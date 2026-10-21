// Оружие. Строки интерфейса: weapon.<id>.name / weapon.<id>.desc (ключи выводятся из id).
// Формат записи:
// id: {
//   icon: 'icon_<id>',          // ключ иконки 24×24 в manifest.js
//   sprite: 'proj_blade_arc',    // ключ спрайта снаряда/эффекта
//   behavior: 'melee_arc',       // файл src/behaviors/weapons/<behavior>.js
//   maxLevel: 7,
//   evolved: true,               // только у супероружия (см. combos.js); в карточки не попадает
//   levels: [                    // levels[0] = уровень 1; каждая следующая запись — полный набор чисел
//     { damage, cooldown, amount, area, speed, duration, pierce, knockback, ... },
//   ],
// }
// Смысл полей по behavior (damage умножается на atk, cooldown делится на haste):
//   melee_arc  : amount — число взмахов подряд (чередуют стороны), area — длина удара, knockback
//   projectile : amount — число снарядов веером, speed, duration — время полёта, pierce — сколько врагов пробьёт сверх первого
//   orbit      : amount — число щитов, area — радиус орбиты, speed — рад/с, duration — сколько щиты активны, cooldown — пауза
//   aura       : area — радиус, cooldown — период удара по каждому врагу в зоне
//   boomerang  : amount — число топоров, area — дальность, speed, duration — предельное время жизни
//   chain      : amount — число молний, jumps — перескоков на следующего врага, area — дальность перескока, range — дальность цели
//   area_drop  : amount — число бомб, area — радиус взрыва, duration — время огня на земле, fireDamage — доля урона огня за тик

