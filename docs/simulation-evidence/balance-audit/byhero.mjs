// Исходы по стартовому герою (solo) и доля урона оружия в первые 5 минут (минуты полного владения).
import { readFileSync, existsSync } from 'node:fs';
import { weaponTable } from '../../../tools/telemetry/weapons.mjs';
for (const name of process.argv.slice(2)) {
  const f = `tools/out/audit/${name}.json`;
  if (!existsSync(f)) continue;
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const g = {};
  for (const r of d.rows) {
    const k = r.config.players === 1 ? `${r.config.difficulty} solo ${r.config.heroes[0]}` : `${r.config.difficulty} duo`;
    const x = g[k] ||= { n: 0, win: 0, alive8: 0 };
    x.n++; if (r.outcome === 'victory') x.win++; if (r.time >= 480 || r.outcome === 'victory') x.alive8++;
  }
  console.log(`== ${name}`);
  console.log('  ' + Object.entries(g).map(([k, x]) => `${k}: win ${x.win}/${x.n}, past 8:00 ${x.alive8}`).join(' | '));
  if (d.records[0]?.run.snaps?.[0]?.damage) {
    const w = weaponTable(d.records).weapons;
    console.log('  early share/perMin: ' + ['storm_chain', 'blade_arc', 'throwing_daggers', 'firebomb', 'war_axe', 'holy_ground', 'guardian_shields']
      .map((id) => `${id} ${w[id]?.early?.share}/${w[id]?.early?.perMin}`).join(', '));
  }
}
