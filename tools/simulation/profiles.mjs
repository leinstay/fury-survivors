import { COMBOS } from '../../src/data/combos.js';

// Frozen human mixture: exploration profiles are never implicitly added to this population.
export const PROFILE_VERSION = 'human-provisional-4';
export const PROFILES = [
  { id: 'focus', weight: 0.25, intent: 'focus', collection: 'bank', bankSeconds: 75, reaction: 0.24, courage: 0.7, temperature: 0.65 },
  // Коллабов больше нет (docs/META.md 1.4): бывший профиль collab влит в evolution.
  { id: 'evolution', weight: 0.45, intent: 'evolution', collection: 'opportunistic', reaction: 0.28, courage: 0.8,
    temperature: 0.7 },
  { id: 'adaptive', weight: 0.20, intent: 'adaptive', collection: 'opportunistic', reaction: 0.36, courage: 0.7,
    temperature: 1 },
  { id: 'defensive', weight: 0.10, intent: 'defensive', collection: 'steady', reaction: 0.40, courage: 0.55,
    temperature: 0.85 },
];
export function recipeProfiles() {
  return COMBOS.map((c) => ({ id: `recipe:${c.result}`, intent: 'recipe', recipe: c.result,
    collection: 'opportunistic', reaction: 0.30, courage: 0.75, temperature: 0.6 }));
}

// Билды для метрики клира (targets.mjs): бот выбирает пассивки по профилю, оружие как обычно.
// Вес прибавляется к оценке карточки пассивки; glass — весь фокус в урон, tank — в защиту, mid — без перекоса.
export const BUILD_BIAS = {
  glass: { attack: 3, magic: 3, crit: 3, crit_dmg: 3, haste: 2.5, area: 2, duration: 1.5,
    max_hp: -4, armor: -4, regen: -4, dodge: -4, thorns: -4, speed: -1, pickup: -1, luck: 1 },
  mid: {},
  // tank: 4 защитные пассивки (как «полный» билд в defense.mjs), остальные слоты как у mid
  tank: { max_hp: 3, armor: 3, regen: 3, dodge: 3 },
};
export const BUILD_PROFILES = Object.keys(BUILD_BIAS).map((build) => ({ id: build, build,
  intent: 'evolution', collection: 'opportunistic', reaction: 0.28, courage: 0.8, temperature: 0.7 }));
