/**
 * Flow engine — turns input into a real artifact using the selected provider.
 *
 * Pure Node, no Electron deps, so it can be unit-run against a live Ollama
 * (see test/engine.test.js). The main process calls runFlow() over IPC and
 * streams onProgress lines into the renderer's wait/Playground stage.
 *
 *   runFlow({ input, flow, provider, model, creds, onProgress }) ->
 *     book : { type:'book', cover, pages:[{ch,title,epi,prose,scene}], model }
 *     game : { type:'game', html } | { type:'game', fallback:true, reason }
 *     extract: { type:'extract', fields }
 */

'use strict';

const { complete, metaFor } = require('./providers');
const { sceneFor } = require('./scenes');

// BYOK personas — cloud models have no baked-in Shiva persona, so we supply the
// specialist's "hat" (system prompt) ourselves. Local Ollama specialists already
// carry their persona + temperature in their Modelfile, so for those we send NO
// system prompt (only the task/format) and let the hat apply. (See the
// shiva-model-architecture note: one base per domain, many prompt-specialists.)
const PERSONAS = {
  writer:   'You are Shiva-Writer. You make any topic genuinely interesting and vivid, never inventing facts that contradict the source. Light structure is fine; clean narrative prose when asked.',
  code:     'You are Shiva-Code, a careful programmer. You output only working, self-contained code.',
  chat:     'You are Shiva, a precise assistant. Answer accurately and only from the given input; never invent facts.',
};

/** Pull the first balanced {...} JSON object out of a model response. */
function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch (_) { return null; } } }
  }
  return null;
}

/**
 * One base per domain, many prompt-specialists per base. Each flow maps to a
 * local Ollama specialist tag + the temperature its job wants; `persona` selects
 * the BYOK system prompt. (book/novelize/extract = general Qwen2.5 base;
 * game = the Qwen2.5-Coder base — code genuinely needs its own pretraining.)
 */
const SPECIALISTS = {
  // book + novelize are ONE model (shiva-writer) in two modes — the "switch".
  book:     { tag: 'shiva-writer:latest', persona: 'writer', temp: 0.85, mode: 'story' },
  novelize: { tag: 'shiva-writer:latest', persona: 'writer', temp: 0.8,  mode: 'novel' },
  game:     { tag: 'shiva-code:7b',       persona: 'code',   temp: 0.2 },
  extract:  { tag: 'shiva-chat:latest',   persona: 'chat',   temp: 0.1 },
};

/** Resolve { model, system, temperature } for a flow + provider.
 *  Local: wear the Modelfile hat (no system override). BYOK: supply persona. */
function specForFlow(flow, providerId, model) {
  const spec = SPECIALISTS[flow] || SPECIALISTS.book;
  const meta = metaFor(providerId);
  const isLocal = meta.kind === 'ollama';
  return {
    model: model || (isLocal ? spec.tag : meta.defaultModel),
    system: isLocal ? null : PERSONAS[spec.persona],
    temperature: spec.temp,
    mode: spec.mode || null,
  };
}

/** Parse a writer/novelize prose response (TITLE: / CHAPTER: format) into a
 *  reader-ready deck — "prose = model, layout = deterministic". Narrative models
 *  honour their "prose only" hat, so we also fall back to paragraph-chunking,
 *  then a single page, and a run is never empty. */
