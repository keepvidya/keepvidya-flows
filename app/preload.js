/**
 * Preload — exposes a safe, minimal bridge to the renderer as window.kvflows.
 * The renderer (renderer/index.html) detects this object and upgrades the
 * prototype's mocked flow into real, local generation; without it, the same
 * file still runs as a browser prototype.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kvflows', {
  platform: process.platform,
  appVersion: () => ipcRenderer.invoke('app:version'),

  // Custom titlebar window controls (frameless window)
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximizeToggle: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
  },

  // Local model / Ollama status
  ollamaStatus: () => ipcRenderer.invoke('ollama:status'),

  // First-run setup: probe Ollama + hardware, install/pull/warm as needed
  system: {
    probe: () => ipcRenderer.invoke('system:probe'),
    installOllama: () => ipcRenderer.invoke('ollama:install'),
    pullModel: (model) => ipcRenderer.invoke('model:pull', { model }),
    warm: (model) => ipcRenderer.invoke('model:warm', { model }),
    onPullProgress: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('model:progress', h); return () => ipcRenderer.removeListener('model:progress', h); },
  },

  // Config + providers
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    setMode: (mode) => ipcRenderer.invoke('config:setMode', mode),
    setDefault: (id) => ipcRenderer.invoke('config:setDefault', id),
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    save: (id, fields) => ipcRenderer.invoke('providers:save', { id, fields }),
    test: (id, fields) => ipcRenderer.invoke('providers:test', { id, fields }),
  },

  // Flows
  runFlow: (opts) => ipcRenderer.invoke('flow:run', opts),
  onFlowProgress: (cb) => { const h = (_e, line) => cb(line); ipcRenderer.on('flow:progress', h); return () => ipcRenderer.removeListener('flow:progress', h); },

  // Library — the user's saved storage
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    get: (id) => ipcRenderer.invoke('library:get', { id }),
    remove: (id) => ipcRenderer.invoke('library:delete', { id }),
    novelize: (id) => ipcRenderer.invoke('library:novelize', { id }),
  },

  // Files + artifacts
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  fetchUrl: (url) => ipcRenderer.invoke('web:fetch', url),
  saveArtifact: (suggestedName, content) => ipcRenderer.invoke('artifact:save', { suggestedName, content }),

  // Navigation from the tray
  onNavigate: (cb) => { const h = (_e, route) => cb(route); ipcRenderer.on('navigate', h); return () => ipcRenderer.removeListener('navigate', h); },

  // Auto-update (mirrors Knovex)
  onUpdateProgress: (cb) => { const h = (_e, info) => cb(info); ipcRenderer.on('app:update-progress', h); return () => ipcRenderer.removeListener('app:update-progress', h); },
  onUpdateDownloaded: (cb) => { const h = (_e, info) => cb(info); ipcRenderer.on('app:update-downloaded', h); return () => ipcRenderer.removeListener('app:update-downloaded', h); },
  installUpdate: () => ipcRenderer.send('app:install-update'),
});
