const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['trace', 'self', 'peers', 'stats', 'hint', 'relay', 'processing', 'sdk-error', 'session', 'pill'];

contextBridge.exposeInMainWorld('mizzle', {
  start: (opts) => ipcRenderer.invoke('start', opts),
  stop: () => ipcRenderer.invoke('stop'),
  newCode: () => ipcRenderer.invoke('new-code'),
  togglePill: () => ipcRenderer.invoke('toggle-pill'),
  openCameraSettings: () => ipcRenderer.invoke('open-camera-settings'),
  on: (channel, cb) => {
    if (!CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
});
