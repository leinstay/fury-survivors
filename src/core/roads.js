// Песчаные дороги: сеть из «полос» по всему миру, заданная формулой, поэтому дорога никогда не обрывается
// и в любой точке мира известна без генерации соседей. Чистая логика: sim ставит по ней объекты (вагонетки
// на дороге, фонари у обочины), рендер рисует песок (src/render/roads.js), декор не сажает на неё деревья.
//
// Полоса k горизонтальная: y(x) = (k + 0.5) * spacing + wobble * sin(x / wave + p1) + wobble * 0.4 * sin(x / wave2 + p2);
// вертикальные симметрично x(y). Фазы p1, p2 и само наличие полосы (chance) выводятся из сида и номера полосы.
// Пересечения горизонтальных и вертикальных полос дают перекрёстки сами собой.
import { hashSeed } from './rng.js';

const SALT_H = 1;
const SALT_V = 2;

/**
 * @param {{spacing: number, width: number, chance: number, wobble: number, wave: number, wave2: number}} cfg
 * @param {number} seed
 * @return {!Object} roads
 */
export function createRoads(cfg, seed) {
  const unit = (salt, k, n) => hashSeed(seed, salt * 1000003 + n, k) / 4294967296;
  const lanes = new Map(); // "salt,k" -> { on, p1, p2 }
  const lane = (salt, k) => {
    const key = salt * 65536 + (k + 32768);
    let l = lanes.get(key);
    if (!l) {
      l = {
        on: unit(salt, k, 0) < cfg.chance,
        p1: unit(salt, k, 1) * 6.2832,
        p2: unit(salt, k, 2) * 6.2832,
      };
      lanes.set(key, l);
    }
    return l;
  };
  // Осевая линия полосы k по координате вдоль неё.
  const center = (l, k, s) => (k + 0.5) * cfg.spacing +
    cfg.wobble * Math.sin(s / cfg.wave + l.p1) + cfg.wobble * 0.4 * Math.sin(s / cfg.wave2 + l.p2);
  const slope = (l, s) => (cfg.wobble / cfg.wave) * Math.cos(s / cfg.wave + l.p1) +
    (cfg.wobble * 0.4 / cfg.wave2) * Math.cos(s / cfg.wave2 + l.p2);

  const roads = {
    cfg,

    /**
     * Ближайшая полоса. @return {{d: number, angle: number}} расстояние до оси и направление дороги (рад)
     */
    nearest(x, y) {
      let best = Infinity;
      let angle = 0;
      const kh = Math.floor(y / cfg.spacing);
      for (let k = kh - 1; k <= kh + 1; k++) {
        const l = lane(SALT_H, k);
        if (!l.on) continue;
        const d = Math.abs(y - center(l, k, x));
        if (d < best) { best = d; angle = Math.atan(slope(l, x)); }
      }
      const kv = Math.floor(x / cfg.spacing);
      for (let k = kv - 1; k <= kv + 1; k++) {
        const l = lane(SALT_V, k);
        if (!l.on) continue;
        const d = Math.abs(x - center(l, k, y));
        if (d < best) { best = d; angle = Math.PI / 2 - Math.atan(slope(l, y)); }
      }
      return { d: best, angle };
    },

    /** @return {number} расстояние от точки до оси ближайшей дороги */
    distance(x, y) {
      return roads.nearest(x, y).d;
    },

    /** @return {boolean} точка на полотне дороги (с запасом margin от края, может быть отрицательным) */
    onRoad(x, y, margin = 0) {
      return roads.distance(x, y) < cfg.width / 2 + margin;
    },

    /**
     * Случайная точка на оси дороги внутри чанка или null, если дорога через чанк не проходит.
     * @param {number} x0 левый край, @param {number} y0 верхний край, @param {number} size сторона чанка
     * @param {{next: function(): number}} rnd
     * @return {?{x: number, y: number, angle: number}}
     */
    pointInChunk(x0, y0, size, rnd) {
      const cand = [];
      const kh0 = Math.floor((y0 - cfg.wobble * 1.4) / cfg.spacing);
      const kh1 = Math.floor((y0 + size + cfg.wobble * 1.4) / cfg.spacing);
      for (let k = kh0; k <= kh1; k++) {
        const l = lane(SALT_H, k);
        if (!l.on) continue;
        const x = x0 + rnd() * size;
        const y = center(l, k, x);
        if (y >= y0 && y < y0 + size) cand.push({ x, y, angle: Math.atan(slope(l, x)) });
      }
      const kv0 = Math.floor((x0 - cfg.wobble * 1.4) / cfg.spacing);
      const kv1 = Math.floor((x0 + size + cfg.wobble * 1.4) / cfg.spacing);
      for (let k = kv0; k <= kv1; k++) {
        const l = lane(SALT_V, k);
        if (!l.on) continue;
        const y = y0 + rnd() * size;
        const x = center(l, k, y);
        if (x >= x0 && x < x0 + size) {
          cand.push({ x, y, angle: Math.PI / 2 - Math.atan(slope(l, y)) });
        }
      }
      if (!cand.length) return null;
      return cand[Math.floor(rnd() * cand.length)];
    },

    /**
     * Таблицы осей для прямоугольника (рендер песка): для горизонтальных полос y оси по каждому x,
     * для вертикальных x оси по каждому y. Расстояние в точке = min(|y - h[i][x - x0]|, |x - v[j][y - y0]|).
     * @return {{h: !Array<!Float32Array>, v: !Array<!Float32Array>}}
     */
    tables(x0, y0, w, h) {
      const out = { h: [], v: [] };
      const pad = cfg.wobble * 1.4 + cfg.width;
      const kh1 = Math.floor((y0 + h + pad) / cfg.spacing);
      for (let k = Math.floor((y0 - pad) / cfg.spacing); k <= kh1; k++) {
        const l = lane(SALT_H, k);
        if (!l.on) continue;
        const t = new Float32Array(w);
        for (let i = 0; i < w; i++) t[i] = center(l, k, x0 + i);
        out.h.push(t);
      }
      const kv1 = Math.floor((x0 + w + pad) / cfg.spacing);
      for (let k = Math.floor((x0 - pad) / cfg.spacing); k <= kv1; k++) {
        const l = lane(SALT_V, k);
        if (!l.on) continue;
        const t = new Float32Array(h);
        for (let i = 0; i < h; i++) t[i] = center(l, k, y0 + i);
        out.v.push(t);
      }
      return out;
    },

    /** @return {boolean} в квадрате чанка есть полотно дороги (грубо, по оси и углам) */
    crossesChunk(x0, y0, size) {
      const h = size / 2;
      const r = cfg.width / 2;
      const pts = [
        [x0 + h, y0 + h], [x0, y0], [x0 + size, y0], [x0, y0 + size], [x0 + size, y0 + size],
      ];
      for (const [x, y] of pts) if (roads.distance(x, y) < h * 1.5 + r) return true;
      return false;
    },
  };
  return roads;
}
