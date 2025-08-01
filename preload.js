// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveConfig: (config) => ipcRenderer.send('save-config', config),
  requestInitialConfig: () => ipcRenderer.send('request-initial-config'),
  onLoadConfig: (callback) => ipcRenderer.on('load-config', (event, ...args) => callback(...args)),
  
  testPrint: () => ipcRenderer.send('test-print'),
  
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),
  onSetNgrokUrl: (callback) => ipcRenderer.on('set-ngrok-url', (event, ...args) => callback(...args))
});