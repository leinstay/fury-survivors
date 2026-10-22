// Убирает рот, который PixelLab дорисовывает на кадрах анимации (исходные персонажи без рта).
// Кадр 0 — исходный рисунок без рта, по нему задана середина лица и низ глаз. Для каждого кадра голова
// находится сдвигом кадра 0 (минимум разницы по окну лица), под глазами ищутся замкнутые пятна не цвета
// кожи с заметно другим пикселем (рот; бледные тени и румянец не трогаются), пятно и его ореол заливаются
// цветом кожи вокруг.
// node tools/demouth.mjs [key...]   правит assets/raw/<key>_{anim|walk}_pixellab/*.png на месте
//   --dry      только отчёт, без записи
//   --debug    лист проверки tools/out/demouth-debug.png
import sharp from 'sharp';
import { existsSync } from 'node:fs';

// cx: середина лица в кадре 0 (координаты кадра 192×256); eb: нижняя строка глаз в кадре 0;
// top, h, halfW: сдвиг зоны от eb, её высота и полуширина; light: см. LIGHT_MIN.
const FACES = {
  heroine: { cx: 117, eb: 97 },
  catgirl: { cx: 117, eb: 100 },
  foxgirl: { cx: 112, eb: 103 },   // лиса из roster_v1 (у прежней торчал обрубок хвоста)
  succubus: { cx: 122, eb: 100 },
  slime: { cx: 118, eb: 108, top: -3, h: 32, halfW: 20 },
  // ghost: рта на кадрах нет, а тени тела под лицом похожи на пятна — не трогаем
  bunnygirl: { cx: 108, eb: 95 },
  harpy: { cx: 101, eb: 85, top: -9 },
  lamia: { cx: 98, eb: 85 },
  kitsune_empress: { cx: 112, eb: 90, light: true },
  harpy_queen: { cx: 105, eb: 85 },
  dryad_queen: { cx: 107, eb: 90, top: -12, light: true },
};
// Кадры, где голова повёрнута или рот на краю щеки и автоматика его не находит:
// прямоугольник [x0, y0, x1, y1] в координатах самого кадра; в нём заливаются тёмные и розово-красные пиксели.
const MANUAL = {
  succubus: { 7: [109, 106, 115, 109], 8: [110, 103, 114, 106] },
  bunnygirl: { 4: [111, 106, 117, 110], 8: [113, 121, 118, 126] },
  kitsune_empress: { 5: [109, 90, 120, 97] },
};
const BOX = { halfW: 15, top: -6, h: 18 };   // зона рта: от низа глаз (top) вниз на h
const SEARCH = 18;                  // поиск сдвига головы, px
const SKIN_TOL = 28;                // расстояние RGB до цвета кожи, ниже — кожа
const MOUTH = 45;                   // в пятне рта есть пиксель дальше от кожи на столько (тёмный или розовый)
const LIGHT_MIN = 80;               // режим light: пиксели темнее этого считаются контуром
const MAX_AREA = 140;               // открытый рот у боссов и гарпии до ~120 px

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const DEBUG = args.includes('--debug') ? [] : null;
const keys = args.filter((a) => !a.startsWith('--'));
const dirOf = (k) => ['anim', 'walk']
  .map((s) => `assets/raw/${k}_${s}_pixellab`)
  .find((d) => existsSync(`${d}/0.png`));

