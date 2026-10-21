// Единая пиксельная рамка: тень, светлая рамка 1 px, тёмная заливка. Координаты центра, как у rectangle.
import { COLORS } from './style.js';

export const PANEL = {
  fill: COLORS.panel,
  fillFocus: COLORS.panelFocus,
  border: COLORS.stroke,
  borderFocus: COLORS.strokeFocus,
  shadow: 0x000000,
};

export function addPanel(scene, x, y, w, h, opts = {}) {
  const g = scene.add.graphics();
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);
  const panel = {
    g,
    colors: { fill: PANEL.fill, border: PANEL.border, ...opts },
    draw(fill, border) {
      g.clear();
      g.fillStyle(PANEL.shadow, 0.45).fillRect(left + 2, top + 2, w, h);
      g.fillStyle(border, 1).fillRect(left, top, w, h);
      g.fillStyle(fill, 1).fillRect(left + 1, top + 1, w - 2, h - 2);
      // светлая верхняя кромка внутри рамки
      g.fillStyle(0xffffff, 0.08).fillRect(left + 1, top + 1, w - 2, 1);
    },
    setFocus(f) {
      this.draw(f ? PANEL.fillFocus : this.colors.fill, f ? PANEL.borderFocus : this.colors.border);
      return this;
    },
    setAlpha(a) { g.setAlpha(a); return this; },
    setDepth(d) { g.setDepth(d); return this; },
    destroy() { g.destroy(); },
  };
  panel.setFocus(false);
  return panel;
}
