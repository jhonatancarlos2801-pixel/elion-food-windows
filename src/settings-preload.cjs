'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('elionSettings', Object.freeze({
  load: () => ipcRenderer.invoke('settings:get'),
  save: (settings) => ipcRenderer.invoke('settings:save', settings),
  printTest: (destination) => ipcRenderer.invoke('print:test', destination),
  retry: () => ipcRenderer.send('app:retry'),
}));
