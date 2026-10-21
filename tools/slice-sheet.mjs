// Нарезка листа с разрозненными объектами (окружение, предметы, иконки, снаряды) в спрайты из manifest.js.
//
// node tools/slice-sheet.mjs <sheet> [--report]
//   описание листа: tools/sheets.json → { "<sheet>": { "raw": "assets/raw/x.png", "items": [ ... ] } }
//   items идут в порядке чтения (ряды сверху вниз, в ряду слева направо); элемент — ключ спрайта,
//   { "key", "frame", "flip" } (кадр многокадрового спрайта, зеркально по X) или null (пропустить объект).
//   --report: только напечатать найденные объекты и их родной размер, файлы не писать.
//
// 1. Маска фона как в clean-sprite. Связные области, близкие области (искры, блики) сливаются в один объект.
// 2. Шаг сетки модели общий на весь лист, каждый объект снимается по сетке (gridSnap).
// 3. Если объект больше manifest.size [w, h], он уменьшается голосованием по блокам (shrink); меньше — остаётся родным.
// 4. Объект ставится в кадр по origin: при origin y = 1 низом на нижнюю строку, иначе центром.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../assets/sprites/manifest.js';
import { buildMask, removeSpecks, edgeProfiles, edgePeaks, commonStep, gridSnap, shrink } from './clean-sprite.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MERGE_GAP = 14; // px исходника: области ближе этого считаются одним объектом (sheets.json: mergeGap)

function components(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1);
  const boxes = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = boxes.length;
    const b = { x0: w, x1: 0, y0: h, y1: 0 };
    let sp = 0;
    stack[sp++] = s; lab[s] = id;
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i / w) | 0;
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && lab[j] < 0) { lab[j] = id; stack[sp++] = j; }
      }
    }
    boxes.push(b);
  }
  return boxes;
}

function mergeClose(boxes, gap = MERGE_GAP) {
  const near = (a, b) => a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1;
  let list = boxes.slice();
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < list.length && !changed; i++) for (let j = i + 1; j < list.length; j++) {
      if (!near(list[i], list[j])) continue;
      const a = list[i], b = list[j];
      list[i] = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
      list.splice(j, 1);
      changed = true;
      break;
    }
  }
  return list;
}

// Ряды по перекрытию (по умолчанию): объект попадает в ряд, если его вертикальный отрезок пересекается с рядом.
function overlapOrder(boxes) {
  const sorted = boxes.slice().sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const b of sorted) {
    const row = rows.find((r) => b.y0 <= r.y1 && b.y1 >= r.y0);
    if (row) { row.items.push(b); row.y0 = Math.min(row.y0, b.y0); row.y1 = Math.max(row.y1, b.y1); }
    else rows.push({ y0: b.y0, y1: b.y1, items: [b] });
  }
  rows.sort((a, b) => a.y0 - b.y0);
  return rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0));
}

// Ряды по центрам (sheets.json: "rows": "center"): объект попадает в ряд, если его центр по y близок
// к центру ряда. Высокий объект на два ряда (босс) получает свой ряд между ними.
function centerOrder(boxes) {
  const cy = (b) => (b.y0 + b.y1) / 2;
  const sorted = boxes.slice().sort((a, b) => cy(a) - cy(b));
  const rows = [];
  for (const b of sorted) {
    const row = rows.find((r) => Math.abs(cy(b) - r.cy) < Math.min(r.h, b.y1 - b.y0) / 4);
    if (row) row.items.push(b);
    else rows.push({ cy: cy(b), h: b.y1 - b.y0, items: [b] });
  }
  rows.sort((a, b) => a.cy - b.cy);
  return rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0));
}

function flipX(im) {
  const out = new Uint8Array(im.rgba.length);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    out.set(im.rgba.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + (im.w - 1 - x)) * 4);
  }
  return { ...im, rgba: out };
}

