import { XP } from '../../src/data/constants.js';
import { DIFFICULTIES } from '../../src/data/difficulty.js';
import { COOP } from '../../src/data/coop.js';
import { HEROES } from '../../src/data/heroes.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { simFingerprint } from '../../src/core/lockstep.js';

// Explicit experimental overrides are scoped to one synchronous run/replay, then restored.
export function installExperiment(experiment) {
  if (!experiment) return () => {};
  const saved = { xp: structuredClone(XP), cursed: structuredClone(DIFFICULTIES.cursed),
    coop: structuredClone(COOP),
    weapons: structuredClone(Object.fromEntries(Object.keys(experiment.weapons || {})
      .map((id) => [id, WEAPONS[id].levels]))),
    heroes: Object.fromEntries(Object.entries(HEROES).map(([id, h]) => [id, { ...h.stats }])) };
  if (experiment.xp) Object.assign(XP, experiment.xp);
  if (experiment.cursedXP !== undefined) DIFFICULTIES.cursed.xpMul = experiment.cursedXP;
  if (experiment.coopXP !== undefined) COOP.xpMul = experiment.coopXP;
  if (experiment.coopLevelScale !== undefined) COOP.xpLevelScale = experiment.coopLevelScale;
  if (experiment.coop) Object.assign(COOP, experiment.coop);
  // weapons: { id: [патч уровня 1, патч уровня 2, ...] }, null — уровень без изменений.
  for (const [id, patches] of Object.entries(experiment.weapons || {})) {
    patches.forEach((patch, i) => {
      if (!patch) return;
      const { damageMul, ...rest } = patch; // damageMul — множитель текущего урона уровня
      const level = WEAPONS[id].levels[i];
      Object.assign(level, rest);
      if (damageMul) level.damage = Math.round(level.damage * damageMul);
    });
  }
  // heroStats: прибавка к базовым статам каждого героя, например { regen: 0.2 }.
  for (const [k, v] of Object.entries(experiment.heroStats || {})) {
    for (const h of Object.values(HEROES)) h.stats[k] += v;
  }
  simFingerprint(true);
  return () => {
    Object.assign(XP, saved.xp);
    Object.assign(DIFFICULTIES.cursed, saved.cursed);
    Object.assign(COOP, saved.coop);
    for (const [id, levels] of Object.entries(saved.weapons)) WEAPONS[id].levels = levels;
    for (const [id, stats] of Object.entries(saved.heroes)) Object.assign(HEROES[id].stats, stats);
    simFingerprint(true);
  };
}
