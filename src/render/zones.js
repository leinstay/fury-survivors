// Зоны на земле, нарисованные слоями вместо растянутого спрайта (как чеснок в Vampire Survivors):
//   aura  — святая земля: полупрозрачный диск, светлый край и волны от центра к краю в такт удару (rehit);
//   boom  — взрыв бомбы: вспышка, расходящаяся к краю за время жизни;
//   fire  — огонь на земле: мерцающий диск с краем, гаснет к концу.
//   crack — трещина молота (slam): тёмное пятно и ломаные лучи от центра (форма от uid), гаснет по p.alpha.
//   bolt  — молния (chain): рваная ломаная с ореолом и вспышкой в точке попадания, над персонажами.
//   slash — росчерк клинка (behaviors/weapons/slash.js): слегка изогнутая линза от хвоста до головы полосы, три
//           слоя (узкий полупрозрачный шлейф, тонкая середина, белое ядро 1–2 px сложением цвета); рисуется над
//           персонажами (свой слой top), голова идёт за сим (p.b), хвост догоняет её, полоса гаснет по p.alpha.
//   snake — луч-змейка (behaviors/weapons/beam.js): те же три слоя, что у слэша, вдоль ломаной p.pts (хвост →
//           голова), почти белый с голубым оттенком, сужается к хвосту, голова чуть заострена; над персонажами,
//           поднят на WEAPON_BEHAVIOR.beam.lift (окружность выхода оружия), гаснет по p.alpha.
// Цвет — tint снаряда (супероружие) или цвет зоны по умолчанию из FX.zones.
import { FX } from '../data/constants.js';
import { WEAPON_BEHAVIOR } from '../data/weapons.js';

const SL = WEAPON_BEHAVIOR.slash;
const CH = WEAPON_BEHAVIOR.chain;
const BM = WEAPON_BEHAVIOR.beam;
const SLASH_STEPS = 14; // точек на сторону линзы
const SNAKE_STEP = 3;   // px ломаной на точку ленты змейки
const SNAKE_MAX = 48;   // точек ленты не больше
// лента змейки: точки вдоль ломаной (x, y, нормаль nx, ny, доля s от хвоста), переиспользуются между кадрами
const snakeBuf = new Float64Array(SNAKE_MAX * 5);

