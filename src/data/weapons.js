// Оружие. Строки интерфейса: weapon.<id>.name / weapon.<id>.desc (ключи выводятся из id).
// Формат записи:
// id: {
//   icon: 'icon_<id>',          // ключ иконки 24×24 в manifest.js
//   sprite: 'proj_blade_arc',    // ключ спрайта снаряда/эффекта
//   behavior: 'melee_arc',       // файл src/behaviors/weapons/<behavior>.js
//   dmgType: 'steel',            // 'steel' | 'magic': урон умножается на стат владельца этого типа
//   maxLevel: 5,
//   evolved: true,               // только у супероружия (см. combos.js); в карточки не попадает
//   tint: 0xff9040,              // цвет снарядов (необязательно)
//   levels: [                    // levels[0] = уровень 1; каждая следующая запись — полный набор чисел
//     { damage, cooldown, amount, area, speed, duration, pierce, knockback, ... },
//   ],
// }
// Смысл полей по behavior (damage умножается на steel или magic по dmgType, cooldown делится на haste,
// area и duration, если они есть в уровне, умножаются на статы area и duration владельца):
//   melee_arc  : amount — число взмахов подряд (чередуют стороны), area — длина удара, knockback
//   projectile : amount — число снарядов веером, speed, duration — время полёта, pierce — сколько врагов пробьёт сверх первого
//   orbit      : amount — число щитов, area — радиус орбиты, speed — рад/с, duration — сколько щиты активны, cooldown — пауза,
//                size — масштаб спрайта (по умолчанию 1), hitRadius — радиус попадания (по умолчанию WEAPON_BEHAVIOR.orbit.hitRadius)
//   aura       : area — радиус, cooldown — период удара по каждому врагу в зоне
//   boomerang  : amount — число топоров, area — дальность, speed, duration — предельное время жизни
//   chain      : amount — число молний, jumps — перескоков на следующего врага, area — дальность перескока, range — дальность цели
//   area_drop  : amount — число бомб, area — радиус взрыва, duration — время огня на земле, fireDamage — доля урона огня за тик

// Лестница радиусов колец: уровни Holy Ground, дальше ауры и удары супероружия (числа уровней, до стата area). Ауры и длина удара
// Blade Arc стоят ровно на ступенях, орбиты (щиты) так, что внешний край спрайта идёт по линии кольца
// (onRing). Щиты не растут: базовые на T2 (растут числом и скоростью, как в VS), защитные апгрейды на T1
// (ближе к герою, ловят больше снарядов), атакующие на T3. Проверяет tests/unit/data.test.js.
export const RINGS = [55, 62, 70, 78, 86, 95, 105, 115, 130, 150];
// Видимый радиус спрайта на орбите (px мира при size 1) по направлению от героя: шар щита без искр,
// у кинжала и полумесяца половина толщины (летят вдоль орбиты).
export const ORBIT_R = { proj_shield: 7, proj_axe: 10, proj_dagger: 4, proj_crescent: 27 };
// Радиус орбиты, при котором внешний край спрайта (r с учётом size) лежит на кольце k.
const onRing = (k, r) => Math.round(RINGS[k] - r);
const SHIELD_R = ORBIT_R.proj_shield;

