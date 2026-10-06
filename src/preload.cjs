'use strict';

const { contextBridge, ipcRenderer, webFrame } = require('electron');

const MAX_HTML_LENGTH = 1_500_000;
const channelToken = `elion-print-${Math.random().toString(36).slice(2)}`;

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== channelToken) return;
  const html = event.data.html;
  if (typeof html !== 'string' || html.length < 1 || html.length > MAX_HTML_LENGTH) return;
  ipcRenderer.send('print:request', { html, title: String(event.data.title || '').slice(0, 160) });
});

const installPrintBridge = `(() => {
  if (window.__ELION_FOOD_PRINT_BRIDGE__) return;
  Object.defineProperty(window, '__ELION_FOOD_PRINT_BRIDGE__', { value: true });
  window.print = () => {
    window.postMessage({
      type: ${JSON.stringify(channelToken)},
      html: document.documentElement.outerHTML,
      title: document.title
    }, '*');
  };
})()`;

webFrame.executeJavaScript(installPrintBridge).catch(() => {});

contextBridge.exposeInMainWorld('elionDesktop', Object.freeze({
  retry: () => ipcRenderer.send('app:retry'),
}));