// Псевдослучайное число 0..1 от целых a, b: форма трещины одна и та же на всех кадрах (не RNG сима).
function hash01(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawCrack(g, p, x, y) {
  const Z = FX.zones.crack;
  const a = p.alpha == null ? 1 : p.alpha;
  if (a <= 0) return;
  const c = p.tint || 0xd8b070;
  g.fillStyle(Z.dark, Z.fill * a).fillCircle(x, y, p.radius * 0.8);
  for (let i = 0; i < Z.rays; i++) {
    let ang = p.angle + (i / Z.rays) * Math.PI * 2 + (hash01(p.uid, i) - 0.5) * Z.jitter;
    const len = p.radius * (0.6 + 0.4 * hash01(p.uid, i + 100));
    let px = x;
    let py = y;
    for (let j = 1; j <= Z.joints; j++) {
      ang += (hash01(p.uid, i * 16 + j + 200) - 0.5) * Z.jitter * 2;
      const step = len / Z.joints;
      const nx = px + Math.cos(ang) * step;
      const ny = py + Math.sin(ang) * step;
      const w = Math.max(1, Z.width * (1 - (j - 1) / Z.joints));
      g.lineStyle(w + 1, c, Z.edge * a).lineBetween(px, py + 1, nx, ny + 1);
      g.lineStyle(w, Z.dark, Z.line * a).lineBetween(px, py, nx, ny);
      px = nx;
      py = ny;
    }
  }
}

// Одна сторона/слой линзы слэша: от s0 до s1 (доли длины), полуширина hw × профиль, side ±1 — изгиб.
function slashLayer(g, p, s0, s1, hw, color, alpha) {
  if (alpha <= 0 || s1 <= s0) return;
  const len = p.radius;
  const ca = Math.cos(p.angle);
  const sa = Math.sin(p.angle);
  const bow = SL.bow * len * ((p.uid & 1) ? 1 : -1);
  const pt = (s, side) => {
    const prof = Math.pow(Math.sin(Math.PI * s), SL.taper); // острые концы, толще в середине
    // голова пока идёт — острая: сужение у переднего края видимой части
    const tip = Math.min(1, (s1 - s) / 0.12 + 0.2);
    const off = bow * 4 * s * (1 - s) + side * hw * prof * tip;
    return [p.x + ca * s * len - sa * off, p.y + sa * s * len + ca * off - SL.lift];
  };
  g.fillStyle(color, alpha);
  g.beginPath();
  let q = pt(s0, 1);
  g.moveTo(q[0], q[1]);
  for (let i = 1; i <= SLASH_STEPS; i++) {
    q = pt(s0 + ((s1 - s0) * i) / SLASH_STEPS, 1);
    g.lineTo(q[0], q[1]);
  }
  for (let i = SLASH_STEPS; i >= 0; i--) {
    q = pt(s0 + ((s1 - s0) * i) / SLASH_STEPS, -1);
    g.lineTo(q[0], q[1]);
  }
  g.closePath();
  g.fillPath();
}

function drawSlash(g, glow, p) {
  const a = p.alpha == null ? 1 : p.alpha;
  if (a <= 0 || !(p.radius > 0)) return;
  const el = (p.life0 || 0) - p.life;
  const lag = SL.lag * p.a;
  const s1 = Math.min(1, p.b / p.radius);
  const k = Math.max(0, Math.min(1, (el - lag) / Math.max(1e-6, (p.life0 || 1) - lag)));
  const s0 = Math.min(s1, k * k); // хвост догоняет голову с разгоном
  const c = p.tint || SL.color;
  const hw = p.c;
  slashLayer(g, p, s0, s1, hw * SL.trail, c, SL.trailAlpha * a);
  slashLayer(g, p, s0, s1, hw * SL.mid, p.tint || SL.midColor, SL.midAlpha * a);
  slashLayer(glow, p, s0, s1, Math.max(SL.coreMin, hw * SL.core), SL.coreColor, SL.coreAlpha * a);
}

// Точки ленты змейки: ломаная p.pts, разбитая поровну по длине; нормаль по соседним точкам (углы отскоков
// скругляются). Возвращает число точек (0 — рисовать нечего).
function snakeSamples(p) {
  const pts = p.pts;
  if (!pts || pts.length < 4) return 0;
  let total = 0;
  for (let i = 2; i < pts.length; i += 2) {
    total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  }
  if (total < 0.5) return 0;
  const n = Math.max(2, Math.min(SNAKE_MAX, Math.ceil(total / SNAKE_STEP) + 1));
  const b = snakeBuf;
  let seg = 2;
  let segStart = 0;
  let segLen = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
  for (let i = 0; i < n; i++) {
    const at = (total * i) / (n - 1);
    while (at > segStart + segLen && seg + 2 < pts.length) {
      segStart += segLen;
      seg += 2;
      segLen = Math.hypot(pts[seg] - pts[seg - 2], pts[seg + 1] - pts[seg - 1]);
    }
    const k = segLen > 1e-6 ? Math.min(1, (at - segStart) / segLen) : 1;
    b[i * 5] = pts[seg - 2] + (pts[seg] - pts[seg - 2]) * k;
    b[i * 5 + 1] = pts[seg - 1] + (pts[seg + 1] - pts[seg - 1]) * k;
    b[i * 5 + 4] = i / (n - 1);
  }
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    const dx = b[i1 * 5] - b[i0 * 5];
    const dy = b[i1 * 5 + 1] - b[i0 * 5 + 1];
    const l = Math.hypot(dx, dy) || 1;
    b[i * 5 + 2] = -dy / l;
    b[i * 5 + 3] = dx / l;
  }
  return n;
}

