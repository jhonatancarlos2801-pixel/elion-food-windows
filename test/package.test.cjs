'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('empacotamento Windows tem nome e atalhos obrigatórios', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.productName, 'ELION FOOD');
  assert.equal(pkg.build.artifactName, 'ELION-FOOD-Setup.${ext}');
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  assert.equal(pkg.build.publish[0].provider, 'github');
  assert.equal(pkg.build.publish[0].repo, 'elion-food-windows');
});

test('janela remota mantém título e impressão silenciosa dinâmica explícitos', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.cjs'), 'utf8');
  assert.match(main, /silent:\s*true/);
  assert.match(main, /deviceName:\s*destination\.deviceName/);
  assert.match(main, /page-title-updated/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /setTitle\(APP_NAME\)/);
  assert.match(main, /executeJavaScript/);
  assert.match(main, /height:\s*documentHeightMicrons\(heightPixels\)/);
  assert.match(main, /webPreferences:\s*secureWebPreferences\(webPreferences\)/);
  assert.match(main, /trustedPrintSenderFrame\(event\.senderFrame\)/);
});
