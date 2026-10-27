import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { BOSSES, BOSS } from '../../src/data/bosses.js';
import { forest } from '../../src/data/stages/forest.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };
const step = (sim, s) => { for (let i = 0; i < Math.round(s / DT); i++) sim.step(DT, idle); };
const god = (sim) => { sim.player.stats.maxHp = 1e9; sim.player.maxHp = 1e9; sim.player.hp = 1e9; };

// Тестовый босс с одной атакой; cd[0] = 0, чтобы атака сработала на первом шаге.
function setup(attack, extra = {}) {
  BOSSES.__test = { sprite: 'dryad_queen', behavior: 'boss', hp: 1e9, speed: 0.001, damage: 10, xp: 0, size: 20, knockbackResist: 1, attacks: [{ cooldown: 1000, ...attack }], ...extra };
  const sim = createSim({ seed: 5 });
  god(sim);
  sim.player.weapons.length = 0;
  sim.player.x = 0; sim.player.y = 0;
  const boss = sim.spawnEnemy('__test', 200, 0, false, true);
  boss.cd[0] = 0;
  return { sim, boss };
}
const enemyProj = (sim) => sim.projectiles.filter((p) => p.owner === 'enemy');
// веер и кольцо начинаются после замаха BOSS.castDelay
const pastWindup = (sim) => {
  sim.step(DT, idle);
  while (!enemyProj(sim).length && sim.time < 3) sim.step(DT, idle);
};

test('boss attack fan: count projectiles aimed at the player within the spread', () => {
  const { sim } = setup({ type: 'fan', count: 5, spread: 60, speed: 100, damage: 10, life: 5 });
  pastWindup(sim);
  assert.ok(sim.time >= BOSS.castDelay, 'fan waits for the windup');
  const ps = enemyProj(sim);
  assert.equal(ps.length, 5);
  const a = ps.map((p) => p.angle).sort((x, y) => x - y);
  assert.ok(Math.abs(a[2] - Math.PI) < 0.02, `centre aims at the player, got ${a[2]}`);
  assert.ok(Math.abs(a[4] - a[0] - Math.PI / 3) < 0.02, 'full spread 60 degrees');
});

test('boss attack fan: volleys repeat after the interval', () => {
  const { sim } = setup({ type: 'fan', count: 3, spread: 20, speed: 10, damage: 10, life: 50, volleys: 3, interval: 0.5 });
  step(sim, 2);
  assert.equal(enemyProj(sim).length, 9);
});