// Один слой ленты: полуширина hw у головы, к хвосту сужается (s^taper), голова заострена.
function snakeLayer(g, n, hw, color, alpha) {
  if (alpha <= 0 || n < 2) return;
  const b = snakeBuf;
  const lift = BM.lift;
  const off = (i) => {
    const s = b[i * 5 + 4];
    return hw * Math.pow(s, BM.taper) * Math.min(1, (1 - s) / 0.12 + 0.35);
  };
  // точка i на стороне side (±1)
  const to = (i, side, first) => {
    const o = side * off(i);
    const x = b[i * 5] + b[i * 5 + 2] * o;
    const y = b[i * 5 + 1] + b[i * 5 + 3] * o - lift;
    if (first) g.moveTo(x, y);
    else g.lineTo(x, y);
  };
  g.fillStyle(color, alpha);
  g.beginPath();
  for (let i = 0; i < n; i++) to(i, 1, i === 0);
  for (let i = n - 1; i >= 0; i--) to(i, -1, false);
  g.closePath();
  g.fillPath();
}

function drawSnake(g, glow, p) {
  const a = p.alpha == null ? 1 : p.alpha;
  if (a <= 0) return;
  const n = snakeSamples(p);
  if (!n) return;
  const hw = BM.halfWidth;
  snakeLayer(g, n, hw, p.tint || BM.color, BM.trailAlpha * a);
  snakeLayer(g, n, hw * BM.mid, p.tint || BM.midColor, BM.midAlpha * a);
  snakeLayer(glow, n, Math.max(BM.coreMin, hw * BM.core), BM.coreColor, BM.coreAlpha * a);
}

