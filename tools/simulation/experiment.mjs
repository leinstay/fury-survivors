import { XP } from '../../src/data/constants.js';
import { DIFFICULTIES } from '../../src/data/difficulty.js';
import { COOP } from '../../src/data/coop.js';
import { HEROES } from '../../src/data/heroes.js';
import { simFingerprint } from '../../src/core/lockstep.js';

// Explicit experimental overrides are scoped to one synchronous run/replay, then restored.
export function installExperiment(experiment) {
  if (!experiment) return () => {};
  const saved = { xp: structuredClone(XP), cursed: structuredClone(DIFFICULTIES.cursed),
    coop: structuredClone(COOP),
    heroes: Object.fromEntries(Object.entries(HEROES).map(([id, h]) => [id, { ...h.stats }])) };
  if (experiment.xp) Object.assign(XP, experiment.xp);
  if (experiment.cursedXP !== undefined) DIFFICULTIES.cursed.xpMul = experiment.cursedXP;
  if (experiment.coopXP !== undefined) COOP.xpMul = experiment.coopXP;
  if (experiment.coopLevelScale !== undefined) COOP.xpLevelScale = experiment.coopLevelScale;
  if (experiment.coop) Object.assign(COOP, experiment.coop);
  // heroStats: прибавка к базовым статам каждого героя, например { regen: 0.2 }.
  for (const [k, v] of Object.entries(experiment.heroStats || {})) {
    for (const h of Object.values(HEROES)) h.stats[k] += v;
  }
  simFingerprint(true);
  return () => {
    Object.assign(XP, saved.xp);
    Object.assign(DIFFICULTIES.cursed, saved.cursed);
    Object.assign(COOP, saved.coop);
    for (const [id, stats] of Object.entries(saved.heroes)) Object.assign(HEROES[id].stats, stats);
    simFingerprint(true);
  };
}
