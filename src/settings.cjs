'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PAPER_WIDTHS } = require('./constants.cjs');

const DEFAULT_SETTINGS = Object.freeze({
  launchAtLogin: false,
  kitchen: { enabled: true, deviceName: '', paperWidthMm: 80 },
  counter: { enabled: false, deviceName: '', paperWidthMm: 80 },
});

function cleanDestination(value, fallback) {
  const input = value && typeof value === 'object' ? value : {};
  const width = Number(input.paperWidthMm);
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled,
    deviceName: typeof input.deviceName === 'string' ? input.deviceName.trim().slice(0, 256) : fallback.deviceName,
    paperWidthMm: PAPER_WIDTHS.includes(width) ? width : fallback.paperWidthMm,
  };
}

function normalizeSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    launchAtLogin: typeof input.launchAtLogin === 'boolean' ? input.launchAtLogin : DEFAULT_SETTINGS.launchAtLogin,
    kitchen: cleanDestination(input.kitchen, DEFAULT_SETTINGS.kitchen),
    counter: cleanDestination(input.counter, DEFAULT_SETTINGS.counter),
  };
}

function activeDestinations(settings) {
  return ['kitchen', 'counter']
    .map((id) => ({ id, ...settings[id] }))
    .filter((destination) => destination.enabled && destination.deviceName);
}

function createSettingsStore(filePath) {
  let current = { ...DEFAULT_SETTINGS, kitchen: { ...DEFAULT_SETTINGS.kitchen }, counter: { ...DEFAULT_SETTINGS.counter } };
  try {
    current = normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[settings] Não foi possível ler as configurações:', error.message);
  }

  return {
    get() {
      return structuredClone(current);
    },
    save(next) {
      current = normalizeSettings(next);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, filePath);
      return this.get();
    },
  };
}

module.exports = { DEFAULT_SETTINGS, activeDestinations, createSettingsStore, normalizeSettings };
