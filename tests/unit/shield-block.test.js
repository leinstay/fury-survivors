// Щиты (orbit) ловят вражеские снаряды по видимому размеру щита (WEAPON_BEHAVIOR.orbit.blockR), а не по
// радиусу удара hitRadius: пуля, пролетевшая рядом с щитом, не пропадает.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { WEAPON_BEHAVIOR } from '../../src/data/weapons.js';

const DT = 1 / 60;

function setup() {
  const sim = createSim({ seed: 3 });
  sim.director = { update() {} };
  sim.player.weapons = [{ id: 'guardian_shields', level: 5 }];
  sim._syncBuild();
  let s = null;
  for (let i = 0; i < 600 && !s; i++) {
    sim.step(DT, {});
    s = sim.projectiles.find((p) => p.blocks && p.life > 0);
  }
  return { sim, s };
}

// Вражеская пуля на расстоянии d от центра щита (сбоку от линии к герою), неподвижная.
function bullet(sim, s, d) {
  const p = sim.addProjectile('enemy', 'proj_enemy');
  p.x = s.x + d;
  p.y = s.y;
  p.radius = 3;
  p.dmg = 1;
  p.life = 5;
  return p;
}

test('shield blocks only shots that touch the visible shield', () => {
  const { sim, s } = setup();
  assert.ok(s, 'shield exists');
  assert.ok(s.blockR < s.radius, 'block radius is smaller than the hit radius');
  assert.equal(s.blockR, WEAPON_BEHAVIOR.orbit.blockR * s.scale);
  const far = bullet(sim, s, s.blockR + 3 + 6);
  const near = bullet(sim, s, s.blockR);
  sim._updateProjectiles(0);
  assert.ok(far.life > 0, 'a shot passing near the shield survives');
  assert.ok(near.life <= 0, 'a shot touching the shield is blocked');
});
