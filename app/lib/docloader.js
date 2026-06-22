/**
 * Document loader — a small, framework-style multi-format loader (the Node
 * analogue of LangChain's document loaders). One entry point per source:
 *   loadFile(path)  — local file → { name, kind, text }
 *   loadUrl(url)    — fetch a web page/PDF over the internet → { name, kind, text }
 *
 * Extractors: PDF via pdf-parse (PDF.js — the Node equivalent of pypdf/pymupdf),
 * DOCX via mammoth, HTML/RTF via built-in strippers, everything else as utf-8.
 * Domain-agnostic: it returns the document's REAL text, so the flow adapts to
 * whatever the document is about (nutrition, finance, history, code, …).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const dnsp = require('dns').promises;

const MAX = 200000;

function clean(t) {
  return String(t || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')  // strip control chars (binary noise)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX);
}

/** Strip HTML to readable text without a DOM dependency. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article|header|footer)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/** Strip RTF control words to plain text. */
function rtfToText(s) {
  return String(s || '')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\\\*[^}]*\}/g, '')
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

async function pdfText(buf) {
  const { PDFParse } = require('pdf-parse');
  const parsed = await new PDFParse({ data: buf }).getText();
  return (parsed && parsed.text) || '';
}
async function docxText(fp) {
  return (await require('mammoth').extractRawText({ path: fp })).value || '';
}

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.log', '.xml', '.yml', '.yaml', '.text', '']);

/** Load a local file by extension. Returns { name, kind, text }. Throws on unsupported. */
async function loadFile(fp) {
  const name = path.basename(fp), ext = path.extname(fp).toLowerCase();
  let text = '', kind = (ext.replace('.', '') || 'text');
  if (ext === '.pdf') { text = await pdfText(fs.readFileSync(fp)); kind = 'pdf'; }
  else if (ext === '.docx') { text = await docxText(fp); kind = 'docx'; }
  else if (ext === '.html' || ext === '.htm') { text = htmlToText(fs.readFileSync(fp, 'utf8')); kind = 'html'; }
  else if (ext === '.rtf') { text = rtfToText(fs.readFileSync(fp, 'utf8')); kind = 'rtf'; }
  else if (TEXT_EXT.has(ext)) { text = fs.readFileSync(fp, 'utf8'); kind = ext.replace('.', '') || 'text'; }
  else throw new Error(`Unsupported file type "${ext || 'none'}". Use pdf, docx, html, rtf, txt, md, csv, tsv or json.`);
  text = clean(text);
  if (!text) throw new Error('No readable text found in this file.');
  return { name, kind, text };
}

// ── SSRF guard: don't let a URL (or a redirect) reach private/loopback hosts ──
function ipToLong(ip) { return ip.split('.').reduce((a, o) => ((a << 8) + parseInt(o, 10)) >>> 0, 0); }
function inCidr(ip, base, bits) { const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return (ipToLong(ip) & m) === (ipToLong(base) & m); }
function isPrivateV4(ip) {
  return inCidr(ip, '0.0.0.0', 8) || inCidr(ip, '10.0.0.0', 8) || inCidr(ip, '100.64.0.0', 10) ||
    inCidr(ip, '127.0.0.0', 8) || inCidr(ip, '169.254.0.0', 16) || inCidr(ip, '172.16.0.0', 12) ||
    inCidr(ip, '192.0.0.0', 24) || inCidr(ip, '192.168.0.0', 16) || inCidr(ip, '198.18.0.0', 15) ||
    inCidr(ip, '224.0.0.0', 4) || inCidr(ip, '240.0.0.0', 4);
}
function isPrivateV6(ip) {
  const l = ip.toLowerCase();
  if (l === '::1' || l === '::') return true;
  if (/^f[cd]/.test(l)) return true;                 // fc00::/7  unique-local
  if (/^fe[89ab]/.test(l)) return true;              // fe80::/10 link-local
  const m = l.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  return m ? isPrivateV4(m[1]) : false;
}
function isPrivateIp(ip) { return net.isIPv4(ip) ? isPrivateV4(ip) : net.isIPv6(ip) ? isPrivateV6(ip) : true; }

async function assertPublicUrl(u) {
  let p; try { p = new URL(u); } catch (_) { throw new Error('That doesn\'t look like a valid URL.'); }
  if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error('Only http and https links are allowed.');
  const host = p.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home|.*\.lan)$/i.test(host)) throw new Error('Local addresses aren\'t allowed.');
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new Error('Private/local addresses aren\'t allowed.'); return; }
  let addrs; try { addrs = await dnsp.lookup(host, { all: true }); } catch (e) { throw new Error('Couldn\'t resolve that host: ' + e.message); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('That host resolves to a private/local address.');
}

/** Fetch a URL, validating it (and every redirect hop) against the SSRF guard. */
async function safeFetch(u, hops) {
  hops = hops || 0;
  if (hops > 5) throw new Error('Too many redirects.');
  await assertPublicUrl(u);
  let res;
  try {
    res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'KeepvidyaFlows/0.1 (+https://keepvidya.com)', Accept: 'text/html,application/pdf,*/*' }, signal: AbortSignal.timeout(20000) });
  } catch (e) { throw new Error('Could not reach that URL: ' + e.message); }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) return safeFetch(new URL(loc, u).toString(), hops + 1);
  }
  return res;
}

/** Fetch a web page (or remote PDF) and return its text. This is how the Web-link
 *  flow "connects to the internet": the main process fetches, then extracts.
 *  Guarded against SSRF — only public http/https hosts, redirects re-checked. */
async function loadUrl(url) {
  let u = String(url || '').trim();
  if (!u) throw new Error('Enter a URL.');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const res = await safeFetch(u);
  if (!res.ok) throw new Error(`The page returned HTTP ${res.status}.`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  let text = '', kind = 'html';
  if (ct.includes('pdf') || /\.pdf($|\?)/i.test(u)) {
    text = await pdfText(Buffer.from(await res.arrayBuffer())); kind = 'pdf';
  } else {
    const body = await res.text();
    if (ct.includes('html') || /<html|<body|<div|<p[ >]/i.test(body)) { text = htmlToText(body); kind = 'html'; }
    else { text = body; kind = ct.includes('json') ? 'json' : 'text'; }
  }
  text = clean(text);
  if (!text) throw new Error('That page had no readable text.');
  return { name: u, kind, text };
}

module.exports = { loadFile, loadUrl, htmlToText, rtfToText, clean };
