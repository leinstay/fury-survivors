// Процедурные спрайты новых оружий (docs/META.md 1.4) в стиле ножей с листа projectiles: пиксель-арт без
// сглаживания, палитра tools/palette.json, обводка outline у твёрдых предметов; свечения (висп, метеор, луч) без
// обводки, ступенчатой прозрачностью. Все спрайты density 2 (1 px текстуры = 1 px холста), размеры кадров из
// assets/sprites/manifest.js, число кадров ленты Boot.js берёт по ширине PNG.
//
// node tools/make-weapon-art.mjs [wisp|shot|meteor|spear|bolt|mine|frost|beam|cloud]...   (без аргументов — всё)
// Иконки icon_* новых оружий не здесь: их рисуют настоящей графикой, пока заглушки tools/placeholders.mjs.
//
//   wisp    proj_wisp        8 кадров: ядро, ореол, переливание голубой ↔ бирюзовый ↔ белый, пульс, язычок пламени
//   shot    proj_wisp_shot   пуля виспа: proj_enemy с листа, перекрашенная в голубой (поворот оттенка)
//   meteor  proj_meteor      8 кадров (кадр 160, density 1, шар r 36): красно-оранжевый шар с ядром, ореолом и хвостом вверх-вправо (падает влево-вниз,
//                            WEAPON_BEHAVIOR.area_drop.fallSlant), переливание красный ↔ оранжевый ↔ жёлто-белый
//   spear   proj_spear       древко с листовидным наконечником, остриё вправо (angle 0)
//   bolt    proj_bolt        короткий толстый болт с оперением
//   mine    proj_mine        6 кадров: стальной диск на земле, мигающий красный огонёк
//   frost   proj_frost       4 кадра: ледяной шар с гранями и блёстками (видимый радиус ORBIT_R.proj_frost × density)
//   beam    proj_beam        4 кадра: звено луча, светлая полоса с бегущими бликами, стыкуется по длине
//   cloud   proj_poison_cloud зелёное облако (в игре облако рисуется зоной, спрайт для кодекса)
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { SPRITES } from '../assets/sprites/manifest.js';
import { encodePng } from './placeholders.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAL = JSON.parse(readFileSync(join(root, 'tools/palette.json'), 'utf8'));
const OUTLINE = PAL.outline;

// Палитра по именам (все из tools/palette.json, кроме свечений).
const C = {
  out: OUTLINE, ink: '#2b2b3a',
  steel0: '#5a5a6a', steel1: '#8a8a9a', steel2: '#b8b8c8', steel3: '#e0e0ea', white: '#ffffff',
  wood0: '#8a5a3a', wood1: '#b8845a',
  red0: '#7a2e2e', red1: '#b8433a', red2: '#e0603a', orange: '#f2904a', gold: '#f7c06a', cream: '#fbe3a0',
  green0: '#3e5a3a', green1: '#5a8a4a', green2: '#86b85a', green3: '#bfe07a',
  blue0: '#2e3e6a', blue1: '#4a6aa8', blue2: '#7aa6d8', blue3: '#bcdcf2',
  violet0: '#4a3a6a', violet1: '#7a5aa0', violet2: '#b08ad0', violet3: '#e0b8e8',
  pink: '#d86a9a', rose: '#fdeae0',
  // свечения (вне палитры, как у взмаха tools/make-slash.mjs)
  cyan: '#6af0ff', teal: '#40e8c8', ice: '#d8ffff', mint: '#80ffd0',
  flame: '#ff5030', ember: '#ff9a30', sun: '#fff0a0',
};

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lerp = (a, b, k) => a + (b - a) * k;
// Цвет между опорными точками кольца (t в долях цикла 0..1), hex-строки.
function cycle(keys, t) {
  const n = keys.length;
  const f = ((t % 1) + 1) % 1 * n;
  const i = Math.floor(f);
  const k = f - i;
  const a = hex(keys[i % n]);
  const b = hex(keys[(i + 1) % n]);
  return a.map((v, j) => Math.round(lerp(v, b[j], k)));
}

