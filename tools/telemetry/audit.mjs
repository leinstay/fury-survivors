// Аудит баланса по телеметрии fury_runs и по ботам в той же схеме.
// node tools/telemetry/audit.mjs <runs.json> [--bots bots.json] [--out audit.json]
// Единица исхода — сессия (дуо: два документа с одним sessionId), единица прогрессии — игрок.
// Неизвестные поля старых записей остаются null, а не нулём.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPool } from '../../src/core/upgrades.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { COMBOS } from '../../src/data/combos.js';
import { SLOTS } from '../../src/data/constants.js';
import { COOP } from '../../src/data/coop.js';
import { HEROES } from '../../src/data/heroes.js';
import { decodeRun, parseCard } from './data.mjs';

export const MARKS = [60, 180, 300, 600, 900];
const VOLUNTARY = new Set(['take', 'reroll', 'skip', 'banish', 'evo', 'evoSkip']);

const median = (a) => {
  const v = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x))
    .sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const quart = (a) => {
  const v = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 0.5))];
  return [q(0.25), q(0.5), q(0.75)];
};

// Сколько ещё личных уровней улучшений можно взять при данном билде (без лечения).
// Свободный слот считается ёмкостью лучшего ещё не поглощённого предмета.
export function capacity(w, p, slots, banished = new Set()) {
  const pool = buildPool({ weapons: w.map(([id, level]) => ({ id, level })),
    passives: p.map(([id, level]) => ({ id, level })), slots }, banished).length;
  const consumed = new Set();
  for (const c of COMBOS) {
    if (w.some(([id]) => id === c.result)) for (const id of c.from) consumed.add(id);
  }
  let levels = 0;
  for (const [id, lv] of w) {
    if (WEAPONS[id] && !WEAPONS[id].evolved) levels += WEAPONS[id].maxLevel - lv;
  }
  for (const [id, lv] of p) if (PASSIVES[id]) levels += PASSIVES[id].levels.length - lv;
  const freeW = slots.weapons - w.length;
  const freeP = slots.passives - p.length;
  const candW = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved && !consumed.has(id) &&
    !w.some(([x]) => x === id) && !banished.has(`weapon:${id}`)).length;
  const candP = Object.keys(PASSIVES).filter((id) => !p.some(([x]) => x === id) &&
    !banished.has(`passive:${id}`)).length;
  levels += Math.min(freeW, candW) * 7 + Math.min(freeP, candP) * 5;
  return { pool, levels };
}

function inputStats(r) {
  if (!Array.isArray(r.inputs) || !r.inputs.length) return null;
  const k = r.mode === 'duo' ? (r.local || 0) * 2 : 0;
  const end = Math.round(r.time * (r.tickRate || 60));
  let idle = 0;
  let changes = 0;
  let last = null;
  for (let i = 0; i < r.inputs.length; i++) {
    const row = r.inputs[i];
    const next = i + 1 < r.inputs.length ? r.inputs[i + 1][0] : end;
    const x = row[1 + k];
    const y = row[2 + k];
    const key = `${x},${y}`;
    if (key !== last) changes++;
    last = key;
    if (Math.hypot(x, y) < 0.1) idle += Math.max(0, next - row[0]);
  }
  return { idleShare: idle / Math.max(1, end), changesPerMin: changes / Math.max(1, r.time / 60) };
}

export function playerRecord(raw, at = '') {
  const r = decodeRun(raw);
  const duo = r.mode === 'duo';
  const slots = duo ? COOP.slots : SLOTS;
  const picks = r.picks || [];
  const banished = new Set();
  const marks = {};
  const snaps = [...(r.snaps || [])];
  for (const T of MARKS) {
    const s = snaps.find((x) => x.t === T);
    const before = picks.filter((pk) => pk[0] <= T);
    for (const pk of before) if (pk[1] === 'banish') banished.add(parseCard(pk[2]).kind + ':' + parseCard(pk[2]).id);
    if (!s) { marks[T] = null; continue; }
    const cap = capacity(s.w.map(([id, lv]) => [id, lv]), s.p || [], slots, banished);
    const takes = before.filter((pk) => pk[1] === 'take');
    marks[T] = { level: s.lv, alive: !s.dead, takes: takes.length,
      weaponTakes: takes.filter((pk) => pk[2].startsWith('weapon:')).length,
      evos: before.filter((pk) => pk[1] === 'evo').length,
      heals: before.filter((pk) => pk[1] === 'heal').length,
      pool: cap.pool, levelsLeft: cap.levels,
      groundXP: s.economy?.groundXP ?? null, pickedXP: s.economy?.pickedXP ?? null,
      generatedXP: s.economy?.generatedXP ?? null };
  }
  // Концентрация: доля взятий оружия, ушедших в одно самое прокачанное оружие за первые 5 минут.
  const early = picks.filter((pk) => pk[0] <= 300 && pk[1] === 'take' && pk[2].startsWith('weapon:'));
  const byW = {};
  for (const pk of early) byW[parseCard(pk[2]).id] = (byW[parseCard(pk[2]).id] || 0) + 1;
  const top = Math.max(0, ...Object.values(byW));
  const firstMax = picks.find((pk) => pk[1] === 'take' && pk[2].startsWith('weapon:') &&
    parseCard(pk[2]).level === (WEAPONS[parseCard(pk[2]).id]?.maxLevel || 7));
  // Выбор нового оружия против прокачки, если в предложении было и то и другое.
  let mixed = 0;
  let tookNew = 0;
  for (const pk of picks) {
    if (pk[1] !== 'take') continue;
    const offered = pk[3].map(parseCard);
    if (offered.some((c) => c.level === 1) && offered.some((c) => c.level > 1)) {
      mixed++; if (parseCard(pk[2]).level === 1) tookNew++;
    }
  }
  const dec = (r.decisions || []).filter((d) => VOLUNTARY.has(d.pick?.[1]) &&
    Number.isFinite(d.decisionMs));
  const magnets = r.magnets || [];
  return {
    at, v: r.v || 1, ver: r.ver || r.fingerprint || '', mode: r.mode, difficulty: r.difficulty,
    hero: r.hero, status: r.status, time: r.time, level: r.level, won: r.won ?? (r.status === 'victory'),
    session: r.sessionId || null, local: r.local ?? 0, revives: r.revives ?? null,
    killedBy: r.killedBy || '', terminal: r.terminal || null,
    marks, concentration5: early.length ? top / early.length : null, earlyWeaponTakes: early.length,
    newWhenMixed: mixed ? tookNew / mixed : null,
    firstMaxAt: firstMax ? firstMax[0] : null,
    evoTimes: picks.filter((pk) => pk[1] === 'evo').map((pk) => [pk[0], parseCard(pk[2]).id]),
    evoSkips: picks.filter((pk) => pk[1] === 'evoSkip').length,
    autoHealAt: picks.find((pk) => pk[1] === 'heal')?.[0] ?? null,
    acts: Object.fromEntries(['take', 'reroll', 'skip', 'banish', 'evo', 'evoSkip', 'heal', 'chest']
      .map((a) => [a, picks.filter((pk) => pk[1] === a).length])),
    decisionMs: dec.length ? median(dec.map((d) => d.decisionMs)) : null,
    input: inputStats(r),
    magnets: r.magnets ? magnets.length : null,
    magnetGroundXP: magnets.length ? median(magnets.map((m) => m.groundXP)) : null,
    distancePerMin: Number.isFinite(r.distance) ? r.distance / Math.max(1, r.time / 60) : null,
    capture: r.capture ?
      { dropped: r.capture.dropped, inputComplete: r.capture.inputComplete } : null,
  };
}

