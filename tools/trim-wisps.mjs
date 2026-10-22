// Чистка кадров PixelLab от лишних язычков пламени: в заданных зонах кадра удаляются отдельные пятна
// (связные области, чей центр внутри зоны) и синие пиксели, приросшие к фигуре.
// Правит assets/raw/reaper_anim_pixellab/*.png на месте, после него лента пересобирается:
// node tools/hd-frames.mjs assets/sprites/reaper.png 1.5 assets/raw/reaper_anim_pixellab/{0..8}.png
// node tools/trim-wisps.mjs [apply]   без apply только печатает, что было бы удалено
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets', 'raw', 'reaper_anim_pixellab');
// зоны кадра 192×256 [x0, y0, x1, y1]: над капюшоном слева от косы; слева у волос
const ZONES = [[30, 0, 85, 60], [0, 110, 34, 170]];
// над макушкой капюшона остаётся светлая ниточка пряди: в этой зоне стираются все светлые пиксели
const LIGHT_ZONE = [56, 14, 86, 48];
const LIGHT = 90;      // яркость, выше которой пиксель в LIGHT_ZONE считается прядью (капюшон темнее)
const SPECK = 8;       // отдельные пятна не больше стольких пикселей удаляются по всему кадру (синие точки)
const ALPHA = 20;
const apply = process.argv[2] === 'apply';

const inZone = (x, y) => ZONES.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
const isCyan = (d, i) => d[i + 3] >= ALPHA && d[i + 2] > 140 && d[i] < 130 && d[i + 1] > 110;

// Связные области непрозрачных пикселей (4-связность), списки индексов.
function components(data, W, H) {
  const lab = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let s = 0; s < W * H; s++) {
    if (data[s * 4 + 3] < ALPHA || lab[s] >= 0) continue;
    const id = comps.length;
    const px = [];
    const st = [s];
    lab[s] = id;
    while (st.length) {
      const i = st.pop();
      px.push(i);
      const x = i % W;
      const y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (data[j * 4 + 3] >= ALPHA && lab[j] < 0) { lab[j] = id; st.push(j); }
      }
    }
    comps.push(px);
  }
  return comps;
}

function center(px, W) {
  let sx = 0;
  let sy = 0;
  for (const i of px) { sx += i % W; sy += (i / W) | 0; }
  return [sx / px.length, sy / px.length];
}

for (let f = 0; f <= 8; f++) {
  const file = join(dir, `${f}.png`);
  const { data, info } = await sharp(file).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const comps = components(data, W, H);
  const main = comps.reduce((a, b) => (b.length > a.length ? b : a));
  const removed = [];
  for (const c of comps) {
    if (c === main) continue;
    const [cx, cy] = center(c, W);
    if (!inZone(cx, cy) && c.length > SPECK) continue;
    removed.push(`${c.length}px@${cx.toFixed(0)},${cy.toFixed(0)}`);
    if (apply) for (const i of c) data[i * 4 + 3] = 0;
  }
  let light = 0;
  for (let y = LIGHT_ZONE[1]; y <= LIGHT_ZONE[3]; y++) {
    for (let x = LIGHT_ZONE[0]; x <= LIGHT_ZONE[2]; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] < ALPHA || (data[i] + data[i + 1] + data[i + 2]) / 3 <= LIGHT) continue;
      light++;
      if (apply) data[i + 3] = 0;
    }
  }
  let cyan = 0;
  for (const [x0, y0, x1, y1] of ZONES) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        if (!isCyan(data, i)) continue;
        cyan++;
        if (apply) data[i + 3] = 0;
      }
    }
  }
  console.log(`frame ${f}: blobs ${removed.join(' ') || '-'}, cyan px in zones ${cyan}, light px ${light}`);
  if (apply) await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
}