// Пиксельный холст RGBA. Цвет: hex-строка или [r, g, b]; alpha 0..1. Запись без смешивания: верхний слой
// заменяет пиксель (ступенчатые ореолы рисуются от внешнего к внутреннему).
class Px {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = Buffer.alloc(w * h * 4);
  }

  set(x, y, c, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = typeof c === 'string' ? hex(c) : c;
    const i = (y * this.w + x) * 4;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = Math.round(a * 255);
  }

  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }

  disc(cx, cy, r, c, a = 1) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c, a);
      }
    }
  }

  // Эллипс с полуосями rx, ry.
  ellipse(cx, cy, rx, ry, c, a = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }

  rect(x0, y0, w, h, c, a = 1) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
  }

  // Многоугольник по центрам пикселей (чёт-нечет).
  poly(pts, c, a = 1) {
    const ys = pts.map((p) => p[1]);
    const xs = pts.map((p) => p[0]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const py = y + 0.5;
      const cross = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= py && y1 > py) || (y1 <= py && y0 > py)) {
          cross.push(x0 + ((py - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      cross.sort((p, q) => p - q);
      for (let i = 0; i + 1 < cross.length; i += 2) {
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
          const px = x + 0.5;
          if (px >= cross[i] && px <= cross[i + 1]) this.set(x, y, c, a);
        }
      }
    }
  }

  // Отрезок толщиной t (пятна вдоль него).
  line(x0, y0, x1, y1, c, t = 1, a = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n);
      const y = lerp(y0, y1, i / n);
      if (t <= 1) this.set(Math.floor(x), Math.floor(y), c, a);
      else this.disc(x, y, t / 2, c, a);
    }
  }

  // Обводка: цвет c на прозрачных пикселях рядом с непрозрачными (4-соседство). thr — порог альфы тела.
  outline(c = OUTLINE, thr = 128) {
    const src = Buffer.from(this.d);
    const at = (x, y) =>
      (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y) >= thr) continue;
        const near = at(x - 1, y) >= thr || at(x + 1, y) >= thr ||
            at(x, y - 1) >= thr || at(x, y + 1) >= thr;
        if (near) this.set(x, y, c);
      }
    }
  }

  // Копия холста, увеличенная в k раз без сглаживания.
  scaled(k) {
    const o = new Px(this.w * k, this.h * k);
    for (let y = 0; y < o.h; y++) {
      for (let x = 0; x < o.w; x++) {
        const i = (Math.floor(y / k) * this.w + Math.floor(x / k)) * 4;
        this.d.copy(o.d, (y * o.w + x) * 4, i, i + 4);
      }
    }
    return o;
  }
}

// Лента кадров одной высоты в PNG спрайта key; проверяет кадр по manifest.
function writeStrip(key, frames) {
  const s = SPRITES[key];
  const [w, h] = [s.frameWidth, s.frameHeight];
  for (const f of frames) if (f.w !== w || f.h !== h) throw new Error(`${key}: frame ${f.w}x${f.h}, manifest ${w}x${h}`);
  const strip = new Px(w * frames.length, h);
  frames.forEach((f, i) => {
    for (let y = 0; y < h; y++) {
      f.d.copy(strip.d, (y * strip.w + i * w) * 4, y * w * 4, (y + 1) * w * 4);
    }
  });
  const out = join(root, s.file);
  writeFileSync(out, encodePng(strip.w, strip.h, strip.d));
  console.log('wrote', s.file, `${w}x${h} x${frames.length}`);
}

