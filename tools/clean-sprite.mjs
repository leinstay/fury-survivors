// Чистка сгенерированного листа в настоящий пиксель-арт под кадр из manifest.js.
//
// node tools/clean-sprite.mjs <raw.png> <spriteKey> [--frames N] [--colors 16 | --palette] [--threshold 0.4] [--dark 0.3] [--no-outline] [--grid | --resample]
//   [--height N] [--frame N] [--out path]   переопределить рост, квадратный кадр и файл (для проб; по умолчанию из manifest)
//
// 1. Фон: альфа из PNG или хромакей пурпурного (#FF00FF), с удалением пурпурного ореола.
// 2. Позы: столбцы с непрозрачными пикселями режутся по пустым промежуткам, лишние куски сливаются с соседями.
// 3. Квантование: своя палитра спрайта (k-means, --colors) или общая tools/palette.json (--palette).
// 4. Уменьшение до роста manifest.size[1] голосованием по блокам (самый частый цвет блока), один масштаб на все позы.
// 5. Удаление одиночных пикселей, обводка 1 px цветом palette.outline.
//
// Режим --grid (по умолчанию для спрайтов с density > 1): модель рисует пиксель-арт на своей неровной сетке (клетки ~9×10 px).
// Границы клеток ищутся по пикам перепадов цвета, из каждой клетки берётся самый частый цвет: рисунок переносится
// один арт-пиксель в один пиксель, без масштабирования, квантования и новой обводки (своя у рисунка уже есть).
// Рост получается родной. Если он больше manifest.size[1] (или --height) больше чем на 10%, чистый рисунок уменьшается
// голосованием по блокам (shrink): модель рисует разные листы на сетке разного шага.
// 6. Кадр frameWidth×frameHeight: ноги на origin[1], центр стоп на origin[0]. Результат: assets/sprites/<key>.png.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../assets/sprites/manifest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE = JSON.parse(readFileSync(join(root, 'tools', 'palette.json'), 'utf8'));

function parseArgs(argv) {
  const a = { input: null, key: null, frames: null, grid: null, colors: 16, palette: false, threshold: 0.4, darkWeight: 0.3, outline: true, height: null, frame: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--frames') a.frames = Number(argv[++i]);
    else if (v === '--colors') a.colors = Number(argv[++i]);
    else if (v === '--palette') a.palette = true;
    else if (v === '--threshold') a.threshold = Number(argv[++i]);
    else if (v === '--dark') a.darkWeight = Number(argv[++i]);
    else if (v === '--no-outline') a.outline = false;
    else if (v === '--grid') a.grid = true;
    else if (v === '--resample') a.grid = false;
    else if (v === '--height') a.height = Number(argv[++i]);
    else if (v === '--frame') a.frame = Number(argv[++i]);
    else if (v === '--out') a.out = argv[++i];
    else if (!a.input) a.input = v;
    else if (!a.key) a.key = v;
  }
  return a;
}

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// «Redmean»: дешёвое приближение воспринимаемой разницы цветов.
function dist(r1, g1, b1, r2, g2, b2) {
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

function nearest(pal, r, g, b) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const d = dist(r, g, b, pal[i][0], pal[i][1], pal[i][2]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// 1. Маска фона. Возвращает Uint8Array: 1 = пиксель фигуры.
function buildMask(data, w, h) {
  const n = w * h;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) transparent++;
  const useAlpha = transparent > n * 0.05;
  const mask = new Uint8Array(n);
  const magenta = (i) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    return Math.min(r, b) - g;
  };
  for (let i = 0; i < n; i++) {
    if (useAlpha) mask[i] = data[i * 4 + 3] >= 128 && magenta(i) < 90 ? 1 : 0;
    else mask[i] = magenta(i) < 80 ? 1 : 0;
  }
  // Ореол: краевые пиксели с заметным пурпурным оттенком.
  for (let pass = 0; pass < 2; pass++) {
    const kill = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const edge = !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w];
      if (edge && magenta(i) > 30) kill.push(i);
    }
    for (const i of kill) mask[i] = 0;
  }
  return { mask, useAlpha };
}

// Мелкий мусор: связные области меньше minArea пикселей убираются.
function removeSpecks(mask, w, h, minArea) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let sp = 0, count = 0;
    const comp = [];
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const i = stack[--sp];
      comp.push(i); count++;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
    }
    if (count < minArea) for (const i of comp) mask[i] = 0;
  }
}

