// Реестр поведений по имени. Новое поведение = новый файл + строка здесь.
import { meleeArc } from './weapons/melee_arc.js';
import { projectile } from './weapons/projectile.js';
import { orbit } from './weapons/orbit.js';
import { aura } from './weapons/aura.js';
import { boomerang } from './weapons/boomerang.js';
import { chain } from './weapons/chain.js';
import { areaDrop } from './weapons/area_drop.js';
import { combo } from './weapons/combo.js';

import { chase } from './enemies/chase.js';
import { dash } from './enemies/dash.js';
import { ranged } from './enemies/ranged.js';
import { swarm } from './enemies/swarm.js';
import { phase } from './enemies/phase.js';
import { boss } from './enemies/boss.js';
import { drift } from './enemies/drift.js';

export const WEAPON_BEHAVIORS = {
  melee_arc: meleeArc,
  projectile,
  orbit,
  aura,
  boomerang,
  chain,
  area_drop: areaDrop,
  combo,
};

export const ENEMY_BEHAVIORS = { chase, dash, ranged, swarm, phase, boss, drift };
