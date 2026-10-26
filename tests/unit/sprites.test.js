import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES, CHAR, CHAR_OLD } from '../../assets/sprites/manifest.js';
import { HEROES } from '../../src/data/heroes.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { pngSize, frameCount } from '../../tools/sprite-frames.mjs';
import { walkFrame } from '../../src/render/anim.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('sprites: strip width is a whole number of frames, height is one frame', () => {
  for (const [key, s] of Object.entries(SPRITES)) {
    const { width, height } = pngSize(join(root, s.file));
    assert.equal(width % s.frameWidth, 0, `${key}: width ${width} not a multiple of frame ${s.frameWidth}`);
    assert.equal(height, s.frameHeight, `${key}: height ${height} != frame ${s.frameHeight}`);
    if (s.frames) assert.equal(width / s.frameWidth, s.frames, `${key}: frames in manifest != strip width`);
  }
});

// Герои уже на CHAR, враги до новых анимаций на CHAR_OLD.
test('sprites: heroes use CHAR×CHAR, regular enemies CHAR or CHAR_OLD, count from strip width', () => {
  const heroes = new Set(Object.values(HEROES).map((d) => d.sprite));
  const keys = new Set([...Object.values(HEROES), ...Object.values(ENEMIES)].map((d) => d.sprite));
  for (const key of keys) {
    const s = SPRITES[key];
    assert.equal(s.frameWidth, s.frameHeight, `${key}: square frame`);
    if (heroes.has(key)) assert.equal(s.frameWidth, CHAR, `${key}: hero frame`);
    else assert.ok([CHAR, CHAR_OLD].includes(s.frameWidth), `${key}: enemy frame ${s.frameWidth}`);
    assert.equal(s.frames, undefined, `${key}: frames comes from the strip, not manifest`);
    assert.ok(frameCount(s, root) >= 2, `${key}: walk strip`);
  }
});

test('anim: walk cycle follows frame count, seam adds the stand frame', () => {
  const cycle = (def) => Array.from({ length: def.frames + 1 }, (_, i) => walkFrame(def, i));
  assert.deepEqual(cycle({ frames: 4 }), [1, 2, 3, 1, 2]);
  assert.deepEqual(cycle({ frames: 4, seam: true }), [1, 2, 3, 0, 1]);
  assert.deepEqual(cycle({ frames: 3, walk: [2, 1] }), [2, 1, 2, 1]);
});