const load = async (f) => {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const save = (im, file) => sharp(im.data, { raw: { width: im.w, height: im.h, channels: 4 } })
  .png().toFile(file);
const px = (im, x, y) => {
  const i = (y * im.w + x) * 4;
  return [im.data[i], im.data[i + 1], im.data[i + 2], im.data[i + 3]];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// Самый частый непрозрачный цвет прямоугольника: цвет кожи кадра (кадр 0 мутнее остальных, его цвет не годится).
function modeColor(im, x0, y0, x1, y1) {
  const count = new Map();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = px(im, x, y);
      if (c[3] <= 128) continue;
      const k = c.slice(0, 3).join();
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  return [...count].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
}

// Сдвиг (dx, dy), при котором окно лица кадра 0 лучше всего ложится на кадр.
function align(ref, im, f) {
  const x0 = f.cx - 26;
  const x1 = f.cx + 26;
  const y0 = f.eb - 22;
  const y1 = f.eb + 4;
  let best = [0, 0];
  let bestE = Infinity;
  for (let dy = -SEARCH; dy <= SEARCH; dy++) {
    for (let dx = -SEARCH; dx <= SEARCH; dx++) {
      let e = 0;
      for (let y = y0; y < y1 && e < bestE; y++) {
        for (let x = x0; x < x1; x++) {
          const X = x + dx;
          const Y = y + dy;
          if (X < 0 || Y < 0 || X >= im.w || Y >= im.h) {
            e += 1e4;
            continue;
          }
          const a = px(ref, x, y);
          const b = px(im, X, Y);
          if (a[3] < 128 || b[3] < 128) e += (a[3] < 128) === (b[3] < 128) ? 0 : 3e4;
          else e += dist(a, b) ** 2;
        }
      }
      if (e < bestE) {
        bestE = e;
        best = [dx, dy];
      }
    }
  }
  return best;
}

async function fixManual(file, [x0, y0, x1, y1]) {
  const im = await load(file);
  const skin = modeColor(im, x0 - 3, y0 - 3, x1 + 3, y1 + 3);
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = px(im, x, y);
      if (c[3] < 128 || dist(c, skin) < SKIN_TOL || !(lum(c) < 110 || c[0] - c[1] > 35)) continue;
      const i = (y * im.w + x) * 4;
      im.data[i] = skin[0];
      im.data[i + 1] = skin[1];
      im.data[i + 2] = skin[2];
      n++;
    }
  }
  if (!dry) await save(im, file);
  return n;
}

async function fixFrame(file, ref, f) {
  const im = await load(file);
  const [dx, dy] = align(ref, im, f);
  const hw = f.halfW ?? BOX.halfW;
  const bx0 = f.cx - hw + dx;
  const bx1 = f.cx + hw + dx;
  const by0 = f.eb + (f.top ?? BOX.top) + dy;
  const by1 = by0 + (f.h ?? BOX.h);
  const W = bx1 - bx0 + 1;
  const H = by1 - by0 + 1;
  const skin = modeColor(im, bx0, by0, bx1, by1);
  // кожа: близко к цвету кожи; светлые блики рядом с ним (белая подсветка под ртом) тоже считаются кожей
  const bright = (c) => c[0] + c[1] + c[2] > skin[0] + skin[1] + skin[2];
  const isSkin = (x, y) => {
    const c = px(im, x, y);
    const d = dist(c, skin);
    return c[3] > 128 && (d < SKIN_TOL || (bright(c) && d < 45));
  };
  // light: рот на линии подбородка; тёмный контур не входит в пятно, убирается только заливка рта
  const barrier = (x, y) => isSkin(x, y) || (f.light && lum(px(im, x, y)) < LIGHT_MIN);
  const seen = new Uint8Array(W * H);
  const fills = [];
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const k = (y - by0) * W + (x - bx0);
      if (seen[k] || barrier(x, y)) continue;
      // пятно не-кожи внутри зоны; касается края зоны — не рот (контур, волосы, глаз)
      const comp = [];
      const q = [[x, y]];
      seen[k] = 1;
      let edge = false;
      let mouthLike = false;
      while (q.length) {
        const [qx, qy] = q.pop();
        comp.push([qx, qy]);
        if (qx === bx0 || qx === bx1 || qy === by0 || qy === by1) edge = true;
        if (dist(px(im, qx, qy), skin) > MOUTH) mouthLike = true;
        for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) {
          if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue;
          const nk = (ny - by0) * W + (nx - bx0);
          if (seen[nk] || barrier(nx, ny)) continue;
          seen[nk] = 1;
          q.push([nx, ny]);
        }
      }
      if (!edge && mouthLike && comp.length <= MAX_AREA) fills.push(comp);
    }
  }
  if (DEBUG) DEBUG.push({ file, box: [bx0, by0, bx1, by1], fills: fills.flat() });
  if (!fills.length) return { dx, dy, filled: 0 };
  // заливка: пятно плюс ореол (соседи, заметно отличные от кожи), цвет — среднее кожи вокруг
  const mark = new Set();
  for (const comp of fills) {
    for (const [x, y] of comp) {
      mark.add(`${x},${y}`);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const c = px(im, x + ox, y + oy);
          const d = dist(c, skin);
          if (c[3] > 128 && d > 12 && d < SKIN_TOL) mark.add(`${x + ox},${y + oy}`);
        }
      }
    }
  }
  for (const s of mark) {
    const [x, y] = s.split(',').map(Number);
    const sum = [0, 0, 0];
    let n = 0;
    for (let oy = -4; oy <= 4; oy++) {
      for (let ox = -4; ox <= 4; ox++) {
        if (mark.has(`${x + ox},${y + oy}`)) continue;
        const c = px(im, x + ox, y + oy);
        if (c[3] <= 128 || dist(c, skin) >= SKIN_TOL) continue;
        sum[0] += c[0];
        sum[1] += c[1];
        sum[2] += c[2];
        n++;
      }
    }
    const c = n ? sum.map((v) => v / n) : skin;
    const i = (y * im.w + x) * 4;
    im.data[i] = Math.round(c[0]);
    im.data[i + 1] = Math.round(c[1]);
    im.data[i + 2] = Math.round(c[2]);
    im.data[i + 3] = 255;
  }
  if (!dry) await save(im, file);
  return { dx, dy, filled: mark.size, spots: fills.map((c) => c.length) };
}

