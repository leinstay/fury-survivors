// Итоговые статы = базовые статы героя + пассивки.
// Сначала применяются все add, затем все mul (стат *= 1 + значение).
import { PASSIVES } from '../data/passives.js';

/**
 * @param {!Object<string, number>} base базовые статы героя
 * @param {!Array<{id: string, level: number}>} passives
 * @param {!Object<string, number>=} out объект для записи (переиспользуется)
 * @return {!Object<string, number>} out
 */
export function computeStats(base, passives, out = {}) {
  for (const k in base) out[k] = base[k];
  for (let i = 0; i < passives.length; i++) {
    const p = passives[i];
    const def = PASSIVES[p.id];
    if (!def || def.mode !== 'add' || p.level < 1) continue;
    out[def.stat] = (out[def.stat] || 0) + def.levels[Math.min(p.level, def.levels.length) - 1];
  }
  for (let i = 0; i < passives.length; i++) {
    const p = passives[i];
    const def = PASSIVES[p.id];
    if (!def || def.mode !== 'mul' || p.level < 1) continue;
    out[def.stat] = (out[def.stat] || 0) *
        (1 + def.levels[Math.min(p.level, def.levels.length) - 1]);
  }
  return out;
}
