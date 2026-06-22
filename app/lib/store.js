/**
 * Config + credential store. Lives in app.getPath('userData')/config.json.
 *
 * API keys are encrypted at rest with Electron's safeStorage (OS keychain /
 * DPAPI) when available, mirroring Knovex's "keys encrypted on this device,
 * never sent to Keepvidya" promise. Falls back to obfuscation with a logged
 * warning if the OS crypto isn't available (e.g. headless CI).
 *
 * Shape:
 *   { mode: 'local'|'byok',
 *     defaultProvider: 'local',
 *     providers: { <id>: { model, base_url?, region?, _key?, _secret?, configured } } }
 */

'use strict';

const fs = require('fs');
const path = require('path');

let _app = null;        // injected from main so this file is unit-testable
let _safeStorage = null;

function init(app, safeStorage) { _app = app; _safeStorage = safeStorage; }

function configPath() {
  const dir = _app ? _app.getPath('userData') : path.join(__dirname, '..', '.dev-userdata');
  return path.join(dir, 'config.json');
}

const DEFAULTS = { mode: 'local', defaultProvider: 'local', providers: {} };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) }; }
  catch (_) { return { ...DEFAULTS }; }
}

function save(cfg) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) { console.warn('[store] save failed:', e.message); }
}

function enc(plain) {
  if (!plain) return '';
  if (_safeStorage && _safeStorage.isEncryptionAvailable()) {
    return 'enc:' + _safeStorage.encryptString(plain).toString('base64');
  }
  return 'b64:' + Buffer.from(plain, 'utf8').toString('base64');
}

function dec(stored) {
  if (!stored) return '';
  if (stored.startsWith('enc:') && _safeStorage) {
    try { return _safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64')); } catch (_) { return ''; }
  }
  if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  return '';
}

/** Persist a provider's settings; encrypts key/secret fields. */
function saveProvider(id, fields) {
  const cfg = load();
  const cur = cfg.providers[id] || {};
  const next = { ...cur, model: fields.model || cur.model, configured: true };
  if (fields.base_url !== undefined) next.base_url = fields.base_url;
  if (fields.region !== undefined) next.region = fields.region;
  if (fields.access_key_id !== undefined) next.access_key_id = fields.access_key_id;
  if (fields.key !== undefined) next._key = enc(fields.key);
  if (fields.secret_access_key !== undefined) next._secret = enc(fields.secret_access_key);
  cfg.providers[id] = next;
  save(cfg);
  return sanitize(cfg);
}

/** Decrypted credentials for a provider, ready to hand to providers.complete(). */
function getCreds(id) {
  const p = load().providers[id] || {};
  return {
    model: p.model,
    base_url: p.base_url,
    region: p.region,
    access_key_id: p.access_key_id,
    key: dec(p._key),
    secret_access_key: dec(p._secret),
  };
}

/** Config safe to send to the renderer — never exposes raw keys. */
function sanitize(cfg = load()) {
  const providers = {};
  for (const [id, p] of Object.entries(cfg.providers)) {
    providers[id] = { model: p.model, base_url: p.base_url, region: p.region, configured: !!p.configured, hasKey: !!(p._key || p._secret) };
  }
  return { mode: cfg.mode, defaultProvider: cfg.defaultProvider, providers };
}

function setMode(mode) { const c = load(); c.mode = mode; save(c); return sanitize(c); }
function setDefault(id) { const c = load(); c.defaultProvider = id; save(c); return sanitize(c); }

module.exports = { init, load, save, saveProvider, getCreds, sanitize, setMode, setDefault, configPath };
