import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../../src/core/stats.js';
import { HEROES } from '../../src/data/heroes.js';
import { PASSIVES } from '../../src/data/passives.js';

const base = HEROES.heroine.stats;

test('stats: no passives returns base stats and does not mutate base', () => {
  const s = computeStats(base, []);
  assert.deepEqual(s, base);
  assert.notEqual(s, base);
});

test('stats: add and mul modes', () => {
  const s = computeStats(base, [{ id: 'max_hp', level: 2 }, { id: 'crit', level: 3 }, { id: 'armor', level: 5 }]);
  assert.ok(Math.abs(s.maxHp - base.maxHp * (1 + PASSIVES.max_hp.levels[1])) < 1e-9);
  assert.ok(Math.abs(s.crit - (base.crit + PASSIVES.crit.levels[2])) < 1e-9);
  assert.equal(s.armor, base.armor + 5);
});

test('stats: every passive changes a known stat at every level', () => {
  for (const [id, def] of Object.entries(PASSIVES)) {
    assert.ok(def.stat in base, `${id}: unknown stat ${def.stat}`);
    let prev = base[def.stat];
    for (let lv = 1; lv <= def.levels.length; lv++) {
      const s = computeStats(base, [{ id, level: lv }]);
      assert.ok(s[def.stat] > prev, `${id} level ${lv} does not grow`);
      prev = s[def.stat];
    }
  }
});

test('stats: reuses out object', () => {
  const out = {};
  const r = computeStats(base, [{ id: 'speed', level: 1 }], out);
  assert.equal(r, out);
  assert.ok(out.speed > base.speed);
});
