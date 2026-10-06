'use strict';

const MICRONS_PER_INCH = 25_400;
const CSS_PIXELS_PER_INCH = 96;
const MIN_RECEIPT_HEIGHT_MICRONS = 50_000;
const MAX_RECEIPT_HEIGHT_MICRONS = 2_000_000;
const VERTICAL_MARGIN_MICRONS = 4_000;

function documentHeightMicrons(heightPixels) {
  const pixels = Number.isFinite(Number(heightPixels)) ? Math.max(0, Number(heightPixels)) : 0;
  const content = Math.ceil((pixels * MICRONS_PER_INCH) / CSS_PIXELS_PER_INCH);
  return Math.min(MAX_RECEIPT_HEIGHT_MICRONS, Math.max(MIN_RECEIPT_HEIGHT_MICRONS, content + VERTICAL_MARGIN_MICRONS));
}

module.exports = {
  MAX_RECEIPT_HEIGHT_MICRONS,
  MIN_RECEIPT_HEIGHT_MICRONS,
  documentHeightMicrons,
};
