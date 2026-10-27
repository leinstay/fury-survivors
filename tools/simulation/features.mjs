import { COMBOS } from '../../src/data/combos.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';

// Модель выбора (model.mjs) обучена на людях до переименования пассивки armor → resistance: вес item:armor.
const MODEL_ID = { resistance: 'armor' };

export function cardKey(c) { return `${c.kind}:${c.id}`; }
export function cardFeatures(c, context, lastTake = '') {
  const w = context.w || [];
  const p = context.p || [];
  const own = (c.kind === 'weapon' ? w : p).find(([id]) => id === c.id);
  const primary = w.reduce((a, x) => !a || x[1] > a[1] ? x : a, null)?.[0];
  const ids = [...w, ...p].map(([id]) => id);
  const partner = COMBOS.some((r) => r.from.includes(c.id) &&
    r.from.some((id) => id !== c.id && ids.includes(id)));
  return {
    [`item:${MODEL_ID[c.id] || c.id}`]: 1, weapon: c.kind === 'weapon' ? 1 : 0,
    upgrade: own ? 1 : 0, weaponUpgrade: own && c.kind === 'weapon' ? 1 : 0,
    progress: own ? own[1] / (WEAPONS[c.id]?.maxLevel || PASSIVES[c.id]?.levels.length || 7) : 0,
    primary: c.id === primary ? 1 : 0, repeat: c.id === lastTake ? 1 : 0,
    partner: partner ? 1 : 0,
    defense: ['resistance', 'max_hp', 'regen'].includes(c.id) ? 1 : 0,
    crowdedWeapon: !own && c.kind === 'weapon' ? w.length / 6 : 0,
  };
}
export function linearScore(features, weights) {
  let s = 0;
  for (const [k, v] of Object.entries(features)) s += v * (weights[k] || 0);
  return s;
}
export function probabilities(scores, temperature = 1) {
  const max = Math.max(...scores);
  const exp = scores.map((s) => Math.exp((s - max) / Math.max(0.05, temperature)));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / sum);
}
