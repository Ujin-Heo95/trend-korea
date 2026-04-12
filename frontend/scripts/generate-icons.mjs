import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'public/brand_logo_mini.png');
const OUT = resolve(ROOT, 'public/icons');

await mkdir(OUT, { recursive: true });

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function squareOnWhite(size, innerRatio) {
  const inner = Math.round(size * innerRatio);
  const mark = await sharp(SRC)
    .resize({ width: inner, height: inner, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png();
}

const targets = [
  { name: 'icon-192.png', size: 192, ratio: 0.78 },
  { name: 'icon-512.png', size: 512, ratio: 0.78 },
  { name: 'icon-maskable-192.png', size: 192, ratio: 0.62 },
  { name: 'icon-maskable-512.png', size: 512, ratio: 0.62 },
  { name: 'apple-touch-icon-180.png', size: 180, ratio: 0.78 },
];

for (const t of targets) {
  const img = await squareOnWhite(t.size, t.ratio);
  await img.toFile(resolve(OUT, t.name));
  console.log(`✓ ${t.name} (${t.size}×${t.size})`);
}
console.log('Done.');
