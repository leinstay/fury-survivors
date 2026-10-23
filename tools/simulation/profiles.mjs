import { COMBOS } from '../../src/data/combos.js';

// Frozen human mixture: exploration profiles are never implicitly added to this population.
export const PROFILE_VERSION = 'human-provisional-2';
export const PROFILES = [
  { id: 'focus', weight: 0.25, intent: 'focus', collection: 'bank', bankSeconds: 75, reaction: 0.24, courage: 0.7, temperature: 0.65 },
  { id: 'evolution', weight: 0.25, intent: 'evolution', collection: 'opportunistic', reaction: 0.28, courage: 0.8,
    temperature: 0.7 },
  { id: 'collab', weight: 0.20, intent: 'collab', collection: 'bank', bankSeconds: 60, reaction: 0.32, courage: 0.8, temperature: 0.8 },
  { id: 'adaptive', weight: 0.20, intent: 'adaptive', collection: 'opportunistic', reaction: 0.36, courage: 0.7,
    temperature: 1 },
  { id: 'defensive', weight: 0.10, intent: 'defensive', collection: 'steady', reaction: 0.40, courage: 0.55,
    temperature: 0.85 },
];
export function recipeProfiles() {
  return COMBOS.map((c) => ({ id: `recipe:${c.result}`, intent: 'recipe', recipe: c.result,
    collection: 'opportunistic', reaction: 0.30, courage: 0.75, temperature: 0.6 }));
}
