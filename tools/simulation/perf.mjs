// Performance is measured separately from correctness: timings depend on the machine.
import { createSim } from '../../src/core/sim.js';
import { SIM } from '../../src/data/constants.js';
import { cpus } from 'node:os';
const sim = createSim({ seed: 21 });
sim.player.maxHp = sim.player.hp = 1e9;
sim.player.weapons.push({ id: 'holy_ground', level: 3 }, { id: 'war_axe', level: 3 },
    { id: 'storm_chain', level: 3 }, { id: 'throwing_daggers', level: 3 });
sim._syncBuild();
const samples = [];
for (let i = 0; i < 660; i++) {
  while (sim.canSpawn()) {sim.spawnEnemy('harpy', sim.player.x + 250,
      sim.player.y + (sim.enemies.length % 50) * 4);}
  if (sim.state === 'levelup') sim.chooseCard(0);
  const t = performance.now();
  sim.step(1 / SIM.tickRate, { x: 0.7, y: 0.2 });
  if (i >= 60) samples.push(performance.now() - t);
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ node: process.version, cpu: cpus()[0].model,
  enemies: sim.enemies.length, meanMs: samples.reduce((a, b) => a + b) / samples.length,
  p95Ms: samples[Math.floor(samples.length * 0.95)],
  p99Ms: samples[Math.floor(samples.length * 0.99)],
  maxMs: samples.at(-1) }, null, 2));
