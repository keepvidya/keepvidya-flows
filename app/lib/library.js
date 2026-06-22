/**
 * Library — the user's personal storage of everything they've made.
 *
 * Each Flow result (storybook / game) is auto-saved here so the user can come
 * back and see what they have, re-open it, novelize it, download it, or delete
 * it. File-based in app.getPath('userData')/library/: a lightweight index.json
 * of metadata + one <id>.json per item holding the full content.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let _app = null;
function init(app) { _app = app; }

function dir() {
  const d = _app ? path.join(_app.getPath('userData'), 'library') : path.join(__dirname, '..', '.dev-userdata', 'library');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function indexPath() { return path.join(dir(), 'index.json'); }
function readIndex() { try { return JSON.parse(fs.readFileSync(indexPath(), 'utf8')); } catch (_) { return []; } }
function writeIndex(list) { try { fs.writeFileSync(indexPath(), JSON.stringify(list, null, 2), 'utf8'); } catch (e) { console.warn('[library] write:', e.message); } }
function newId() { return 'kvf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** Save an item. entry = { type:'book'|'game', title, model, source, content }. */
function save(entry) {
  const list = readIndex();
  const meta = {
    id: entry.id || newId(),
    type: entry.type,
    title: (entry.title || 'Untitled').slice(0, 120),
    model: entry.model || null,
    source: (entry.source || '').slice(0, 400),
    novelized: !!entry.novelized,
    createdAt: Date.now(),
  };
  try { fs.writeFileSync(path.join(dir(), meta.id + '.json'), JSON.stringify(entry.content || {}), 'utf8'); } catch (e) { console.warn('[library] content:', e.message); }
  list.unshift(meta);
  writeIndex(list);
  return meta;
}

/** Metadata for every saved item, newest first. */
function list() { return readIndex(); }

/** Full item (metadata + content) by id. */
function get(id) {
  const meta = readIndex().find((x) => x.id === id);
  if (!meta) return null;
  let content = {};
  try { content = JSON.parse(fs.readFileSync(path.join(dir(), id + '.json'), 'utf8')); } catch (_) {}
  return { ...meta, content };
}

/** Delete an item; returns the new index. */
function remove(id) {
  const list = readIndex().filter((x) => x.id !== id);
  writeIndex(list);
  try { fs.unlinkSync(path.join(dir(), id + '.json')); } catch (_) {}
  return list;
}

module.exports = { init, save, list, get, remove };