// Детерминированный шум для искр.
const hash = (a, b, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------------------------------------------
// Светящийся шар: ступенчатый ореол (без обводки), тело, ядро. keys — кольцо цветов тела по фазе t.
// between — рисуется между ореолом и телом (хвост метеора: ореол его не перекрывает, тело — поверх).
// k — множитель толщины ореола (крупный метеор).
function glowBall(p, cx, cy, r, t, keys, core = C.white, haloA = [0.14, 0.3, 0.5],
    between = null, k = 1) {
  const body = cycle(keys, t);
  const light = cycle(keys, t + 0.35).map((v) => Math.round(lerp(v, 255, 0.45)));
  p.disc(cx, cy, r + 5 * k, body, haloA[0]);
  p.disc(cx, cy, r + 3 * k, body, haloA[1]);
  p.disc(cx, cy, r + 1.5 * k, body, haloA[2]);
  if (between) between();
  p.disc(cx, cy, r, body, 0.92);
  p.disc(cx - r * 0.1, cy - r * 0.1, r * 0.62, light, 1);
  p.disc(cx - r * 0.15, cy - r * 0.15, r * 0.3, core, 1);
}

function wisp() {
  const N = 8;
  const S = SPRITES.proj_wisp;
  const keys = [C.cyan, C.teal, C.ice, '#80d8ff'];
  const frames = [];
  for (let f = 0; f < N; f++) {
    const t = f / N;
    const p = new Px(S.frameWidth, S.frameHeight);
    const cx = S.frameWidth / 2;
    const cy = S.frameHeight / 2 + 1;
    const r = 5.5 + 0.9 * Math.sin(t * Math.PI * 2);
    // язычок пламени над ядром: цепочка убывающих дисков, качается по фазе
    const body = cycle(keys, t);
    const sway = Math.sin(t * Math.PI * 2 + 1) * 2.5;
    for (let i = 0; i < 4; i++) {
      const k = i / 4;
      const fx = cx + sway * k + 0.5 * Math.sin(k * 6 + t * 7);
      p.disc(fx, cy - r - 1 - i * 2.2, 2.6 - k * 1.8, body, 0.35 + 0.15 * (1 - k));
    }
    glowBall(p, cx, cy, r, t, keys);
    // искры вокруг: три точки на орбите
    for (let i = 0; i < 3; i++) {
      const a = t * Math.PI * 2 * (i % 2 ? 1 : -1) + (i * Math.PI * 2) / 3;
      const rr = r + 4 + 2 * hash(i, f);
      p.set(Math.floor(cx + Math.cos(a) * rr), Math.floor(cy + Math.sin(a) * rr * 0.8),
          i === 1 ? C.white : C.ice, 0.8);
    }
    frames.push(p);
  }
  writeStrip('proj_wisp', frames);
}

// Шар радиусом R px текстуры в кадре manifest (density 1: 1 px текстуры = 1 px мира); ореол и хвост
// пропорциональны R. Диаметр шара при scale 1 = 2R px мира — это WEAPON_BEHAVIOR.area_drop.meteorBall (weapons.js):
// area_drop.js растягивает спрайт так, чтобы шар был meteorSize долей круга удара.
function meteor() {
  const N = 8;
  const S = SPRITES.proj_meteor;
  const R = 36;
  const k = R / 8; // старый шар был r 8
  const keys = [C.flame, C.ember, C.sun, C.red2];
  // направление хвоста: против падения (fallSlant 0.4 вбок на 1 вниз)
  const tx = 0.4 / Math.hypot(0.4, 1);
  const ty = -1 / Math.hypot(0.4, 1);
  const frames = [];
  for (let f = 0; f < N; f++) {
    const t = f / N;
    const p = new Px(S.frameWidth, S.frameHeight);
    const cx = S.frameWidth / 2;
    const cy = S.frameHeight / 2;
    const r = R + 0.8 * k * Math.sin(t * Math.PI * 2);
    const tail = () => {
      // хвост: диски вдоль направления, темнеют и редеют к концу, покачиваются поперёк
      const L = 13 * k;
      const steps = 40;
      for (let i = steps; i >= 0; i--) {
        const q = i / steps;
        const d = r * 0.7 + L * q;
        const wob = Math.sin(q * 7 + t * Math.PI * 2 * 2) * (0.6 + 1.6 * q) * k;
        const x = cx + tx * d - ty * wob;
        const y = cy + ty * d + tx * wob;
        const col = q < 0.25 ? hex(C.ember) : q < 0.55 ? hex(C.red2) : hex(C.red0);
        const a = q < 0.55 ? 0.9 : 0.65 - 0.35 * (q - 0.55) / 0.45;
        p.disc(x, y, Math.max(0.8, r * 0.5 * Math.pow(1 - q, 1.4) + 0.6 * k), col, a);
      }
      // угольки
      for (let i = 0; i < 16; i++) {
        const q = hash(i, f, 1);
        const d = r + 2 * k + L * q;
        const off = (hash(i, f, 2) - 0.5) * 10 * k * (0.4 + q);
        p.disc(cx + tx * d - ty * off, cy + ty * d + tx * off, 1.2 + hash(i, f, 4),
            hash(i, f, 3) > 0.5 ? C.gold : C.ember, 0.9);
      }
    };
    glowBall(p, cx, cy, r, t, keys, C.sun, [0.16, 0.32, 0.55], tail, k * 0.55); // ореол уже шара: не вылезает за круг удара
    frames.push(p);
  }
  writeStrip('proj_meteor', frames);
}

// Пуля виспа: вражеская пуля с листа projectiles, оттенок повёрнут из розового в голубой.
async function shot() {
  const src = await sharp(join(root, SPRITES.proj_enemy.file)).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
  const { width, height } = src.info;
  const p = new Px(width, height);
  src.data.copy(p.d);
  const shift = 180 - 330; // розовый (~330°) → голубой (180°)
  for (let i = 0; i < p.d.length; i += 4) {
    if (!p.d[i + 3]) continue;
    const [r, g, b] = rgbToHsl(p.d[i], p.d[i + 1], p.d[i + 2]);
    const [nr, ng, nb] = hslToRgb((r + shift / 360 + 1) % 1, g, b);
    p.d[i] = nr; p.d[i + 1] = ng; p.d[i + 2] = nb;
  }
  writeStrip('proj_wisp_shot', [p]);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}

// ---------------------------------------------------------------------------------------------------------
// Копьё: древко, обмотка у наконечника, листовидное лезвие с ребром. Остриё вправо.
function spear() {
  const S = SPRITES.proj_spear;
  const p = new Px(S.frameWidth, S.frameHeight);
  const cy = S.frameHeight / 2; // 8
  // древко рядами 7..9
  p.rect(2, cy - 1, 34, 1, C.wood1);
  p.rect(2, cy, 34, 1, C.wood0);
  p.rect(2, cy + 1, 34, 1, C.wood0);
  p.rect(2, cy - 1, 3, 3, C.steel1); // пятка
  p.rect(2, cy - 1, 3, 1, C.steel2);
  p.rect(31, cy - 1, 4, 3, C.red1); // обмотка
  p.rect(32, cy - 1, 1, 3, C.red0);
  p.rect(34, cy - 1, 1, 3, C.red0);
  // лезвие: лист от x=34 до острия 46
  const blade = [[34, cy], [37, cy - 4], [41, cy - 3.2], [46.5, cy], [41, cy + 3.2], [37, cy + 4]];
  p.poly(blade, C.steel2);
  p.poly([[34, cy], [37, cy - 4], [41, cy - 3.2], [46.5, cy]], C.steel3); // верхняя грань светлее
  p.poly([[34, cy], [46.5, cy], [41, cy + 3.2], [37, cy + 4]], C.steel1); // нижняя темнее
  p.line(35, cy, 45, cy, C.white); // ребро
  p.rect(34, cy - 1, 2, 3, C.steel0); // пятка лезвия
  p.outline();
  writeStrip('proj_spear', [p]);
}

// Болт: короткое толстое древко, стальная головка, два пера.
function bolt() {
  const S = SPRITES.proj_bolt;
  const p = new Px(S.frameWidth, S.frameHeight);
  const cy = S.frameHeight / 2; // 6
  p.rect(4, cy - 1, 24, 1, C.wood1);
  p.rect(4, cy, 24, 2, C.wood0);
  // оперение: по два пера сверху и снизу
  p.poly([[3, cy - 1], [9, cy - 1], [10, cy - 4], [5, cy - 4]], C.red1);
  p.poly([[3, cy + 2], [9, cy + 2], [10, cy + 5], [5, cy + 5]], C.red1);
  p.line(5, cy - 3, 9, cy - 2, C.rose);
  p.line(5, cy + 4, 9, cy + 3, C.red0);
  p.rect(2, cy - 1, 2, 3, C.steel1); // пятка
  // головка: четырёхгранник
  p.poly([[26, cy - 3], [30, cy - 3], [35.5, cy + 0.5], [30, cy + 4], [26, cy + 4]], C.steel2);
  p.poly([[26, cy - 3], [30, cy - 3], [35.5, cy + 0.5], [26, cy + 0.5]], C.steel3);
  p.rect(26, cy - 1, 2, 3, C.steel0);
  p.line(27, cy, 34, cy, C.white);
  p.outline();
  writeStrip('proj_bolt', [p]);
}

// Мина: стальной диск сверху, четыре заклёпки, красный огонёк мигает.
function mine() {
  const N = 6;
  const S = SPRITES.proj_mine;
  const frames = [];
  for (let f = 0; f < N; f++) {
    const p = new Px(S.frameWidth, S.frameHeight);
    const cx = S.frameWidth / 2;
    const cy = S.frameHeight / 2;
    p.ellipse(cx, cy + 1, 11, 9, C.steel0);
    p.ellipse(cx, cy, 11, 9, C.steel1);
    p.ellipse(cx, cy - 0.5, 8, 6, C.steel0);
    p.ellipse(cx, cy - 1, 7, 5, C.ink);
    p.ellipse(cx - 2, cy - 4, 5, 1.5, C.steel2); // блик
    for (const [dx, dy] of [[-9, 0], [9, 0], [0, -7], [0, 7]]) {
      p.set(Math.floor(cx + dx), Math.floor(cy + dy), C.steel3);
    }
    const k = 0.5 + 0.5 * Math.sin((f / N) * Math.PI * 2);
    const on = k > 0.5;
    p.disc(cx, cy - 1, 3.2 + k, on ? C.red2 : C.red0, on ? 0.35 + 0.3 * k : 0.25);
    p.disc(cx, cy - 1, 2, on ? C.red2 : C.red0);
    if (on) p.set(Math.floor(cx) - 1, Math.floor(cy) - 2, C.gold);
    p.outline();
    frames.push(p);
  }
  writeStrip('proj_mine', frames);
}

// Ледяной шар: полупрозрачный ореол, тело со светлыми гранями, блёстки меняются по кадрам.
function frost() {
  const N = 4;
  const S = SPRITES.proj_frost;
  const frames = [];
  for (let f = 0; f < N; f++) {
    const p = new Px(S.frameWidth, S.frameHeight);
    const cx = S.frameWidth / 2;
    const cy = S.frameHeight / 2;
    const r = 17;
    p.disc(cx, cy, r + 4, C.blue2, 0.25);
    p.disc(cx, cy, r + 2, C.blue3, 0.45);
    p.disc(cx, cy, r, C.blue2);
    p.disc(cx - 1, cy - 1, r - 3, C.blue3);
    p.disc(cx - 3, cy - 3, r - 8, C.ice);
    // грани кристалла: шесть лучей от центра
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + 0.3;
      p.line(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4,
          cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), C.blue1, 1, 0.8);
      const b = a + Math.PI / 6;
      p.line(cx + Math.cos(b) * 9, cy + Math.sin(b) * 9,
          cx + Math.cos(b) * (r - 3), cy + Math.sin(b) * (r - 3), C.white, 1, 0.9);
    }
    p.disc(cx - 4, cy - 5, 2.5, C.white);
    for (let i = 0; i < 5; i++) {
      const a = hash(i, f, 7) * Math.PI * 2;
      const d = 6 + hash(i, f, 8) * (r - 7);
      const x = Math.floor(cx + Math.cos(a) * d);
      const y = Math.floor(cy + Math.sin(a) * d);
      p.set(x, y, C.white);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + ox, y + oy, C.ice);
    }
    p.outline(C.blue0);
    frames.push(p);
  }
  writeStrip('proj_frost', frames);
}

