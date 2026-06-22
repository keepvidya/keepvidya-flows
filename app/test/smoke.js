/**
 * Headless boot smoke — verifies the real Electron app end-to-end without a
 * visible window: loads renderer/index.html under the real preload, then drives
 * a full storybook generation through renderer -> preload IPC -> flow engine ->
 * live Shiva. Run: node_modules/.bin/electron test/smoke.js
 */
'use strict';

const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const store = require('../lib/store');
const ollama = require('../lib/ollama');
const library = require('../lib/library');
const { runFlow } = require('../lib/flowEngine');
const { PROVIDERS } = require('../lib/providers');

app.disableHardwareAcceleration();

function registerIpc() {
  store.init(app, safeStorage);
  library.init(app);
  ipcMain.handle('library:list', () => library.list());
  ipcMain.handle('library:get', (_e, { id }) => library.get(id));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('ollama:status', async () => ({ up: await ollama.isUp(), hasShiva: await ollama.hasShiva(), models: await ollama.listModels() }));
  ipcMain.handle('system:probe', () => require('../lib/system').probe());
  ipcMain.handle('config:get', () => store.sanitize());
  ipcMain.handle('config:setMode', (_e, m) => store.setMode(m));
  ipcMain.handle('config:setDefault', (_e, id) => store.setDefault(id));
  ipcMain.handle('providers:list', () => PROVIDERS.map((p) => ({ id: p.id, label: p.label })));
  ipcMain.handle('providers:save', (_e, { id, fields }) => store.saveProvider(id, fields || {}));
  ipcMain.handle('providers:test', async () => ({ ok: true }));
  ipcMain.handle('dialog:openFile', async () => null);
  ipcMain.handle('artifact:save', async () => ({ saved: false }));
  ipcMain.handle('flow:run', async (_e, opts) => {
    const res = await runFlow({ ...opts, provider: opts.provider || 'local', creds: {}, onProgress: () => {} });
    if (res && res.type === 'book') { const m = library.save({ type: 'book', title: res.cover && res.cover.title, model: res.model, source: opts.input, content: { cover: res.cover, pages: res.pages } }); res.libraryId = m.id; }
    return res;
  });
}

app.whenReady().then(async () => {
  registerIpc();
  const w = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await w.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  const out = {};
  try {
    out.kvflows = await w.webContents.executeJavaScript('typeof window.kvflows');
    out.version = await w.webContents.executeJavaScript('window.kvflows.appVersion()');
    out.providers = await w.webContents.executeJavaScript('window.kvflows.providers.list().then(p => p.length)');
    out.status = await w.webContents.executeJavaScript('window.kvflows.ollamaStatus()');
    out.probe = await w.webContents.executeJavaScript('window.kvflows.system.probe().then(p => ({ ollamaInstalled:p.ollama.installed, needsInstall:p.ollama.needsInstall, ramGB:p.hardware.ramGB, gpu:p.hardware.gpu, rec:p.recommend.tier, recModel:p.recommend.model }))');
    out.flow = await w.webContents.executeJavaScript(
      'window.kvflows.runFlow({input:"The sun gives light and warmth to every living thing on earth.", flow:"book", provider:"local", model:"shiva-chat:1.5b"})' +
      '.then(r => ({ type:r.type, cover:r.cover&&r.cover.title, pages:r.pages&&r.pages.length, libraryId:!!r.libraryId }))'
    );
    out.library = await w.webContents.executeJavaScript('window.kvflows.library.list().then(l => ({ count:l.length, newest:l[0]&&l[0].title, type:l[0]&&l[0].type }))');
    out.modelsPage = await w.webContents.executeJavaScript(
      '(function(){ document.querySelector(\'.dock [data-scene="app"]\').click(); document.querySelector(\'.sidebar [data-nav="models"]\').click();' +
      ' return new Promise(function(r){ setTimeout(function(){ r({ cards:document.querySelectorAll("#mdl-grid .mdl-card").length, installed:document.querySelectorAll("#mdl-grid .mdl-status.ok").length, names:Array.prototype.map.call(document.querySelectorAll("#mdl-grid .mdl-name"),function(n){return n.textContent;}).join(",") }); },600); }); })()'
    );
    console.log('SMOKE_OK ' + JSON.stringify(out));
  } catch (e) {
    console.log('SMOKE_FAIL ' + e.message);
  }
  app.quit();
});

app.on('window-all-closed', () => app.quit());
