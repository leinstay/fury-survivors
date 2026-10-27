// Люди: удары по герою, урон, дистанция до врага, движение и клир по минутам забега (docs/BALANCE_AUDIT.md, 12).
// node tools/telemetry/hits.mjs <runs.json|.json.gz> [...] [--json out.json]
// Несколько выгрузок склеиваются без повторов (сессия + игрок + время забега).
//   hits/min   — события playerHurt своего игрока (v2+; одно событие = один удар, i-frames 0.5 с)
//   dmg/min    — сумма урона из них; у v1 событий нет: удары оцениваются как урон по источнику (hurt)
//                / урон врага на средней минуте забега (ENEMIES.damage × рост этапа), только весь забег
//   near       — медиана расстояния до ближайшего живого врага, px (movement раз в 1 с, только живые секунды)
//   speed      — медиана пути за секунду, px/с; still — доля секунд без движения (< 5 px)
//   alive / kills/min — живых врагов в мире на срезе (snaps.en) и убийств за минуту (snaps.k);
//   боссы      — время от появления босса до убийства (bosses), медиана по документам
//   little     — alive / (убийств в секунду): средняя жизнь моба с появления по закону Литтла, с
// Документы с обрезанными events (capture.dropped.events) считаются только до последнего события.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeRun } from './data.mjs';
import { ENEMIES } from '../../src/data/enemies.js';
import { BOSSES } from '../../src/data/bosses.js';
import { forest } from '../../src/data/stages/forest.js';

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const out = jsonAt >= 0 ? args[jsonAt + 1] : '';
const files = args.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1);
const load = (f) => {
  const buf = readFileSync(f);
  const d = JSON.parse((f.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8'));
  return Array.isArray(d) ? d : d.records;
};
const seen = new Set();
const runs = [];
for (const f of files) {
  for (const rec of load(f)) {
    const r = decodeRun(rec.run);
    const key = `${r.sessionId || rec.at}|${r.local ?? 0}|${r.time}|${r.kills}`;
    if (seen.has(key)) continue;
    seen.add(key);
    runs.push(r);
  }
}

const med = (a) => {
  a = a.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? +a[a.length >> 1].toFixed(2) : null;
};
const mean = (a) => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : null);
const MINUTES = 16;
const mode = (r) => `${r.mode}/${r.difficulty}`;
const groups = {};
const v1 = {};
for (const r of runs) {
  const g = groups[mode(r)] ||= { docs: 0, docsV2: 0,
    minutes: Array.from({ length: MINUTES }, () => ({ hits: [], dmg: [], near: [], speed: [],
      still: [], alive: [], kills: [], little: [], src: {} })) };
  g.docs++;
  for (const [id, at, killed] of r.bosses || []) {
    if (killed > 0) ((g.bosses ||= {})[id] ||= []).push(killed - at);
  }
  // Клир по срезам есть у всех версий.
  let prev = { t: 0, k: 0 };
  for (const s of r.snaps) {
    const m = Math.round(s.t / 60) - 1;
    if (m >= 0 && m < MINUTES && s.t - prev.t > 0 && Number.isFinite(s.en)) {
      const perSec = (s.k - prev.k) / (s.t - prev.t);
      g.minutes[m].alive.push(s.en);
      g.minutes[m].kills.push(perSec * 60);
      if (perSec > 0) g.minutes[m].little.push(s.en / perSec);
    }
    prev = s;
  }
  if (!r.events || !r.movement) {
    // v1: только урон по источнику за весь забег.
    const row = v1[mode(r)] ||= { docs: 0, minutes: 0, dmg: 0, hits: 0 };
    const midMin = r.time / 120;
    const scale = 1 + forest.scaling.damagePerMinute * midMin;
    row.docs++; row.minutes += r.time / 60;
    for (const [src, dmg] of Object.entries(r.hurt || {})) {
      const def = ENEMIES[src] || BOSSES[src];
      const per = def ? (def.params?.projDamage && src === 'succubus' ? (def.damage + def.params.projDamage) / 2 :
        def.damage) * scale : 12;
      row.dmg += dmg; row.hits += dmg / per;
    }
    continue;
  }
  g.docsV2++;
  const dropped = r.capture?.dropped?.events > 0;
  const lastEvent = r.events.length ? r.events[r.events.length - 1].t : 0;
  const covered = dropped ? lastEvent : r.time;
  const local = r.local ?? 0;
  for (let m = 0; m < MINUTES; m++) {
    const a = m * 60;
    const b = Math.min(a + 60, covered);
    const alive = r.movement.filter((x) => x.t >= a && x.t < a + 60 && !x.dead);
    if (b - a >= 30 && alive.length >= 30) {
      const hurt = r.events.filter((e) => e.type === 'playerHurt' && e.player === local && e.t >= a && e.t < b);
      const k = 60 / (b - a);
      g.minutes[m].hits.push(hurt.length * k);
      g.minutes[m].dmg.push(hurt.reduce((s, e) => s + (e.amount || 0), 0) * k);
      for (const e of hurt) g.minutes[m].src[e.src] = (g.minutes[m].src[e.src] || 0) + 1;
    }
    if (alive.length < 30) continue;
    g.minutes[m].near.push(med(alive.map((x) =>
      (x.enemy ? Math.hypot(x.enemy[1], x.enemy[2]) : NaN))));
    const steps = [];
    for (let i = 1; i < alive.length; i++) {
      const dt = alive[i].t - alive[i - 1].t;
      const d = Math.hypot(alive[i].x - alive[i - 1].x, alive[i].y - alive[i - 1].y);
      if (dt > 0 && dt <= 1.5) steps.push(d / dt);
    }
    g.minutes[m].speed.push(med(steps));
    g.minutes[m].still.push(steps.filter((v) => v < 5).length / Math.max(1, steps.length));
  }
}

const report = {};
for (const [k, g] of Object.entries(groups).sort()) {
  console.log(`\n${k}: документов ${g.docs}, с событиями ${g.docsV2}`);
  console.log(' мин  n  удары/мин(мед/ср)  урон/мин  до врага px  px/с  стоит%  живых  убийств/мин  литтл с  n(клир)');
  const bossTtk = Object.fromEntries(Object.entries(g.bosses || {}).map(([id, v]) =>
    [id, { n: v.length, median: med(v), max: Math.max(...v) }]));
  console.log(' боссы (с появления до убийства, с):', JSON.stringify(bossTtk));
  report[k] = { docs: g.docs, docsV2: g.docsV2, bosses: bossTtk, minutes: [] };
  g.minutes.forEach((x, m) => {
    const row = { minute: m, n: x.hits.length, hitsMedian: med(x.hits), hitsMean: mean(x.hits),
      dmgMean: mean(x.dmg), near: med(x.near), speed: med(x.speed), still: mean(x.still),
      alive: med(x.alive), kills: med(x.kills), little: med(x.little), nClear: x.alive.length,
      src: x.src };
    report[k].minutes.push(row);
    if (!row.n && !row.nClear) return;
    console.log(`  ${String(m).padStart(2)} ${String(row.n).padStart(2)}   ${row.hitsMedian}/${row.hitsMean}`.padEnd(30) +
      `${row.dmgMean}`.padEnd(10) + `${row.near}`.padEnd(13) + `${row.speed}`.padEnd(7) +
      `${row.still === null ? '' : Math.round(row.still * 100)}`.padEnd(8) + `${row.alive}`.padEnd(7) +
      `${row.kills === null ? '' : Math.round(row.kills)}`.padEnd(13) + `${row.little}`.padEnd(9) + row.nClear);
  });
}
for (const [k, r] of Object.entries(v1)) {
  console.log(`v1 ${k}: документов ${r.docs}, оценка ударов ${(r.hits / r.minutes).toFixed(2)}/мин, ` +
    `урон ${(r.dmg / r.minutes).toFixed(1)}/мин (по всему забегу)`);
  report[`v1 ${k}`] = { docs: r.docs, hitsPerMin: +(r.hits / r.minutes).toFixed(2), dmgPerMin: +(r.dmg / r.minutes).toFixed(1) };
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
