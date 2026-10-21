import { RENDER_ZOOM } from '../data/constants.js';
// Общие стили текста. Jersey 15 (OFL), fallback monospace.
export const FONT_NAME = 'Jersey 15';
// Jersey 15 уже и мельче прежнего Pixelify Sans: размеры в коде остались прежними, шрифт их чуть увеличивает.
const FONT_SCALE = 1.15;
export const FONT = `'${FONT_NAME}', monospace`;

// resolution = RENDER_ZOOM: текст рисуется в разрешении холста и не огрубляется зумом камеры.
export function textStyle(size = 12, color = '#ffffff', extra = {}) {
  return { fontFamily: FONT, fontSize: `${Math.round(size * FONT_SCALE)}px`, color, resolution: RENDER_ZOOM, ...extra };
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
