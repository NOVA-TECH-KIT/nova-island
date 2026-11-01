const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('prefs', {
  features: () => ipcRenderer.invoke('features-get'),
  setFeatures: (patch) => ipcRenderer.send('features-set', patch),
  resetFeatures: () => ipcRenderer.send('features-reset'),
  onFeatures: on('features'),
  general: () => ipcRenderer.invoke('general-get'),
  setGeneral: (key, value) => ipcRenderer.send('general-set', key, value),
  onGeneral: on('general'),
  window: (action) => ipcRenderer.send('prefs-window', action),
  previewReminder: () => ipcRenderer.send('reminder-preview'),
  bridgeStatus: () => ipcRenderer.invoke('bridge-status'),
  openLog: () => ipcRenderer.send('open-log'),
  copyReport: () => ipcRenderer.invoke('copy-report'),
  location: () => ipcRenderer.invoke('loc-get'),
  searchCity: (q) => ipcRenderer.invoke('loc-search', q),
  setLocation: (loc) => ipcRenderer.send('loc-set', loc),
  onLocation: on('location'),
  calendar: () => ipcRenderer.invoke('cal-get'),
  setCalendar: (url) => ipcRenderer.invoke('cal-set', url),
  onCalendar: on('calendar'),
  openSupport: (key) => ipcRenderer.send('open-support', key),
  downloadFolders: () => ipcRenderer.invoke('dl-folders'),
  addDownloadFolder: () => ipcRenderer.invoke('dl-folder-add'),
  removeDownloadFolder: (p) => ipcRenderer.invoke('dl-folder-remove', p),
});