// Звено луча: горизонтальная полоса на всю ширину кадра, блики бегут по длине.
function beam() {
  const N = 4;
  const S = SPRITES.proj_beam;
  const frames = [];
  for (let f = 0; f < N; f++) {
    const p = new Px(S.frameWidth, S.frameHeight);
    const cy = S.frameHeight / 2;
    p.rect(0, cy - 4, S.frameWidth, 8, C.violet2, 0.25);
    p.rect(0, cy - 3, S.frameWidth, 6, C.violet3, 0.5);
    p.rect(0, cy - 2, S.frameWidth, 4, '#ffe0ff', 0.9);
    p.rect(0, cy - 1, S.frameWidth, 2, C.white);
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(((i * 9 + f * 7) % S.frameWidth));
      p.rect(x, cy - 3, 3, 6, C.white, 0.95);
      p.set(x + 1, cy - 4, C.rose, 0.8);
      p.set(x + 1, cy + 3, C.rose, 0.8);
    }
    frames.push(p);
  }
  writeStrip('proj_beam', frames);
}

// Ядовитое облако: клубы из дисков, пузыри; только для иконки и кодекса.
function cloud() {
  const S = SPRITES.proj_poison_cloud;
  const p = new Px(S.frameWidth, S.frameHeight);
  const cx = S.frameWidth / 2;
  const cy = S.frameHeight / 2;
  const blobs = [[0, 6, 30], [-26, 10, 22], [26, 12, 22], [-14, -10, 22], [16, -12, 20],
    [0, -20, 16], [-38, 18, 12], [40, 20, 12]];
  for (const [dx, dy, r] of blobs) p.disc(cx + dx, cy + dy, r + 2, C.green0);
  for (const [dx, dy, r] of blobs) p.disc(cx + dx, cy + dy, r, C.green1);
  for (const [dx, dy, r] of blobs) p.disc(cx + dx - r * 0.25, cy + dy - r * 0.3, r * 0.6, C.green2);
  for (const [dx, dy, r] of blobs) {
    p.disc(cx + dx - r * 0.35, cy + dy - r * 0.4, r * 0.25, C.green3);
  }
  for (let i = 0; i < 7; i++) {
    const x = cx + (hash(i, 1) - 0.5) * 90;
    const y = cy + (hash(i, 2) - 0.5) * 50;
    p.disc(x, y, 2 + hash(i, 3) * 2, C.green3, 0.9);
  }
  p.outline(C.green0);
  writeStrip('proj_poison_cloud', [p]);
}

// meteor, frost и shot теперь рисует tools/make-ragged-balls.mjs: без аргумента здесь не запускаются
const JOBS = { wisp, shot, meteor, spear, bolt, mine, frost, beam, cloud };
const MANUAL = ['meteor', 'frost', 'shot'];
const args = process.argv.slice(2);
const names = args.length ? args : Object.keys(JOBS).filter((n) => !MANUAL.includes(n));
for (const n of names) {
  if (!JOBS[n]) throw new Error(`unknown job ${n}; known: ${Object.keys(JOBS).join(', ')}`);
  await JOBS[n]();
}
