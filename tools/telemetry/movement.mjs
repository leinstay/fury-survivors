// Движение в дуо (v2): ближайший враг, расстояние до напарника, входящий урон и путь в минуту.
// node tools/telemetry/movement.mjs <runs.json> [label]; окно 1:00–7:00, только живые секунды.
import { readFileSync } from 'node:fs';
import { decodeRun } from './data.mjs';
const med = (a) => {
  a = a.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? +a[a.length >> 1].toFixed(1) : null;
};
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const g = {};
for (const { run } of Array.isArray(d) ? d : d.records) {
  const r = decodeRun(run);
  if (!r.movement?.length) continue;
  const k = `${process.argv[3] || ''} ${r.difficulty}/${r.mode}`;
  const x = g[k] ||= { en: [], ally: [], hurt: [], dist: [], n: 0 };
  x.n++;
  const ms = r.movement.filter((m) => m.t >= 60 && m.t <= 420 && !m.dead);
  x.en.push(med(ms.map((m) => (m.enemy ? Math.hypot(m.enemy[1], m.enemy[2]) : NaN))));
  x.ally.push(med(ms.map((m) =>
    (m.allies?.[0] ? Math.hypot(m.allies[0][0], m.allies[0][1]) : NaN))));
  x.hurt.push(Object.values(r.hurt || {}).reduce((a, b) => a + b, 0) / (r.time / 60));
  x.dist.push(r.distance / (r.time / 60));
}
for (const [k, x] of Object.entries(g)) {
  console.log(k.padEnd(20), 'docs', x.n, 'nearestEnemy', med(x.en), 'allyDist', med(x.ally),
    'hurt/min', med(x.hurt), 'px/min', med(x.dist));
}

// Входящий урон в одном окне 1:00–7:00 по событиям playerHurt (без смещения длиной забега).
const w = {};
for (const { run } of Array.isArray(d) ? d : d.records) {
  const r = decodeRun(run);
  if (!r.events?.length) continue;
  const end = Math.min(r.time, 420);
  if (end <= 90) continue;
  const hurt = r.events.filter((e) => e.type === 'playerHurt' && e.player === (r.local || 0) &&
    e.t >= 60 && e.t <= 420).reduce((s, e) => s + (e.amount || 0), 0);
  (w[`${r.difficulty}/${r.mode}`] ||= []).push(hurt / ((end - 60) / 60));
}
for (const [k, v] of Object.entries(w)) console.log(`${process.argv[3] || ''} ${k}`.padEnd(20), 'hurt/min 1-7m', med(v), 'n', v.length);
