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
// С "hd" в описании листа шаги 2–3 заменяет плавное уменьшение из исходника (writeHd), см. docs/ASSETS.md.
// --raw: исходники фигур в assets/raw/<sheet>/.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
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
      const x = i % w;
      const y = (i / w) | 0;
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && lab[j] < 0) { lab[j] = id; stack[sp++] = j; }
        }
      }
    }
    boxes.push(b);
  }
  return { boxes, lab };
}

// sheets.json "boxes": рамка [x0, y0, x1, y1] на каждый item. Связная область достаётся рамке, в которой её центр,
// у объекта своя маска: чужие куски внутри его рамки (хвост, крыло соседа) не попадают. "drop": [[x0, y0, x1, y1]] —
// области с центром внутри выбрасываются (лишний огонёк, обрезок).
function assignByBoxes(mask, w, h, sheet) {
  const { boxes: comps, lab } = components(mask, w, h);
  const sum = comps.map(() => ({ x: 0, y: 0, n: 0 }));
  for (let i = 0; i < w * h; i++) {
    if (lab[i] >= 0) {
      const s = sum[lab[i]];
      s.x += i % w;
      s.y += (i / w) | 0;
      s.n++;
    }
  }
  const inside = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  const owner = sum.map((s) => {
    const cx = s.x / s.n;
    const cy = s.y / s.n;
    if ((sheet.drop || []).some((r) => inside(r, cx, cy))) return -1;
    return sheet.boxes.findIndex((r) => inside(r, cx, cy));
  });
  return sheet.boxes.map((_, k) => {
    const m = new Uint8Array(w * h);
    const b = { x0: w, x1: 0, y0: h, y1: 0 };
    for (let i = 0; i < w * h; i++) {
      if (lab[i] < 0 || owner[lab[i]] !== k) continue;
      m[i] = 1;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
    return { mask: m, box: b };
  });
}

const itemOf = (it) => (!it ? null : typeof it === 'string' ? { key: it } : it);
const rawName = (item) => (item.frame != null ? `${item.key}_${item.frame}` : item.key);
const rawInfo = (b) => ({ width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1, channels: 4 });

// Фигура в исходном разрешении (без снятия сетки) с прозрачным фоном: референсы (Nano Banana, меню) и HD-спрайты.
function cropRaw(data, w, b, mask) {
  const { width: bw, height: bh } = rawInfo(b);
  const out = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (b.y0 + y) * w + b.x0 + x;
      if (!mask[i]) continue;
      out.set(data.subarray(i * 4, i * 4 + 3), (y * bw + x) * 4);
      out[(y * bw + x) * 4 + 3] = 255;
    }
  }
  return out;
}