// 2. Позы по столбцам.
function findPoses(mask, w, h, frames) {
  const col = new Uint8Array(w);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (mask[y * w + x]) { col[x] = 1; break; }
  let segs = [];
  for (let x = 0; x < w; x++) {
    if (col[x] && (x === 0 || !col[x - 1])) segs.push({ x0: x, x1: x });
    if (col[x]) segs[segs.length - 1].x1 = x;
  }
  if (segs.length < frames) throw new Error(`found ${segs.length} separate figures, expected ${frames}`);
  // Самый узкий кусок сливается с ближайшим соседом, пока не останется frames.
  while (segs.length > frames) {
    let k = 0;
    for (let i = 1; i < segs.length; i++) if (segs[i].x1 - segs[i].x0 < segs[k].x1 - segs[k].x0) k = i;
    const gapL = k > 0 ? segs[k].x0 - segs[k - 1].x1 : Infinity;
    const gapR = k < segs.length - 1 ? segs[k + 1].x0 - segs[k].x1 : Infinity;
    const m = gapL <= gapR ? k - 1 : k + 1;
    const a = Math.min(k, m), b = Math.max(k, m);
    segs.splice(a, 2, { x0: segs[a].x0, x1: segs[b].x1 });
  }
  return segs.map(({ x0, x1 }) => {
    let y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x++) if (mask[y * w + x]) { if (y < y0) y0 = y; y1 = y; break; }
    return { x0, x1, y0, y1 };
  });
}

// 3. k-means по пикселям фигуры, детерминированный старт по частоте цветов.
function kmeans(data, mask, k) {
  const pts = [];
  for (let i = 0; i < mask.length; i += 3) if (mask[i]) pts.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  const freq = new Map();
  for (const p of pts) {
    const key = (p[0] >> 4) << 8 | (p[1] >> 4) << 4 | (p[2] >> 4);
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const seeds = [...freq].sort((a, b) => b[1] - a[1]);
  const cents = [];
  for (const [key] of seeds) {
    const c = [((key >> 8) & 15) * 16 + 8, ((key >> 4) & 15) * 16 + 8, (key & 15) * 16 + 8];
    if (cents.every((d) => dist(...c, ...d) > 3000)) cents.push(c);
    if (cents.length === k) break;
  }
  for (let it = 0; it < 12; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      const j = nearest(cents, p[0], p[1], p[2]);
      sum[j][0] += p[0]; sum[j][1] += p[1]; sum[j][2] += p[2]; sum[j][3]++;
    }
    for (let j = 0; j < cents.length; j++) if (sum[j][3]) cents[j] = [0, 1, 2].map((c) => Math.round(sum[j][c] / sum[j][3]));
  }
  return cents;
}

// 4. Уменьшение позы голосованием по блокам. Возвращает индексы палитры (-1 прозрачно).
// Тёмные цвета (контуры исходника) голосуют с весом darkWeight, иначе при сильном уменьшении они забивают детали.
function downscale(idx, mask, w, pose, scale, threshold, pal, darkWeight) {
  const palLen = pal.length;
  const weight = pal.map(([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b < 70 ? darkWeight : 1));
  const bw = pose.x1 - pose.x0 + 1, bh = pose.y1 - pose.y0 + 1;
  const ow = Math.max(1, Math.round(bw * scale)), oh = Math.max(1, Math.round(bh * scale));
  const out = new Int16Array(ow * oh).fill(-1);
  const votes = new Float32Array(palLen);
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    const sx0 = pose.x0 + Math.floor(ox * bw / ow), sx1 = pose.x0 + Math.floor((ox + 1) * bw / ow);
    const sy0 = pose.y0 + Math.floor(oy * bh / oh), sy1 = pose.y0 + Math.floor((oy + 1) * bh / oh);
    votes.fill(0);
    let total = 0, solid = 0;
    for (let y = sy0; y < Math.max(sy1, sy0 + 1); y++) for (let x = sx0; x < Math.max(sx1, sx0 + 1); x++) {
      total++;
      const i = y * w + x;
      if (mask[i]) { solid++; votes[idx[i]] += weight[idx[i]]; }
    }
    if (solid / total < threshold) continue;
    let best = 0;
    for (let j = 1; j < palLen; j++) if (votes[j] > votes[best]) best = j;
    out[oy * ow + ox] = best;
  }
  return { w: ow, h: oh, px: out };
}

