import { XP, COMBAT } from '../../src/data/constants.js';
import { DIFFICULTIES } from '../../src/data/difficulty.js';
import { COOP } from '../../src/data/coop.js';
import { HEROES } from '../../src/data/heroes.js';
import { PASSIVES } from '../../src/data/passives.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { BOSSES } from '../../src/data/bosses.js';
import { forest } from '../../src/data/stages/forest.js';
import { simFingerprint } from '../../src/core/lockstep.js';

// Explicit experimental overrides are scoped to one synchronous run/replay, then restored.
export function installExperiment(experiment) {
  if (!experiment) return () => {};
  const saved = { xp: structuredClone(XP), cursed: structuredClone(DIFFICULTIES.cursed),
    coop: structuredClone(COOP), combat: { ...COMBAT },
    weapons: structuredClone(Object.fromEntries(Object.keys(experiment.weapons || {})
      .map((id) => [id, WEAPONS[id].levels]))),
    heroes: Object.fromEntries(Object.entries(HEROES).map(([id, h]) => [id, { ...h.stats }])),
    enemies: structuredClone(Object.fromEntries(Object.keys(experiment.enemies || {})
      .map((id) => [id, { ...ENEMIES[id] }]))),
    bosses: Object.fromEntries(Object.keys(experiment.bosses || {})
      .map((id) => [id, { ...BOSSES[id] }])),
    timeline: forest.timeline, scaling: { ...forest.scaling },
    passives: Object.fromEntries(Object.keys(experiment.passives || {})
      .map((id) => [id, PASSIVES[id].levels])),
    difficulty: structuredClone(DIFFICULTIES) };
  // passives: { id: [уровни] } — замена таблицы уровней; difficulty: { id: { поле: значение } }.
  for (const [id, lv] of Object.entries(experiment.passives || {})) PASSIVES[id].levels = lv;
  for (const [id, patch] of Object.entries(experiment.difficulty || {})) {
    Object.assign(DIFFICULTIES[id], patch);
  }
  // enemies / bosses: { id: { поле: значение } } — замена полей записи; timeline — весь таймлайн леса;
  // scaling — поля forest.scaling.
  for (const [id, p] of Object.entries(experiment.enemies || {})) Object.assign(ENEMIES[id], p);
  for (const [id, p] of Object.entries(experiment.bosses || {})) Object.assign(BOSSES[id], p);
  if (experiment.timeline) forest.timeline = experiment.timeline;
  if (experiment.scaling) Object.assign(forest.scaling, experiment.scaling);
  if (experiment.xp) Object.assign(XP, experiment.xp);
  if (experiment.cursedXP !== undefined) DIFFICULTIES.cursed.xpMul = experiment.cursedXP;
  if (experiment.coopXP !== undefined) COOP.xpMul = experiment.coopXP;
  if (experiment.coopLevelScale !== undefined) COOP.xpLevelScale = experiment.coopLevelScale;
  if (experiment.coop) Object.assign(COOP, experiment.coop);
  if (experiment.combat) Object.assign(COMBAT, experiment.combat);
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
  // heroSet: { heroId: { stat: значение } } — точная замена статов одного героя.
  for (const [id, stats] of Object.entries(experiment.heroSet || {})) {
    Object.assign(HEROES[id].stats, stats);
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
    Object.assign(COMBAT, saved.combat);
    for (const [id, levels] of Object.entries(saved.weapons)) WEAPONS[id].levels = levels;
    for (const [id, stats] of Object.entries(saved.heroes)) Object.assign(HEROES[id].stats, stats);
    for (const [id, def] of Object.entries(saved.enemies)) Object.assign(ENEMIES[id], def);
    for (const [id, def] of Object.entries(saved.bosses)) Object.assign(BOSSES[id], def);
    forest.timeline = saved.timeline;
    for (const [id, levels] of Object.entries(saved.passives)) PASSIVES[id].levels = levels;
    for (const [id, def] of Object.entries(saved.difficulty)) Object.assign(DIFFICULTIES[id], def);
    Object.assign(forest.scaling, saved.scaling);
    simFingerprint(true);
  };
}
