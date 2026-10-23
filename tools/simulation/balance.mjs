import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { matrix, runMatrix } from './matrix.mjs';
import { summarize } from './stats.mjs';
import { sourceHash } from './record.mjs';
import { MODEL } from './model.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
if (args[0] === 'report') {
  const data = JSON.parse(await readFile(args[1], 'utf8'));
  console.log(JSON.stringify(summarize(data.rows), null, 2));
} else {
  const n = Number(opt('n', args.includes('--full') ? 400 : 20));
  const split = opt('split', args.includes('--full') ? 'qualification' : 'tuning');
  const experiment = opt('experiment', '') ? JSON.parse(await readFile(opt('experiment'), 'utf8')) : null;
  const configs = matrix({ n, split, noEvolution: args.includes('--no-evolution'),
    immortal: args.includes('--immortal'), recipes: args.includes('--recipes'), until: Number(opt('until', 1080)), experiment });
  const out = opt('out', 'tools/out/simulation/balance.json');
  await mkdir(dirname(out), { recursive: true });
  const source = sourceHash();
  const rows = await runMatrix(configs, { concurrency: Number(opt('workers', 4)),
    onResult: (r, done, total) => {
      if (done % 20 === 0 || done === total) console.error(`${done}/${total}: ${r.outcome} ${r.config.difficulty}/${r.config.players}`);
    } });
  const summary = summarize(rows);
  const result = { schema: 1, source, model: MODEL.version, split, n, experiment, rows, summary };
  await writeFile(out, JSON.stringify(result));
  console.log(JSON.stringify(summary, null, 2));
  if (rows.some((r) => r.outcome === 'error')) process.exitCode = 1;
}