// sheets.json "hd": фигуры не снимаются по сетке, а плавно уменьшаются из исходника (как ходьба героини, tools/hd-frames.mjs).
// "hd": { "default": k, "<key>": k } — множитель от px исходника к px холста; спрайт в manifest с density 2 (показ 1:1).
// Элемент { "key", "hd": false } только даёт исходник (--raw), спрайт не пишется.
async function writeHd(sheet, data, w, boxes, masks) {
  const strips = new Map();
  for (let i = 0; i < boxes.length; i++) {
    const item = itemOf(sheet.items[i]);
    if (!item || item.hd === false) continue;
    const spec = SPRITES[item.key];
    if (!spec) throw new Error(`unknown sprite key "${item.key}"`);
    const k = sheet.hd[item.key] ?? sheet.hd.default;
    const info = rawInfo(boxes[i]);
    const tw = Math.max(1, Math.round(info.width * k));
    const th = Math.max(1, Math.round(info.height * k));
    let img = sharp(cropRaw(data, w, boxes[i], masks[i]), { raw: info }).resize(tw, th, { kernel: 'lanczos3' });
    if (item.flip) img = img.flop();
    const rgba = (await img.ensureAlpha().raw().toBuffer());
    // альфа порогом, как в hd-frames: без полупрозрачной каймы
    for (let p = 3; p < rgba.length; p += 4) rgba[p] = rgba[p] >= 110 ? 255 : 0;
    if (!strips.has(item.key)) strips.set(item.key, { spec, frames: [] });
    strips.get(item.key).frames[item.frame || 0] = { w: tw, h: th, rgba };
    console.log(`  ${item.key}[${item.frame || 0}] ${info.width}x${info.height} -> ${tw}x${th} (x${k})`);
  }
  for (const [key, { spec, frames }] of strips) {
    const fw = spec.frameWidth;
    const fh = spec.frameHeight;
    const n = spec.frames || frames.length; // без frames в manifest: сколько кадров нарезано с листа
    const layers = [];
    for (let f = 0; f < n; f++) {
      const im = frames[f] || frames[0];
      if (im.w > fw || im.h > fh) throw new Error(`${key}: ${im.w}x${im.h} does not fit frame ${fw}x${fh}`);
      const left = f * fw + Math.round(fw * spec.origin[0] - im.w / 2);
      const top = spec.origin[1] >= 0.99 ? fh - im.h : Math.round(fh * spec.origin[1] - im.h / 2);
      layers.push({ input: im.rgba, raw: { width: im.w, height: im.h, channels: 4 }, left, top });
    }
    await sharp({
      create: {
        width: fw * n, height: fh, channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers).png().toFile(join(root, spec.file));
  }
  console.log(`wrote ${strips.size} hd sprites`);
}

function mergeClose(boxes, gap = MERGE_GAP) {
  const near = (a, b) => a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 &&
      a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1;
  const list = boxes.slice();
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < list.length && !changed; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!near(list[i], list[j])) continue;
        const a = list[i];
        const b = list[j];
        list[i] = {
          x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1),
          y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1),
        };
        list.splice(j, 1);
        changed = true;
        break;
      }
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
    if (row) {
      row.items.push(b);
      row.y0 = Math.min(row.y0, b.y0);
      row.y1 = Math.max(row.y1, b.y1);
    } else {
      rows.push({ y0: b.y0, y1: b.y1, items: [b] });
    }
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

// Сдвиг (dx, dy) кадра im относительно ref, при котором верхние 40% фигуры (голова) совпадают лучше всего.
function headShift(ref, im) {
  const rows = Math.round(ref.h * 0.4);
  const px = (m, x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ?
      null : m.rgba.subarray((y * m.w + x) * 4, (y * m.w + x) * 4 + 4));
  let best = [0, 0];
  let bestCost = Infinity;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      let cost = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < ref.w; x++) {
          const a = px(ref, x, y);
          const b = px(im, x - dx, y - dy);
          const ao = a && a[3] > 0;
          const bo = b && b[3] > 0;
          if (ao !== bo) {
            cost += 255;
          } else if (ao) {
            cost += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
          }
        }
      }
      if (cost < bestCost) { bestCost = cost; best = [dx, dy]; }
    }
  }
  return best;
}

function flipX(im) {
  const out = new Uint8Array(im.rgba.length);
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      out.set(im.rgba.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4),
          (y * im.w + (im.w - 1 - x)) * 4);
    }
  }
  return { ...im, rgba: out };
}

