'use strict';

const SAFE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  devTools: false,
  webviewTag: false,
});

function secureWebPreferences(extra = {}) {
  return { ...extra, ...SAFE_WEB_PREFERENCES };
}

module.exports = { SAFE_WEB_PREFERENCES, secureWebPreferences };
