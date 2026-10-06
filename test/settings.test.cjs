'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { activeDestinations, normalizeSettings } = require('../src/settings.cjs');

test('normaliza configurações e limita papel a 58 ou 80 mm', () => {
  const value = normalizeSettings({
    launchAtLogin: true,
    kitchen: { enabled: true, deviceName: '  EPSON TM-T20  ', paperWidthMm: 58 },
    counter: { enabled: true, deviceName: 'B'.repeat(300), paperWidthMm: 72 },
  });
  assert.equal(value.launchAtLogin, true);
  assert.equal('autoPrint' in value, false);
  assert.deepEqual(value.kitchen, { enabled: true, deviceName: 'EPSON TM-T20', paperWidthMm: 58 });
  assert.equal(value.counter.paperWidthMm, 80);
  assert.equal(value.counter.deviceName.length, 256);
});

test('retorna somente destinos ativos com impressora selecionada', () => {
  const settings = normalizeSettings({
    kitchen: { enabled: true, deviceName: 'Cozinha', paperWidthMm: 80 },
    counter: { enabled: false, deviceName: 'Balcão', paperWidthMm: 58 },
  });
  assert.deepEqual(activeDestinations(settings), [
    { id: 'kitchen', enabled: true, deviceName: 'Cozinha', paperWidthMm: 80 },
  ]);
});
