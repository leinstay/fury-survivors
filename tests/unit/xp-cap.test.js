// Потолок кристаллов опыта на земле (XP.maxGems): сверх него опыт копится в одном кристалле переполнения,
// суммарный опыт на земле не теряется.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { XP } from '../../src/data/constants.js';

test('xp gems over the cap go into one overflow gem, no xp is lost', () => {
  const sim = createSim({ seed: 2 });
  sim.director = { update() {} };
  const far = 2000;
  const n = XP.maxGems + 250;
  for (let i = 0; i < n; i++) {
    sim.dropPickup('xp_small', sim.player.x + far + (i % 50) * 40, sim.player.y + far + Math.floor(i / 50) * 40, 1);
    if (i % 50 === 49) sim._updatePickups(0); // счётчик кристаллов обновляется в шаге
  }
  sim._updatePickups(0);
  const gems = sim.pickups.filter((p) => p.kind === 'xp');
  assert.ok(gems.length <= XP.maxGems + 50, `gems on the ground: ${gems.length}`);
  assert.equal(gems.reduce((s, p) => s + p.value, 0), n, 'total xp kept');
  assert.ok(sim.xpOverflow && sim.xpOverflow.value > 1, 'overflow gem collects the rest');
});
