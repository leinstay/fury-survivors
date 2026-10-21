// Что убивает бота: node tests/balance/death.mjs <seed>
// Печатает HP, число врагов по типам и вражеские снаряды каждые 5 с за минуту до смерти.
import { runBot } from './bot.js';
const seed = Number(process.argv[2] || 2);
const log = [];
const r = runBot({ seed, upgrades: true, onSecond(sim) {
  const by = {};
  for (const e of sim.enemies) by[e.type] = (by[e.type] || 0) + 1;
  log.push({ t: Math.round(sim.time), hp: Math.round(sim.player.hp), maxHp: Math.round(sim.player.maxHp), by, shots: sim.projectiles.filter((p) => p.owner === 'enemy').length });
} });
console.log(r.state, r.time.toFixed(0));
for (const l of log.filter((l) => l.t >= r.time - 60 && l.t % 5 === 0)) console.log(JSON.stringify(l));
