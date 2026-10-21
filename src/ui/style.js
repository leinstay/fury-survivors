import { RENDER_ZOOM } from '../data/constants.js';
// Общие стили текста. Шрифт пока monospace, размеры целые.
export const FONT = 'monospace';

// resolution = RENDER_ZOOM: текст рисуется в разрешении холста и не огрубляется зумом камеры.
export function textStyle(size = 12, color = '#ffffff', extra = {}) {
  return { fontFamily: FONT, fontSize: `${Math.round(size)}px`, color, resolution: RENDER_ZOOM, ...extra };
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
