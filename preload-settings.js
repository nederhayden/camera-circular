'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApp', {
  get: () => ipcRenderer.invoke('appearance:get'),
  update: (patch) => ipcRenderer.send('appearance:update', patch),
  onChange: (cb) => ipcRenderer.on('appearance:changed', (_e, value) => cb(value)),
});
