import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runSimulation, replay } from './runner.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
if (args[0] === 'replay') {
  const data = JSON.parse(await readFile(args[1], 'utf8'));
  console.log(replay(data.trace || data));
} else {
  const loaded = opt('config', '') ? JSON.parse(await readFile(opt('config'), 'utf8')) : {};
  const config = loaded.config || loaded;
  const result = runSimulation({ ...config, seed: Number(opt('seed', config.seed || 1)),
    difficulty: opt('difficulty', config.difficulty || 'normal'),
    players: Number(opt('players', config.players || 1)),
    until: Number(opt('until', config.until || 1080)),
    profiles: opt('profile', '').split(',').filter(Boolean).length ?
      opt('profile').split(',') : config.profiles || ['focus', 'evolution'],
    immortal: args.includes('--immortal') ? [true, true] : config.immortal || [],
    noEvolution: args.includes('--no-evolution') ? [true, true] : config.noEvolution || [],
    record: !!opt('out', ''), telemetry: args.includes('--telemetry'),
    detailed: args.includes('--detailed') });
  const out = opt('out', '');
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(result));
  }
  console.log(JSON.stringify({ outcome: result.outcome, time: result.time, level: result.level,
    kills: result.kills, recipes: result.recipes, interventions: result.interventions.length,
    wallMs: result.wallMs, error: result.error, final: result.final }, null, 2));
  if (result.outcome === 'error') process.exitCode = 1;
}
