const { contextBridge, ipcRenderer } = require('electron');

// Sichere, klar definierte Brücke zwischen Oberfläche und Hauptprozess
contextBridge.exposeInMainWorld('api', {
  state: () => ipcRenderer.invoke('state'),
  clockIn: (projectId) => ipcRenderer.invoke('clockIn', projectId),
  addProject: (name, rate) => ipcRenderer.invoke('addProject', name, rate),
  updateProject: (id, patch) => ipcRenderer.invoke('updateProject', id, patch),
  closeProject: (id) => ipcRenderer.invoke('closeProject', id),
  reopenProject: (id) => ipcRenderer.invoke('reopenProject', id),
  deleteProject: (id, reassignTo) => ipcRenderer.invoke('deleteProject', id, reassignTo),
  setActiveProject: (id) => ipcRenderer.invoke('setActiveProject', id),
  updateSessionProject: (id, projectId) => ipcRenderer.invoke('updateSessionProject', id, projectId),
  clockOut: () => ipcRenderer.invoke('clockOut'),
  startBreak: () => ipcRenderer.invoke('startBreak'),
  endBreak: () => ipcRenderer.invoke('endBreak'),
  addManual: (entry) => ipcRenderer.invoke('addManual', entry),
  updateSessionTimes: (id, ci, co, date) => ipcRenderer.invoke('updateSessionTimes', id, ci, co, date),
  addBreak: (id, s, e) => ipcRenderer.invoke('addBreak', id, s, e),
  updateBreak: (id, i, s, e) => ipcRenderer.invoke('updateBreak', id, i, s, e),
  deleteBreak: (id, i) => ipcRenderer.invoke('deleteBreak', id, i),
  deleteSession: (id) => ipcRenderer.invoke('deleteSession', id),
  updateSettings: (patch) => ipcRenderer.invoke('updateSettings', patch),
  clearLogs: () => ipcRenderer.invoke('clearLogs'),
  exportCsv: (csv, defaultName) => ipcRenderer.invoke('exportCsv', csv, defaultName),
  dataInfo: () => ipcRenderer.invoke('dataInfo'),
  openDataFolder: () => ipcRenderer.invoke('openDataFolder'),

  // Updates: Prüfung anstoßen, fertiges Update installieren, Fortschritt empfangen
  checkForUpdate: () => ipcRenderer.invoke('checkForUpdate'),
  installUpdate: () => ipcRenderer.invoke('installUpdate'),
  onUpdateEvent: (cb) => {
    ipcRenderer.on('update-event', (_e, info) => cb(info));
  },
});