async function main() {
  const name = process.argv[2];
  const reportOnly = process.argv.includes('--report');
  const sheets = JSON.parse(readFileSync(join(root, 'tools', 'sheets.json'), 'utf8'));
  const sheet = sheets[name];
  if (!sheet) throw new Error(`unknown sheet "${name}" (see tools/sheets.json)`);

  const { data, info } = await sharp(join(root, sheet.raw)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const { mask } = buildMask(data, w, h);
  // Фигуры, которые касаются друг друга (свечение, хвост, крыло), разделяются вертикальными разрезами:
  // sheets.json "cuts": [[x, y0, y1], ...] в px исходника.
  for (const [x, y0, y1] of sheet.cuts || []) for (let y = y0; y < y1; y++) mask[y * w + x] = 0;
  removeSpecks(mask, w, h, 12);
  const found = mergeClose(components(mask, w, h), sheet.mergeGap).filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) > 150);
  const boxes = sheet.rows === 'center' ? centerOrder(found) : overlapOrder(found);

  const profs = boxes.map((b) => edgeProfiles(data, mask, w, h, b));
  // Шаг сетки модели зависит от качества и масштаба листа: границы шага задаются в sheets.json (step: [min, max]).
  const [minStep, maxStep] = sheet.step || [6, 16];
  const gap = Math.max(2, minStep - 1);
  let sx = commonStep(profs.map((p) => edgePeaks(p.colE, p.x0, p.x1, gap)), minStep, maxStep);
  let sy = commonStep(profs.map((p) => edgePeaks(p.rowE, p.y0, p.y1, gap)), minStep, maxStep);
  if (sy > sx * 1.6) sy /= 2;
  else if (sx > sy * 1.6) sx /= 2;
  const native = profs.map((p) => gridSnap(data, mask, w, p, sx, sy));
  console.log(`${name}: ${boxes.length} objects, cell ${sx.toFixed(2)}x${sy.toFixed(2)}`);

  if (reportOnly || boxes.length !== sheet.items.length) {
    native.forEach((im, i) => console.log(`  ${i}: ${JSON.stringify(sheet.items[i] ?? '?')} native ${im.w}x${im.h} at ${boxes[i].x0},${boxes[i].y0}`));
    if (!reportOnly) throw new Error(`found ${boxes.length} objects, tools/sheets.json lists ${sheet.items.length}`);
    return;
  }

  // Собираем кадры по ключам
  const strips = new Map();
  sheet.items.forEach((it, i) => {
    if (!it) return;
    const item = typeof it === 'string' ? { key: it } : it;
    const spec = SPRITES[item.key];
    if (!spec) throw new Error(`unknown sprite key "${item.key}"`);
    let im = native[i];
    const [tw, th] = spec.size;
    const k = Math.min(1, tw / im.w, th / im.h);
    if (k < 0.97) im = shrink(im, k);
    if (item.flip) im = flipX(im);
    if (!strips.has(item.key)) strips.set(item.key, { spec, frames: [] });
    strips.get(item.key).frames[item.frame || 0] = im;
    console.log(`  ${item.key}[${item.frame || 0}] native ${native[i].w}x${native[i].h} -> ${im.w}x${im.h}${k < 0.97 ? ` (x${k.toFixed(2)})` : ''}`);
  });

  for (const [key, { spec, frames }] of strips) {
    const fw = spec.frameWidth, fh = spec.frameHeight, n = spec.frames;
    const buf = Buffer.alloc(fw * n * fh * 4);
    for (let f = 0; f < n; f++) {
      const im = frames[f] || frames[0];
      const ox = Math.round(fw * spec.origin[0] - im.w / 2);
      const oy = spec.origin[1] >= 0.99 ? fh - im.h : Math.round(fh * spec.origin[1] - im.h / 2);
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        const s = (y * im.w + x) * 4;
        const tx = ox + x, ty = oy + y;
        if (!im.rgba[s + 3] || tx < 0 || ty < 0 || tx >= fw || ty >= fh) continue;
        buf.set(im.rgba.subarray(s, s + 4), (ty * fw * n + f * fw + tx) * 4);
      }
    }
    await sharp(buf, { raw: { width: fw * n, height: fh, channels: 4 } }).png().toFile(join(root, spec.file));
  }
  console.log(`wrote ${strips.size} sprites`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