export const WEAPONS = {
  blade_arc: {
    icon: 'icon_blade_arc', sprite: 'proj_blade_arc', behavior: 'melee_arc', maxLevel: 7,
    levels: [
      { damage: 12, cooldown: 1.1, amount: 1, area: 52, knockback: 90 },
      { damage: 12, cooldown: 1.1, amount: 2, area: 52, knockback: 90 },
      { damage: 15, cooldown: 1.2, amount: 2, area: 48, knockback: 100 },
      { damage: 15, cooldown: 1.1, amount: 2, area: 60, knockback: 100 },
      { damage: 22, cooldown: 1.1, amount: 2, area: 60, knockback: 110 },
      { damage: 22, cooldown: 1.0, amount: 2, area: 72, knockback: 110 },
      { damage: 32, cooldown: 1.0, amount: 3, area: 72, knockback: 120 },
    ],
  },
  throwing_daggers: {
    icon: 'icon_throwing_daggers', sprite: 'proj_dagger', behavior: 'projectile', maxLevel: 7,
    levels: [
      { damage: 8, cooldown: 1.0, amount: 1, speed: 280, duration: 1.2, pierce: 0, knockback: 40 },
      { damage: 8, cooldown: 1.0, amount: 2, speed: 280, duration: 1.2, pierce: 0, knockback: 40 },
      { damage: 11, cooldown: 0.95, amount: 2, speed: 300, duration: 1.2, pierce: 0, knockback: 50 },
      { damage: 11, cooldown: 0.9, amount: 3, speed: 300, duration: 1.3, pierce: 0, knockback: 50 },
      { damage: 14, cooldown: 0.85, amount: 3, speed: 320, duration: 1.3, pierce: 1, knockback: 60 },
      { damage: 14, cooldown: 0.8, amount: 4, speed: 320, duration: 1.4, pierce: 1, knockback: 60 },
      { damage: 20, cooldown: 0.75, amount: 4, speed: 340, duration: 1.4, pierce: 2, knockback: 70 },
    ],
  },
  guardian_shields: {
    icon: 'icon_guardian_shields', sprite: 'proj_shield', behavior: 'orbit', maxLevel: 7,
    levels: [
      { damage: 12, cooldown: 2.5, amount: 2, area: 44, speed: 2.8, duration: 2.8, knockback: 80 },
      { damage: 12, cooldown: 2.4, amount: 2, area: 46, speed: 3.0, duration: 3.0, knockback: 80 },
      { damage: 14, cooldown: 2.2, amount: 2, area: 46, speed: 3.0, duration: 3.0, knockback: 90 },
      { damage: 14, cooldown: 2.0, amount: 3, area: 50, speed: 3.2, duration: 3.2, knockback: 90 },
      { damage: 17, cooldown: 1.9, amount: 3, area: 54, speed: 3.5, duration: 3.5, knockback: 100 },
      { damage: 17, cooldown: 1.8, amount: 4, area: 58, speed: 3.8, duration: 3.8, knockback: 100 },
      { damage: 22, cooldown: 1.5, amount: 4, area: 62, speed: 4.0, duration: 4.2, knockback: 110 },
    ],
  },
  holy_ground: {
    icon: 'icon_holy_ground', sprite: 'proj_holy_ground', behavior: 'aura', maxLevel: 7,
    levels: [
      { damage: 6, cooldown: 0.7, area: 55, knockback: 15 },
      { damage: 7, cooldown: 0.65, area: 62, knockback: 15 },
      { damage: 9, cooldown: 0.6, area: 70, knockback: 20 },
      { damage: 11, cooldown: 0.55, area: 78, knockback: 20 },
      { damage: 13, cooldown: 0.5, area: 86, knockback: 25 },
      { damage: 16, cooldown: 0.45, area: 95, knockback: 25 },
      { damage: 20, cooldown: 0.4, area: 105, knockback: 30 },
    ],
  },
  war_axe: {
    icon: 'icon_war_axe', sprite: 'proj_axe', behavior: 'boomerang', maxLevel: 7,
    levels: [
      { damage: 16, cooldown: 2.0, amount: 1, area: 110, speed: 200, duration: 4, knockback: 60 },
      { damage: 16, cooldown: 1.9, amount: 2, area: 120, speed: 210, duration: 4, knockback: 60 },
      { damage: 22, cooldown: 1.8, amount: 2, area: 130, speed: 220, duration: 4, knockback: 70 },
      { damage: 22, cooldown: 1.7, amount: 2, area: 145, speed: 230, duration: 4, knockback: 70 },
      { damage: 30, cooldown: 1.5, amount: 3, area: 155, speed: 240, duration: 4, knockback: 80 },
      { damage: 30, cooldown: 1.4, amount: 3, area: 170, speed: 250, duration: 4, knockback: 80 },
      { damage: 42, cooldown: 1.2, amount: 4, area: 185, speed: 260, duration: 4, knockback: 90 },
    ],
  },
  storm_chain: {
    icon: 'icon_storm_chain', sprite: 'proj_chain', behavior: 'chain', maxLevel: 7,
    levels: [
      { damage: 12, cooldown: 1.8, amount: 1, jumps: 2, area: 90, range: 230, knockback: 20 },
      { damage: 12, cooldown: 1.7, amount: 1, jumps: 3, area: 95, range: 240, knockback: 20 },
      { damage: 16, cooldown: 1.6, amount: 2, jumps: 3, area: 100, range: 250, knockback: 25 },
      { damage: 16, cooldown: 1.5, amount: 2, jumps: 4, area: 105, range: 260, knockback: 25 },
      { damage: 22, cooldown: 1.4, amount: 2, jumps: 5, area: 110, range: 270, knockback: 30 },
      { damage: 22, cooldown: 1.3, amount: 3, jumps: 5, area: 115, range: 280, knockback: 30 },
      { damage: 30, cooldown: 1.2, amount: 3, jumps: 6, area: 120, range: 290, knockback: 35 },
    ],
  },
  firebomb: {
    icon: 'icon_firebomb', sprite: 'proj_firebomb', behavior: 'area_drop', maxLevel: 7,
    levels: [
      { damage: 14, cooldown: 2.6, amount: 1, area: 36, duration: 1.5, fireDamage: 0.3, knockback: 50 },
      { damage: 14, cooldown: 2.5, amount: 1, area: 40, duration: 1.8, fireDamage: 0.3, knockback: 50 },
      { damage: 20, cooldown: 2.3, amount: 2, area: 44, duration: 2.0, fireDamage: 0.35, knockback: 55 },
      { damage: 20, cooldown: 2.1, amount: 2, area: 48, duration: 2.3, fireDamage: 0.35, knockback: 55 },
      { damage: 28, cooldown: 1.9, amount: 2, area: 54, duration: 2.6, fireDamage: 0.4, knockback: 60 },
      { damage: 28, cooldown: 1.7, amount: 3, area: 58, duration: 2.8, fireDamage: 0.4, knockback: 60 },
      { damage: 38, cooldown: 1.5, amount: 3, area: 64, duration: 3.2, fireDamage: 0.45, knockback: 70 },
    ],
  },

  // Супероружие: существующие behavior с усиленными числами.
  aegis_storm: {
    // Blade Arc + Guardian Shields: щиты-клинки, всегда активные.
    icon: 'icon_aegis_storm', sprite: 'proj_blade_arc', behavior: 'orbit', maxLevel: 1, evolved: true,
    levels: [
      { damage: 26, cooldown: 0, amount: 6, area: 70, speed: 4.5, duration: 1e9, knockback: 130 },
    ],
  },
  thunder_knives: {
    // Throwing Daggers + Storm Chain: град пробивающих клинков.
    icon: 'icon_thunder_knives', sprite: 'proj_dagger', behavior: 'projectile', maxLevel: 1, evolved: true,
    levels: [
      { damage: 26, cooldown: 0.45, amount: 6, speed: 380, duration: 1.5, pierce: 5, knockback: 80 },
    ],
  },
};
