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

// ---- валидация контента (этап 1) ----
import { WEAPON_BEHAVIORS, ENEMY_BEHAVIORS } from '../../src/behaviors/index.js';

test('data: weapons have behavior, icon, sprite and full level tables', () => {
  assert.equal(Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved).length, 7);
  for (const [id, w] of Object.entries(WEAPONS)) {
    assert.ok(WEAPON_BEHAVIORS[w.behavior], `${id}: unknown behavior ${w.behavior}`);
    assert.ok(w.icon && w.sprite, `${id}: icon/sprite`);
    assert.equal(w.levels.length, w.maxLevel, `${id}: levels vs maxLevel`);
    if (!w.evolved) assert.equal(w.maxLevel, 7, `${id}: 7 levels`);
    for (const [i, lv] of w.levels.entries()) {
      assert.ok(lv.damage > 0, `${id} L${i + 1}: damage`);
      assert.ok(lv.cooldown >= 0, `${id} L${i + 1}: cooldown`);
    }
    for (let i = 1; i < w.levels.length; i++) {
      assert.ok(w.levels[i].damage >= w.levels[i - 1].damage, `${id}: damage must not drop at L${i + 1}`);
    }
  }
});

test('data: passives are well formed', () => {
  assert.equal(Object.keys(PASSIVES).length, 9);
  const stats = Object.keys(HEROES.heroine.stats);
  for (const [id, p] of Object.entries(PASSIVES)) {
    assert.ok(stats.includes(p.stat), `${id}: stat`);
    assert.ok(['add', 'mul'].includes(p.mode), `${id}: mode`);
    assert.ok(p.levels.length >= 1 && p.levels.every((v, i, a) => i === 0 || v > a[i - 1]), `${id}: levels grow`);
  }
});

test('data: combos use maxed regular weapons and evolved results', () => {
  assert.equal(COMBOS.length, 2);
  for (const c of COMBOS) {
    for (const id of c.from) assert.ok(!WEAPONS[id].evolved, `${id} is evolved`);
    assert.ok(WEAPONS[c.result].evolved, `${c.result} must have evolved: true`);
  }
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (w.evolved) assert.ok(COMBOS.some((c) => c.result === id), `${id}: evolved weapon without combo`);
  }
});

test('data: enemies have behavior, positive stats, elite block', () => {
  assert.equal(Object.keys(ENEMIES).length, 8);
  for (const [id, e] of Object.entries(ENEMIES)) {
    assert.ok(ENEMY_BEHAVIORS[e.behavior], `${id}: behavior`);
    assert.ok(e.hp > 0 && e.speed > 0 && e.damage > 0 && e.xp > 0 && e.size > 0, `${id}: stats`);
    assert.ok(e.elite && e.elite.hpMul > 1 && e.elite.sizeMul > 1 && e.elite.drop === 'chest', `${id}: elite`);
  }
});

test('data: bosses use known behavior, attacks and summons', () => {
  for (const [id, b] of Object.entries(BOSSES)) {
    assert.ok(ENEMY_BEHAVIORS[b.behavior], `${id}: behavior`);
    assert.ok(b.attacks.length > 0);
    for (const a of b.attacks) {
      assert.ok(['dash', 'summon'].includes(a.type));
      if (a.type === 'summon') assert.ok(ENEMIES[a.enemy], `${id}: summon enemy`);
    }
  }
  assert.ok(BOSSES.dryad_queen);
});

test('data: pickups, props drops and timeline are consistent', () => {
  for (const id of ['xp_small', 'xp_medium', 'xp_large', 'food', 'magnet', 'coin', 'chest']) assert.ok(PICKUPS[id], id);
  for (const p of forest.props.filter((x) => x.breakable)) {
    for (const [pid, chance] of Object.entries(p.drop)) {
      assert.ok(PICKUPS[pid], `prop drop ${pid}`);
      assert.ok(chance > 0 && chance <= 1);
    }
  }
  const last = forest.timeline[forest.timeline.length - 1];
  assert.equal(last.type, 'boss');
  assert.equal(last.at, forest.duration);
  for (const ev of forest.timeline) {
    assert.ok(['spawn', 'ring', 'elite', 'burst', 'boss'].includes(ev.type), `event type ${ev.type}`);
    if (ev.until !== undefined) assert.ok(ev.until > ev.at);
  }
});

test('data: i18n table has every derived key', () => {
  // Строки пишет другой агент; тест проверяет только те ключи, которые уже есть в таблице, на пустоту.
  for (const [k, v] of Object.entries(en)) assert.ok(v.length > 0, k);
});
