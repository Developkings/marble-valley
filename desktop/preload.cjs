const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('marbleNet', {
  start: () => ipcRenderer.invoke('net-start'),
  setBeacon: (data) => ipcRenderer.send('net-beacon', data),
  send: (ip, data) => ipcRenderer.send('net-send', ip, data),
  onMessage: (listener) => ipcRenderer.on('net-message', (_e, message) => listener(message)),
});
