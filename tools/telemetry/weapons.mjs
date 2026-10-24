// Оружие в естественных забегах по телеметрии v2 (люди или боты в той же схеме).
// node tools/telemetry/weapons.mjs <runs.json|bots.json>
// По минутным дельтам snaps[].damage: урон в минуту владения, доля урона игрока, overkill (raw/dealt),
// добивания целей, которые раньше били другие источники, доля попаданий ближе 64 px.
// Это ассоциации в настоящих забегах, а не причинные сравнения: их дают контролируемые пробы sim:combat.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeRun } from './data.mjs';

const PHASES = [['early', 0, 300], ['mid', 300, 600], ['late', 600, 900]];
const median = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  return v.length ? v[v.length >> 1] : null; };

export function weaponTable(records) {
  const rows = {};
  const pairs = {};
  for (const { run } of records) {
    const r = decodeRun(run);
    if ((r.v || 1) < 2) continue;
    const snaps = r.snaps || [];
    for (let i = 1; i < snaps.length; i++) {
      const a = snaps[i - 1];
      const b = snaps[i];
      const phase = PHASES.find(([, lo, hi]) => b.t > lo && b.t <= hi);
      if (!phase || !b.damage) continue;
      const total = b.damage.reduce((s, d) => s + d[1], 0) -
        (a.damage || []).reduce((s, d) => s + d[1], 0);
      const held = new Map(b.w.map(([id, lv]) => [id, lv]));
      const prevHeld = new Set(a.w.map(([id]) => id));
      for (const [id, lv] of held) {
        if (!prevHeld.has(id)) continue; // владел всю минуту
        const now = b.damage.find((d) => d[0] === id);
        const old = (a.damage || []).find((d) => d[0] === id);
        if (!now) continue;
        const dealt = now[1] - (old?.[1] || 0);
        const raw = now[2] - (old?.[2] || 0);
        const key = `${id}|${phase[0]}`;
        const row = rows[key] ||= { perMin: [], share: [], raw: 0, dealt: 0, levels: [] };
        row.perMin.push(dealt); row.share.push(total > 0 ? dealt / total : 0);
        row.raw += raw; row.dealt += dealt; row.levels.push(lv);
        // Меч рядом с дальнобойными: доля урона клинка при наличии/отсутствии молнии и ножей.
        if (id === 'blade_arc') {
          for (const other of ['storm_chain', 'throwing_daggers', 'holy_ground']) {
            const k = `blade_arc+${other}=${held.has(other) ? 'yes' : 'no'}|${phase[0]}`;
            (pairs[k] ||= []).push(total > 0 ? dealt / total : 0);
          }
        }
      }
    }
    const c = r.end?.combat || {};
    for (const [id, x] of Object.entries(c)) {
      const key = `${id}|end`;
      const row = rows[key] ||= { hits: 0, finishes: 0, assisted: 0, close: 0, bins: 0 };
      row.hits += x.hits; row.finishes += x.finishes;
      row.assisted += Object.values(x.finishesAfter || {}).reduce((s, n) => s + n, 0);
      row.close += (x.distanceHits || [])[0] + (x.distanceHits || [])[1] || 0;
      row.bins += (x.distanceHits || []).reduce((s, n) => s + n, 0);
    }
  }
  const out = {};
  for (const [key, row] of Object.entries(rows)) {
    const [id, phase] = key.split('|');
    out[id] ||= {};
    out[id][phase] = phase === 'end' ? { hits: row.hits, finishes: row.finishes,
      assistedShare: row.finishes ? +(row.assisted / row.finishes).toFixed(2) : null,
      closeShare: row.bins ? +(row.close / row.bins).toFixed(2) : null } :
      { minutes: row.perMin.length, perMin: Math.round(median(row.perMin)),
        share: +median(row.share).toFixed(2),
        overkill: row.dealt ? +(row.raw / row.dealt).toFixed(2) : null,
        level: median(row.levels) };
  }
  const pairOut = Object.fromEntries(Object.entries(pairs).map(([k, v]) =>
    [k, { minutes: v.length, bladeShare: +median(v).toFixed(2) }]));
  return { weapons: out, bladeContext: pairOut };
}

if (process.argv[2] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(weaponTable(Array.isArray(d) ? d : d.records), null, 1));
}