// Молния (chain): рваная ломаная от (p.x, p.y) до (p.a, p.b), изломы попеременно в стороны, форма меняется
// каждые CH.flicker с; голубой ореол и белое ядро сложением цвета, вспышка в точке попадания; гаснет к концу жизни.
function drawBolt(g, p) {
  const life0 = p.life0 || CH.visualLife;
  const fade = Math.max(0, Math.min(1, p.life / life0));
  if (fade <= 0) return;
  const phase = Math.floor((life0 - p.life) / CH.flicker);
  const a = fade * (0.7 + 0.3 * hash01(p.uid, phase * 31 + 7));
  const x1 = p.a;
  const y1 = p.b - CH.lift;
  // первое звено — с окружности вокруг центра тела героя (FX.weaponOrigin) в сторону цели, не из тела
  let x0 = p.x;
  let y0 = p.y - CH.lift;
  if (p.c === 1) {
    const WO = FX.weaponOrigin;
    const cy = p.y - WO.lift;
    const ux = x1 - p.x;
    const uy = y1 - cy;
    const ul = Math.sqrt(ux * ux + uy * uy) || 1;
    const r = Math.min(WO.radius, ul * 0.9);
    x0 = p.x + (ux / ul) * r;
    y0 = cy + (uy / ul) * r;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.max(CH.minSegs, Math.min(CH.maxSegs, Math.round(len / CH.segLen)));
  const c = p.tint || CH.color;
  for (let layer = 0; layer < 2; layer++) {
    if (layer === 0) g.lineStyle(CH.halo * 2, c, CH.haloAlpha * a);
    else g.lineStyle(CH.core, CH.coreColor, a);
    g.beginPath();
    g.moveTo(x0, y0);
    for (let i = 1; i < n; i++) {
      const side = (i & 1) ? 1 : -1;
      const off = side * CH.jitter * (0.5 + 0.5 * hash01(p.uid, phase * 16 + i));
      const t = (i + (hash01(p.uid, phase * 16 + i + 8) - 0.5) * 0.5) / n;
      g.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
    }
    g.lineTo(x1, y1);
    g.strokePath();
  }
  g.fillStyle(c, 0.5 * a).fillCircle(x1, y1, CH.flash * (1.5 - 0.5 * fade));
  g.fillStyle(CH.coreColor, a).fillCircle(x1, y1, CH.flash * 0.5);
}

// Кольца внутри шара (метеор): count колец со сдвигом по фазе, каждое за period с растёт от центра до radius
// и гаснет к краю.
function drawPulse(g, p, time, P) {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const r = P.radius * (p.scale || 1);
  for (let i = 0; i < P.count; i++) {
    const k = ((time / P.period) + i / P.count + (p.uid % 7) * 0.13) % 1;
    g.lineStyle(P.width, P.color, P.alpha * (1 - k))
        .strokeCircle(x, y, r * (P.start + (1 - P.start) * k));
  }
}

/**
 * Святая земля: полупрозрачный диск с ядром, лёгкое дыхание радиуса, две волны от центра к краю со сдвигом
 * в полпериода и светлый край. Им же рисуются освящённые круги Жницы (render/reaper.js).
 * @param {number} period с на волну
 * @param {number} a общая прозрачность (0..1)
 */
export function drawAura(g, x, y, radius, c, time, period, a) {
  const A = FX.zones.aura;
  const r = radius * (1 + A.breathe * Math.sin(time * A.breatheSpeed));
  g.fillStyle(c, A.fill * a).fillCircle(x, y, r);
  g.fillStyle(c, A.core * a).fillCircle(x, y, r * 0.55);
  for (let i = 0; i < 2; i++) {
    const k = ((time / period) + i * 0.5) % 1;
    g.lineStyle(A.waveWidth, c, A.wave * (1 - k) * a).strokeCircle(x, y, r * (0.2 + 0.8 * k));
  }
  g.lineStyle(A.rimWidth, c, A.rim * a).strokeCircle(x, y, r);
}

export class Zones {
  // depth — слой зон на земле; topDepth — слой над персонажами (слэш), сложение цвета
  constructor(scene, depth, topDepth = depth) {
    this.g = scene.add.graphics().setDepth(depth);
    // слэш: шлейф и середина обычным смешением (цвет tint виден и на траве), только ядро сложением — светится
    this.top = scene.add.graphics().setDepth(topDepth);
    this.glow = scene.add.graphics().setDepth(topDepth + 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  draw(projectiles, time) {
    const g = this.g;
    const Z = FX.zones;
    g.clear();
    this.top.clear();
    this.glow.clear();
    for (const p of projectiles) {
      if (!p.fx) {
        // метеор и ледяной шар: внутри шара бегут кольца от центра к краю, как волны святой земли
        const P = Z.pulse[p.sprite];
        if (P) drawPulse(this.top, p, time, P);
        continue;
      }
      if (p.fx === 'slash') { drawSlash(this.top, this.glow, p); continue; }
      if (p.fx === 'snake') { drawSnake(this.top, this.glow, p); continue; }
      if (p.fx === 'bolt') { drawBolt(this.glow, p); continue; }
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (p.fx === 'aura') {
        // облако яда проявляется и гаснет (alpha); волны в такт удару
        const period = p.rehit > 0 ? p.rehit * Z.aura.wavesPerHit : 1;
        const a = p.alpha == null ? 1 : p.alpha;
        drawAura(g, x, y, p.radius, p.tint || Z.aura.color, time, period, a);
      } else if (p.fx === 'boom') {
        const k = 1 - p.life / (p.life0 || 1);
        const c = p.tint || Z.boom.color;
        g.fillStyle(Z.boom.core, Z.boom.alpha * (1 - k))
            .fillCircle(x, y, p.radius * (0.3 + 0.5 * k));
        g.fillStyle(c, Z.boom.alpha * 0.6 * (1 - k)).fillCircle(x, y, p.radius * (0.5 + 0.5 * k));
        g.lineStyle(2, c, 1 - k).strokeCircle(x, y, p.radius * (0.6 + 0.4 * k));
      } else if (p.fx === 'fire') {
        const c = p.tint || Z.fire.color;
        const fade = Math.min(1, p.life / Z.fire.fadeOut);
        const flicker = 1 + Z.fire.flicker * Math.sin(time * 17 + p.uid);
        g.fillStyle(c, Z.fire.fill * fade * flicker).fillCircle(x, y, p.radius);
        g.fillStyle(Z.fire.core, Z.fire.fill * 0.8 * fade)
            .fillCircle(x, y, p.radius * 0.45 * flicker);
        g.lineStyle(1, c, Z.fire.rim * fade).strokeCircle(x, y, p.radius);
      } else if (p.fx === 'crack') {
        drawCrack(g, p, x, y);
      }
    }
  }
}
