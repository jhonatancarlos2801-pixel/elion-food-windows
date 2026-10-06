'use strict';

const APP_NAME = 'ELION FOOD';
const PRODUCTION_URL = 'https://restaurante.grupoelion.com.br';
const PRODUCTION_ORIGIN = new URL(PRODUCTION_URL).origin;
const PAPER_WIDTHS = Object.freeze([58, 80]);

module.exports = { APP_NAME, PAPER_WIDTHS, PRODUCTION_ORIGIN, PRODUCTION_URL };
