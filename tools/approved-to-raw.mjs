// Утверждённые анимации (листы 3×3 по 256 из tools/out/first-frames-256/approved/<имя>.png, в них правили руками)
// → кадры assets/raw/<key>_walk256_pixellab/0..8.png и ленты игры: герои и враги ×0.5 (кадр 128), боссы и жница ×1 (256).
// node tools/approved-to-raw.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const APPROVED = 'tools/out/first-frames-256/approved';
// имя листа → ключ спрайта в игре (жница в листах называется death)
const KEY = { death: 'reaper' };
const BIG = new Set(['harpy_queen', 'kitsune_empress', 'dryad_queen', 'reaper']);

for (const file of fs.readdirSync(APPROVED).filter((f) => f.endsWith('.png'))) {
  const name = file.slice(0, -4);
  const key = KEY[name] || name;
  const dir = `assets/raw/${key}_walk256_pixellab`;
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  for (let i = 0; i < 9; i++) {
    const out = `${dir}/${i}.png`;
    const { data } = await sharp(`${APPROVED}/${file}`)
        .extract({ left: (i % 3) * 256, top: Math.floor(i / 3) * 256, width: 256, height: 256 })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let p = 3; p < data.length; p += 4) data[p] = data[p] >= 128 ? 255 : 0; // правки руками: альфа двоичная
    await sharp(data, { raw: { width: 256, height: 256, channels: 4 } }).png().toFile(out);
    frames.push(out);
  }
  const scale = BIG.has(key) ? '1' : '0.5';
  execFileSync('node', ['tools/hd-frames.mjs', `assets/sprites/${key}.png`, scale, ...frames], { stdio: 'inherit' });
}
