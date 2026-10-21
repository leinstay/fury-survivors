import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPRITES } from '../../assets/sprites/manifest.js';
import { HEROES } from '../../src/data/heroes.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { COMBOS } from '../../src/data/combos.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { BOSSES } from '../../src/data/bosses.js';
import { PICKUPS } from '../../src/data/pickups.js';
import forest from '../../src/data/stages/forest.js';
import en from '../../src/i18n/en.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('manifest: every sprite has a file and sane frame', () => {
  for (const [key, s] of Object.entries(SPRITES)) {
    assert.ok(existsSync(join(root, s.file)), `${key}: missing ${s.file}`);
    assert.ok(s.frameWidth > 0 && s.frameHeight > 0 && s.frames >= 1, `${key}: bad frame`);
    assert.ok(s.origin[0] >= 0 && s.origin[0] <= 1 && s.origin[1] >= 0 && s.origin[1] <= 1, `${key}: bad origin`);
  }
});

test('data: sprites referenced by content exist in manifest', () => {
  const refs = [
    ...Object.values(HEROES).flatMap((h) => [h.sprite, h.portrait]),
    ...Object.values(WEAPONS).flatMap((w) => [w.icon, w.sprite]),
    ...Object.values(PASSIVES).map((p) => p.icon),
    ...Object.values(ENEMIES).map((e) => e.sprite),
    ...Object.values(BOSSES).map((b) => b.sprite),
    ...Object.values(PICKUPS).map((p) => p.sprite),
  ].filter(Boolean);
  for (const r of refs) assert.ok(SPRITES[r], `sprite "${r}" not in manifest`);
});

test('data: combos reference existing weapons', () => {
  for (const c of COMBOS) {
    for (const id of [...c.from, c.result]) assert.ok(WEAPONS[id], `combo references unknown weapon "${id}"`);
  }
});

test('data: hero start weapons exist', () => {
  for (const [id, h] of Object.entries(HEROES)) assert.ok(WEAPONS[h.startWeapon], `${id}: unknown startWeapon`);
});

test('stage: timeline sorted and references known enemies', () => {
  let prev = -1;
  for (const ev of forest.timeline) {
    assert.ok(ev.at >= prev, `timeline not sorted at ${ev.at}`);
    prev = ev.at;
    if (ev.enemy) assert.ok(ENEMIES[ev.enemy], `unknown enemy "${ev.enemy}"`);
    if (ev.boss) assert.ok(BOSSES[ev.boss], `unknown boss "${ev.boss}"`);
  }
});

test('i18n: all values are strings', () => {
  for (const [k, v] of Object.entries(en)) assert.equal(typeof v, 'string', k);
});