// 5. Одиночные пиксели и обводка. Обводка добавляет по 1 px с каждой стороны.
function cleanup(img, outlineIdx, outline) {
  const { w, h, px } = img;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : px[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[y * w + x] < 0) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) >= 0) n++;
    if (n === 0) px[y * w + x] = -1;
  }
  if (!outline) return img;
  const W = w + 2, H = h + 2;
  const out = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(y + 1) * W + x + 1] = px[y * w + x];
  const res = Int16Array.from(out);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (out[y * W + x] >= 0) continue;
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < W && ny < H && out[ny * W + nx] >= 0 && out[ny * W + nx] !== outlineIdx;
    });
    if (n4) res[y * W + x] = outlineIdx;
  }
  return { w: W, h: H, px: res };
}

// Пики профиля перепадов: локальный максимум в окне ±3, не ближе minGap друг к другу.
function edgePeaks(E, a, b, minGap) {
  let max = 0;
  for (let x = a; x < b; x++) if (E[x] > max) max = E[x];
  const peaks = [];
  for (let x = a + 1; x < b; x++) {
    if (E[x] < max * 0.08) continue;
    let ok = true;
    for (let k = -3; k <= 3; k++) if (k && E[x + k] > E[x]) ok = false;
    if (!ok) continue;
    if (peaks.length && x - peaks[peaks.length - 1] < minGap) {
      if (E[x] > E[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = x; // из двух близких берём сильный
      continue;
    }
    peaks.push(x);
  }
  return peaks;
}

// Шаг сетки: самая частая разница между соседними пиками (6..16 px) по всем позам.
function commonStep(peakLists) {
  const hist = new Map();
  for (const p of peakLists) for (let i = 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    if (d >= 6 && d <= 16) hist.set(d, (hist.get(d) || 0) + 1);
  }
  let best = 9, bn = 0;
  for (const [d, n] of hist) if (n > bn) { bn = n; best = d; }
  // уточнение: среднее по соседним значениям гистограммы
  const near = [best - 1, best, best + 1].map((d) => [d, hist.get(d) || 0]);
  const sum = near.reduce((s, [, n]) => s + n, 0);
  return near.reduce((s, [d, n]) => s + d * n, 0) / sum;
}

// Границы клеток по одной оси: пики не ближе 0.7 шага, длинные однотонные участки дорезаются по шагу.
function gridLines(E, a, b, step) {
  const peaks = edgePeaks(E, a, b, Math.round(step * 0.7));
  const lines = [];
  let prev = a;
  for (const v of [...peaks, b]) {
    const n = Math.max(1, Math.round((v - prev) / step));
    for (let k = 0; k < n; k++) lines.push(Math.round(prev + (v - prev) * k / n));
    prev = v;
  }
  lines.push(b);
  return lines;
}

// Профили перепадов цвета по столбцам и строкам внутри позы (граница фигура/фон тоже перепад).
function edgeProfiles(data, mask, w, h, pose) {
  const x0 = Math.max(0, pose.x0 - 2), x1 = Math.min(w - 1, pose.x1 + 3);
  const y0 = Math.max(0, pose.y0 - 2), y1 = Math.min(h - 1, pose.y1 + 3);
  const diff = (ax, ay, bx, by) => {
    const mi = mask[ay * w + ax], mj = mask[by * w + bx];
    if (!mi && !mj) return 0;
    if (mi !== mj) return 255;
    const i = (ay * w + ax) * 4, j = (by * w + bx) * 4;
    return Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
  };
  const colE = new Float64Array(w + 4), rowE = new Float64Array(h + 4);
  for (let y = y0 + 1; y <= y1; y++) for (let x = x0 + 1; x <= x1; x++) {
    if (diff(x, y, x - 1, y) > 60) colE[x]++;
    if (diff(x, y, x, y - 1) > 60) rowE[y]++;
  }
  return { colE, rowE, x0, x1, y0, y1 };
}

// Снятие позы по родной сетке с общим шагом [sx, sy]. Возвращает { w, h, rgba } с обрезанными пустыми краями.
// Уменьшение чистого пиксель-арта в k раз (k < 1): каждый выходной пиксель берёт самый частый цвет своего блока,
// тёмные цвета (обводка) получают бонус, чтобы контур не рвался. Пусто, если блок прозрачен больше чем наполовину.
function shrink(im, k) {
  const ow = Math.max(1, Math.round(im.w * k)), oh = Math.max(1, Math.round(im.h * k));
  const rgba = new Uint8Array(ow * oh * 4);
  const counts = new Map();
  for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
    const xa = Math.floor(i * im.w / ow), xb = Math.max(xa + 1, Math.floor((i + 1) * im.w / ow));
    const ya = Math.floor(j * im.h / oh), yb = Math.max(ya + 1, Math.floor((j + 1) * im.h / oh));
    counts.clear();
    let solid = 0, best = -1, bestN = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const q = (y * im.w + x) * 4;
      if (!im.rgba[q + 3]) continue;
      solid++;
      const lum = im.rgba[q] * 0.3 + im.rgba[q + 1] * 0.59 + im.rgba[q + 2] * 0.11;
      const key = im.rgba[q] << 16 | im.rgba[q + 1] << 8 | im.rgba[q + 2];
      const n = (counts.get(key) || 0) + (lum < 70 ? 1.6 : 1);
      counts.set(key, n);
      if (n > bestN) { bestN = n; best = q; }
    }
    if (solid * 2 < (xb - xa) * (yb - ya)) continue;
    const o = (j * ow + i) * 4;
    rgba[o] = im.rgba[best]; rgba[o + 1] = im.rgba[best + 1]; rgba[o + 2] = im.rgba[best + 2]; rgba[o + 3] = 255;
  }
  return trim({ w: ow, h: oh, rgba });
}

