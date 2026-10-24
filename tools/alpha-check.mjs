// Проверка листа на ореол: доля полупрозрачных пикселей и превью на чёрном и белом фоне (дымка видна сразу).
// node tools/alpha-check.mjs assets/raw/icons_all.png   ->   tools/out/<имя>_black.png, tools/out/<имя>_white.png
// Чистый лист (каждый пиксель либо целиком непрозрачный, либо прозрачный) режется без потерь; доля
// полупрозрачных выше пары процентов — модель нарисовала свечение мягким, его надо убирать.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/alpha-check.mjs <sheet.png>'); process.exit(2); }
const img = sharp(file).ensureAlpha();
const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
const n = info.width * info.height;
let clear = 0;
let solid = 0;
let soft = 0;
for (let i = 0; i < n; i++) {
  const a = data[i * 4 + 3];
  if (a === 0) clear++; else if (a === 255) solid++; else soft++;
}
const pct = (v) => `${((v / n) * 100).toFixed(1)} %`;
console.log(`${info.width}×${info.height}: прозрачных ${pct(clear)}, непрозрачных ${pct(solid)}, полупрозрачных ${pct(soft)}`);
if (clear < n * 0.05) console.log('прозрачного фона почти нет: модель нарисовала непрозрачный фон');
const out = join(import.meta.dirname, 'out');
mkdirSync(out, { recursive: true });
const name = basename(file, extname(file));
for (const [bg, rgb] of [['black', { r: 0, g: 0, b: 0 }], ['white', { r: 255, g: 255, b: 255 }]]) {
  await img.clone().flatten({ background: rgb }).png().toFile(join(out, `${name}_${bg}.png`));
}
console.log(`превью: tools/out/${name}_black.png, tools/out/${name}_white.png`);