// Сессии: дуо по sessionId; исход команды — победа, если победил кто-то, иначе худший технический.
export function sessions(players) {
  const map = new Map();
  for (const p of players) {
    const key = p.mode === 'duo' && p.session ? `duo:${p.session}` : `solo:${p.at}:${p.ver}:${p.time}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()].map(([key, ps]) => {
    const statuses = ps.map((p) => p.status);
    const outcome = statuses.includes('victory') ? 'victory' : statuses.includes('disconnected') ?
      'disconnected' : statuses.includes('quit') ? 'quit' : statuses.includes('dead') ? 'dead' : statuses[0];
    return { key, mode: ps[0].mode, difficulty: ps[0].difficulty, docs: ps.length,
      heroes: ps.map((p) => p.hero), outcome, time: Math.max(...ps.map((p) => p.time)),
      level: Math.max(...ps.map((p) => p.level)), ver: ps[0].ver, v: ps[0].v, players: ps };
  });
}

function modeTable(players, ss) {
  const out = {};
  for (const mode of ['solo', 'duo']) {for (const difficulty of ['normal', 'cursed']) {
    const S = ss.filter((s) => s.mode === mode && s.difficulty === difficulty);
    const P = players.filter((p) => p.mode === mode && p.difficulty === difficulty);
    const outcomes = {};
    for (const s of S) outcomes[s.outcome] = (outcomes[s.outcome] || 0) + 1;
    const minutes = {};
    for (const T of MARKS) {
      const m = P.map((p) => p.marks[T]).filter(Boolean);
      minutes[T] = { players: m.length, level: median(m.map((x) => x.level)),
        takes: median(m.map((x) => x.takes)), pool: median(m.map((x) => x.pool)),
        levelsLeft: median(m.map((x) => x.levelsLeft)),
        exhausted: m.filter((x) => x.pool === 0).length,
        healed: m.filter((x) => x.heals > 0).length,
        groundXP: median(m.map((x) => x.groundXP)) };
    }
    out[`${difficulty}/${mode}`] = { sessions: S.length, docs: P.length, outcomes, minutes,
      concentration5: median(P.map((p) => p.concentration5)),
      newWhenMixed: median(P.map((p) => p.newWhenMixed)),
      firstMaxAt: median(P.map((p) => p.firstMaxAt)),
      firstEvoAt: median(P.map((p) => p.evoTimes[0]?.[0] ?? null)),
      autoHealAt: P.map((p) => p.autoHealAt).filter((x) => x !== null),
      idleShare: median(P.map((p) => p.input?.idleShare ?? null)),
      decisionMs: median(P.map((p) => p.decisionMs)),
      magnets: median(P.map((p) => p.magnets)) };
  }}
  return out;
}

export function audit(records) {
  const players = records.map(({ at, run }) => playerRecord(run, at));
  const ss = sessions(players);
  return { players, sessions: ss.map(({ players: ps, ...s }) => s), modes: modeTable(players, ss) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args[i + 1]; };
  const load = (path) => {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(d) ? d : d.records;
  };
  const human = audit(load(args[0]));
  const result = { human };
  if (opt('bots')) result.bots = audit(load(opt('bots')));
  const text = JSON.stringify(result, null, 1);
  if (opt('out')) writeFileSync(opt('out'), text);
  console.log(JSON.stringify({ human: human.modes, bots: result.bots?.modes }, null, 1));
}
export { median, quart, HEROES };
