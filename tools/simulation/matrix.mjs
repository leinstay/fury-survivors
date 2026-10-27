import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { PROFILES, recipeProfiles } from './profiles.mjs';

export function matrix({ n = 20, split = 'tuning', noEvolution = false, immortal = false,
  until = 1080, experiment = null, recipes = false, bag = null } = {}) {
  const base = { tuning: 10000, validation: 200000, qualification: 4000000 }[split];
  if (!base || !Number.isInteger(n) || n < 1) throw new Error('Invalid matrix specification');
  const counts = PROFILES.map((p) => Math.floor(p.weight * n));
  let left = n - counts.reduce((a, b) => a + b, 0);
  const remainders = PROFILES.map((p, i) => ({ i, remainder: p.weight * n - counts[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of remainders) if (left-- > 0) counts[i]++;
  const cohort = PROFILES.flatMap((p, i) => Array(counts[i]).fill(p.id));
  const jobs = [];
  if (recipes) {
    for (const profile of recipeProfiles()) {for (const difficulty of ['normal', 'cursed']) {
      for (const players of [1, 2]) {for (let i = 0; i < n; i++) {
        jobs.push({ seed: base + i * 1009, behaviorSeed: base + 37 + i * 1031,
          difficulty, players, until, profiles: [profile.id, 'adaptive'],
          heroes: ['heroine', 'mage'], immortal: immortal ? [true, true] : [],
          noEvolution: [], cohort: 'recipe', experiment, split });
      }}
    }}
    return jobs;
  }
  for (const difficulty of ['normal', 'cursed']) {for (const players of [1, 2]) {
    for (let i = 0; i < n; i++) {jobs.push({ seed: base + i * 1009,
      behaviorSeed: base + 37 + i * 1031, difficulty, players, until,
      profiles: [cohort[i], cohort[(i + Math.floor(n / 3)) % n]],
      heroes: i % 2 ? ['mage', 'heroine'] : ['heroine', 'mage'],
      noEvolution: noEvolution ? [true, true] : [], immortal: immortal ? [true, true] : [],
      experiment, split, ...(bag ? { bag } : {}) });}
  }}
  return jobs;
}

export async function runMatrix(configs, { concurrency = Math.min(4, availableParallelism()),
  onResult = () => {} } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid worker count');
  const results = Array(configs.length);
  let next = 0;
  let done = 0;
  if (!configs.length) return results;
  await new Promise((resolve, reject) => {
    const workers = [];
    let failed = false;
    const stop = () => workers.forEach((w) => w.terminate());
    for (let i = 0; i < Math.min(concurrency, configs.length); i++) {
      const worker = new Worker(new URL('./worker.mjs', import.meta.url));
      workers.push(worker);
      const dispatch = () => {
        if (next < configs.length) {
          const index = next++; worker.postMessage({ index, config: configs[index] });
        }
      };
      worker.on('message', ({ index, result, error }) => {
        if (failed) return;
        if (error) { failed = true; stop(); reject(new Error(error)); return; }
        results[index] = result; done++; onResult(result, done, configs.length);
        if (done === configs.length) { stop(); resolve(); }
        else dispatch();
      });
      worker.on('error', (err) => { if (!failed) { failed = true; stop(); reject(err); } });
      dispatch();
    }
  });
  return results;
}
