import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, critChance, statReport } from '../../src/core/stats.js';
import { HEROES } from '../../src/data/heroes.js';
import { PASSIVES } from '../../src/data/passives.js';
import { STATS, STAT_CAPS, STAT_CAPS_REL } from '../../src/data/stats.js';

const base = HEROES.heroine.stats;
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('stats: no passives returns base stats and does not mutate base', () => {
  const s = computeStats(base, []);
  assert.deepEqual(s, base);
  assert.notEqual(s, base);
});

test('stats: percent stats multiply the base, flat stats add', () => {
  const s = computeStats(base, [{ id: 'max_hp', level: 2 }, { id: 'crit', level: 3 }, { id: 'armor', level: 5 }]);
  assert.ok(near(s.maxHp, base.maxHp * (1 + PASSIVES.max_hp.levels[1])));
  assert.ok(near(s.crit, base.crit + PASSIVES.crit.levels[2]));
  assert.equal(s.armor, base.armor + PASSIVES.armor.levels[4]);
});

test('stats: increased sums, more multiplies, extra flat adds (PoE style)', () => {
  // attack: пассивка 5 (+50%) и шмот +30% — одна сумма; more ×1.2 и ×1.5 — произведение
  const s = computeStats(base, [{ id: 'attack', level: 5 }], {},
      { inc: { attack: 0.3 }, more: { attack: 1.2 * 1.5 }, flat: { armor: 2, crit: 0.1 } });
  assert.ok(near(s.attack, base.attack * (1 + PASSIVES.attack.levels[4] + 0.3) * 1.2 * 1.5));
  assert.equal(s.armor, base.armor + 2);
  assert.ok(near(s.crit, base.crit + 0.1));
  // источники без extra не меняют результат
  assert.deepEqual(computeStats(base, [], {}, null), computeStats(base, []));
});

test('stats: every passive changes a known stat at every level', () => {
  for (const [id, def] of Object.entries(PASSIVES)) {
    assert.ok(def.stat in base, `${id}: unknown stat ${def.stat}`);
    assert.ok(STATS[def.stat], `${id}: stat ${def.stat} not in data/stats.js`);
    let prev = base[def.stat];
    for (let lv = 1; lv <= def.levels.length; lv++) {
      const s = computeStats(base, [{ id, level: lv }]);
      assert.ok(s[def.stat] > prev, `${id} level ${lv} does not grow`);
      prev = s[def.stat];
    }
  }
});

test('stats: caps clamp the result, statReport shows uncapped value and the cap', () => {
  const huge = { inc: {}, flat: {} };
  for (const k in STATS) (STATS[k] === 'percent' ? huge.inc : huge.flat)[k] = 100;
  const s = computeStats(base, [], {}, huge);
  for (const [k, cap] of Object.entries(STAT_CAPS)) {
    if (k === 'crit') continue; // кап шанса, а не стата
    assert.ok(near(s[k], cap), `${k}: ${s[k]} != cap ${cap}`);
  }
  assert.ok(near(s.speed, base.speed * STAT_CAPS_REL.speed));
  assert.ok(1 / s.haste >= 0.35 - 1e-9, 'cooldown never below x0.35');
  assert.equal(critChance(s), STAT_CAPS.crit);
  assert.ok(s.maxHp > base.maxHp * 50, 'maxHp has no cap');
  const r = statReport(base, [], huge);
  assert.ok(r.dodge.capped && near(r.dodge.value, STAT_CAPS.dodge));
  assert.ok(r.dodge.raw > STAT_CAPS.dodge);
  assert.ok(r.crit.capped && near(r.crit.value, STAT_CAPS.crit));
  assert.ok(!r.maxHp.capped && r.maxHp.cap === Infinity);
  const plain = statReport(base, [{ id: 'luck', level: 5 }]);
  assert.ok(!plain.luck.capped && near(plain.luck.value, 1.5));
  assert.ok(near(plain.crit.value, base.crit * 1.5), 'crit is reported as the final chance');
});

test('stats: crit chance is crit × luck', () => {
  assert.ok(near(critChance({ crit: 0.2, luck: 1.5 }), 0.3));
  assert.equal(critChance({ crit: 0.9, luck: 1 }), STAT_CAPS.crit);
});

test('stats: reuses out object', () => {
  const out = {};
  const r = computeStats(base, [{ id: 'speed', level: 1 }], out);
  assert.equal(r, out);
  assert.ok(out.speed > base.speed);
});