function proseToDeck(text, input, model, novelized) {
  const s = String(text || '');
  const ORD = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
  const clean = (t) => String(t || '').replace(/^[\s"'*#]+|[\s"'*]+$/g, '').trim();
  let title = clean((s.match(/TITLE:\s*(.+)/i) || [])[1]);
  let pages = s.split(/CHAPTER:\s*/i).slice(1).map((c, i) => {
    const nl = c.indexOf('\n');
    const ct = clean((nl >= 0 ? c.slice(0, nl) : 'Chapter ' + (i + 1)).slice(0, 60));
    const prose = (nl >= 0 ? c.slice(nl + 1) : c).replace(/TITLE:.*/i, '').trim().slice(0, 900);
    return { ch: 'Chapter ' + (ORD[i] || i + 1), title: ct || 'Chapter ' + (i + 1), epi: '', prose, scene: sceneFor(ct + ' ' + prose + ' ' + input) };
  }).filter((p) => p.prose && p.prose.length > 20);
  if (!pages.length) {
    const paras = s.replace(/TITLE:.*/i, '').split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x.length > 30);
    const per = Math.max(1, Math.ceil(paras.length / 3));
    for (let i = 0; i < paras.length && pages.length < 3; i += per) {
      const prose = paras.slice(i, i + per).join(' ').slice(0, 900);
      pages.push({ ch: 'Chapter ' + (ORD[pages.length] || pages.length + 1), title: 'A Retelling', epi: '', prose, scene: sceneFor(prose + ' ' + input) });
    }
  }
  if (!pages.length) pages = [{ ch: 'Chapter One', title: 'The Retelling', epi: '', prose: (s || input).slice(0, 400), scene: sceneFor(input) }];
  return {
    type: 'book', model, novelized: !!novelized,
    cover: {
      title: (title || pages[0].title || (novelized ? 'Your Novel' : 'Your Story')).slice(0, 60),
      sub: novelized ? 'Novelized by Shiva on your machine.' : 'A Keepvidya storybook, made on your machine.',
    },
    pages,
  };
}

/** Storybook + novelize share one path: the writer family produces engaging
 *  chapter prose, then we lay it out deterministically. book = shiva-writer
 *  (make it interesting); novelize = shiva-novelize (vivid prose from prose). */
async function runProseBook(flow, { input, provider, model, creds, onProgress, signal }) {
  const spec = specForFlow(flow, provider, model);
  const novelized = spec.mode === 'novel';
  onProgress && onProgress('Reading your material…');
  const task = novelized
    ? 'Novelize the SOURCE below into vivid, flowing narrative prose across THREE short chapters — fuller and more story-like than the source, as clean prose with no commentary. Never contradict the source.\n'
    : 'Turn the SOURCE below into an engaging illustrated story of THREE short chapters a curious reader would enjoy. Keep it faithful to the facts.\n';
  const prompt = task +
    'Output EXACTLY this plain-text format and nothing else:\n' +
    'TITLE: <a short book title>\n' +
    'CHAPTER: <chapter title>\n<about 80 words of prose>\n' +
    'CHAPTER: <chapter title>\n<about 80 words of prose>\n' +
    'CHAPTER: <chapter title>\n<about 80 words of prose>\n\n' +
    'SOURCE:\n"""\n' + String(input).slice(0, 5000) + '\n"""';
  onProgress && onProgress((novelized ? 'Novelizing' : 'Writing') + ' chapter by chapter…');
  const { text } = await complete(provider, { system: spec.system, prompt, model: spec.model, creds, temperature: spec.temperature, maxTokens: 1600, signal });
  onProgress && onProgress('Binding the book…');
  return proseToDeck(text, input, spec.model, novelized);
}

const runStorybook = (opts) => runProseBook('book', opts);
const runNovelize = (opts) => runProseBook('novelize', opts);

async function runGame({ input, provider, model, creds, onProgress, signal }) {
  const spec = specForFlow('game', provider, model);
  onProgress && onProgress('Warming up Shiva-Code…');
  const prompt =
    'Write a COMPLETE, self-contained, single-file HTML5 game based on this idea: "' + String(input).slice(0, 400) + '".\n' +
    'Hard requirements: one file only; all CSS and JS inline; NO external scripts, CDNs or imports; ' +
    'use a <canvas> and keyboard controls; copper (#C0703C) and dark ink (#121D23) colours; ' +
    'it must run by simply opening the file. Output ONLY the HTML, starting with <!doctype html>.';

  onProgress && onProgress('Writing the game loop…');
  const { text } = await complete(provider, { system: spec.system, prompt, model: spec.model, creds, temperature: spec.temperature, maxTokens: 2200, signal });

  onProgress && onProgress('Checking it actually runs…');
  const html = stripFences(text);
  const looksValid = /<canvas/i.test(html) && /<script/i.test(html) && /(requestAnimationFrame|setInterval)/.test(html) && /<\/html>/i.test(html);
  if (!looksValid) return { type: 'game', fallback: true, reason: 'Model output was not a valid self-contained game; using the built-in Snake.', model: spec.model };
  return { type: 'game', html, model: spec.model };
}

async function runExtract({ input, provider, model, creds, signal }) {
  const spec = specForFlow('extract', provider, model);
  const prompt =
    'Extract the key fields from the document below as a flat JSON object of string values. ' +
    'Use snake_case keys. Return ONLY JSON.\nDOCUMENT:\n"""\n' + String(input).slice(0, 6000) + '\n"""';
  const { text } = await complete(provider, { system: spec.system, prompt, model: spec.model, creds, temperature: spec.temperature, maxTokens: 700, signal });
  return { type: 'extract', model: spec.model, fields: extractJson(text) || { raw: String(text).slice(0, 500) } };
}

function stripFences(t) {
  let s = String(t || '').trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const idx = s.toLowerCase().indexOf('<!doctype');
  if (idx > 0) s = s.slice(idx);
  return s;
}

async function runFlow(opts) {
  const flow = opts.flow || 'book';
  if (flow === 'book') return runStorybook(opts);
  if (flow === 'game') return runGame(opts);
  if (flow === 'novelize') return runNovelize(opts);
  if (flow === 'extract') return runExtract(opts);
  throw new Error(`Unknown flow '${flow}'`);
}

module.exports = { runFlow, extractJson, SPECIALISTS };
