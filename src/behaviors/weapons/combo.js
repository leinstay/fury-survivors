// Супероружие из двух частей (коллаб двух оружий, как в HoloCure): в одном слоте работают два обычных behavior,
// у каждой части свои числа, спрайт и цвет. Запись в weapons.js:
//   parts: [{ behavior: 'boomerang', sprite: 'proj_axe', tint: 0xffa040, damage, cooldown, ... }, { ... }]
// damage части умножается на atk и на power супероружия (weapons.js, по умолчанию 1: подгонка силы коллаба
// без правки общих пресетов частей), cooldown делится на haste, как у обычного оружия.
// Урон обеих частей пишется на id супероружия; таймеры повторного попадания у частей разные (slot + 8 * номер).
import { WEAPON_BEHAVIORS } from '../index.js';

const SLOT_STRIDE = 8;

function refresh(sub, part, stats, power) {
  const p = sub.params;
  for (const k in part) if (k !== 'behavior' && k !== 'sprite' && k !== 'tint') p[k] = part[k];
  p.damage = part.damage * power * stats.atk;
  p.cooldown = part.cooldown / stats.haste;
}

export const combo = {
  init(w, sim) {
    w.parts = w.def.parts.map((part, i) => {
      const sub = {
        id: w.id, level: 1,
        def: { sprite: part.sprite, behavior: part.behavior },
        beh: WEAPON_BEHAVIORS[part.behavior],
        params: {}, slot: w.slot + SLOT_STRIDE * i, cooldown: 0.3 + 0.2 * i, tint: part.tint || 0,
        shields: null, p: null, t: 0, n: 0, q: 0, active: false, timer: 0, owner: w.owner,
        get removed() { return w.removed; },
      };
      refresh(sub, part, w.owner.stats, w.def.power || 1);
      if (sub.beh.init) sub.beh.init(sub, sim);
      return sub;
    });
  },
  update(w, sim, dt) {
    const st = w.owner.stats;
    for (let i = 0; i < w.parts.length; i++) {
      const sub = w.parts[i];
      refresh(sub, w.def.parts[i], st, w.def.power || 1);
      sim.projTint = sub.tint;
      sub.beh.update(sub, sim, dt);
    }
    sim.projTint = 0;
  },
};
