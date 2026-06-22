/**
 * System probe for the first-run installer:
 *   1. Is Ollama already present? (only install it if not)
 *   2. What hardware is this? (RAM / CPU / GPU)
 *   3. Which Shiva model suits it? (Fast 1.5B vs Quality 7B)
 *
 * Pure Node (os + fetch + a couple of best-effort shell-outs) so it runs in the
 * main process and is unit-runnable. Everything degrades gracefully: if a probe
 * fails we assume the conservative option.
 */

'use strict';

const os = require('os');
const { execFile } = require('child_process');
const ollama = require('./ollama');

function gb(bytes) { return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10; }

function run(cmd, args, timeout = 4000) {
  return new Promise((resolve) => {
    try { execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout))); }
    catch (_) { resolve(null); }
  });
}

// ── 1. Ollama presence ────────────────────────────────────────────────────────
async function detectOllama() {
  const running = await ollama.isUp();
  let installed = running, version = null;
  if (running) {
    try { const r = await fetch('http://localhost:11434/api/version', { signal: AbortSignal.timeout(2000) }); if (r.ok) version = (await r.json()).version; } catch (_) {}
  }
  if (!installed) {
    const out = os.platform() === 'win32' ? await run('where', ['ollama']) : await run('which', ['ollama']);
    if (out && out.trim()) installed = true;
  }
  return { installed, running, version, needsInstall: !installed };
}

// ── 2. Hardware ───────────────────────────────────────────────────────────────
async function detectGpu() {
  const plat = os.platform();
  let names = [];
  if (plat === 'win32') {
    const out = await run('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name -join "|"']);
    if (out) names = out.split('|').map((s) => s.trim()).filter(Boolean);
  } else if (plat === 'darwin') {
    const out = await run('system_profiler', ['SPDisplaysDataType']);
    if (out) names = [...out.matchAll(/Chipset Model:\s*(.+)/g)].map((m) => m[1].trim());
  } else {
    const out = await run('sh', ['-c', 'lspci | grep -i "vga\\|3d"']);
    if (out) names = out.split('\n').map((s) => s.replace(/.*(?:VGA|3D)[^:]*:\s*/i, '').trim()).filter(Boolean);
  }
  const apple = plat === 'darwin' && os.arch() === 'arm64';
  const dedicated = apple || names.some((n) => /nvidia|geforce|rtx|gtx|radeon rx|radeon pro|arc a\d|tesla|quadro/i.test(n));
  return { names, dedicated, apple };
}

async function detectHardware() {
  const cpus = os.cpus() || [];
  const gpu = await detectGpu();
  return {
    platform: os.platform(), arch: os.arch(),
    ramGB: gb(os.totalmem()), freeRamGB: gb(os.freemem()),
    cpu: ((cpus[0] && cpus[0].model) || 'Unknown CPU').replace(/\s+/g, ' ').trim(),
    cores: cpus.length,
    gpu: gpu.names[0] || 'Integrated graphics', gpuNames: gpu.names,
    gpuCapable: gpu.dedicated, apple: gpu.apple,
  };
}

// ── 3. Model recommendation ───────────────────────────────────────────────────
function recommendModel(hw) {
  const ram = hw.ramGB || 0;
  const gpuOK = !!(hw.gpuCapable || hw.apple);
  const fast = { tier: 'fast', model: 'shiva-chat:latest', tags: ['shiva-chat:latest', 'shiva-chat:1.5b'], label: 'Shiva 1.5B · Fast', size: '~1.0 GB', ok: true };
  const quality = { tier: 'quality', model: 'shiva-chat:7b', tags: ['shiva-chat:7b'], label: 'Shiva 7B · Quality', size: '~4.7 GB', ok: true };

  let pick, reason;
  if (ram >= 32 || gpuOK) {
    pick = 'quality';
    reason = gpuOK
      ? `${hw.apple ? 'Your Apple Silicon' : 'Your GPU (' + hw.gpu + ')'} can run the larger 7B model comfortably.`
      : `With ${ram} GB RAM, the 7B model runs comfortably.`;
    fast.note = 'Snappiest; great for quick runs.';
    quality.note = 'Recommended — best quality on your hardware.';
  } else if (ram >= 14) {
    pick = 'fast';
    reason = `Your machine has ${ram} GB RAM and no dedicated GPU, so the 1.5B model is the snappy default. The 7B runs too, just slower.`;
    fast.note = 'Recommended — snappy on this CPU.';
    quality.note = 'Runs, but noticeably slower without a GPU.';
  } else if (ram >= 8) {
    pick = 'fast';
    reason = `With ${ram} GB RAM, the 1.5B model is the right fit — the 7B needs more memory than you have free.`;
    fast.note = 'Recommended for your memory.';
    quality.note = `Not advised — too tight on ${ram} GB.`;
    quality.ok = false;
  } else {
    pick = 'fast';
    reason = `Your machine has ${ram} GB RAM, which is tight — the 1.5B model is the safe choice.`;
    fast.note = 'The safe choice on limited memory.';
    quality.note = 'Not supported on this memory.';
    quality.ok = false;
  }
  const options = [fast, quality].map((o) => ({ ...o, recommended: o.tier === pick }));
  const chosen = pick === 'quality' ? quality : fast;
  return { tier: pick, model: chosen.model, label: chosen.label, reason, options };
}

/** One call for the installer: Ollama status + hardware + model recommendation. */
async function probe() {
  const [ollamaInfo, hardware] = await Promise.all([detectOllama(), detectHardware()]);
  const installed = ollamaInfo.running ? await ollama.listModels() : [];
  const recommend = recommendModel(hardware);
  recommend.options = recommend.options.map((o) => ({ ...o, present: o.tags.some((t) => installed.includes(t)) }));
  return { ollama: ollamaInfo, hardware, recommend, installedModels: installed };
}

module.exports = { detectOllama, detectHardware, recommendModel, probe };
