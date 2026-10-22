// Процедурный бесшовный тайл травы (кадр из manifest, обычная плотность) → assets/sprites/grass.png.
// Тайл крупный (128×128), чтобы повтор узора не бросался в глаза.
// node tools/make-grass.mjs [--seed 7]
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../assets/sprites/manifest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = SPRITES.grass;
const S = spec.frameWidth;
const seedArg = process.argv.indexOf('--seed');
let seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 7;

const COLORS = {
  base: [63, 107, 53],
  dark: [55, 94, 46],
  light: [74, 120, 60],
  tuftDark: [47, 82, 41],
  tuftLight: [98, 142, 72],
};

function rnd() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function frame() {
  const px = Array.from({ length: S * S }, () => COLORS.base);
  const put = (x, y, c) => { px[((y + S) % S) * S + ((x + S) % S)] = c; };
  // пятна светлее и темнее: короткие горизонтальные мазки, чтобы не было шума по пикселю
  for (let i = 0; i < (S * S) / 40; i++) {
    const c = rnd() < 0.5 ? COLORS.dark : COLORS.light;
    const x = Math.floor(rnd() * S);
    const y = Math.floor(rnd() * S);
    const len = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < len; k++) put(x + k, y, c);
    if (rnd() < 0.5) for (let k = 1; k < len - 1; k++) put(x + k, y + 1, c);
  }
  // пучки травы: «галочка» из тёмного низа и светлых кончиков
  for (let i = 0; i < (S * S) / 150; i++) {
    const x = Math.floor(rnd() * S);
    const y = Math.floor(rnd() * S);
    put(x, y, COLORS.tuftDark);
    put(x - 1, y - 1, COLORS.tuftLight);
    put(x + 1, y - 1, COLORS.tuftLight);
    if (rnd() < 0.6) { put(x, y - 1, COLORS.tuftDark); put(x, y - 2, COLORS.tuftLight); }
  }
  return px;
}

const frames = Array.from({ length: spec.frames }, frame);
const W = S * spec.frames;
const buf = Buffer.alloc(W * S * 4);
frames.forEach((px, f) => px.forEach((c, i) => {
  const o = ((Math.floor(i / S)) * W + f * S + (i % S)) * 4;
  buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
}));
await sharp(buf, { raw: { width: W, height: S, channels: 4 } }).png().toFile(join(root, spec.file));
console.log(`${spec.file} ${W}x${S}`);
