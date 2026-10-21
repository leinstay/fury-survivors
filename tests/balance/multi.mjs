// Сводка по нескольким сидам: node tests/balance/multi.mjs [noupg]
import { runBot } from './bot.js';
const upgrades = process.argv[2] !== 'noupg';
for (let seed = 1; seed <= 8; seed++) {
  const r = runBot({ seed, upgrades });
  console.log(seed, r.state, r.time.toFixed(0), 'lvl300=' + r.levelAt[300], 'lvl600=' + r.levelAt[600], 'maxEn=' + r.maxEnemies, 'kills=' + r.sim.kills, r.sim.player.weapons.map((w) => w.id.slice(0, 5) + w.level).join(','));
}
