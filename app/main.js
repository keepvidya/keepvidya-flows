/**
 * Keepvidya Flows — Electron main process.
 *
 * Node-only: there is no separate backend to spawn. Flows are LLM calls, so the
 * flow engine runs in-process and talks to local Ollama (the bundled Shiva
 * model) and BYOK providers over HTTP. The shell — window-state persistence,
 * tray, external-link handling, and the electron-updater "restart to update"
 * flow — is lifted from Knovex (D:\Learning\knovex\desktop\main.js).
 */

'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const store = require('./lib/store');
const ollama = require('./lib/ollama');
const system = require('./lib/system');
const library = require('./lib/library');
const docloader = require('./lib/docloader');
const { runFlow } = require('./lib/flowEngine');
const { PROVIDERS, testConnection } = require('./lib/providers');

const IS_DEV = process.argv.includes('--dev') || !app.isPackaged;
const WIN = { minW: 940, minH: 620, w: 1240, h: 820 };
const ICON = path.join(__dirname, 'assets', 'icon.png');

// Windows resolves a window's taskbar icon and groups its buttons by the
// AppUserModelID; without one a frameless window shows a blank/generic icon
// (and notifications are mis-attributed). Match the NSIS appId.
app.setAppUserModelId('com.keepvidya.flows');

// In dev, keep config + library in a repo-local folder so running `electron .`
// never writes into (or reads) the INSTALLED app's profile — otherwise test
// data leaks into the shipped app and its first-run installer gets skipped.
// Packaged builds use the OS userData under the productName ("Keepvidya Flows").
if (IS_DEV) app.setPath('userData', path.join(__dirname, '.dev-userdata'));

let mainWindow = null;
let tray = null;
let manualUpdateCheck = false;

// Render reliably everywhere. VMs, remote desktops and sandboxed/constrained GPUs
// can fail to create a GPU cache ("Unable to create cache: Access is denied"),
// which leaves the window painting black even though the DOM is fine. Software
// rendering sidesteps that, and this UI is light enough that the cost is nil.
app.disableHardwareAcceleration();

// One instance only — a second launch just focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
}

// ─── window state (JSON in userData) ─────────────────────────────────────────
function statePath() { return path.join(app.getPath('userData'), 'window-state.json'); }
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    if (s && s.width >= WIN.minW && s.height >= WIN.minH) return s;
  } catch (_) {}
  return { width: WIN.w, height: WIN.h };
}
function saveState(win) { try { fs.writeFileSync(statePath(), JSON.stringify(win.getBounds()), 'utf8'); } catch (_) {} }

function createMainWindow() {
  const st = loadState();
  mainWindow = new BrowserWindow({
    width: st.width, height: st.height,
    ...(st.x !== undefined ? { x: st.x, y: st.y } : {}),
    minWidth: WIN.minW, minHeight: WIN.minH,
    title: 'Keepvidya Flows', show: false, backgroundColor: '#121D23',
    icon: ICON,              // taskbar / window icon (frameless → no OS icon otherwise)
    frame: false,            // custom chrome — the in-app titlebar is the real one
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', JSON.stringify(d)));
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus(); });
  mainWindow.on('resize', () => saveState(mainWindow));
  mainWindow.on('move', () => saveState(mainWindow));
  mainWindow.on('show', () => triggerUpdateCheck());
  mainWindow.on('close', (e) => { saveState(mainWindow); if (tray && !app.isQuitting) { e.preventDefault(); mainWindow.hide(); } });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      mainWindow.webContents.isDevToolsOpened() ? mainWindow.webContents.closeDevTools() : mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });
}

