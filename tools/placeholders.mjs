// Генерирует заглушки по assets/sprites/manifest.js: цветной силуэт с обводкой, тот же кадр и опора.
// Существующие файлы не трогает (там может лежать настоящий спрайт), если не передан --force.
// Запуск: node tools/placeholders.mjs [--force]
import { writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../assets/sprites/manifest.js';
import { frameCount } from './sprite-frames.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// RGBA-буфер -> PNG без внешних зависимостей.
export function encodePng(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 бит на канал
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Попадает ли пиксель (x, y) кадра в силуэт. cx, footY — опора; w, h — размер фигуры.
function inside(shape, x, y, cx, footY, w, h, frame) {
  const top = footY - h;
  const left = cx - w / 2;
  if (shape === 'rect') return x >= left && x < left + w && y >= top && y < footY;
  if (shape === 'round' || shape === 'blob' || shape === 'flyer') {
    const squash = shape === 'blob' && frame === 1 ? 0.88 : 1;
    const bob = shape === 'flyer' ? [0, -2, 1][frame] : 0;
    const rx = w / 2 / squash;
    const ry = (h / 2) * squash;
    const cy = footY - ry + bob;
    return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  }
  // humanoid: голова (смещена вправо — смотрит вправо), туловище, две ноги, в шаге ноги расходятся
  const headR = Math.max(3, Math.round(w * 0.3));
  const headCy = top + headR;
  if (((x + 0.5 - cx - 2) / headR) ** 2 + ((y + 0.5 - headCy) / headR) ** 2 <= 1) return true;
  const torsoTop = top + headR * 2;
  const legTop = top + Math.round(h * 0.6);
  if (y >= torsoTop && y < legTop && x >= left + 2 && x < left + w - 2) return true;
  if (y >= legTop && y < footY) {
    const spread = [0, 3, -3][frame];
    const legW = Math.max(2, Math.round(w * 0.25));
    const l1 = cx - legW - 1 + spread;
    const l2 = cx + 1 - spread;
    return (x >= l1 && x < l1 + legW) || (x >= l2 && x < l2 + legW);
  }
  return false;
}

export function renderPlaceholder(s) {
  const frames = frameCount(s, root);
  const W = s.frameWidth * frames;
  const H = s.frameHeight;
  const buf = Buffer.alloc(W * H * 4);
  const [r, g, b] = hex(s.color);
  const [sw, sh] = s.size;
  const cx = s.frameWidth * s.origin[0];
  // Опора у ног (origin y ниже 0.75) или фигура по центру кадра.
  const footY = s.origin[1] >= 0.75 ?
      Math.round(s.frameHeight * s.origin[1]) : Math.round((s.frameHeight + sh) / 2);
  for (let f = 0; f < frames; f++) {
    const shade = 1 - (f % 4) * 0.08;
    const mask = (x, y) => {
      if (x < 0 || y < 0 || x >= s.frameWidth || y >= H) return false;
      return s.shape === 'tile' || inside(s.shape, x, y, cx, footY, sw, sh, f % 3);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < s.frameWidth; x++) {
        const i = (y * W + f * s.frameWidth + x) * 4;
        if (mask(x, y)) {
          // Правая половина светлее: видно, куда смотрит фигура. Тайлы с редким шумом.
          let k = shade * (s.shape !== 'tile' && x > cx ? 1.15 : 1);
          if (s.shape === 'tile' && (x * 7 + y * 13 + f * 5) % 23 === 0) k *= 1.3;
          buf[i] = Math.min(255, r * k);
          buf[i + 1] = Math.min(255, g * k);
          buf[i + 2] = Math.min(255, b * k);
          buf[i + 3] = 255;
        } else if (mask(x - 1, y) || mask(x + 1, y) || mask(x, y - 1) || mask(x, y + 1)) {
          buf[i] = 20; buf[i + 1] = 16; buf[i + 2] = 24; buf[i + 3] = 255;
        }
      }
    }
  }
  return encodePng(W, H, buf);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  let made = 0;
  let kept = 0;
  for (const s of Object.values(SPRITES)) {
    const out = join(root, s.file);
    if (existsSync(out) && !force) { kept++; continue; }
    writeFileSync(out, renderPlaceholder(s));
    made++;
  }
  console.log(`placeholders: ${made} written, ${kept} kept`);
}
