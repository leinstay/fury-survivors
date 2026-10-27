import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { createDirector } from '../../src/core/director.js';
import { forest } from '../../src/data/stages/forest.js';

const count = (sim, type) => sim.enemies.filter((e) => !e.dead && e.type === type).length;
const tick = (sim, dir, to, dt = 0.5) => {
  while (sim.time < to) { sim.time += dt; dir.update(sim, dt); }
};

function setup(timeline) {
  const sim = createSim({ hero: 'heroine', seed: 3 });
  sim.enemies.length = 0;
  sim.deadN = 0;
  return { sim, dir: createDirector({ timeline, duration: 900 }, sim.rng) };
}

test('director: afterBoss holds a spawn until enough bosses are killed', () => {
  const { sim, dir } = setup([
    { at: 0, type: 'spawn', enemy: 'foxgirl', rate: 2, until: 100, group: 1, afterBoss: 1 },
    { at: 0, type: 'spawn', enemy: 'catgirl', rate: 2, until: 100, group: 1 },
  ]);
  tick(sim, dir, 10);
  assert.equal(count(sim, 'foxgirl'), 0, 'no foxgirls before the first boss kill');
  assert.ok(count(sim, 'catgirl') > 0, 'ungated spawn runs');
  sim.bossKills = 1;
  tick(sim, dir, 20);
  assert.ok(count(sim, 'foxgirl') > 0, 'foxgirls after the kill');
});

test('director: a gated one-shot fires at the kill; an expired spawn window never starts', () => {
  const { sim, dir } = setup([
    { at: 5, type: 'burst', enemy: 'succubus', count: 6, afterBoss: 2 },
    { at: 5, type: 'spawn', enemy: 'lamia', rate: 3, until: 30, group: 1, afterBoss: 2 },
  ]);
  tick(sim, dir, 20);
  sim.bossKills = 1;
  tick(sim, dir, 40);
  assert.equal(count(sim, 'succubus'), 0, 'one boss is not enough');
  sim.bossKills = 2;
  tick(sim, dir, 41);
  assert.equal(count(sim, 'succubus'), 6, 'burst fires once when the gate opens');
  tick(sim, dir, 60);
  assert.equal(count(sim, 'succubus'), 6);
  assert.equal(count(sim, 'lamia'), 0, 'window 5..30 is over by the time of the kill');
});

test('director: same seed and kills give the same spawns (coop determinism)', () => {
  const runOnce = () => {
    const { sim, dir } = setup([
      { at: 0, type: 'spawn', enemy: 'foxgirl', rate: 1.5, until: 200, group: 2, afterBoss: 1 },
    ]);
    tick(sim, dir, 7);
    sim.bossKills = 1;
    tick(sim, dir, 30);
    return sim.enemies.map((e) => [e.type, Math.round(e.x), Math.round(e.y)]);
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('forest: kitsune (foxgirl) waves after the 1st boss, succubi after the 2nd', () => {
  for (const ev of forest.timeline) {
    if (ev.enemy === 'foxgirl') assert.ok(ev.afterBoss >= 1, `foxgirl at ${ev.at} must wait for boss 1`);
    if (ev.enemy === 'succubus') assert.ok(ev.afterBoss >= 2, `succubus at ${ev.at} must wait for boss 2`);
    if (ev.afterBoss !== undefined) {
      assert.ok(Number.isInteger(ev.afterBoss) && ev.afterBoss > 0, 'afterBoss is a positive integer');
      assert.notEqual(ev.type, 'boss', 'bosses are not gated');
    }
  }
});