test('boss attack ring: count x volleys projectiles, spin turns each volley', () => {
  const { sim } = setup({ type: 'ring', count: 8, volleys: 3, interval: 0.3, spin: 0.2, speed: 10, damage: 10, life: 50 });
  pastWindup(sim);
  const first = enemyProj(sim).map((p) => p.angle);
  assert.equal(first.length, 8);
  step(sim, 1.5);
  const all = enemyProj(sim);
  assert.equal(all.length, 24);
  const mod = (x) => ((x % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4);
  const offsets = new Set(all.map((p) => Math.round(mod(p.angle) * 1000)));
  assert.equal(offsets.size, 3, 'three distinct rotations');
});

test('boss attack slam: telegraph first, damage only inside the radius after the delay', () => {
  const run = (px) => {
    const { sim } = setup({ type: 'slam', count: 1, radius: 30, delay: 0.5, damage: 25 });
    sim.player.hp = sim.player.maxHp = sim.player.stats.maxHp = 100;
    sim.step(DT, idle);
    assert.equal(sim.telegraphs.length, 1);
    const tg = sim.telegraphs[0];
    assert.deepEqual([tg.x, tg.y, tg.radius, tg.delay], [0, 0, 30, 0.5]);
    sim.player.x = px; // игрок успевает отойти (или остаётся рядом)
    step(sim, 0.3);
    assert.equal(sim.player.hp, 100, 'no damage during the warning');
    step(sim, 0.4);
    assert.equal(sim.telegraphs.length, 0);
    return sim.player.hp;
  };
  const inside = run(10);
  assert.ok(inside < 100 && inside >= 100 - 25 * (1 + 0.1), `hit inside, hp ${inside}`);
  assert.equal(run(80), 100, 'no hit outside');
});

test('boss attack slam: several strikes, each aimed at the player position at its telegraph time', () => {
  const { sim } = setup({ type: 'slam', count: 3, radius: 20, delay: 5, damage: 10, interval: 0.5 });
  sim.step(DT, idle);
  sim.player.x = 100;
  step(sim, 0.55);
  sim.player.x = 200;
  step(sim, 0.5);
  const xs = sim.telegraphs.map((t) => Math.round(t.x)).sort((a, b) => a - b);
  assert.deepEqual(xs, [0, 100, 200]);
});

test('boss attack blink: fades out, then reappears near the player', () => {
  const { sim, boss } = setup({ type: 'blink', delay: 0.5, distance: 60, fadeIn: 0.3 });
  sim.step(DT, idle);
  step(sim, 0.3);
  assert.ok(boss.alpha < 1, 'fading');
  step(sim, 0.4);
  const d = Math.hypot(boss.x - sim.player.x, boss.y - sim.player.y);
  assert.ok(Math.abs(d - 60) < 1, `distance ${d}`);
  step(sim, 0.5);
  assert.equal(boss.alpha, 1);
});

test('boss attack: rageOnly attacks wait for the rage phase', () => {
  const { sim, boss } = setup({ type: 'fan', count: 1, spread: 0, speed: 10, damage: 1, life: 50, rageOnly: true }, { rage: { hpFraction: 0.5, cooldownMul: 1 } });
  step(sim, 1);
  assert.equal(enemyProj(sim).length, 0);
  boss.hp = boss.maxHp * 0.4;
  boss.cd[0] = 0;
  step(sim, 1);
  assert.equal(enemyProj(sim).length, 1);
});

test('boss: killing a non-final boss gives item loot, no skill chest, and the run continues', () => {
  const first = forest.timeline.find((e) => e.type === 'boss').boss;
  const sim = createSim({ seed: 6 });
  god(sim);
  const boss = sim.spawnBoss(first);
  sim.damageEnemy(boss, 1e12, 'blade_arc', 0, 0, 0);
  assert.equal(sim.state, 'running');
  assert.ok(sim.events.some((e) => e.type === 'bossDown' && e.boss === first));
  assert.equal(sim.pickups.filter((p) => p.kind === 'chest').length, 0, 'skill chests come from elites only');
  assert.ok(sim.player.loot.length >= 1, 'item loot is rolled');
  const last = sim.spawnBoss('dryad_queen');
  sim.damageEnemy(last, 1e12, 'blade_arc', 0, 0, 0);
  assert.ok(sim.won);
  assert.ok(sim.events.some((e) => e.type === 'overtime'));
});

test('boss: each boss gets its own warning 10 s ahead', () => {
  const sim = createSim({ seed: 7 });
  god(sim);
  const warned = [];
  for (const b of forest.timeline.filter((e) => e.type === 'boss')) {
    sim.time = b.at - forest.bossWarning - 1;
    for (let i = 0; i < 2 * 60; i++) {
      if (sim.state === 'levelup') { sim.levelUp.skips = 1e9; sim.skip(); }
      sim.step(DT, idle);
      for (const e of sim.events) if (e.type === 'bossWarning') warned.push(e.boss);
    }
  }
  assert.deepEqual(warned, ['kitsune_empress', 'harpy_queen', 'dryad_queen']);
});

test('boss HP bar passes to a boss that is still alive when the newer one dies', () => {
  const sim = createSim({ seed: 5 });
  god(sim);
  sim.player.weapons.length = 0;
  const first = sim.spawnBoss('kitsune_empress');
  const second = sim.spawnBoss('harpy_queen');
  assert.equal(sim.boss, second);
  second.hp = 0;
  second.dead = true;
  sim.step(DT, idle);
  assert.equal(sim.boss, first);
});

test('boss fairness: a fan does not start while the heroine is point-blank, and a dash stops short', () => {
  const { sim, boss } = setup({ type: 'fan', count: 3, spread: 20, speed: 10, damage: 1, life: 50 });
  boss.x = BOSS.minRange / 2;
  boss.y = 0;
  step(sim, 2);
  assert.equal(enemyProj(sim).length, 0, 'no volley at point-blank range');
  const d = setup({ type: 'dash', cooldown: 1000, windup: 0.1, speed: 600, time: 2 });
  step(d.sim, 1);
  const dist = Math.hypot(d.boss.x - d.sim.player.x, d.boss.y - d.sim.player.y);
  assert.ok(dist >= BOSS.dashStop - 15, `dash stopped at ${dist.toFixed(0)} px`);
});
