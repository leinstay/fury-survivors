import { readFile, writeFile } from 'node:fs/promises';
import { normalizeRun } from './data.mjs';
const source = process.argv[2] || 'tests/fixtures/telemetry';
const runs = JSON.parse(await readFile(`${source}/runs.json`, 'utf8'));
const normalized = runs.map((r, i) => normalizeRun(r.run, i));
const median = (a) => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
const report = {
  nRuns: normalized.length,
  modes: Object.fromEntries(['solo', 'duo'].map((m) => [m, normalized.filter((r) => r.mode === m).length])),
  picks: normalized.reduce((n, r) => n + r.decisions.length, 0),
  voluntary: normalized.reduce((n, r) => n + r.decisions.filter((d) => d.voluntary).length, 0),
  autoHeals: normalized.reduce((n, r) => n + r.decisions.filter((d) => d.act === 'heal').length, 0),
  recipes: normalized.reduce((n, r) => n + r.recipes.length, 0),
  incompleteIntervals: normalized.reduce((n, r) =>
    n + r.intervals.filter((x) => !x.complete).length, 0),
  byDifficulty: Object.fromEntries(['normal', 'cursed'].map((d) => {
    const group = normalized.filter((r) => r.difficulty === d);
    return [d, { n: group.length, minutes: Object.fromEntries([60, 180, 300, 600, 900].map((t) => {
      const snapshots = group.flatMap((r) => r.snapshots.filter((s) => s.t === t));
      return [t, { n: snapshots.length, level: median(snapshots.map((s) => s.lv)) }];
    })), exhaustionTimes: group.map((r) => r.autoHealAt).filter((t) => t !== null) }];
  })),
  levelPauses: Object.fromEntries([19, 20, 21, 39, 40, 41].map((lv) => [lv,
    median(runs.map(({ run: r }) => r.levels[lv + 1] && r.levels[lv] ?
      r.levels[lv + 1] - r.levels[lv] : null).filter((v) => v !== null))])),
  warnings: normalized.map((r) => ({ run: r.id, warnings: r.warnings })),
};
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
