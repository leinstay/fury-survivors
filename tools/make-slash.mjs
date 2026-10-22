// Процедурные взмахи клинка (оба выпуклые вправо, почти белые):
//   proj_blade_arc — край удара конусом (melee_arc): кусок кольца вокруг героя, центр окружности левее кадра;
//   proj_crescent — симметричный полумесяц с центром в середине кадра, для щитов и бумеранга (aegis_storm,
//   reaper_crescent), которые крутят спрайт вокруг его центра.
// Внешний край — дуга окружности с центром в герое, внутренний край сужает полосу к концам. Геометрия кадра
// берётся из WEAPON_BEHAVIOR.melee_arc (src/data/weapons.js), её же читает оружие, чтобы поставить центр
// окружности в середину тела героя.
// Гладкий, без пиксельной сетки: текстура уменьшается линейно (smooth в manifest).
// Почти белый, чтобы tint супероружия (crimson_arc, reaper_crescent) красил его целиком.
// node tools/make-slash.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../assets/sprites/manifest.js';
import { WEAPON_BEHAVIOR } from '../src/data/weapons.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARC = WEAPON_BEHAVIOR.melee_arc;
const S = SPRITES.proj_blade_arc.frameWidth;
const k = S / ARC.tex;

// Внешняя дуга: окружность с центром в герое (C). Концы — на ±arcSpan° от линии удара.
const cy = (ARC.tex / 2) * k;
const C = { x: ARC.texCenterX * k, r: ARC.texRadius * k };
const span = (ARC.arcSpan * Math.PI) / 180;
const tipX = C.x + C.r * Math.cos(span);
const tipY = C.r * Math.sin(span);
// Внутренняя дуга проходит через оба конца и середину полосы (на texThickness ближе к герою): окружность с
// центром на линии удара, (tipX - b)² + tipY² = (midX - b)².
const midX = C.x + C.r - ARC.texThickness * k;
const b = (tipX * tipX + tipY * tipY - midX * midX) / (2 * (tipX - midX));
const inner = Math.abs(midX - b);

const path = `M ${tipX} ${cy - tipY} A ${C.r} ${C.r} 0 0 1 ${tipX} ${cy + tipY} `
  + `A ${inner} ${inner} 0 0 0 ${tipX} ${cy - tipY} Z`;
const slashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <radialGradient id="body" cx="${C.x}" cy="${cy}" r="${C.r}" gradientUnits="userSpaceOnUse">
      <stop offset="${(midX - C.x) / C.r - 0.02}" stop-color="#9fd4ff" stop-opacity="0.35"/>
      <stop offset="${1 - (ARC.texThickness * k * 0.45) / C.r}" stop-color="#c8e8ff" stop-opacity="0.9"/>
      <stop offset="0.96" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e2f3ff"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${6 * k}"/></filter>
  </defs>
  <path d="${path}" fill="#bfe4ff" opacity="0.7" filter="url(#glow)"/>
  <path d="${path}" fill="url(#body)"/>
</svg>`;

// Полумесяц: внешняя дуга — круг A, внутренняя — круг B, концы там, где круги пересекаются.
const A = { x: 110 * k, r: 120 * k };
const B = { x: 57 * k, r: 108 * k };
const cTipY = 108 * k;
const cTipX = A.x - Math.sqrt(A.r * A.r - cTipY * cTipY);
const crescentPath = `M ${cTipX} ${cy - cTipY} A ${A.r} ${A.r} 0 0 1 ${cTipX} ${cy + cTipY} `
  + `A ${B.r} ${B.r} 0 0 0 ${cTipX} ${cy - cTipY} Z`;
const crescentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <radialGradient id="body" cx="${A.x}" cy="${cy}" r="${A.r}" gradientUnits="userSpaceOnUse">
      <stop offset="0.45" stop-color="#9fd4ff" stop-opacity="0.3"/>
      <stop offset="0.72" stop-color="#c8e8ff" stop-opacity="0.9"/>
      <stop offset="0.9" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e2f3ff"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${7 * k}"/></filter>
  </defs>
  <path d="${crescentPath}" fill="#bfe4ff" opacity="0.7" filter="url(#glow)"/>
  <path d="${crescentPath}" fill="url(#body)"/>
</svg>`;

for (const [key, svg] of [['proj_blade_arc', slashSvg], ['proj_crescent', crescentSvg]]) {
  const out = join(root, SPRITES[key].file);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('wrote', out, `${S}x${S}`);
}
