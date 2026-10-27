// Цели ребаланса (docs/META.md 1.1): доля забегов, где убит 2-й босс (10:00) и 3-й (15:00, победа),
// окно смертей 5:00–8:00 и доли урона по оружию. Сумка: --bag 2 (полная сумка T2, tools/simulation/bags.mjs).
// node tools/simulation/targets.mjs --n 80 --modes normal/1,normal/1/bag,cursed/1,normal/2 [--split tuning]
//   [--workers 16] [--experiment x.json] [--out tools/out/targets.json]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { availableParallelism } from 'node:os';
import { matrix, runMatrix } from './matrix.mjs';
import { wilson } from './stats.mjs';
import { WEAPONS } from '../../src/data/weapons.js';
import { COMBOS } from '../../src/data/combos.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const n = Number(opt('n', 40));
const split = opt('split', 'tuning');
const experiment = opt('experiment', '') ? JSON.parse(await readFile(opt('experiment'), 'utf8')) : null;
const modes = opt('modes', 'normal/1,normal/1/bag,cursed/1,normal/2').split(',');
const bagSpec = { tier: Number(opt('tier', 2)), cells: Number(opt('cells', 45)), pick: Number(opt('pick', 1)) };
const workers = Number(opt('workers', Math.max(1, availableParallelism() - 2)));

const jobs = [];
for (const mode of modes) {
  const [difficulty, players, bag] = mode.split('/');
  const base = matrix({ n, split, experiment, bag: bag ? bagSpec : null })
    .filter((c) => c.difficulty === difficulty && c.players === Number(players));
  for (const c of base) jobs.push({ ...c, mode });
}
const t0 = Date.now();
const rows = await runMatrix(jobs, { concurrency: workers, onResult: (r, done, total) => {
  if (done % 50 === 0 || done === total) console.error(`${done}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} });

const evolvedFrom = Object.fromEntries(COMBOS.map((c) => [c.result, c.from[0]]));
const pct = (k, m) => `${(100 * k / m).toFixed(0)}% [${wilson(k, m).map((x) => (100 * x).toFixed(0)).join('–')}]`;
const report = {};
for (const mode of modes) {
  const data = rows.filter((r) => r.config.mode === mode);
  const m = data.length;
  const boss1 = data.filter((r) => r.bossKills >= 1).length;
  const boss2 = data.filter((r) => r.bossKills >= 2).length;
  const boss3 = data.filter((r) => r.won).length;
  const errors = data.filter((r) => ['error', 'timeout'].includes(r.outcome)).length;
  const deaths = data.filter((r) => r.outcome === 'defeat').map((r) => r.time);
  const wins = data.filter((r) => r.won).map((r) => Math.round(r.time)).sort((a, b) => a - b);
  const winMedian = wins.length ? wins[Math.floor(wins.length / 2)] : null;
  const timeouts = data.filter((r) => r.outcome === 'timeout').length;
  const window = deaths.filter((t) => t >= 300 && t < 480).length;
  const hist = {};
  for (const t of deaths) { const k = Math.floor(t / 60); hist[k] = (hist[k] || 0) + 1; }
  // Урон: по базовому оружию (эволюция приписана своему оружию) и отдельно по эволюциям.
  const dmg = {};
  const evo = {};
  let total = 0;
  for (const r of data) {
    for (const p of r.final) {
      for (const [id, v] of Object.entries(p.dealt || {})) {
        const key = evolvedFrom[id] || id;
        if (!WEAPONS[key]) continue;
        dmg[key] = (dmg[key] || 0) + v; total += v;
        if (evolvedFrom[id]) evo[id] = (evo[id] || 0) + v;
      }
    }
  }
  // Сколько забегов оружие было взято (у кого-то из игроков в финальной сборке) и урон за секунду владения
  // (combat.dealt / opportunities.held из record.mjs): эволюции отдельно под своим id.
  const owned = {};
  const held = {};
  const dealt = {};
  for (const r of data) {
    for (const p of r.final) {
      for (const [id] of p.weapons) {
        const key = evolvedFrom[id] || id;
        owned[key] = (owned[key] || 0) + 1;
      }
    }
    for (const [key, row] of Object.entries(r.combat || {})) {
      const id = key.split(':')[1];
      dealt[id] = (dealt[id] || 0) + row.dealt;
    }
    for (const [key, row] of Object.entries(r.opportunities || {})) {
      const id = key.split(':')[1];
      held[id] = (held[id] || 0) + row.held;
    }
  }
  const dps = Object.fromEntries(Object.keys(dealt).filter((id) => held[id] > 0)
    .sort((a, b) => dealt[b] / held[b] - dealt[a] / held[a])
    .map((id) => [id, { dps: Math.round(dealt[id] / held[id]),
      heldMin: Math.round(held[id] / 60) }]));
  const share = Object.fromEntries(Object.entries(dmg).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, { share: +(v / total).toFixed(3), owned: owned[k] || 0,
      perOwner: Math.round(v / (owned[k] || 1)) }]));
  const heroes = {};
  for (const r of data) {
    const h = r.config.heroes.slice(0, r.config.players).join('+');
    const row = heroes[h] || (heroes[h] = { n: 0, boss2: 0, boss3: 0 });
    row.n++; if (r.bossKills >= 2) row.boss2++; if (r.won) row.boss3++;
  }
  report[mode] = { n: m, boss1: pct(boss1, m), boss2: pct(boss2, m), boss3: pct(boss3, m),
    boss2k: boss2, boss3k: boss3, errors, timeouts, winMedian, deathWindow5to8: `${window}/${deaths.length}`, deathsByMinute: hist,
    evolutions: Object.fromEntries(Object.entries(evo)
      .map(([k, v]) => [k, +(v / total).toFixed(3)])),
    damage: share, dps, heroes };
  console.log(`${mode}: n ${m}  boss1 ${pct(boss1, m)}  boss2 ${pct(boss2, m)}  boss3 ${pct(boss3, m)}  ` +
    `err ${errors} (timeout ${timeouts})  win@${winMedian}  deaths 5-8 ${window}/${deaths.length}  byMin ${JSON.stringify(hist)}`);
}
if (!args.includes('--quiet')) {
  for (const [mode, r] of Object.entries(report)) {
    console.log(mode, Object.entries(r.damage).map(([k, v]) =>
      `${k} ${(v.share * 100).toFixed(1)}%/${v.owned}`).join('  '));
    console.log('  dps', Object.entries(r.dps).map(([k, v]) => `${k} ${v.dps}/${v.heldMin}m`).join('  '));
    console.log('  heroes', JSON.stringify(r.heroes));
  }
}
const out = opt('out', '');
if (out) {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ n, split, experiment, bag: bagSpec, report }, null, 1));
}