// Общие числа behavior, одинаковые для всех оружий с этим behavior.
// targetRange — дальность поиска цели, hitRadius — радиус попадания снаряда, время в секундах.
export const WEAPON_BEHAVIOR = {
  projectile: { targetRange: 360, hitRadius: 5 },
  boomerang: { targetRange: 320, hitRadius: 10 },
  area_drop: { targetRange: 300, flight: 0.5, fireTick: 0.5 }, // flight — полёт бомбы, fireTick — период урона огня
  // молния рисуется звеньями-спрайтами: одно на linkStep px отрезка, не больше maxLinks, живут visualLife с
  // propWidth — полуширина удара молнии по разрушаемым объектам вдоль её пути, px.
  chain: { visualLife: 0.14, linkStep: 18, maxLinks: 7, propWidth: 4 },
  // hitRadius по умолчанию (перекрывается params.hitRadius; спрайт щита 22 px мира), rehit — повторный удар
  // того же щита по той же цели (у каждого щита свой таймер).
  orbit: { hitRadius: 12, rehit: 0.5 },
  // swingGap — пауза между взмахами серии, swingLife — время жизни взмаха, aimRange — дальность выбора цели (× area).
  // Удар конусом из героя: длина arcRadius × area, половина угла arcSpan° вокруг направления удара.
  // Картинка — край конуса, кусок кольца вокруг героя: внешняя дуга на arcRadius × area от середины тела
  // (bodyLift px над ногами), середина дуги на линии удара. Кадр спрайта (tools/make-slash.mjs): tex × tex px,
  // центр окружности в (texCenterX, tex / 2), внешний радиус texRadius, толщина полосы посередине texThickness;
  // spriteWorld — ширина кадра в мире при scale 1.
  melee_arc: {
    swingGap: 0.18, swingLife: 0.16, aimRange: 2.6,
    arcRadius: 1, arcSpan: 50, bodyLift: 22,
    tex: 256, texCenterX: 92, texRadius: 156, texThickness: 30, spriteWorld: 64,
  },
};

