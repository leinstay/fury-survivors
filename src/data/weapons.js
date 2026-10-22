// Оружие. Строки интерфейса: weapon.<id>.name / weapon.<id>.desc (ключи выводятся из id).
// Формат записи:
// id: {
//   icon: 'icon_<id>',          // ключ иконки 24×24 в manifest.js
//   sprite: 'proj_blade_arc',    // ключ спрайта снаряда/эффекта
//   behavior: 'melee_arc',       // файл src/behaviors/weapons/<behavior>.js
//   maxLevel: 7,
//   evolved: true,               // только у супероружия (см. combos.js); в карточки не попадает
//   tint: 0xff9040,              // цвет снарядов (необязательно)
//   parts: [...]                 // behavior 'combo': части коллаба, см. src/behaviors/weapons/combo.js
//   levels: [                    // levels[0] = уровень 1; каждая следующая запись — полный набор чисел
//     { damage, cooldown, amount, area, speed, duration, pierce, knockback, ... },
//   ],
// }
// Смысл полей по behavior (damage умножается на atk, cooldown делится на haste):
//   melee_arc  : amount — число взмахов подряд (чередуют стороны), area — длина удара, knockback
//   projectile : amount — число снарядов веером, speed, duration — время полёта, pierce — сколько врагов пробьёт сверх первого
//   orbit      : amount — число щитов, area — радиус орбиты, speed — рад/с, duration — сколько щиты активны, cooldown — пауза,
//                size — масштаб спрайта (по умолчанию 1), hitRadius — радиус попадания (по умолчанию WEAPON_BEHAVIOR.orbit.hitRadius)
//   aura       : area — радиус, cooldown — период удара по каждому врагу в зоне
//   boomerang  : amount — число топоров, area — дальность, speed, duration — предельное время жизни
//   chain      : amount — число молний, jumps — перескоков на следующего врага, area — дальность перескока, range — дальность цели
//   area_drop  : amount — число бомб, area — радиус взрыва, duration — время огня на земле, fireDamage — доля урона огня за тик

// Пресеты частей коллабов: behavior, спрайт и числа чуть выше максимального уровня исходного оружия
// (примерно 1.3-2× DPS уровня 7), коллаб целиком — примерно 1.5-2× суммы двух оружий уровня 7.
const B = { behavior: 'melee_arc', sprite: 'proj_blade_arc', damage: 42, cooldown: 1.0, amount: 2, area: 84, knockback: 130 };
const D = { behavior: 'projectile', sprite: 'proj_dagger', damage: 22, cooldown: 0.6, amount: 5, speed: 360, duration: 1.5, pierce: 3, knockback: 80 };
const S = { behavior: 'orbit', sprite: 'proj_shield', damage: 25, cooldown: 0, amount: 5, area: 66, speed: 4.2, duration: 1e9, knockback: 120 };
const H = { behavior: 'aura', sprite: 'proj_holy_ground', damage: 18, cooldown: 0.9, area: 115, knockback: 35 };
const A = { behavior: 'boomerang', sprite: 'proj_axe', damage: 28, cooldown: 1.8, amount: 3, area: 195, speed: 270, duration: 4, knockback: 100 };
const C = { behavior: 'chain', sprite: 'proj_chain', damage: 36, cooldown: 2.5, amount: 2, jumps: 5, area: 125, range: 300, knockback: 40 };
const F = { behavior: 'area_drop', sprite: 'proj_firebomb', damage: 34, cooldown: 2.0, amount: 3, area: 70, duration: 3.5, fireDamage: 0.5, knockback: 80 };
const part = (base, over, tint) => ({ ...base, ...over, ...(tint ? { tint } : {}) });

