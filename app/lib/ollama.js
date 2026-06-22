/**
 * Local Ollama helpers — used by the main process for the "Shiva · Local"
 * status pill and the model picker. Generation itself goes through
 * providers.js (the `ollama`/`local` kinds).
 */

'use strict';

const DEFAULT_BASE = 'http://localhost:11434';

/** Is a local Ollama server reachable? */
async function isUp(base = DEFAULT_BASE) {
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch (_) {
    return false;
  }
}

/** List locally installed Ollama model tags (names). */
async function listModels(base = DEFAULT_BASE) {
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.models || []).map((m) => m.name).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/** True if any Shiva model is installed locally (the bundled engine is present). */
async function hasShiva(base = DEFAULT_BASE) {
  const names = await listModels(base);
  return names.some((n) => n.startsWith('shiva-chat'));
}

/** Pull a model, streaming {status, pct} progress (used when a model is absent). */
async function pullModel(model, onProgress, base = DEFAULT_BASE) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/pull`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Pull failed: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      try { const j = JSON.parse(line); onProgress && onProgress({ status: j.status, pct: j.total && j.completed ? Math.round((j.completed / j.total) * 100) : null }); } catch (_) {}
    }
  }
  return { ok: true };
}

/** Load a model into memory (a 1-token chat) so the first real run is fast. */
async function warm(model, base = DEFAULT_BASE) {
  try {
    await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], stream: false, keep_alive: '10m', options: { num_predict: 1 } }),
      signal: AbortSignal.timeout(120000),
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { DEFAULT_BASE, isUp, listModels, hasShiva, pullModel, warm };
