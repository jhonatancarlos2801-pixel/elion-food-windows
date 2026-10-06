'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedPrintFrame } = require('../src/security.cjs');
const { secureWebPreferences } = require('../src/secure-web-preferences.cjs');

const production = 'https://restaurante.grupoelion.com.br/pedidos';

test('preferências seguras prevalecem sem descartar preload e subframes', () => {
  const result = secureWebPreferences({
    preload: '/tmp/preload.cjs',
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    nodeIntegration: true,
    sandbox: false,
    devTools: true,
    webviewTag: true,
  });
  assert.equal(result.preload, '/tmp/preload.cjs');
  assert.equal(result.nodeIntegrationInSubFrames, true);
  assert.deepEqual(
    { contextIsolation: result.contextIsolation, nodeIntegration: result.nodeIntegration, sandbox: result.sandbox, devTools: result.devTools, webviewTag: result.webviewTag },
    { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false, webviewTag: false },
  );
});

test('aceita somente frame principal de produção ou srcdoc filho de produção', () => {
  assert.equal(isTrustedPrintFrame({ url: production, topUrl: production, isMainFrame: true }), true);
  assert.equal(isTrustedPrintFrame({ url: 'about:srcdoc', topUrl: production, isMainFrame: false }), true);
  assert.equal(isTrustedPrintFrame({ url: 'https://third-party.example/frame', topUrl: production, isMainFrame: false }), false);
  assert.equal(isTrustedPrintFrame({ url: production, topUrl: production, isMainFrame: false }), false);
  assert.equal(isTrustedPrintFrame({ url: 'about:srcdoc', topUrl: 'https://evil.example', isMainFrame: false }), false);
});
