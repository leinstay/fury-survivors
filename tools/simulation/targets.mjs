// Цели баланса (docs/META.md 1.1, docs/BALANCE_AUDIT.md 12): клир, а не смерть.
// Бессмертные боты трёх билдов (profiles.mjs BUILD_BIAS: glass, mid, tank) играют забег; по минутам меряется,
// сколько живёт обычный моб (на экране → смерть, clear.mjs) и сколько врагов на экране. Провал — не успевает
// убивать: врагов на экране становится больше (или мир упирается в лимит), моб живёт дольше LIFE_FAIL.
// Защита считается отдельно на бумаге (defense.mjs). Боссы: время убийства (TTK).
// node tools/simulation/targets.mjs --n 24 --modes normal/1,cursed/1,normal/2 --builds glass,mid,tank
//   [--split tuning] [--workers 30] [--bag 2] [--experiment x.json] [--out tools/out/targets.json] [--quiet]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { availableParallelism } from 'node:os';
import { runMatrix } from './matrix.mjs';
import { histMedian } from './clear.mjs';
import { COMBOS } from '../../src/data/combos.js';

// Пороги метрики (инструмент, не игра). Минуты 0–14 по началу минуты.
export const CLEAR_TARGETS = {
  mid: { life: [3, 5] },              // средний билд: моб на экране живёт 3–5 с весь забег
  glass: { from: 10, life: [1, 2], minHits: 2 }, // с 10:00 моб за 1–2 с, но не одним ударом (среднее ≥ 2)
  failLife: 8,                         // с: дольше — билд не успевает (провал минуты)
  failCap: 0.25,                       // доля минуты у лимита врагов — провал
  failScreen: 150,                     // врагов на экране в среднем за минуту — провал
};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const n = Number(opt('n', 24));
const split = opt('split', 'tuning');
const experiment = opt('experiment', '') ? JSON.parse(await readFile(opt('experiment'), 'utf8')) : null;
const modes = opt('modes', 'normal/1,cursed/1,normal/2').split(',');
const builds = opt('builds', 'glass,mid,tank').split(',');
const bagTier = Number(opt('bag', 0));
const until = Number(opt('until', 1020));
const workers = Number(opt('workers', Math.max(1, availableParallelism() - 2)));
const base = { tuning: 10000, validation: 200000, qualification: 4000000 }[split];
if (!base) throw new Error('Invalid split');

const jobs = [];
for (const mode of modes) {
  const [difficulty, players] = mode.split('/');
  for (const build of builds) {
    for (let i = 0; i < n; i++) {
      jobs.push({ seed: base + i * 1009, behaviorSeed: base + 37 + i * 1031, difficulty,
        players: Number(players), until, profiles: [build, build],
        heroes: i % 2 ? ['mage', 'heroine'] : ['heroine', 'mage'],
        immortal: [true, true], noEvolution: [], clear: true, experiment, split,
        ...(bagTier ? { bag: { tier: bagTier, cells: 45, pick: 1 } } : {}), mode, build });
    }
  }
}
const t0 = Date.now();
const rows = await runMatrix(jobs, { concurrency: workers, onResult: (r, done, total) => {
  if (done % 50 === 0 || done === total) console.error(`${done}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} });

const r1 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const median = (a) => {
  a = a.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[a.length >> 1] : null;
};
const evolved = new Set(COMBOS.map((c) => c.result));

function summarize(data) {
  const mins = [];
  for (let m = 0; m < 15; m++) {
    const acc = { kills: 0, life: 0, visible: 0, visibleN: 0, ttk: 0, ttkN: 0, hits: 0, oneShot: 0,
      onScreen: 0, alive: 0, cap: 0, samples: 0, hist: Array(160).fill(0), runs: 0, peak: [],
      byType: {} };
    for (const r of data) {
      const x = r.clear?.minutes[m];
      if (!x || !x.samples) continue;
      acc.runs++;
      for (const k of ['kills', 'life', 'visible', 'visibleN', 'ttk', 'ttkN', 'hits', 'oneShot',
        'onScreen', 'alive', 'cap', 'samples']) acc[k] += x[k];
      x.hist.forEach((v, i) => { acc.hist[i] += v; });
      acc.peak.push(x.peakOnScreen);
      for (const [k, v] of Object.entries(x.byType || {})) acc.byType[k] = (acc.byType[k] || 0) + v;
    }
    if (!acc.runs) continue;
    mins.push({ minute: m, runs: acc.runs, killsPerMin: Math.round(acc.kills / acc.runs),
      visible: r1(acc.visible / acc.visibleN), visibleMedian: histMedian(acc.hist),
      life: r1(acc.life / acc.kills), ttk: r1(acc.ttk / acc.ttkN),
      hitsPerKill: r1(acc.hits / acc.kills),
      oneShot: r1(100 * acc.oneShot / acc.kills), onScreen: r1(acc.onScreen / acc.samples),
      peakOnScreen: median(acc.peak), alive: r1(acc.alive / acc.samples),
      capShare: r1(100 * acc.cap / acc.samples),
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
  // Провал забега: две минуты подряд с жизнью моба > failLife, лимитом > failCap или экраном > failScreen
  // (устойчиво не успевает убивать; одна тяжёлая минута с боссом — ещё не провал). Минута провала — первая из двух.
  const T = CLEAR_TARGETS;
  const bad = (x) => x && x.samples && ((x.visibleN ? x.visible / x.visibleN : 0) > T.failLife ||
    x.cap / x.samples > T.failCap || x.onScreen / x.samples > T.failScreen);
  const failAt = data.map((r) => {
    const ms = r.clear?.minutes || [];
    for (let m = 0; m + 1 < Math.min(15, ms.length); m++) {
      if (bad(ms[m]) && bad(ms[m + 1])) return m;
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
    level: median(data.map((r) => r.level)) };
}

const report = {};
for (const mode of modes) {
  for (const build of builds) {
    const key = `${mode}/${build}`;
    report[key] = summarize(rows.filter((r) => r.config.mode === mode && r.config.build === build));
  }
}
if (!args.includes('--quiet')) {
  for (const [key, r] of Object.entries(report)) {
    console.log(`\n${key}: n ${r.n} err ${r.errors} won ${r.won} fail ${r.failRuns} (до 10:00 ${r.failBefore10}, ` +
      `медиана минуты ${r.failMinuteMedian}) L ${r.level}`);
    console.log(' мин  видна(ср/мед)  с появл.  ttk  уд/убийство  1уд%  экран(ср/пик)  мир  лимит%  убийств/мин');
    for (const m of r.minutes) {
      console.log(`  ${String(m.minute).padStart(2)}   ${String(m.visible).padStart(4)}/${String(m.visibleMedian).padEnd(5)}` +
        `   ${String(m.life).padStart(5)}  ${String(m.ttk).padStart(4)}  ${String(m.hitsPerKill).padStart(6)}` +
        `      ${String(m.oneShot).padStart(4)}   ${String(m.onScreen).padStart(5)}/${String(m.peakOnScreen).padEnd(4)}` +
        `  ${String(m.alive).padStart(5)}  ${String(m.capShare).padStart(5)}  ${m.killsPerMin}`);
    }
    if (args.includes('--types')) {
      for (const m of r.minutes) console.log(`  экран ${m.minute}:`, JSON.stringify(m.byType));
    }
    console.log('  боссы', JSON.stringify(r.bosses));
    console.log('  урон%', JSON.stringify(r.damage));
  }
}
const out = opt('out', '');
if (out) {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ n, split, experiment, builds, modes, bagTier,
    targets: CLEAR_TARGETS, report }, null, 1));
}
