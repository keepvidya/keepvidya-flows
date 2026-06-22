/**
 * Provider layer — mirrors Knovex's 7-provider set
 * (knovex/backend/core/providers/ + frontend/src/pages/Settings/LLMSettings.tsx).
 *
 * One async function per provider that takes a normalised request and returns
 * { text }.  No third-party SDKs: uses Node 22's global fetch and each
 * provider's native HTTP API. Bedrock needs AWS SigV4 (the AWS SDK) and is
 * intentionally deferred — it stays listed/configurable but errors clearly.
 *
 * Shapes:
 *   meta   = { id, label, letter, color, kind, defaultModel, models, baseUrl }
 *   creds  = { key?, base_url?, region?, access_key_id?, secret_access_key? }
 *   req    = { system?, prompt, model, creds, temperature?, maxTokens? }
 */

'use strict';

const PROVIDERS = [
  { id: 'openai',    label: 'OpenAI',        letter: 'O',  color: '#10A37F', kind: 'openai',    baseUrl: 'https://api.openai.com/v1',                 defaultModel: 'gpt-4o-mini',             models: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'] },
  { id: 'anthropic', label: 'Anthropic',     letter: 'A',  color: '#C9714E', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1',              defaultModel: 'claude-haiku-4-5',        models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'] },
  { id: 'groq',      label: 'Groq',          letter: 'Gq', color: '#F55036', kind: 'openai',    baseUrl: 'https://api.groq.com/openai/v1',            defaultModel: 'llama-3.3-70b-versatile', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
  { id: 'gemini',    label: 'Google Gemini', letter: 'Ge', color: '#4285F4', kind: 'gemini',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.0-flash', models: ['gemini-2.0-flash', 'gemini-2.5-pro'] },
  { id: 'cerebras',  label: 'Cerebras',      letter: 'Ce', color: '#F76707', kind: 'openai',    baseUrl: 'https://api.cerebras.ai/v1',                defaultModel: 'llama3.3-70b',            models: ['llama3.3-70b', 'gpt-oss-120b'] },
  { id: 'bedrock',   label: 'AWS Bedrock',   letter: 'Be', color: '#FF9900', kind: 'bedrock',   baseUrl: '',                                          defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0', models: ['anthropic.claude-3-5-sonnet-20240620-v1:0'] },
  { id: 'ollama',    label: 'Ollama',        letter: 'Ol', color: '#6E7079', kind: 'ollama',    baseUrl: 'http://localhost:11434',                    defaultModel: 'shiva-chat:7b',           models: ['shiva-chat:7b', 'shiva-chat:latest', 'llama3.2:3b'] },
  // The bundled, owner-facing local engine — also Ollama under the hood, but
  // presented as "Keepvidya's own model" and the default offline path.
  { id: 'local',     label: 'Shiva · Local', letter: 'S',  color: '#C0703C', kind: 'ollama',    baseUrl: 'http://localhost:11434',                    defaultModel: 'shiva-chat:latest',       models: ['shiva-chat:latest', 'shiva-chat:7b'] },
];

const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

function metaFor(id) {
  const m = byId[id];
  if (!m) throw new Error(`Unknown provider '${id}'. Known: ${PROVIDERS.map((p) => p.id).join(', ')}`);
  return m;
}

async function asJson(res, who) {
  const txt = await res.text();
  if (!res.ok) {
    let detail = txt.slice(0, 400);
    try { detail = JSON.parse(txt).error?.message || JSON.parse(txt).error || detail; } catch (_) {}
    throw new Error(`${who} HTTP ${res.status}: ${detail}`);
  }
  try { return JSON.parse(txt); } catch (_) { throw new Error(`${who}: non-JSON response: ${txt.slice(0, 200)}`); }
}

/** OpenAI-compatible chat (openai, groq, cerebras, and any custom /v1 endpoint). */
async function completeOpenAI(meta, req) {
  const base = (req.creds.base_url || meta.baseUrl).replace(/\/$/, '');
  const messages = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.creds.key || ''}` },
    body: JSON.stringify({ model: req.model || meta.defaultModel, messages, temperature: req.temperature ?? 0.4, max_tokens: req.maxTokens ?? 1200 }),
    signal: req.signal,
  });
  const j = await asJson(res, meta.label);
  return { text: j.choices?.[0]?.message?.content ?? '' };
}

/** Anthropic Messages API. */
async function completeAnthropic(meta, req) {
  const base = (req.creds.base_url || meta.baseUrl).replace(/\/$/, '');
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': req.creds.key || '', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: req.model || meta.defaultModel,
      max_tokens: req.maxTokens ?? 1200,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: 'user', content: req.prompt }],
      temperature: req.temperature ?? 0.4,
    }),
    signal: req.signal,
  });
  const j = await asJson(res, meta.label);
  return { text: (j.content || []).map((b) => b.text || '').join('') };
}

/** Google Gemini generateContent. */
async function completeGemini(meta, req) {
  const base = (req.creds.base_url || meta.baseUrl).replace(/\/$/, '');
  const model = req.model || meta.defaultModel;
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(req.creds.key || '')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: { temperature: req.temperature ?? 0.4, maxOutputTokens: req.maxTokens ?? 1200 },
    }),
    signal: req.signal,
  });
  const j = await asJson(res, meta.label);
  return { text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('') };
}

/** Local / self-hosted Ollama (also powers the bundled "Shiva · Local"). */
async function completeOllama(meta, req) {
  const base = (req.creds.base_url || meta.baseUrl).replace(/\/$/, '');
  const messages = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model || meta.defaultModel,
      stream: false,
      keep_alive: '5m',
      messages,
      options: { temperature: req.temperature ?? 0.4, num_ctx: 4096 },
    }),
    signal: req.signal,
  });
  const j = await asJson(res, meta.label);
  return { text: j.message?.content ?? '' };
}

/**
 * Complete a single prompt against the chosen provider.
 * @param {string} providerId
 * @param {object} req  { system?, prompt, model?, creds?, temperature?, maxTokens?, signal? }
 * @returns {Promise<{text:string}>}
 */
async function complete(providerId, req) {
  const meta = metaFor(providerId);
  const r = { ...req, creds: req.creds || {} };
  switch (meta.kind) {
    case 'openai':    return completeOpenAI(meta, r);
    case 'anthropic': return completeAnthropic(meta, r);
    case 'gemini':    return completeGemini(meta, r);
    case 'ollama':    return completeOllama(meta, r);
    case 'bedrock':
      throw new Error('AWS Bedrock needs the AWS SDK (SigV4 signing) — not in this local build yet. Pick another provider.');
    default:
      throw new Error(`No completion path for kind '${meta.kind}'`);
  }
}

/** Lightweight credential check used by the Settings "Test & save" button. */
async function testConnection(providerId, creds, model) {
  const meta = metaFor(providerId);
  if (meta.kind === 'bedrock') return { ok: false, error: 'Bedrock not supported in the local build yet.' };
  const { text } = await complete(providerId, {
    prompt: 'Reply with the single word: ok',
    model: model || meta.defaultModel,
    creds,
    maxTokens: 8,
    temperature: 0,
  });
  return { ok: /ok/i.test(text || ''), sample: (text || '').trim().slice(0, 40) };
}

module.exports = { PROVIDERS, metaFor, complete, testConnection };
