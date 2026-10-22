// Вырезка фигуры из сырого листа модели в исходном разрешении (без снятия сетки): для крупного показа, например в меню.
// node tools/crop-raw.mjs <raw.png> <x> <y> <w> <h> <out.png>
//   фон и полупрозрачное свечение вокруг фигуры убираются той же маской, что в clean-sprite; рамка обрезается по фигуре.
import sharp from 'sharp';
import { buildMask, removeSpecks } from './clean-sprite.mjs';

const [src, ...rest] = process.argv.slice(2);
const [x, y, w, h] = rest.slice(0, 4).map(Number);
const out = rest[4];
if (!src || !out || [x, y, w, h].some((v) => !Number.isFinite(v))) {
  console.error('usage: node tools/crop-raw.mjs <raw.png> <x> <y> <w> <h> <out.png>');
  process.exit(2);
}

const { data } = await sharp(src).extract({ left: x, top: y, width: w, height: h })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { mask } = buildMask(data, w, h);
removeSpecks(mask, w, h, 40);
let x0 = w;
let x1 = -1;
let y0 = h;
let y1 = -1;
for (let i = 0; i < w * h; i++) {
  if (!mask[i]) { data[i * 4 + 3] = 0; continue; }
  data[i * 4 + 3] = 255;
  const px = i % w;
  const py = (i / w) | 0;
  if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
}
await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toFile(out);
console.log(`${out} ${x1 - x0 + 1}x${y1 - y0 + 1}`);
