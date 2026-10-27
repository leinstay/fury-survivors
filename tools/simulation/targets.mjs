// Цели баланса (docs/META.md 1.1, docs/BALANCE_AUDIT.md 12–13): клир, а не смерть.
// Бессмертные боты трёх билдов (profiles.mjs BUILD_BIAS: glass, mid, tank) играют забег; по минутам меряется,
// сколько живёт обычный моб с входа в рамку героя до смерти (clear.mjs, рамка CLEAR в src/data/constants.js) и
// сколько врагов в рамке. Провал — не успевает убивать: врагов в рамке становится больше (или мир упирается
// в лимит), моб живёт в рамке дольше failLife. Защита считается отдельно на бумаге (defense.mjs). Боссы: TTK.
// node tools/simulation/targets.mjs --n 24 --modes normal/1,cursed/1,normal/2,normal/1/dmg2 --builds glass,mid,tank
//   [--split tuning] [--workers 30] [--bag 2] [--experiment x.json] [--out tools/out/targets.json] [--quiet]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { availableParallelism } from 'node:os';
import { pathToFileURL } from 'node:url';
import { runMatrix } from './matrix.mjs';
import { histMedian } from './clear.mjs';
import { COMBOS } from '../../src/data/combos.js';

// Пороги метрики (инструмент, не игра). Минуты 0–14 по началу минуты. Жизнь — с входа в рамку героя,
// врагов — в рамке.
export const CLEAR_TARGETS = {
  mid: { life: [3, 5] },              // средний билд: моб в рамке живёт 3–5 с весь забег
  glass: { from: 10, life: [1, 2], minHits: 2 }, // с 10:00 моб за 1–2 с, но не одним ударом (среднее ≥ 2)
  failLife: 8,                         // с в рамке: дольше — билд не успевает (провал минуты)
  failCap: 0.25,                       // доля минуты у лимита врагов — провал
  failFrame: 60,                       // врагов в рамке в среднем за минуту — провал
  failGrowth: 1.5,                     // врагов в рамке за минуту в столько раз больше, чем за прошлую, при хотя бы
  growthMin: 30,                       // стольких и жизни выше mid.life[1] — тоже провал (толпа растёт)
};
// Окна для оружия: минуты [from, to] включительно.
export const WEAPON_WINDOWS = { early: [0, 4], mid: [5, 9], late: [10, 14], all: [0, 14] };
const SUM_KEYS = ['kills', 'life', 'visible', 'visibleN', 'frame', 'frameN', 'preFrame', 'ttk', 'ttkN',
  'hits', 'oneShot', 'onScreen', 'inFrame', 'alive', 'cap', 'samples'];

const r1 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const median = (a) => {
  a = a.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[a.length >> 1] : null;
};
const evolved = new Set(COMBOS.map((c) => c.result));

/** Провал минуты по CLEAR_TARGETS: x — минута одного забега, prev — прошлая минута. */
export function badMinute(x, prev, T = CLEAR_TARGETS) {
  if (!x || !x.samples) return false;
  const life = x.frameN ? x.frame / x.frameN : 0;
  const frame = x.inFrame / x.samples;
  const before = prev && prev.samples ? prev.inFrame / prev.samples : null;
  const growing = before !== null && frame >= T.growthMin && frame > before * T.failGrowth &&
    life > T.mid.life[1];
  return life > T.failLife || x.cap / x.samples > T.failCap || frame > T.failFrame || growing;
}

/** Оружие по окнам: урон за секунду владения (dps; baseDps — без стата attack/magic), убийств в минуту, дистанция. */
export function weaponTable(data) {
  const out = {};
  for (const [win, [from, to]] of Object.entries(WEAPON_WINDOWS)) {
    const acc = {};
    for (const r of data) {
      for (let m = from; m <= to; m++) {
        for (const [key, w] of Object.entries(r.clear?.minutes[m]?.weapons || {})) {
          const a = acc[key] ||
            (acc[key] = { dealt: 0, raw: 0, base: 0, held: 0, hits: 0, kills: 0, dist: 0 });
          for (const k of Object.keys(a)) a[k] += w[k] || 0;
        }
      }
    }
    out[win] = Object.fromEntries(Object.entries(acc).filter(([, a]) => a.held > 0)
      .map(([key, a]) => [key, { heldMin: r1(a.held / 60), dps: r1(a.dealt / a.held),
        rawDps: r1(a.raw / a.held),
        baseDps: r1(a.base / a.held), killsPerMin: r1(a.kills * 60 / a.held),
        hitsPerSec: r1(a.hits / a.held), dist: a.dealt ? Math.round(a.dist / a.dealt) : null }]));
  }
  return out;
}

