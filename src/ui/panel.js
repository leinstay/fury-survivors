// Единая пиксельная рамка: тень, светлая рамка 1 px, тёмная заливка. Координаты центра, как у rectangle.
import { COLORS } from './style.js';

export const PANEL = {
  fill: COLORS.panel,
  fillFocus: COLORS.panelFocus,
  border: COLORS.stroke,
  borderFocus: COLORS.strokeFocus,
  borderSelected: 0x8cff6a, // выбранный вариант (герой, сложность в лобби): зелёная рамка
  shadow: 0x000000,
};

export function addPanel(scene, x, y, w, h, opts = {}) {
  const g = scene.add.graphics();
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);
  // рамка для проверки отступов (tests/smoke/spacing.spec.js)
  g.__box = { x: left, y: top, w, h };
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
    // Общие состояния всех экранов: фокус / наведение — жёлтая рамка (главнее), выбранное или
    // активное (вкладка, вариант, выбранная награда) — зелёная, остальное — обычная рамка.
    setState(focused, selected) {
      if (focused || !selected) return this.setFocus(focused);
      this.draw(PANEL.fillFocus, PANEL.borderSelected);
      return this;
    },
    setAlpha(a) { g.setAlpha(a); return this; },
    setDepth(d) { g.setDepth(d); return this; },
    destroy() { g.destroy(); },
  };
  panel.setFocus(false);
  return panel;
}
