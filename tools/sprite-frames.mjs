// Число кадров ленты для Node-скриптов и тестов: как в src/scenes/Boot.js, по ширине PNG, если frames не задан в manifest.
import { openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Размер PNG из заголовка IHDR (байты 16..23), без декодирования картинки.
export function pngSize(file) {
  const buf = Buffer.alloc(24);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buf, 0, 24, 0);
  } finally {
    closeSync(fd);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// frames из manifest, иначе ширина файла / frameWidth; нет файла (заглушки ещё не сделаны) — 1 кадр.
export function frameCount(spec, root = '.') {
  if (spec.frames) return spec.frames;
  const file = join(root, spec.file);
  if (!existsSync(file)) return 1;
  return Math.max(1, Math.floor(pngSize(file).width / spec.frameWidth));
}
