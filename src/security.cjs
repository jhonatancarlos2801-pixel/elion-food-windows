'use strict';

const { PRODUCTION_ORIGIN } = require('./constants.cjs');

function hasProductionOrigin(url) {
  try {
    return new URL(url).origin === PRODUCTION_ORIGIN;
  } catch {
    return false;
  }
}

function isTrustedPrintFrame({ url, topUrl, isMainFrame }) {
  if (!hasProductionOrigin(topUrl)) return false;
  if (isMainFrame) return hasProductionOrigin(url);
  return url === 'about:srcdoc';
}

module.exports = { hasProductionOrigin, isTrustedPrintFrame };
