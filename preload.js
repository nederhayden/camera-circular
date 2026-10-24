'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Ponte mínima e explícita entre a página e o processo principal.
contextBridge.exposeInMainWorld('cameraApp', {
  getState: () => ipcRenderer.invoke('state:get'),
  startInteraction: (type) => ipcRenderer.send('interaction:start', type),
  endInteraction: () => ipcRenderer.send('interaction:end'),
  resizeBy: (delta) => ipcRenderer.send('win:resize-by', delta),
  resetSize: () => ipcRenderer.send('win:reset'),
  quit: () => ipcRenderer.send('app:quit'),
  openMenu: (x, y) => ipcRenderer.send('menu:open', { x, y }),
  updateCameras: (list, activeId) => ipcRenderer.send('cameras:update', { list, activeId }),
  onSelectCamera: (cb) => ipcRenderer.on('camera:select', (_e, id) => cb(id)),
  onAppearance: (cb) => ipcRenderer.on('appearance:changed', (_e, value) => cb(value)),
  onMirror: (cb) => ipcRenderer.on('settings:mirror', (_e, value) => cb(Boolean(value))),
  onVisibility: (cb) => ipcRenderer.on('visibility', (_e, value) => cb(Boolean(value))),
});
