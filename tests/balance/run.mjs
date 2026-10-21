// Ручной прогон бота для подгонки баланса: node tests/balance/run.mjs [seed] [noupg]
import { runBot } from './bot.js';

const seed = Number(process.argv[2] || 1);
const upgrades = process.argv[3] !== 'noupg';
const t0 = performance.now();
const r = runBot({ seed, upgrades });
const ms = performance.now() - t0;
console.log(JSON.stringify({
  seed, upgrades, state: r.state, time: +r.time.toFixed(1), level: r.sim.player.level, kills: r.sim.kills,
  levelAt: r.levelAt, maxEnemies: r.maxEnemies, hp: Math.round(r.sim.player.hp),
  weapons: r.sim.player.weapons.map((w) => w.id + ':' + w.level),
  passives: r.sim.player.passives.map((w) => w.id + ':' + w.level),
  dmg: Object.fromEntries(Object.entries(r.sim.damageByWeapon).map(([k, v]) => [k, Math.round(v)])),
  trace: JSON.stringify(r.trace), evolutions: r.evolutions, wallMs: Math.round(ms),
}, null, 1));
