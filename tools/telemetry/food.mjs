// Подбор еды (курочки): сколько раз за минуту жизни и при каком HP, люди против ботов (v2 events + movement).
// node tools/telemetry/food.mjs <runs.json> [label]
import { readFileSync } from 'node:fs';
import { decodeRun } from './data.mjs';
const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? +a[a.length >> 1].toFixed(2) : null; };
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const g = {};
for (const { run } of Array.isArray(d) ? d : d.records) {
  const r = decodeRun(run);
  if (!r.events?.length || !r.movement?.length) continue;
  const me = r.local || 0;
  const k = `${process.argv[3] || ''} ${r.difficulty}/${r.mode}`;
  const x = g[k] ||= { rate: [], hp: [], seen: [], low: [] };
  const food = r.events.filter((e) => e.type === 'pickup' && e.player === me && e.src === 'heal');
  x.rate.push(food.length / (r.time / 60));
  const mhp = r.snaps?.[0]?.mhp || r.end?.mhp || 100;
  for (const e of food) {
    const m = r.movement.findLast((s) => s.t <= e.t);
    if (m) x.hp.push(m.hp / mhp);
  }
  // Сколько секунд еда была видна (в movement есть ближайшая еда) при HP < 50%, и доля таких секунд.
  const low = r.movement.filter((m) => !m.dead && m.hp / mhp < 0.5);
  x.low.push(low.length / Math.max(1, r.movement.length));
  const near = low.filter((m) => m.heal && Math.hypot(m.heal[1], m.heal[2]) < 320).length;
  x.seen.push(low.length ? near / low.length : NaN);
}
for (const [k, x] of Object.entries(g)) {
  console.log(k.padEnd(20), 'food/min', med(x.rate), 'hp% at pickup', med(x.hp),
    'time hp<50%', med(x.low), 'food on screen while hp<50%', med(x.seen), 'docs', x.rate.length);
}