function gridSnap(data, mask, w, prof, sx, sy) {
  const gx = { lines: gridLines(prof.colE, prof.x0, prof.x1, sx) };
  const gy = { lines: gridLines(prof.rowE, prof.y0, prof.y1, sy) };
  const ow = gx.lines.length - 1, oh = gy.lines.length - 1;
  const rgba = new Uint8Array(ow * oh * 4);
  const counts = new Map();
  for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
    // мода по внутренней части клетки: края клеток размыты
    const xa = gx.lines[i], xb = gx.lines[i + 1], ya = gy.lines[j], yb = gy.lines[j + 1];
    counts.clear();
    let best = -1, bestN = 0, total = 0, solid = 0;
    for (let y = ya + 1; y < Math.max(ya + 2, yb - 1); y++) for (let x = xa + 1; x < Math.max(xa + 2, xb - 1); x++) {
      total++;
      if (!mask[y * w + x]) continue;
      solid++;
      const q = (y * w + x) * 4;
      const key = (data[q] >> 3) << 10 | (data[q + 1] >> 3) << 5 | (data[q + 2] >> 3);
      const n = (counts.get(key) || 0) + 1;
      counts.set(key, n);
      if (n > bestN) { bestN = n; best = q; }
    }
    if (best < 0 || solid * 2 < total) continue;
    const o = (j * ow + i) * 4;
    rgba[o] = data[best]; rgba[o + 1] = data[best + 1]; rgba[o + 2] = data[best + 2]; rgba[o + 3] = 255;
  }
  return trim({ w: ow, h: oh, rgba });
}

function trim(img) {
  const { w, h, rgba } = img;
  let l = w, r = -1, t = h, b = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!rgba[(y * w + x) * 4 + 3]) continue;
    if (x < l) l = x;
    if (x > r) r = x;
    if (y < t) t = y;
    if (y > b) b = y;
  }
  if (r < 0) return { w: 0, h: 0, rgba: new Uint8Array(0) };
  const nw = r - l + 1, nh = b - t + 1, out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(rgba.subarray(((y + t) * w + l) * 4, ((y + t) * w + r + 1) * 4), y * nw * 4);
  return { w: nw, h: nh, rgba: out };
}

// Палитровое изображение (индексы, -1 прозрачно) -> RGBA.
function toRgba(img, pal) {
  const rgba = new Uint8Array(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    const p = img.px[i];
    if (p < 0) continue;
    rgba[i * 4] = pal[p][0]; rgba[i * 4 + 1] = pal[p][1]; rgba[i * 4 + 2] = pal[p][2]; rgba[i * 4 + 3] = 255;
  }
  return { w: img.w, h: img.h, rgba };
}

// Центр стоп: средний x непрозрачных пикселей в нижних 20% строк.
function feetCenter(img) {
  const { w, h, rgba } = img;
  let sum = 0, n = 0;
  for (let y = Math.floor(h * 0.8); y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3]) { sum += x; n++; }
  return n ? sum / n : w / 2;
}