// Общие числа behavior, одинаковые для всех оружий с этим behavior (и для частей коллабов).
// targetRange — дальность поиска цели, hitRadius — радиус попадания снаряда, время в секундах.
export const WEAPON_BEHAVIOR = {
  projectile: { targetRange: 360, hitRadius: 5 },
  boomerang: { targetRange: 320, hitRadius: 10 },
  area_drop: { targetRange: 300, flight: 0.5, fireTick: 0.5 }, // flight — полёт бомбы, fireTick — период урона огня
  // молния рисуется звеньями-спрайтами: одно на linkStep px отрезка, не больше maxLinks, живут visualLife с
  chain: { visualLife: 0.14, linkStep: 18, maxLinks: 7 },
  orbit: { hitRadius: 10, rehit: 0.5 },                        // hitRadius по умолчанию (перекрывается params.hitRadius), rehit — повторный удар щита
  // swingGap — пауза между взмахами серии, swingLife — время жизни взмаха, aimRange — дальность выбора цели (× area).
  // Удар конусом из героя: длина arcRadius × area, половина угла arcSpan° вокруг направления удара.
  // Картинка — край конуса, кусок кольца вокруг героя: внешняя дуга на arcRadius × area от середины тела
  // (bodyLift px над ногами), середина дуги на линии удара. Кадр спрайта (tools/make-slash.mjs): tex × tex px,
  // центр окружности в (texCenterX, tex / 2), внешний радиус texRadius, толщина полосы посередине texThickness;
  // spriteWorld — ширина кадра в мире при scale 1.
  melee_arc: {
    swingGap: 0.18, swingLife: 0.16, aimRange: 2.2,
    arcRadius: 1.2, arcSpan: 50, bodyLift: 22,
    tex: 256, texCenterX: 92, texRadius: 156, texThickness: 30, spriteWorld: 64,
  },
};