// ─── tray ────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Keepvidya Flows');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Keepvidya Flows', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Settings', click: () => { mainWindow?.show(); mainWindow?.webContents.send('navigate', 'settings'); } },
    { label: 'Check for updates…', click: () => triggerUpdateCheck({ force: true, manual: true }) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── auto-updater (electron-updater → GitHub Releases) ───────────────────────
let lastCheck = 0;
function triggerUpdateCheck(opts = {}) {
  if (IS_DEV) return;
  const now = Date.now();
  if (!opts.force && now - lastCheck < 5 * 60 * 1000) return;
  lastCheck = now;
  manualUpdateCheck = !!opts.manual;
  autoUpdater.checkForUpdates().catch((e) => console.error('[updater]', e.message));
}
function setupAutoUpdater() {
  if (IS_DEV) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('download-progress', (p) => mainWindow?.webContents.send('app:update-progress', { pct: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => { manualUpdateCheck = false; mainWindow?.webContents.send('app:update-downloaded', { version: info.version, releaseNotes: info.releaseNotes ?? null }); });
  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck) { manualUpdateCheck = false; dialog.showMessageBox(mainWindow, { type: 'info', title: 'Keepvidya Flows', message: 'You’re up to date', detail: `v${app.getVersion()} is the latest version.` }); }
  });
  autoUpdater.on('error', (e) => { if (manualUpdateCheck) { manualUpdateCheck = false; dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Update check failed', message: 'Couldn’t check for updates right now.', detail: e.message }); } });
  setTimeout(() => triggerUpdateCheck({ force: true }), 8000);
  setInterval(() => triggerUpdateCheck(), 4 * 60 * 60 * 1000);
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

// Auto-save a finished result into the user's library and stamp it with its id.
function autoSave(res, source) {
  if (!res || res.type === 'error') return;
  try {
    if (res.type === 'book') {
      const m = library.save({ type: 'book', title: res.cover && res.cover.title, model: res.model, source, novelized: !!res.novelized, content: { cover: res.cover, pages: res.pages } });
      res.libraryId = m.id;
    } else if (res.type === 'game' && res.html && !res.fallback) {
      const m = library.save({ type: 'game', title: 'Playable game', model: res.model, source, content: { html: res.html } });
      res.libraryId = m.id;
    }
  } catch (e) { console.warn('[library] autoSave:', e.message); }
}

function registerIpc() {
  ipcMain.handle('app:version', () => app.getVersion());

  // Window controls for the custom (frameless) titlebar.
  ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.on('win:maximize', () => { if (!mainWindow) return; mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
  ipcMain.on('win:close', () => mainWindow && mainWindow.close());

  ipcMain.handle('ollama:status', async () => ({ up: await ollama.isUp(), hasShiva: await ollama.hasShiva(), models: await ollama.listModels() }));

  // First-run system probe: Ollama presence + hardware + model recommendation.
  ipcMain.handle('system:probe', () => system.probe());
  // Pull a model (only called when it is absent), streaming progress.
  ipcMain.handle('model:pull', async (e, { model }) => {
    try { await ollama.pullModel(model, (p) => { try { e.sender.send('model:progress', p); } catch (_) {} }); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  // Warm a model so the first real run is fast.
  ipcMain.handle('model:warm', (_e, { model }) => ollama.warm(model));
  // Install Ollama — only invoked when it is absent. Runs a bundled installer if
  // we shipped one (extraResources/ollama), else opens the official download.
  ipcMain.handle('ollama:install', async () => {
    const bundled = path.join(process.resourcesPath || '', 'ollama', process.platform === 'win32' ? 'OllamaSetup.exe' : 'ollama');
    if (fs.existsSync(bundled)) { await shell.openPath(bundled); return { ok: true, method: 'bundled' }; }
    await shell.openExternal('https://ollama.com/download');
    return { ok: true, method: 'web' };
  });

  ipcMain.handle('config:get', () => store.sanitize());
  ipcMain.handle('config:setMode', (_e, mode) => store.setMode(mode));
  ipcMain.handle('config:setDefault', (_e, id) => store.setDefault(id));

  ipcMain.handle('providers:list', () => PROVIDERS.map((p) => ({ id: p.id, label: p.label, letter: p.letter, color: p.color, kind: p.kind, defaultModel: p.defaultModel, models: p.models, baseUrl: p.baseUrl })));
  ipcMain.handle('providers:save', (_e, { id, fields }) => store.saveProvider(id, fields || {}));
  ipcMain.handle('providers:test', async (_e, { id, fields }) => {
    try { const creds = fields && fields.key !== undefined ? fields : store.getCreds(id); return await testConnection(id, creds, fields?.model); }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // Run a flow; stream progress lines back to the calling renderer.
  ipcMain.handle('flow:run', async (e, opts) => {
    const cfg = store.load();
    const provider = opts.provider || cfg.defaultProvider || 'local';
    const creds = store.getCreds(provider);
    try {
      const res = await runFlow({
        input: opts.input, flow: opts.flow, provider,
        model: opts.model || creds.model, creds,
        onProgress: (line) => { try { e.sender.send('flow:progress', line); } catch (_) {} },
      });
      autoSave(res, opts.input);
      return res;
    } catch (err) {
      return { type: 'error', error: err.message };
    }
  });

  // Library: the user's saved storage of everything they've made.
  ipcMain.handle('library:list', () => library.list());
  ipcMain.handle('library:get', (_e, { id }) => library.get(id));
  ipcMain.handle('library:delete', (_e, { id }) => library.remove(id));
  // Novelize a saved item into a richer book and save the result too.
  ipcMain.handle('library:novelize', async (e, { id }) => {
    const entry = library.get(id);
    if (!entry) return { type: 'error', error: 'Item not found' };
    let src = entry.source || '';
    if (entry.type === 'book' && entry.content && Array.isArray(entry.content.pages)) {
      src = entry.content.pages.map((p) => p.prose).join('\n\n') || src;
    }
    const cfg = store.load();
    const provider = cfg.defaultProvider || 'local';
    const res = await runFlow({ input: src, flow: 'novelize', provider, creds: store.getCreds(provider), onProgress: (l) => { try { e.sender.send('flow:progress', l); } catch (_) {} } });
    autoSave(res, src);
    return res;
  });

  // File-intake: extract REAL text per type via the document loader
  // (PDF.js/pdf-parse, mammoth, HTML/RTF strippers, utf-8) - never raw bytes.
  ipcMain.handle('dialog:openFile', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'html', 'htm', 'rtf', 'txt', 'md', 'markdown', 'csv', 'tsv', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try { const d = await docloader.loadFile(r.filePaths[0]); return { name: d.name, kind: d.kind, text: d.text }; }
    catch (err) { return { name: path.basename(r.filePaths[0]), text: '', error: err.message }; }
  });

  // Web-link intake: fetch a page (or remote PDF) over the internet, extract text.
  ipcMain.handle('web:fetch', async (_e, url) => {
    try { const d = await docloader.loadUrl(url); return { name: d.name, kind: d.kind, text: d.text }; }
    catch (err) { return { text: '', error: err.message }; }
  });

  // Save an artifact (storybook HTML / game.html) to disk.
  ipcMain.handle('artifact:save', async (_e, { suggestedName, content }) => {
    const r = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName || 'keepvidya-flows-output.html' });
    if (r.canceled || !r.filePath) return { saved: false };
    try { fs.writeFileSync(r.filePath, content, 'utf8'); return { saved: true, path: r.filePath }; }
    catch (err) { return { saved: false, error: err.message }; }
  });

  ipcMain.on('app:install-update', () => { app.isQuitting = true; autoUpdater.quitAndInstall(true, true); });
}

// ─── lifecycle ───────────────────────────────────────────────────────────────
app.on('ready', () => {
  Menu.setApplicationMenu(null);   // no File/Edit/View menu bar — custom chrome
  store.init(app, safeStorage);
  library.init(app);
  registerIpc();
  setupAutoUpdater();
  createTray();
  createMainWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); else mainWindow?.show(); });
app.on('before-quit', () => { app.isQuitting = true; });
