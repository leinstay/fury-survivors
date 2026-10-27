// Неровные шары снарядов одним цветом, без обводки (форма как у пули виспа): кривой край по сетке 2 px
// текстуры (1 px мира при density 2). Пульсация колец внутри рисуется в игре (FX.zones.pulse).
//   meteor  proj_meteor     56 px, тёмно-оранжевый
//   frost   proj_frost      44 px, пустой кадр: ледяной шар — только кольца FX.zones.pulse (решение владельца)
//   shot    proj_wisp_shot  20 px: тёмная обводка убрана, шар закрашен до её внешнего края голубым
// node tools/make-ragged-balls.mjs [meteor frost shot]
import sharp from 'sharp';

const OUT = 'assets/sprites';
const BALLS = {
  meteor: { key: 'proj_meteor', size: 56, color: [0xc8, 0x4e, 0x14], seed: 1 },
  frost: { key: 'proj_frost', size: 44, color: [0xe8, 0xf6, 0xff], seed: 2, empty: true },
};
const CELL = 2;

async function ball({ key, size, color, seed, empty }) {
  const n = size / CELL;
  const c = (n - 1) / 2;
  const R = n / 2 - 0.6;
  const buf = Buffer.alloc(size * size * 4);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const dx = gx - c;
      const dy = gy - c;
      const a = Math.atan2(dy, dx);
      const r = R * (1 + 0.05 * Math.sin(3 * a + seed) + 0.04 * Math.sin(5 * a + 2 * seed) +
          0.03 * Math.sin(8 * a + 3 * seed));
      if (empty || Math.hypot(dx, dy) > r) continue;
      for (let py = 0; py < CELL; py++) {
        for (let px = 0; px < CELL; px++) {
          const i = ((gy * CELL + py) * size + gx * CELL + px) * 4;
          buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = 255;
        }
      }
    }
  }
  await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png()
      .toFile(`${OUT}/${key}.png`);
  console.log(key, size);
}

// Пуля виспа: всё, что внутри внешнего края обводки (и сама обводка), закрашивается; тёмные пиксели и щель
// между обводкой и ядром — цветом края ядра, ядро как было.
async function shot() {
  const file = `${OUT}/proj_wisp_shot.png`;
  const { data, info } = await sharp(file).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const at = (x, y) => (y * W + x) * 4;
  const dark = (i) => data[i + 3] >= 20 && (data[i] + data[i + 1] + data[i + 2]) / 3 < 60;
  // внутри — от крайнего левого до крайнего правого непрозрачного пикселя строки (в обводке бывают дырки)
  const out = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < H; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < W; x++) {
      if (data[at(x, y) + 3] < 20) continue;
      if (l < 0) l = x;
      r = x;
    }
    for (let x = l; l >= 0 && x <= r; x++) out[y * W + x] = 0;
  }
  const rim = [0x80, 0xe8, 0xff];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (out[y * W + x]) continue;
      if (data[i + 3] < 20 || dark(i)) {
        data[i] = rim[0]; data[i + 1] = rim[1]; data[i + 2] = rim[2]; data[i + 3] = 255;
      }
    }
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file + '.tmp');
  const fs = await import('node:fs');
  fs.renameSync(file + '.tmp', file);
  console.log('proj_wisp_shot', W);
}

const jobs = process.argv.slice(2);
const want = (k) => jobs.length === 0 || jobs.includes(k);
if (want('meteor')) await ball(BALLS.meteor);
if (want('frost')) await ball(BALLS.frost);
if (want('shot')) await shot();
