import { runBot } from './bot.js';
for (const seed of [1, 3, 4, 5, 6, 8]) {
  const r = runBot({ seed, until: 900 });
  console.log(seed, r.state, r.time.toFixed(1), 'hp', Math.round(r.sim.player.hp), 'boss', r.sim.boss ? Math.round(r.sim.boss.hp) : null, 'enemies', r.sim.enemies.length);
}
