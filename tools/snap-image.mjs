// Снятие целой картинки (фон, арт меню) по родной сетке модели: одна клетка в пиксель, без потерь.
// node tools/snap-image.mjs <raw.png> <out.png> [--step 5.76]
//   без --step шаг ищется по перепадам цвета (как у спрайтов, диапазон 3–8 px исходника).
import sharp from 'sharp';
import { edgeProfiles, edgePeaks, commonStep, gridSnap } from './clean-sprite.mjs';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node tools/snap-image.mjs <raw.png> <out.png> [--step N]');
  process.exit(2);
}
const stepArg = process.argv.indexOf('--step');

const { data, info } = await sharp(src).removeAlpha().ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const mask = new Uint8Array(w * h).fill(1);
const prof = edgeProfiles(data, mask, w, h, { x0: 0, x1: w - 1, y0: 0, y1: h - 1 });
let step = stepArg > 0 ? Number(process.argv[stepArg + 1]) : 0;
if (!step) {
  const sx = commonStep([edgePeaks(prof.colE, prof.x0, prof.x1, 2)], 3, 8);
  const sy = commonStep([edgePeaks(prof.rowE, prof.y0, prof.y1, 2)], 3, 8);
  step = (sx + sy) / 2;
}
const im = gridSnap(data, mask, w, prof, step, step);
await sharp(Buffer.from(im.rgba), { raw: { width: im.w, height: im.h, channels: 4 } })
    .png().toFile(out);
console.log(`${out} ${im.w}x${im.h}, step ${step.toFixed(2)}`);
