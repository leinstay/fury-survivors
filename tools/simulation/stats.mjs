export function wilson(successes, total, z = 1.95996398454) {
  if (!total) return [0, 1];
  const p = successes / total;
  const d = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / d;
  const radius = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export function upperBinomial(k, n, alpha = 0.05) {
  if (!n || k === n) return 1;
  if (!k) return 1 - alpha ** (1 / n);
  let lo = k / n;
  let hi = 1;
  for (let step = 0; step < 70; step++) {
    const p = (lo + hi) / 2;
    let mass = Math.exp(n * Math.log1p(-p));
    let cdf = mass;
    for (let i = 1; i <= k; i++) { mass *= (n - i + 1) / i * p / (1 - p); cdf += mass; }
    if (cdf > alpha) lo = p;
    else hi = p;
  }
  return hi;
}
export function summarize(rows) {
  const groups = {};
  for (const r of rows) {
    const c = r.config;
    const kind = c.cohort === 'recipe' ? 'recipe' : c.immortal.some(Boolean) ? 'immortal' :
      c.noEvolution.slice(0, c.players).some(Boolean) ?
        c.noEvolution.slice(0, c.players).every(Boolean) ? 'no-evolution' :
          'partial-no-evolution' : 'human';
    const key = `${c.difficulty}/${c.players}/${kind}`;
    (groups[key] ||= []).push(r);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, data]) => {
    const counts = Object.fromEntries(['victory', 'defeat', 'timeout', 'error'].map((o) =>
      [o, data.filter((r) => r.outcome === o).length]));
    const n = data.length;
    const ci = wilson(counts.defeat, n);
    const target = data[0].config.difficulty === 'normal' ? [0.45, 0.55] : [0.70, 0.80];
    const immortal = data[0].config.immortal.some(Boolean);
    const noEvo = data[0].config.noEvolution.some(Boolean);
    const complete = counts.error === 0 && counts.timeout === 0;
    const independent = data.every((r) => r.config.split === 'qualification');
    const unique = new Set(data.map((r) => `${r.config.seed}:${r.config.behaviorSeed}`)).size === n;
    const research = data[0].config.cohort === 'recipe' || key.includes('partial-no-evolution');
    const upper = upperBinomial(counts.victory, n);
    const minute = (at) => {
      const samples = data.flatMap((r) => r.minutes.filter((m) => m.t === at));
      const median = (values) => values.length ?
        values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
      return { n: samples.length, level: median(samples.map((m) => m.level)),
        remainingPerPlayer: median(samples.flatMap((m) => m.players.map((p) => p.remaining))),
        usefulUpgradesPerPlayer: median(samples.flatMap((m) =>
          m.players.map((p) => p.choices.useful || p.choices.takes))),
        earlyExhausted: samples.filter((m) => m.players.some((p) =>
          p.choices.autoHealAt !== null && p.choices.autoHealAt < 900)).length,
        evolved: data.filter((r) => (r.recipes || []).some((p) => p.t <= at)).length };
    };
    return [key, { n, counts, deathRate: counts.defeat / n, deathCI95: ci,
      winUpper95: upper, target,
      independent, unique,
      qualified: immortal || research || (noEvo && data[0].config.difficulty === 'normal') ?
        null : noEvo ? independent && unique && complete && n >= 200 && upper <= 0.05 :
          independent && unique && complete && n >= 400 && ci[0] >= target[0] && ci[1] <= target[1],
      minutes: Object.fromEntries([60, 180, 300, 600, 900].map((t) => [t, minute(t)])),
      interventions: data.reduce((s, r) => s + r.interventions.length, 0),
      wallMs: data.reduce((s, r) => s + r.wallMs, 0) }];
  }));
}