export async function cleanSprite(input, key, opts = {}) {
  const spec = SPRITES[key];
  if (!spec) throw new Error(`unknown sprite key "${key}" (see assets/sprites/manifest.js)`);
  const frames = opts.frames || spec.frames;
  const { data, info } = await sharp(join(root, input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  const { mask, useAlpha } = buildMask(data, w, h);
  removeSpecks(mask, w, h, Math.round(w * h * 0.0002));
  const poses = findPoses(mask, w, h, frames);
  const fw = opts.frame || spec.frameWidth, fh = opts.frame || spec.frameHeight;
  const grid = opts.grid ?? (spec.density || 1) > 1;
  const base = { source: `${w}x${h}`, background: useAlpha ? 'alpha' : 'chroma' };

  if (grid) {
    const profs = poses.map((pose) => edgeProfiles(data, mask, w, h, pose));
    let sx = commonStep(profs.map((p) => edgePeaks(p.colE, p.x0, p.x1, 5)));
    let sy = commonStep(profs.map((p) => edgePeaks(p.rowE, p.y0, p.y1, 5)));
    // Клетки модели почти квадратные. Если по одной оси шаг вдвое больше, там пропущена каждая вторая граница.
    if (sy > sx * 1.6) sy /= 2;
    else if (sx > sy * 1.6) sx /= 2;
    let images = profs.map((p) => gridSnap(data, mask, w, p, sx, sy));
    const nativeH = Math.max(...images.map((im) => im.h));
    const want = opts.height || spec.size[1];
    const report = { ...base, mode: 'grid', cell: `${sx.toFixed(2)}x${sy.toFixed(2)}`, nativeHeight: nativeH };
    // Модель рисует разные листы на сетке разного шага. Если родной рост заметно больше нужного,
    // чистый рисунок уменьшается голосованием по блокам (один масштаб на все позы).
    if (nativeH > want * 1.1) {
      const k = want / nativeH;
      images = images.map((im) => shrink(im, k));
      report.shrunk = +k.toFixed(3);
    } else if (nativeH < want * 0.9) report.warning = `native height ${nativeH} is below manifest size ${want}`;
    return place(images, spec, fw, fh, frames, opts, report);
  }
  const res = resamplePoses(data, mask, w, h, poses, spec, opts);
  return place(res.images, spec, fw, fh, frames, opts, { ...base, ...res.info });
}

function resamplePoses(data, mask, w, h, poses, spec, opts) {
  let pal = opts.palette ? PALETTE.colors.map(hexToRgb) : kmeans(data, mask, opts.colors || 16);
  pal = [...pal, hexToRgb(PALETTE.outline)];
  const outlineIdx = pal.length - 1;
  const idx = new Int16Array(w * h);
  const cache = new Map();
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const c = data[i * 4] << 16 | data[i * 4 + 1] << 8 | data[i * 4 + 2];
    let j = cache.get(c);
    if (j === undefined) { j = nearest(pal.slice(0, -1), data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); cache.set(c, j); }
    idx[i] = j;
  }

  const pad = opts.outline === false ? 0 : 2;
  const maxH = Math.max(...poses.map((p) => p.y1 - p.y0 + 1));
  const scale = ((opts.height || spec.size[1]) - pad) / maxH;
  const images = poses.map((pose) => {
    const img = downscale(idx, mask, w, pose, scale, opts.threshold ?? 0.4, pal, opts.darkWeight ?? 0.3);
    return toRgba(cleanup(img, outlineIdx, opts.outline !== false), pal);
  });
  return { images, info: { mode: 'resample', scale: +scale.toFixed(4), colors: pal.length } };
}

// 6. Кадры в strip: ноги на origin[1], центр стоп на origin[0].
async function place(images, spec, fw, fh, frames, opts, info) {
  const strip = Buffer.alloc(fw * frames * fh * 4);
  const feetY = Math.round(fh * spec.origin[1]);
  const report = images.map((img, f) => {
    const ox = Math.round(fw * spec.origin[0] - feetCenter(img));
    const oy = feetY - img.h;
    let clipped = 0;
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (!img.rgba[i + 3]) continue;
      const tx = ox + x, ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= fw || ty >= fh) { clipped++; continue; }
      const o = (ty * fw * frames + f * fw + tx) * 4;
      strip[o] = img.rgba[i]; strip[o + 1] = img.rgba[i + 1]; strip[o + 2] = img.rgba[i + 2]; strip[o + 3] = 255;
    }
    return { frame: f, size: `${img.w}x${img.h}`, clipped };
  });
  const out = opts.out || spec.file;
  await sharp(strip, { raw: { width: fw * frames, height: fh, channels: 4 } }).png().toFile(join(root, out));
  return { out, ...info, frames: report };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.input || !a.key) {
    console.error('usage: node tools/clean-sprite.mjs <raw.png> <spriteKey> [--frames N] [--colors 16 | --palette] [--threshold 0.4] [--no-outline]');
    process.exit(2);
  }
  cleanSprite(a.input, a.key, a).then((r) => console.log(JSON.stringify(r, null, 1))).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
