// Процедурный взмах клинка (полумесяц, выпуклый вправо) → assets/sprites/proj_blade_arc.png.
// Гладкий, без пиксельной сетки: оружие масштабирует его до ×2, текстура уменьшается линейно (smooth в manifest).
// Почти белый, чтобы tint супероружия (crimson_arc, reaper_crescent) красил его целиком.
// node tools/make-slash.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../assets/sprites/manifest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = SPRITES.proj_blade_arc.frameWidth;
const k = S / 256;

// Внешняя дуга: круг A, внутренняя: круг B; концы полумесяца там, где круги пересекаются.
const cy = 128 * k;
const A = { x: 110 * k, r: 120 * k };
const B = { x: 57 * k, r: 108 * k };
const tipY = 108 * k;
const tipX = A.x - Math.sqrt(A.r * A.r - tipY * tipY);

const path = `M ${tipX} ${cy - tipY} A ${A.r} ${A.r} 0 0 1 ${tipX} ${cy + tipY} A ${B.r} ${B.r} 0 0 0 ${tipX} ${cy - tipY} Z`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <radialGradient id="body" cx="${A.x}" cy="${cy}" r="${A.r}" gradientUnits="userSpaceOnUse">
      <stop offset="0.45" stop-color="#9fd4ff" stop-opacity="0.3"/>
      <stop offset="0.72" stop-color="#c8e8ff" stop-opacity="0.9"/>
      <stop offset="0.9" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e2f3ff"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${7 * k}"/></filter>
  </defs>
  <path d="${path}" fill="#bfe4ff" opacity="0.7" filter="url(#glow)"/>
  <path d="${path}" fill="url(#body)"/>
</svg>`;

const out = join(root, SPRITES.proj_blade_arc.file);
await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote', out, `${S}x${S}`);
