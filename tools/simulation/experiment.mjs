import { XP } from '../../src/data/constants.js';
import { DIFFICULTIES } from '../../src/data/difficulty.js';
import { COOP } from '../../src/data/coop.js';
import { simFingerprint } from '../../src/core/lockstep.js';

// Explicit experimental overrides are scoped to one synchronous run/replay, then restored.
export function installExperiment(experiment) {
  if (!experiment) return () => {};
  const saved = { xp: structuredClone(XP), cursed: structuredClone(DIFFICULTIES.cursed),
    coop: structuredClone(COOP) };
  if (experiment.xp) Object.assign(XP, experiment.xp);
  if (experiment.cursedXP !== undefined) DIFFICULTIES.cursed.xpMul = experiment.cursedXP;
  if (experiment.coopXP !== undefined) COOP.xpMul = experiment.coopXP;
  if (experiment.coopLevelScale !== undefined) COOP.xpLevelScale = experiment.coopLevelScale;
  simFingerprint(true);
  return () => {
    Object.assign(XP, saved.xp);
    Object.assign(DIFFICULTIES.cursed, saved.cursed);
    Object.assign(COOP, saved.coop);
    simFingerprint(true);
  };
}
