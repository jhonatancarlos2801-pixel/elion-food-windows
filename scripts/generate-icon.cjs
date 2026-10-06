'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

async function main() {
  const buildDir = path.resolve(__dirname, '..', 'build');
  const source = path.join(buildDir, 'icon-source.png');
  const outputPng = path.join(buildDir, 'icon.png');
  const outputIco = path.join(buildDir, 'icon.ico');
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  await fs.access(source);
  await sharp(source).resize(512, 512, { fit: 'contain' }).png().toFile(outputPng);
  const pngs = await Promise.all(sizes.map((size) => sharp(source)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer()));
  await fs.writeFile(outputIco, await pngToIco(pngs));
  console.log(`Ícones gerados a partir de ${path.basename(source)} sem alteração da arte.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