export function summarize(data) {
  const mins = [];
  for (let m = 0; m < 15; m++) {
    const acc = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
    Object.assign(acc, { hist: Array(160).fill(0), runs: 0, peak: [], peakFrame: [], byType: {} });
    for (const r of data) {
      const x = r.clear?.minutes[m];
      if (!x || !x.samples) continue;
      acc.runs++;
      for (const k of SUM_KEYS) acc[k] += x[k] || 0;
      x.hist.forEach((v, i) => { acc.hist[i] += v; });
      acc.peak.push(x.peakOnScreen); acc.peakFrame.push(x.peakInFrame);
      for (const [k, v] of Object.entries(x.byType || {})) acc.byType[k] = (acc.byType[k] || 0) + v;
    }
    if (!acc.runs) continue;
    mins.push({ minute: m, runs: acc.runs, killsPerMin: Math.round(acc.kills / acc.runs),
      frame: r1(acc.frame / acc.frameN), frameMedian: histMedian(acc.hist),
      preFrame: r1(100 * acc.preFrame / acc.kills),
      visible: r1(acc.visible / acc.visibleN), life: r1(acc.life / acc.kills),
      ttk: r1(acc.ttk / acc.ttkN), hitsPerKill: r1(acc.hits / acc.kills),
      oneShot: r1(100 * acc.oneShot / acc.kills),
      inFrame: r1(acc.inFrame / acc.samples), peakInFrame: median(acc.peakFrame),
      onScreen: r1(acc.onScreen / acc.samples), peakOnScreen: median(acc.peak),
      alive: r1(acc.alive / acc.samples), capShare: r1(100 * acc.cap / acc.samples),
      byType: Object.fromEntries(Object.entries(acc.byType).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, r1(v / acc.samples)])) });
  }
  const bosses = {};
  for (const r of data) {
    for (const b of r.clear?.bosses || []) {
      const row = bosses[b.id] ||
        (bosses[b.id] = { spawned: 0, killed: 0, ttk: [], hp: [], level: [] });
      row.spawned++; row.hp.push(b.hp); row.level.push(b.level);
      if (b.ttk !== null) { row.killed++; row.ttk.push(b.ttk); }
    }
  }
  for (const row of Object.values(bosses)) {
    row.ttkMedian = r1(median(row.ttk)); row.ttkMax = r1(Math.max(...row.ttk, 0));
    row.hpMedian = median(row.hp); row.levelMedian = median(row.level);
    delete row.ttk; delete row.hp; delete row.level;
  }
  // Провал забега: две минуты подряд с badMinute (устойчиво не успевает убивать; одна тяжёлая минута с боссом —
  // ещё не провал). Минута провала — первая из двух.
  const failAt = data.map((r) => {
    const ms = r.clear?.minutes || [];
    for (let m = 0; m + 1 < Math.min(15, ms.length); m++) {
      if (badMinute(ms[m], ms[m - 1]) && badMinute(ms[m + 1], ms[m])) return m;
    }
    return null;
  });
  const failed = failAt.filter((x) => x !== null);
  const before10 = failed.filter((m) => m < 10).length;
  // Доля урона по оружию (эволюции отдельно).
  const dmg = {};
  let total = 0;
  for (const r of data) {
    for (const p of r.final) {
      for (const [id, v] of Object.entries(p.dealt || {})) {
        dmg[id] = (dmg[id] || 0) + v; total += v;
      }
    }
  }
  const share = Object.fromEntries(Object.entries(dmg).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => [k + (evolved.has(k) ? '*' : ''), +(100 * v / total).toFixed(1)]));
  return { n: data.length, errors: data.filter((r) => r.outcome === 'error').length,
    won: data.filter((r) => r.won).length, failRuns: failed.length, failBefore10: before10,
    failMinuteMedian: median(failed), minutes: mins, bosses, damage: share,
    weapons: weaponTable(data), level: median(data.map((r) => r.level)) };
}

