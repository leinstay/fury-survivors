// Когорта ботов с телеметрией v2 в той же схеме, что у людей, плюс стандартная сводка исходов.
// node tools/simulation/audit-bots.mjs --n 40 --split tuning [--experiment x.json] [--no-evolution]
//   [--modes normal/1,cursed/2] --out tools/out/audit/bots.json
// Телеметрия ботов не отправляется в Firestore: собирается локально в runner.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { matrix, runMatrix } from './matrix.mjs';
import { summarize } from './stats.mjs';
import { sourceHash } from './record.mjs';
import { MODEL } from './model.mjs';
import { PROFILE_VERSION } from './profiles.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const n = Number(opt('n', 20));
const split = opt('split', 'tuning');
const experiment = opt('experiment', '') ? JSON.parse(await readFile(opt('experiment'), 'utf8')) : null;
const modes = opt('modes', '') ? new Set(opt('modes').split(',')) : null;
const configs = matrix({ n, split, noEvolution: args.includes('--no-evolution'),
  until: Number(opt('until', 1080)), experiment })
  .filter((c) => !modes || modes.has(`${c.difficulty}/${c.players}`))
  .map((c) => ({ ...c, telemetry: true }));
const out = opt('out', 'tools/out/audit/bots.json');
await mkdir(dirname(out), { recursive: true });
const rows = await runMatrix(configs, { concurrency: Number(opt('workers', 4)),
  onResult: (r, done, total) => {
    if (done % 20 === 0 || done === total) console.error(`${done}/${total}`);
  } });
const records = [];
for (const [i, r] of rows.entries()) {
  for (const t of r.telemetry || []) {
    if (!t) continue;
    // Сессия бота: seed/behaviorSeed; статус дуо-команды выставляет runner одинаковым обоим.
    t.ver = 'bot'; t.v = 2; t.sessionId = `bot-${i}`;
    // --lite: без тяжёлых потоков (ввод, движение, события), сравнение траекторий их не требует.
    if (args.includes('--lite')) {
      for (const k of ['inputs', 'movement', 'offers', 'applications', 'events']) delete t[k];
    }
    records.push({ at: `bot-${String(i).padStart(5, '0')}`, run: t,
      profile: r.config.profiles[t.local || 0] });
  }
  delete r.telemetry; delete r.trace; delete r.combat; delete r.opportunities;
}
const summary = summarize(rows);
await writeFile(out, JSON.stringify({ schema: 1, source: sourceHash(), model: MODEL.version,
  profiles: PROFILE_VERSION, split, n, experiment, records, rows, summary }));
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k, s]) =>
  [k, { n: s.n, counts: s.counts, deathCI95: s.deathCI95.map((x) => +x.toFixed(3)),
    lv900: s.minutes[900].level, n900: s.minutes[900].n }])), null, 1));
