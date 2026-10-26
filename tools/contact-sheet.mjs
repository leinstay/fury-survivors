// Превью-лист спрайтов для проверки человеком: каждый спрайт ×scale (nearest) на шахматке, с подписью и линией опоры.
// node tools/contact-sheet.mjs [key ...] [--scale 4] [--out tools/out/contact-sheet.png] [--bg grass]
// Без ключей берёт все спрайты из manifest.js.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../assets/sprites/manifest.js';
import { frameCount } from './sprite-frames.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = { keys: [], scale: 4, out: 'tools/out/contact-sheet.png', bg: 'checker' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--scale') a.scale = Number(argv[++i]);
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--bg') a.bg = argv[++i];
    else a.keys.push(argv[i]);
  }
  if (!a.keys.length) a.keys = Object.keys(SPRITES);
  return a;
}

const esc = (s) => s.replace(/[<>&]/g, '');

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const LABEL = 18;
  const GAP = 12;
  const rows = [];
  for (const key of a.keys) {
    const s = SPRITES[key];
    if (!s) throw new Error(`unknown key ${key}`);
    const n = frameCount(s, root);
    const w = s.frameWidth * n * a.scale;
    const h = s.frameHeight * a.scale;
    const img = await sharp(join(root, s.file)).resize(w, h, { kernel: 'nearest' }).png().toBuffer();
    rows.push({ key, s, n, img, w, h });
  }
  const W = Math.max(...rows.map((r) => r.w)) + GAP * 2;
  const H = rows.reduce((sum, r) => sum + r.h + LABEL + GAP, GAP);

  // Фон: шахматка 8×8 или трава, чтобы видеть края и ореол.
  const cell = 8 * a.scale / 2;
  const bgSvg = a.bg === 'grass'
    ? `<svg width="${W}" height="${H}"><rect width="100%" height="100%" fill="#4a7a3a"/></svg>`
    : `<svg width="${W}" height="${H}"><defs><pattern id="c" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">
        <rect width="${cell * 2}" height="${cell * 2}" fill="#d8d8d8"/><rect width="${cell}" height="${cell}" fill="#b8b8b8"/>
        <rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#b8b8b8"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#c)"/></svg>`;

  const layers = [];
  let y = GAP;
  let overlay = '';
  for (const r of rows) {
    overlay += `<text x="${GAP}" y="${y + 13}" font-family="monospace" font-size="13" fill="#111">${esc(r.key)}  ${r.s.frameWidth}x${r.s.frameHeight} x${r.n}</text>`;
    y += LABEL;
    layers.push({ input: r.img, left: GAP, top: y });
    // Опора: красная линия по ногам, синие метки центра каждого кадра.
    const oy = y + Math.round(r.s.frameHeight * r.s.origin[1]) * a.scale;
    overlay += `<line x1="${GAP}" x2="${GAP + r.w}" y1="${oy}" y2="${oy}" stroke="#e02020" stroke-width="1" opacity="0.6"/>`;
    for (let f = 0; f < r.n; f++) {
      const ox = GAP + (f * r.s.frameWidth + r.s.frameWidth * r.s.origin[0]) * a.scale;
      overlay += `<line x1="${ox}" x2="${ox}" y1="${oy - 6}" y2="${oy + 6}" stroke="#2050e0" stroke-width="1"/>`;
      overlay += `<rect x="${GAP + f * r.s.frameWidth * a.scale}" y="${y}" width="${r.s.frameWidth * a.scale}" height="${r.h}" fill="none" stroke="#888" stroke-width="1" opacity="0.5"/>`;
    }
    y += r.h + GAP;
  }
  layers.push({ input: Buffer.from(`<svg width="${W}" height="${H}">${overlay}</svg>`), left: 0, top: 0 });

  const out = join(root, a.out);
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(bgSvg)).composite(layers).png().toFile(out);
  console.log(`${a.out} ${W}x${H}, ${rows.length} sprites`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