export const WEAPONS = {
  blade_arc: {
    // VS Whip: L1 10 урона / 1.35 с; L8 40 × 2 (обе стороны), area 120%. Наш урон за удар выше: ближний бой
    // бьёт сильнее дальнобойного (docs/BALANCE_AUDIT.md 6.4), а HP врагов удвоены; удар на 2 ступени колец длиннее.
    icon: 'icon_blade_arc', sprite: 'proj_blade_arc', behavior: 'melee_arc', dmgType: 'steel', maxLevel: 5,
    levels: [
      { damage: 20, cooldown: 1.0, amount: 1, area: RINGS[3], knockback: 90 },
      { damage: 20, cooldown: 1.0, amount: 2, area: RINGS[3], knockback: 90 },
      { damage: 30, cooldown: 0.9, amount: 2, area: RINGS[4], knockback: 100 },
      { damage: 46, cooldown: 0.85, amount: 2, area: RINGS[6], knockback: 110 },
      { damage: 56, cooldown: 0.8, amount: 2, area: RINGS[7], knockback: 120 },
    ],
  },
  throwing_daggers: {
    // VS Knife: L1 6.5 / 1.0 с, 1 нож; L8 16.5 × 6, pierce 3.
    icon: 'icon_throwing_daggers', sprite: 'proj_dagger', behavior: 'projectile', dmgType: 'steel', maxLevel: 5,
    levels: [
      { damage: 6, cooldown: 0.9, amount: 2, speed: 280,
        duration: 1.2, pierce: 1, knockback: 40 },
      { damage: 7, cooldown: 0.9, amount: 3, speed: 280,
        duration: 1.2, pierce: 1, knockback: 40 },
      { damage: 10, cooldown: 0.85, amount: 4, speed: 300,
        duration: 1.3, pierce: 2, knockback: 50 },
      { damage: 15, cooldown: 0.8, amount: 5, speed: 320,
        duration: 1.4, pierce: 3, knockback: 60 },
      { damage: 20, cooldown: 0.7, amount: 6, speed: 340,
        duration: 1.4, pierce: 3, knockback: 70 },
    ],
  },
  guardian_shields: {
    // VS King Bible: L1 10 урона, 1 книга, 3 с вращения, пауза 3 с; L8 30 × 4, 4 с.
    icon: 'icon_guardian_shields', sprite: 'proj_shield', behavior: 'orbit', dmgType: 'steel', maxLevel: 5,
    levels: [
      { damage: 12, cooldown: 2.0, amount: 2, area: onRing(1, SHIELD_R), hitRadius: 12,
        speed: 3.2, duration: 4.0, knockback: 40 },
      { damage: 15, cooldown: 2.0, amount: 3, area: onRing(1, SHIELD_R), hitRadius: 14,
        speed: 3.3, duration: 4.0, knockback: 40 },
      { damage: 22, cooldown: 1.9, amount: 4, area: onRing(1, SHIELD_R), hitRadius: 16,
        speed: 3.7, duration: 4.0, knockback: 45 },
      { damage: 30, cooldown: 1.7, amount: 5, area: onRing(1, SHIELD_R), hitRadius: 20,
        speed: 4.1, duration: 4.0, knockback: 50 },
      { damage: 36, cooldown: 1.6, amount: 6, area: onRing(1, SHIELD_R), hitRadius: 22,
        speed: 4.4, duration: 4.0, knockback: 55 },
    ],
  },
  holy_ground: {
    // VS Garlic: L1 5 урона раз в 1.3 с; L8 15 раз в 1.0 с, area 100% -> 200%. cooldown — период удара по врагу.
    icon: 'icon_holy_ground', sprite: 'proj_holy_ground', behavior: 'aura', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 10, cooldown: 1.04, area: RINGS[0], knockback: 15 },
      { damage: 12, cooldown: 1.0, area: RINGS[1], knockback: 15 },
      { damage: 20, cooldown: 0.92, area: RINGS[3], knockback: 20 },
      { damage: 28, cooldown: 0.84, area: RINGS[5], knockback: 25 },
      { damage: 30, cooldown: 0.8, area: RINGS[6], knockback: 30 },
    ],
  },
  war_axe: {
    // VS Axe: L1 20 / 4.0 с; L8 80 × 3, pierce 7. Наш топор возвращается и бьёт дважды, поэтому урон ниже.
    icon: 'icon_war_axe', sprite: 'proj_axe', behavior: 'boomerang', dmgType: 'steel', maxLevel: 5,
    levels: [
      { damage: 19, cooldown: 1.5, amount: 1, area: 110, speed: 200, duration: 4, knockback: 60 },
      { damage: 19, cooldown: 1.45, amount: 2, area: 120, speed: 210, duration: 4, knockback: 60 },
      { damage: 26, cooldown: 1.3, amount: 2, area: 145, speed: 230, duration: 4, knockback: 70 },
      { damage: 32, cooldown: 1.1, amount: 3, area: 170, speed: 250, duration: 4, knockback: 80 },
      { damage: 40, cooldown: 1.0, amount: 3, area: 185, speed: 260, duration: 4, knockback: 90 },
    ],
  },
  storm_chain: {
    // Молния бьёт (1 + jumps) врагов, всего amount × (1 + jumps) ударов за cooldown. Самая дальнобойная и бьёт
    // много целей, поэтому урон за удар у неё ниже всех (docs/BALANCE_AUDIT.md 6.4).
    icon: 'icon_storm_chain', sprite: 'proj_chain', behavior: 'chain', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 7, cooldown: 1.25, amount: 1, jumps: 2, area: 90, range: 230, knockback: 20 },
      { damage: 7, cooldown: 1.25, amount: 1, jumps: 3, area: 95, range: 240, knockback: 20 },
      { damage: 9, cooldown: 1.2, amount: 2, jumps: 4, area: 105, range: 260, knockback: 25 },
      { damage: 11, cooldown: 1.15, amount: 3, jumps: 4, area: 115, range: 280, knockback: 30 },
      { damage: 14, cooldown: 1.1, amount: 3, jumps: 4, area: 120, range: 290, knockback: 35 },
    ],
  },
  firebomb: {
    // VS Santa Water: L1 10 урона, 4.5 с, лужа 2 с с тиком 0.5 с; L8 40 × 4, 3 с, area 180%.
    // Взрыв бьёт на damage, огонь — damage × fireDamage раз в WEAPON_BEHAVIOR.area_drop.fireTick.
    icon: 'icon_firebomb', sprite: 'proj_firebomb', behavior: 'area_drop', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 10, cooldown: 3.0, amount: 1, area: 36,
        duration: 2.0, fireDamage: 0.5, knockback: 50 },
      { damage: 10, cooldown: 3.0, amount: 1, area: 40,
        duration: 2.2, fireDamage: 0.5, knockback: 50 },
      { damage: 15, cooldown: 2.8, amount: 2, area: 48,
        duration: 2.6, fireDamage: 0.5, knockback: 55 },
      { damage: 25, cooldown: 2.6, amount: 3, area: 56,
        duration: 2.9, fireDamage: 0.5, knockback: 60 },
      { damage: 30, cooldown: 2.5, amount: 3, area: 60,
        duration: 3.0, fireDamage: 0.5, knockback: 70 },
    ],
  },

  // Эволюции: оружие на maxLevel + своя пассивка (combos.js), существующие behavior с усиленными числами.
  // blade_arc + steel
  crimson_arc: {
    icon: 'icon_crimson_arc', sprite: 'proj_blade_arc', behavior: 'melee_arc', dmgType: 'steel', maxLevel: 1, evolved: true, tint: 0xff5050,
    levels: [
      { damage: 15, cooldown: 1.0, amount: 3, area: RINGS[7], knockback: 150 },
    ],
  },
  // throwing_daggers + haste
  thousand_edge: {
    icon: 'icon_thousand_edge', sprite: 'proj_dagger', behavior: 'projectile', dmgType: 'steel', maxLevel: 1, evolved: true,
    levels: [
      { damage: 34, cooldown: 0.3, amount: 3, speed: 420,
        duration: 1.4, pierce: 3, knockback: 50 },
    ],
  },
  // guardian_shields + armor
  aegis_bastion: {
    icon: 'icon_aegis_bastion', sprite: 'proj_shield', behavior: 'orbit', dmgType: 'steel', maxLevel: 1, evolved: true, tint: 0xa0c8ff,
    levels: [
      { damage: 22, cooldown: 0, amount: 6, area: onRing(0, SHIELD_R * 1.4), speed: 4.4,
        duration: 1e9, knockback: 160, size: 1.4, hitRadius: 14 },
    ],
  },
  // holy_ground + regen
  soul_garden: {
    icon: 'icon_soul_garden', sprite: 'proj_holy_ground', behavior: 'aura', dmgType: 'magic', maxLevel: 1, evolved: true, tint: 0x80ffa0,
    levels: [
      { damage: 22, cooldown: 0.7, area: RINGS[9], knockback: 40 },
    ],
  },
  // war_axe + crit
  death_spiral: {
    icon: 'icon_death_spiral', sprite: 'proj_axe', behavior: 'boomerang', dmgType: 'steel', maxLevel: 1, evolved: true, tint: 0xd0a0ff,
    levels: [
      { damage: 30, cooldown: 1.6, amount: 5, area: 210, speed: 300, duration: 4, knockback: 110 },
    ],
  },
  // storm_chain + luck
  thunder_loop: {
    icon: 'icon_thunder_loop', sprite: 'proj_chain', behavior: 'chain', dmgType: 'magic', maxLevel: 1, evolved: true,
    levels: [
      { damage: 35, cooldown: 1.0, amount: 4, jumps: 5, area: 140, range: 320, knockback: 45 },
    ],
  },
  // firebomb + pickup
  napalm_rain: {
    icon: 'icon_napalm_rain', sprite: 'proj_firebomb', behavior: 'area_drop', dmgType: 'magic', maxLevel: 1, evolved: true,
    levels: [
      { damage: 32, cooldown: 2.0, amount: 5, area: 72,
        duration: 3.8, fireDamage: 0.5, knockback: 80 },
    ],
  },
};
