import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { STATS } from '../../src/data/stats.js';
import { passivePreview, weaponPreview, weaponsForStat, statAffectsWeapon, weaponStats } from
  '../../src/core/card-preview.js';
import { fitSections } from '../../src/ui/grid-fit.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const idOf = (pred) => Object.keys(WEAPONS).find((id) => !WEAPONS[id].evolved && pred(WEAPONS[id]));
const passiveOf = (stat) => Object.keys(PASSIVES).find((id) => PASSIVES[id].stat === stat);

test('card preview: damage-type stat affects only weapons of that type, haste all, defense none', () => {
  const ids = Object.keys(WEAPONS);
  const types = [...new Set(Object.values(WEAPONS).map((w) => w.dmgType))];
  for (const type of types) {
    if (!STATS[type]) continue;
    assert.deepEqual(weaponsForStat(type, ids), ids.filter((id) => WEAPONS[id].dmgType === type));
  }
  assert.deepEqual(weaponsForStat('haste', ids), ids);
  for (const k of ['maxHp', 'regen', 'dodge', 'speed', 'pickup']) assert.deepEqual(weaponsForStat(k, ids), []);
  const noArea = idOf((d) => d.levels.every((lv) => lv.area === undefined));
  if (noArea) assert.equal(statAffectsWeapon('area', noArea), false);
});

test('card preview: passive shows the stat before and after taking the card', () => {
  const sim = createSim({ hero: 'heroine', seed: 1 });
  const pl = sim.players[0];
  const id = passiveOf('maxHp');
  const p = passivePreview(pl, { kind: 'passive', id, level: 1 });
  assert.ok(near(p.before, pl.stats.maxHp));
  assert.ok(near(p.after, pl.heroDef.stats.maxHp * (1 + PASSIVES[id].levels[0])));
  assert.deepEqual(p.weapons, []);
  const atk = passiveOf(WEAPONS[pl.weapons[0].id].dmgType);
  const q = passivePreview(pl, { kind: 'passive', id: atk, level: 1 });
  assert.deepEqual(q.weapons, [pl.weapons[0].id]);
  assert.ok(q.after > q.before);
});

test('card preview: weapon level lists changed parameters with owner stats', () => {
  const sim = createSim({ hero: 'heroine', seed: 1 });
  const pl = sim.players[0];
  const id = pl.weapons[0].id;
  const def = WEAPONS[id];
  const rows = weaponPreview(pl, { kind: 'weapon', id, level: 2, isNew: false });
  for (const r of rows) assert.notEqual(r.before, r.after);
  const dmg = rows.find((r) => r.key === 'damage');
  if (def.levels[0].damage !== def.levels[1].damage) {
    assert.ok(near(dmg.after, def.levels[1].damage * pl.stats[def.dmgType]));
  }
  assert.deepEqual(weaponPreview(pl, { kind: 'weapon', id, level: 1, isNew: true }), []);
});

test('grid fit: sections with headers fit the codex panel, rows balanced', () => {
  for (const counts of [[16, 16, 16, 13], [7, 7, 13, 0], [20, 20, 18, 16], [3, 3, 3, 3]]) {
    const g = fitSections(counts, 288, 244, { head: 13, secGap: 5 });
    assert.ok(g.height <= 244, `${counts} height ${g.height}`);
    assert.ok(g.width <= 288, `${counts} width ${g.width}`);
    counts.forEach((n, i) => {
      assert.ok(g.cols[i] * g.rows[i] >= n);
      if (g.rows[i] > 1) assert.ok(g.cols[i] * (g.rows[i] - 1) < n); // ряды поровну, без пустого ряда
    });
  }
  const g = fitSections([16, 16, 16, 13], 288, 244, { head: 13, secGap: 5 });
  assert.deepEqual(g.cols.slice(0, 3), [8, 8, 8]);
});

test('card preview: new weapon shows its level-1 values with the owner stats', () => {
  const sim = createSim({ hero: 'heroine', seed: 1 });
  const pl = sim.players[0];
  const id = Object.keys(WEAPONS)
      .find((w) => !WEAPONS[w].evolved && !pl.weapons.some((x) => x.id === w));
  const card = { kind: 'weapon', id, level: 1, isNew: true };
  assert.deepEqual(weaponPreview(pl, card), []);
  const rows = weaponStats(pl, card);
  const dmg = rows.find((r) => r.key === 'damage');
  assert.equal(rows[0].key, 'damage');
  assert.ok(near(dmg.value, WEAPONS[id].levels[0].damage * (pl.stats[WEAPONS[id].dmgType] ?? 1)));
});