const pad = (x, k) => String(x).padStart(k);
export function printReport(report, { types = false } = {}) {
  for (const [key, r] of Object.entries(report)) {
    console.log(`\n${key}: n ${r.n} err ${r.errors} won ${r.won} fail ${r.failRuns} ` +
      `(до 10:00 ${r.failBefore10}, медиана минуты ${r.failMinuteMedian}) L ${r.level}`);
    console.log(' мин  рамка ср/мед  до рамки%  экран  с появл.  ttk  уд/уб  1уд%  ' +
      'в рамке ср/пик  экран ср/пик   мир  лимит%  убийств/мин');
    for (const m of r.minutes) {
      console.log(`  ${pad(m.minute, 2)}  ${pad(m.frame, 5)}/${String(m.frameMedian).padEnd(5)}` +
        `  ${pad(m.preFrame, 8)}  ${pad(m.visible, 5)}  ${pad(m.life, 7)}  ${pad(m.ttk, 4)}` +
        `  ${pad(m.hitsPerKill, 5)}  ${pad(m.oneShot, 4)}  ${pad(m.inFrame, 8)}/${String(m.peakInFrame).padEnd(4)}` +
        `  ${pad(m.onScreen, 6)}/${String(m.peakOnScreen).padEnd(4)}  ${pad(m.alive, 5)}  ${pad(m.capShare, 5)}` +
        `  ${m.killsPerMin}`);
    }
    if (types) {
      for (const m of r.minutes) console.log(`  рамка ${m.minute}:`, JSON.stringify(m.byType));
    }
    console.log('  боссы', JSON.stringify(r.bosses));
    console.log('  урон%', JSON.stringify(r.damage));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
  const n = Number(opt('n', 24));
  const split = opt('split', 'tuning');
  const experiment = opt('experiment', '') ?
    JSON.parse(await readFile(opt('experiment'), 'utf8')) : null;
  const modes = opt('modes', 'normal/1,cursed/1,normal/2').split(',');
  const builds = opt('builds', 'glass,mid,tank').split(',');
  const bagTier = Number(opt('bag', 0));
  const until = Number(opt('until', 1020));
  const workers = Number(opt('workers', Math.max(1, availableParallelism() - 2)));
  const base = { tuning: 10000, validation: 200000, qualification: 4000000 }[split];
  if (!base) throw new Error('Invalid split');
  // Режим: difficulty/players[/сумка]: bag2 — случайная сумка T2 (как у ботов, без отбора),
  // dmg2 — атакующая T2: из 3 предметов берётся лучший по attack + magic (docs/BALANCE_AUDIT.md 13, вопрос D).
  const bagOf = (tag) => {
    const m = /^(bag|dmg)(\d)$/.exec(tag || '');
    if (!m) return bagTier ? { tier: bagTier, cells: 45, pick: 1 } : null;
    return m[1] === 'bag' ? { tier: Number(m[2]), cells: 45, pick: 1 } :
      { tier: Number(m[2]), cells: 45, pick: 3, stats: ['attack', 'magic'] };
  };
  const jobs = [];
  for (const mode of modes) {
    const [difficulty, players, tag] = mode.split('/');
    const bag = bagOf(tag);
    for (const build of builds) {
      for (let i = 0; i < n; i++) {
        jobs.push({ seed: base + i * 1009, behaviorSeed: base + 37 + i * 1031, difficulty,
          players: Number(players), until, profiles: [build, build],
          heroes: i % 2 ? ['mage', 'heroine'] : ['heroine', 'mage'],
          immortal: [true, true], noEvolution: [], clear: true, experiment, split,
          ...(bag ? { bag } : {}), mode, build });
      }
    }
  }
  const t0 = Date.now();
  const rows = await runMatrix(jobs, { concurrency: workers, onResult: (r, done, total) => {
    if (done % 50 === 0 || done === total) {
      console.error(`${done}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } });
  const report = {};
  for (const mode of modes) {
    for (const build of builds) {
      report[`${mode}/${build}`] = summarize(rows.filter((r) => r.config.mode === mode &&
        r.config.build === build));
    }
  }
  if (!args.includes('--quiet')) printReport(report, { types: args.includes('--types') });
  const out = opt('out', '');
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify({ n, split, experiment, builds, modes, bagTier,
      frame: (await import('../../src/data/constants.js')).CLEAR, targets: CLEAR_TARGETS, report },
    null, 1));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
