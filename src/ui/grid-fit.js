// Раскладка разделов иконок в панели (кодекс, Armory): у каждого раздела заголовок и сетка клеток.
// Ищется самая крупная клетка, при которой все разделы влезают в w×h; ряды раздела выравниваются
// (16 при 11 в ряд — 8 + 8, а не 11 + 5). Без Phaser: проверяется в tests/unit/grid-fit.test.js.

/**
 * @param {!Array<number>} counts число клеток в каждом разделе
 * @param {number} w ширина области под сетку
 * @param {number} h высота области (заголовки, клетки и зазоры между разделами)
 * @param {{sizes: (!Array<number>|undefined), gap: (number|undefined), head: (number|undefined),
 *     secGap: (number|undefined)}=} o sizes — размеры клетки по убыванию; gap — зазор клеток;
 *     head — высота заголовка раздела вместе с отступом до клеток; secGap — зазор между разделами
 * @return {{size: number, step: number, head: number, cols: !Array<number>, rows: !Array<number>,
 *     width: number, height: number}} cols и rows по разделам; width — ширина самой широкой сетки
 */
export function fitSections(counts, w, h, o = {}) {
  const sizes = o.sizes || [28, 26, 24, 22, 20, 18, 16, 14, 12];
  const gap = o.gap ?? 2;
  const head = o.head ?? 14;
  const secGap = o.secGap ?? 4;
  let best = null;
  for (const size of sizes) {
    const step = size + gap;
    const maxCols = Math.max(1, Math.floor((w + gap) / step));
    const rows = counts.map((n) => Math.ceil(n / maxCols));
    const cols = counts.map((n, i) => (rows[i] ? Math.ceil(n / rows[i]) : 0));
    const grid = rows.reduce((s, r) => s + (r ? r * step - gap : 0), 0);
    const height = counts.length * head + grid + Math.max(0, counts.length - 1) * secGap;
    const width = Math.max(0, ...cols.map((c) => (c ? c * step - gap : 0)));
    best = { size, step, head, cols, rows, width, height };
    if (height <= h) break;
  }
  return best;
}
