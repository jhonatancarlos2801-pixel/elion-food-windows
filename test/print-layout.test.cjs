'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_RECEIPT_HEIGHT_MICRONS,
  MIN_RECEIPT_HEIGHT_MICRONS,
  documentHeightMicrons,
} = require('../src/print-layout.cjs');

test('converte altura CSS em microns e inclui margem vertical', () => {
  assert.equal(documentHeightMicrons(960), 258_000);
});

test('limita recibos vazios e excepcionalmente longos', () => {
  assert.equal(documentHeightMicrons(0), MIN_RECEIPT_HEIGHT_MICRONS);
  assert.equal(documentHeightMicrons(Number.NaN), MIN_RECEIPT_HEIGHT_MICRONS);
  assert.equal(documentHeightMicrons(100_000), MAX_RECEIPT_HEIGHT_MICRONS);
});
