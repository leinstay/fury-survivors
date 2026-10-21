import { RENDER_ZOOM } from '../data/constants.js';
// Общие стили текста. Jersey 15 (OFL), fallback monospace.
export const FONT_NAME = 'Jersey 15';
// Jersey 15 уже и мельче прежнего Pixelify Sans: размеры в коде остались прежними, шрифт их чуть увеличивает.
const FONT_SCALE = 1.15;
export const FONT = `'${FONT_NAME}', monospace`;
// Метрики Jersey 15 в долях размера (замер canvas measureText): заглавные и цифры занимают 0.56 над базовой линией.
// Phaser сам меряет по «|MÉqgy» и получает рамку 0.76 / 0.15, в которой цифры сидят ниже центра. Задаём рамку
// 0.76 / 0.20: запас сверху и снизу от заглавных одинаковый (0.20), поэтому setOrigin(…, 0.5) ставит их ровно по центру.
const METRICS = { ascent: 0.76, descent: 0.2 };

// resolution = RENDER_ZOOM: текст рисуется в разрешении холста и не огрубляется зумом камеры.
export function textStyle(size = 12, color = '#ffffff', extra = {}) {
  const px = Math.round(size * FONT_SCALE);
  const ascent = Math.round(px * METRICS.ascent), descent = Math.round(px * METRICS.descent);
  return { fontFamily: FONT, fontSize: `${px}px`, color, resolution: RENDER_ZOOM, metrics: { ascent, descent, fontSize: ascent + descent }, ...extra };
}

export const COLORS = {
  panel: 0x1a1426,
  panelFocus: 0x3a2a5a,
  stroke: 0x6a5a8a,
  strokeFocus: 0xffd84a,
  accent: '#ff7a3d',
  dim: '#aaaaaa',
  hp: 0xd23a3a,
  xp: 0x4fc3ff,
};