async function main() {
  const name = process.argv[2];
  const reportOnly = process.argv.includes('--report');
  const sheets = JSON.parse(readFileSync(join(root, 'tools', 'sheets.json'), 'utf8'));
  const sheet = sheets[name];
  if (!sheet) throw new Error(`unknown sheet "${name}" (see tools/sheets.json)`);

  const { data, info } = await sharp(join(root, sheet.raw)).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const { mask } = buildMask(data, w, h, { alphaOnly: !!sheet.alphaOnly });
  // Фигуры, которые касаются друг друга (свечение, хвост, крыло), разделяются вертикальными разрезами:
  // sheets.json "cuts": [[x, y0, y1], ...] в px исходника; [x0, x1, y, "h"] — горизонтальный отрезок,
  // чтобы собрать из вертикальных ступенчатый разрез вокруг выступа (хвост, крыло, корни).
  for (const c of sheet.cuts || []) {
    if (c[3] === 'h') for (let x = c[0]; x <= c[1]; x++) mask[c[2] * w + x] = 0;
    else for (let y = c[1]; y < c[2]; y++) mask[y * w + c[0]] = 0;
  }
  removeSpecks(mask, w, h, 12);
  let boxes;
  let masks;
  if (sheet.boxes) {
    const objs = assignByBoxes(mask, w, h, sheet);
    boxes = objs.map((o) => o.box);
    masks = objs.map((o) => o.mask);
  } else {
    const found = mergeClose(components(mask, w, h).boxes, sheet.mergeGap)
        .filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) > 150);
    boxes = sheet.rows === 'center' ? centerOrder(found) : overlapOrder(found);
    masks = boxes.map(() => mask);
  }
  // --raw: каждая фигура в исходном разрешении в assets/raw/<sheet>/<key>.png (кадр N многокадрового: <key>_N.png)
  if (process.argv.includes('--raw') && boxes.length === sheet.items.length) {
    const dir = join(root, 'assets', 'raw', name);
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < boxes.length; i++) {
      const item = itemOf(sheet.items[i]);
      if (item) await sharp(cropRaw(data, w, boxes[i], masks[i]), { raw: rawInfo(boxes[i]) }).png().toFile(join(dir, `${rawName(item)}.png`));
    }
    console.log(`raw crops in assets/raw/${name}/`);
  }
  if (sheet.hd && !reportOnly) return writeHd(sheet, data, w, boxes, masks);

  const profs = boxes.map((b, i) => edgeProfiles(data, masks[i], w, h, b));
  // Шаг сетки модели зависит от качества и масштаба листа: границы шага задаются в sheets.json (step: [min, max]).
  const [minStep, maxStep] = sheet.step || [6, 16];
  const gap = Math.max(2, minStep - 1);
  let sx = commonStep(profs.map((p) => edgePeaks(p.colE, p.x0, p.x1, gap)), minStep, maxStep);
  let sy = commonStep(profs.map((p) => edgePeaks(p.rowE, p.y0, p.y1, gap)), minStep, maxStep);
  if (sy > sx * 1.6) sy /= 2;
  else if (sx > sy * 1.6) sx /= 2;
  const native = profs.map((p, i) => gridSnap(data, masks[i], w, p, sx, sy));
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
    const fw = spec.frameWidth;
    const fh = spec.frameHeight;
    const n = spec.frames || frames.length; // без frames в manifest: сколько кадров нарезано с листа
    const buf = Buffer.alloc(fw * n * fh * 4);
    const place = (im) => [
      Math.round(fw * spec.origin[0] - im.w / 2),
      spec.origin[1] >= 0.99 ? fh - im.h : Math.round(fh * spec.origin[1] - im.h / 2),
    ];
    // sheets.json "align": "head" — кадры шага (1..N-1) сдвигаются так, чтобы голова совпала с кадром 1:
    // разная ширина рамки (меч, плащ) и подскок модели иначе дают дрожь при смене кадров.
    const ref = sheet.align === 'head' && frames[1] ? frames[1] : null;
    for (let f = 0; f < n; f++) {
      const im = frames[f] || frames[0];
      let [ox, oy] = place(im);
      if (ref && f > 0 && im !== ref) {
        const [rx, ry] = place(ref);
        const [dx, dy] = headShift(ref, im);
        ox = rx + dx; oy = ry + dy;
      }
      for (let y = 0; y < im.h; y++) {
        for (let x = 0; x < im.w; x++) {
          const s = (y * im.w + x) * 4;
          const tx = ox + x;
          const ty = oy + y;
          if (!im.rgba[s + 3] || tx < 0 || ty < 0 || tx >= fw || ty >= fh) continue;
          buf.set(im.rgba.subarray(s, s + 4), (ty * fw * n + f * fw + tx) * 4);
        }
      }
    }
    await sharp(buf, { raw: { width: fw * n, height: fh, channels: 4 } })
        .png().toFile(join(root, spec.file));
  }
  console.log(`wrote ${strips.size} sprites`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