export const WEAPONS = {
  blade_arc: {
    // VS Whip: L1 10 урона / 1.35 с; L8 40 × 2 (обе стороны), area 120%.
    icon: 'icon_blade_arc', sprite: 'proj_blade_arc', behavior: 'melee_arc', maxLevel: 7,
    levels: [
      { damage: 10, cooldown: 1.35, amount: 1, area: 52, knockback: 90 },
      { damage: 10, cooldown: 1.35, amount: 2, area: 52, knockback: 90 },
      { damage: 15, cooldown: 1.3, amount: 2, area: 56, knockback: 100 },
      { damage: 15, cooldown: 1.3, amount: 2, area: 60, knockback: 100 },
      { damage: 22, cooldown: 1.25, amount: 2, area: 62, knockback: 110 },
      { damage: 28, cooldown: 1.2, amount: 2, area: 66, knockback: 110 },
      { damage: 36, cooldown: 1.2, amount: 2, area: 72, knockback: 120 },
    ],
  },
  throwing_daggers: {
    // VS Knife: L1 6.5 / 1.0 с, 1 нож; L8 16.5 × 6, pierce 3.
    icon: 'icon_throwing_daggers', sprite: 'proj_dagger', behavior: 'projectile', maxLevel: 7,
    levels: [
      { damage: 7, cooldown: 1.0, amount: 1, speed: 280,
        duration: 1.2, pierce: 0, knockback: 40 },
      { damage: 7, cooldown: 1.0, amount: 2, speed: 280,
        duration: 1.2, pierce: 0, knockback: 40 },
      { damage: 10, cooldown: 1.0, amount: 2, speed: 300,
        duration: 1.2, pierce: 1, knockback: 50 },
      { damage: 10, cooldown: 0.95, amount: 3, speed: 300,
        duration: 1.3, pierce: 1, knockback: 50 },
      { damage: 13, cooldown: 0.95, amount: 3, speed: 320,
        duration: 1.3, pierce: 2, knockback: 60 },
      { damage: 13, cooldown: 0.9, amount: 4, speed: 320,
        duration: 1.4, pierce: 2, knockback: 60 },
      { damage: 16, cooldown: 0.9, amount: 5, speed: 340,
        duration: 1.4, pierce: 3, knockback: 70 },
    ],
  },
  guardian_shields: {
    // VS King Bible: L1 10 урона, 1 книга, 3 с вращения, пауза 3 с; L8 30 × 4, 4 с.
    icon: 'icon_guardian_shields', sprite: 'proj_shield', behavior: 'orbit', maxLevel: 7,
    levels: [
      { damage: 10, cooldown: 3.0, amount: 1, area: 44, speed: 2.8, duration: 3.0, knockback: 80 },
      { damage: 10, cooldown: 3.0, amount: 2, area: 46, speed: 3.0, duration: 3.0, knockback: 80 },
      { damage: 14, cooldown: 3.0, amount: 2, area: 48, speed: 3.2, duration: 3.2, knockback: 90 },
      { damage: 14, cooldown: 3.0, amount: 3, area: 50, speed: 3.4, duration: 3.4, knockback: 90 },
      { damage: 18, cooldown: 2.8, amount: 3, area: 54, speed: 3.6, duration: 3.6, knockback: 100 },
      { damage: 22, cooldown: 2.8, amount: 4, area: 58, speed: 3.8, duration: 3.8, knockback: 100 },
      { damage: 26, cooldown: 2.6, amount: 4, area: 62, speed: 4.0, duration: 4.0, knockback: 110 },
    ],
  },
  holy_ground: {
    // VS Garlic: L1 5 урона раз в 1.3 с; L8 15 раз в 1.0 с, area 100% -> 200%. cooldown — период удара по врагу.
    icon: 'icon_holy_ground', sprite: 'proj_holy_ground', behavior: 'aura', maxLevel: 7,
    levels: [
      { damage: 5, cooldown: 1.3, area: 55, knockback: 15 },
      { damage: 6, cooldown: 1.25, area: 62, knockback: 15 },
      { damage: 7, cooldown: 1.2, area: 70, knockback: 20 },
      { damage: 9, cooldown: 1.15, area: 78, knockback: 20 },
      { damage: 11, cooldown: 1.1, area: 86, knockback: 25 },
      { damage: 13, cooldown: 1.05, area: 95, knockback: 25 },
      { damage: 15, cooldown: 1.0, area: 105, knockback: 30 },
    ],
  },
  war_axe: {
    // VS Axe: L1 20 / 4.0 с; L8 80 × 3, pierce 7. Наш топор возвращается и бьёт дважды, поэтому урон ниже.
    icon: 'icon_war_axe', sprite: 'proj_axe', behavior: 'boomerang', maxLevel: 7,
    levels: [
      { damage: 12, cooldown: 3.0, amount: 1, area: 110, speed: 200, duration: 4, knockback: 60 },
      { damage: 12, cooldown: 2.9, amount: 2, area: 120, speed: 210, duration: 4, knockback: 60 },
      { damage: 17, cooldown: 2.8, amount: 2, area: 130, speed: 220, duration: 4, knockback: 70 },
      { damage: 17, cooldown: 2.6, amount: 2, area: 145, speed: 230, duration: 4, knockback: 70 },
      { damage: 20, cooldown: 2.4, amount: 3, area: 155, speed: 240, duration: 4, knockback: 80 },
      { damage: 20, cooldown: 2.2, amount: 3, area: 170, speed: 250, duration: 4, knockback: 80 },
      { damage: 25, cooldown: 2.0, amount: 3, area: 185, speed: 260, duration: 4, knockback: 90 },
    ],
  },
  storm_chain: {
    // VS Lightning Ring: L1 15 × 2 удара / 4.5 с; L8 65 × 6 / 4.5 с (~87 DPS на всю толпу).
    // Молния бьёт (1 + jumps) врагов, всего amount × (1 + jumps) ударов за cooldown.
    icon: 'icon_storm_chain', sprite: 'proj_chain', behavior: 'chain', maxLevel: 7,
    levels: [
      { damage: 12, cooldown: 3.5, amount: 1, jumps: 1, area: 90, range: 230, knockback: 20 },
      { damage: 12, cooldown: 3.4, amount: 1, jumps: 2, area: 95, range: 240, knockback: 20 },
      { damage: 16, cooldown: 3.3, amount: 1, jumps: 2, area: 100, range: 250, knockback: 25 },
      { damage: 16, cooldown: 3.2, amount: 2, jumps: 2, area: 105, range: 260, knockback: 25 },
      { damage: 21, cooldown: 3.1, amount: 2, jumps: 3, area: 110, range: 270, knockback: 30 },
      { damage: 24, cooldown: 3.0, amount: 2, jumps: 3, area: 115, range: 280, knockback: 30 },
      { damage: 28, cooldown: 3.0, amount: 2, jumps: 4, area: 120, range: 290, knockback: 35 },
    ],
  },
  firebomb: {
    // VS Santa Water: L1 10 урона, 4.5 с, лужа 2 с с тиком 0.5 с; L8 40 × 4, 3 с, area 180%.
    // Взрыв бьёт на damage, огонь — damage × fireDamage раз в WEAPON_BEHAVIOR.area_drop.fireTick.
    icon: 'icon_firebomb', sprite: 'proj_firebomb', behavior: 'area_drop', maxLevel: 7,
    levels: [
      { damage: 10, cooldown: 3.0, amount: 1, area: 36,
        duration: 2.0, fireDamage: 0.5, knockback: 50 },
      { damage: 10, cooldown: 3.0, amount: 1, area: 40,
        duration: 2.2, fireDamage: 0.5, knockback: 50 },
      { damage: 15, cooldown: 2.9, amount: 2, area: 44,
        duration: 2.4, fireDamage: 0.5, knockback: 55 },
      { damage: 15, cooldown: 2.8, amount: 2, area: 48,
        duration: 2.6, fireDamage: 0.5, knockback: 55 },
      { damage: 20, cooldown: 2.7, amount: 2, area: 52,
        duration: 2.8, fireDamage: 0.5, knockback: 60 },
      { damage: 25, cooldown: 2.6, amount: 3, area: 56,
        duration: 2.9, fireDamage: 0.5, knockback: 60 },
      { damage: 30, cooldown: 2.5, amount: 3, area: 60,
        duration: 3.0, fireDamage: 0.5, knockback: 70 },
    ],
  },

  // Супероружие: существующие behavior с усиленными числами.
  aegis_storm: {
    // Blade Arc + Guardian Shields: щиты-клинки, всегда активные.
    icon: 'icon_aegis_storm', sprite: 'proj_crescent', behavior: 'orbit', maxLevel: 1, evolved: true,
    levels: [
      { damage: 36, cooldown: 0, amount: 6, area: 70, speed: 4.5,
        duration: 1e9, knockback: 130, size: 0.45, hitRadius: 14 },
    ],
  },
  thunder_knives: {
    // Throwing Daggers + Storm Chain: град пробивающих клинков.
    icon: 'icon_thunder_knives', sprite: 'proj_dagger', behavior: 'projectile', maxLevel: 1, evolved: true,
    levels: [
      { damage: 22, cooldown: 0.6, amount: 6, speed: 380,
        duration: 1.5, pierce: 5, knockback: 80 },
    ],
  },

  // Коллабы двух оружий (behavior combo: обе части работают в одном слоте) и эволюции оружие + пассивка (как в VS).
  // Части коллаба: пресеты B D S H A C F выше с поправками.
  // blade_arc + throwing_daggers
  phantom_blades: {
    icon: 'icon_phantom_blades', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(B, {}, 0xc8b8ff), part(D, { amount: 6 }, 0xc8b8ff)],
  },
  // blade_arc + holy_ground
  sacred_edge: {
    icon: 'icon_sacred_edge', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(B, { damage: 50 }, 0xffe080), part(H, {}, 0xffe080)],
  },
  // blade_arc + war_axe
  reaper_crescent: {
    icon: 'icon_reaper_crescent', sprite: 'proj_crescent', behavior: 'boomerang', maxLevel: 1, evolved: true, tint: 0xff9090,
    levels: [
      { damage: 46, cooldown: 1.1, amount: 4, area: 200, speed: 280, duration: 4, knockback: 130 },
    ],
  },
  // blade_arc + storm_chain
  storm_edge: {
    icon: 'icon_storm_edge', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(B, {}, 0x90d8ff), part(C, {}, 0x90d8ff)],
  },
  // blade_arc + firebomb
  inferno_slash: {
    icon: 'icon_inferno_slash', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(B, {}, 0xff9040), part(F, { amount: 2 })],
  },
  // throwing_daggers + guardian_shields
  knife_carousel: {
    icon: 'icon_knife_carousel', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(S, { amount: 8, area: 58, sprite: 'proj_dagger' }), part(D, {})],
  },
  // throwing_daggers + holy_ground
  holy_rain: {
    icon: 'icon_holy_rain', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(D, { amount: 6 }, 0xffe080), part(H, {})],
  },
  // throwing_daggers + war_axe
  gale_cutters: {
    icon: 'icon_gale_cutters', sprite: 'proj_dagger', behavior: 'boomerang', maxLevel: 1, evolved: true, tint: 0xb0ffd0,
    levels: [
      { damage: 26, cooldown: 1.2, amount: 6, area: 190, speed: 300, duration: 4, knockback: 80 },
    ],
  },
  // throwing_daggers + firebomb
  ember_knives: {
    icon: 'icon_ember_knives', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(D, {}, 0xff9040), part(F, {})],
  },
  // guardian_shields + holy_ground
  sanctuary: {
    icon: 'icon_sanctuary', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [
      part(H, { damage: 30, area: 130 }),
      part(S, { damage: 30, area: 125, amount: 6 }, 0xffe080),
    ],
  },
  // guardian_shields + war_axe
  bulwark_spin: {
    icon: 'icon_bulwark_spin', sprite: 'proj_axe', behavior: 'orbit', maxLevel: 1, evolved: true,
    levels: [
      { damage: 30, cooldown: 0, amount: 5, area: 74, speed: 4.6, duration: 1e9, knockback: 140 },
    ],
  },
  // guardian_shields + storm_chain
  tesla_ward: {
    icon: 'icon_tesla_ward', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(S, {}, 0x90d8ff), part(C, {})],
  },
  // guardian_shields + firebomb
  comet_ring: {
    icon: 'icon_comet_ring', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(S, {}, 0xff9040), part(F, {})],
  },
  // holy_ground + war_axe
  judgement_wheel: {
    icon: 'icon_judgement_wheel', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(A, { damage: 36 }, 0xffe080), part(H, {})],
  },
  // holy_ground + storm_chain
  divine_storm: {
    icon: 'icon_divine_storm', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(H, {}, 0x90d8ff), part(C, { amount: 3 })],
  },
  // holy_ground + firebomb
  hellfire: {
    icon: 'icon_hellfire', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(H, { damage: 21 }, 0xff7040), part(F, {})],
  },
  // war_axe + storm_chain
  thunder_axe: {
    icon: 'icon_thunder_axe', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(A, { damage: 34 }, 0x90d8ff), part(C, {})],
  },
  // war_axe + firebomb
  blast_axe: {
    icon: 'icon_blast_axe', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(A, {}, 0xff9040), part(F, {})],
  },
  // storm_chain + firebomb
  plasma_storm: {
    icon: 'icon_plasma_storm', behavior: 'combo', maxLevel: 1, evolved: true,
    levels: [{ damage: 0, cooldown: 1 }],
    parts: [part(C, { jumps: 7 }, 0xff80ff), part(F, {}, 0xff80ff)],
  },
  // blade_arc + attack
  crimson_arc: {
    icon: 'icon_crimson_arc', sprite: 'proj_blade_arc', behavior: 'melee_arc', maxLevel: 1, evolved: true, tint: 0xff5050,
    levels: [
      { damage: 36, cooldown: 1.0, amount: 3, area: 96, knockback: 150 },
    ],
  },
  // throwing_daggers + haste
  thousand_edge: {
    icon: 'icon_thousand_edge', sprite: 'proj_dagger', behavior: 'projectile', maxLevel: 1, evolved: true,
    levels: [
      { damage: 20, cooldown: 0.3, amount: 3, speed: 420,
        duration: 1.4, pierce: 3, knockback: 50 },
    ],
  },
  // guardian_shields + armor
  aegis_bastion: {
    icon: 'icon_aegis_bastion', sprite: 'proj_shield', behavior: 'orbit', maxLevel: 1, evolved: true, tint: 0xa0c8ff,
    levels: [
      { damage: 22, cooldown: 0, amount: 6, area: 72, speed: 4.4,
        duration: 1e9, knockback: 160, size: 1.4, hitRadius: 14 },
    ],
  },
  // holy_ground + regen
  soul_garden: {
    icon: 'icon_soul_garden', sprite: 'proj_holy_ground', behavior: 'aura', maxLevel: 1, evolved: true, tint: 0x80ffa0,
    levels: [
      { damage: 22, cooldown: 0.7, area: 150, knockback: 40 },
    ],
  },
  // war_axe + crit
  death_spiral: {
    icon: 'icon_death_spiral', sprite: 'proj_axe', behavior: 'boomerang', maxLevel: 1, evolved: true, tint: 0xd0a0ff,
    levels: [
      { damage: 30, cooldown: 1.6, amount: 5, area: 210, speed: 300, duration: 4, knockback: 110 },
    ],
  },
  // storm_chain + luck
  thunder_loop: {
    icon: 'icon_thunder_loop', sprite: 'proj_chain', behavior: 'chain', maxLevel: 1, evolved: true,
    levels: [
      { damage: 40, cooldown: 2.4, amount: 3, jumps: 3, area: 140, range: 320, knockback: 45 },
    ],
  },
  // firebomb + pickup
  napalm_rain: {
    icon: 'icon_napalm_rain', sprite: 'proj_firebomb', behavior: 'area_drop', maxLevel: 1, evolved: true,
    levels: [
      { damage: 32, cooldown: 2.0, amount: 5, area: 72,
        duration: 3.8, fireDamage: 0.5, knockback: 80 },
    ],
  },
};