for (const key of keys.length ? keys : Object.keys(FACES)) {
  const f = FACES[key];
  const dir = dirOf(key);
  if (!f || !dir) {
    console.log(key, 'skip');
    continue;
  }
  const ref = await load(`${dir}/0.png`);
  const out = [];
  for (let i = 0; i < 9; i++) {
    const r = await fixFrame(`${dir}/${i}.png`, ref, f);
    const m = MANUAL[key]?.[i];
    if (m) r.manual = await fixManual(`${dir}/${i}.png`, m);
    let line = `${i}:${r.dx},${r.dy}`;
    if (r.filled) line += ` fill ${r.filled} [${r.spots}]`;
    if (r.manual) line += ` manual ${r.manual}`;
    out.push(line);
  }
  console.log(key, out.join('  '));
}

if (DEBUG) {
  // лист проверки: окрестность зоны рта ×6, зона жёлтым, найденные пятна красным
  const S = 6;
  const P = 14;
  const cells = DEBUG.map((d) => {
    const [x0, y0, x1, y1] = d.box;
    return { d, X: x0 - P, Y: y0 - P - 10, W: x1 - x0 + 2 * P, H: y1 - y0 + 2 * P + 10 };
  });
  const cw = Math.max(...cells.map((c) => c.W)) * S + 4;
  const ch = Math.max(...cells.map((c) => c.H)) * S + 4;
  const L = [];
  for (const [n, { d, X, Y, W, H }] of cells.entries()) {
    const [x0, y0, x1, y1] = d.box;
    const img = await sharp(d.file)
      .extract({ left: X, top: Y, width: W, height: H })
      .resize(W * S, H * S, { kernel: 'nearest' }).png().toBuffer();
    const spots = d.fills.map(([x, y]) =>
      `<rect x="${(x - X) * S}" y="${(y - Y) * S}" width="${S}" height="${S}" fill="none" stroke="red"/>`).join('');
    const box = `<rect x="${(x0 - X) * S}" y="${(y0 - Y) * S}" width="${(x1 - x0 + 1) * S}" `
      + `height="${(y1 - y0 + 1) * S}" fill="none" stroke="yellow" stroke-width="2"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}">${box}${spots}</svg>`;
    const left = (n % 9) * cw;
    const top = Math.floor(n / 9) * ch;
    L.push({ input: img, left, top }, { input: Buffer.from(svg), left, top });
  }
  await sharp({ create: { width: 9 * cw, height: Math.ceil(cells.length / 9) * ch, channels: 4, background: '#000' } })
    .composite(L).png().toFile('tools/out/demouth-debug.png');
}
