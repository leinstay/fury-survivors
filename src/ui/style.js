// Общие стили текста. Шрифт пока monospace, размеры целые.
export const FONT = 'monospace';

export function textStyle(size = 12, color = '#ffffff', extra = {}) {
  return { fontFamily: FONT, fontSize: `${Math.round(size)}px`, color, ...extra };
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
