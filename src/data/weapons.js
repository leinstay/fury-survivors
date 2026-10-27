// Оружие. Строки интерфейса: weapon.<id>.name / weapon.<id>.desc (ключи выводятся из id).
// Формат записи:
// id: {
//   icon: 'icon_<id>',          // ключ иконки 24×24 в manifest.js
//   sprite: 'proj_blade_arc',    // ключ спрайта снаряда/эффекта
//   behavior: 'melee_arc',       // файл src/behaviors/weapons/<behavior>.js
//   dmgType: 'attack',            // 'attack' | 'magic': урон умножается на стат владельца этого типа
//   maxLevel: 5,
//   evolved: true,               // только у супероружия (см. combos.js); в карточки не попадает
//   tint: 0xff9040,              // цвет снарядов (необязательно)
//   levels: [                    // levels[0] = уровень 1; каждая следующая запись — полный набор чисел
//     { damage, cooldown, amount, area, speed, duration, pierce, knockback, ... },
//   ],
// }
// Смысл полей по behavior (damage умножается на attack или magic по dmgType, cooldown делится на haste,
// area и duration, если они есть в уровне, умножаются на статы area и duration владельца):
//   melee_arc  : amount — число взмахов подряд (чередуют стороны), area — длина удара, knockback
//   projectile : amount — число снарядов веером, speed, duration — время полёта, pierce — сколько врагов пробьёт сверх первого
//   orbit      : amount — число щитов, area — радиус орбиты, speed — рад/с, duration — сколько щиты активны, cooldown — пауза,
//                size — масштаб спрайта (по умолчанию 1), hitRadius — радиус попадания (по умолчанию WEAPON_BEHAVIOR.orbit.hitRadius)
//   aura       : area — радиус, cooldown — период удара по каждому врагу в зоне
//   boomerang  : amount — число топоров, area — дальность, speed, duration — предельное время жизни
//   chain      : amount — число молний, jumps — перескоков на следующего врага, area — дальность перескока, range — дальность цели
//   area_drop  : amount — число бомб, area — радиус взрыва, duration — время огня на земле, fireDamage — доля урона огня за тик
//                (нет или 0 — огня нет); delay — время полёта (по умолчанию WEAPON_BEHAVIOR.area_drop.flight);
//                fall — падает сверху с высоты fall px с кругом-предупреждением (метеор);
//                mine: true — мина: ложится в spread px от героя, лежит duration с, взрывается, когда враг подошёл на trigger px
//   projectile : + pierceAll: true — пробивает всех; hitRadius — радиус попадания (по умолчанию WEAPON_BEHAVIOR.projectile)
//   orbit      : + slow, slowTime — задетые враги ходят со скоростью × slow ещё slowTime с (behaviors/status.js);
//                blocks: false — не ловит вражеские снаряды
//   aura       : knockback 0 — враги не выталкиваются и стоят в зоне (ядовитое облако)
//   beam       : луч по направлению движения героя. duration — сколько горит, cooldown — пауза, tick — период удара,
//                damage — урон за тик каждому врагу на луче, area — длина, width — полуширина, amount — лучей поровну по кругу
//   summon     : amount — огоньков за героем, каждый стреляет раз в cooldown: damage, speed, duration — полёт, pierce;
//                снаряд выстрела — спрайт shot записи оружия

// Лестница радиусов колец: уровни Holy Ground, дальше ауры и удары супероружия (числа уровней, до стата area). Ауры и длина удара
// Blade Arc стоят ровно на ступенях, орбиты (щиты) так, что внешний край спрайта идёт по линии кольца
// (onRing). Щиты не растут: базовые на T2 (растут числом и скоростью, как в VS), защитные апгрейды на T1
// (ближе к герою, ловят больше снарядов), атакующие на T3. Проверяет tests/unit/data.test.js.
export const RINGS = [55, 62, 70, 78, 86, 95, 105, 115, 130, 150];
// Видимый радиус спрайта на орбите (px мира при size 1) по направлению от героя: шар щита без искр,
// у кинжала и полумесяца половина толщины (летят вдоль орбиты).
export const ORBIT_R = { proj_shield: 7, proj_axe: 10, proj_dagger: 4, proj_crescent: 27,
    proj_frost: 10 };
// Радиус орбиты, при котором внешний край спрайта (r с учётом size) лежит на кольце k.
const onRing = (k, r) => Math.round(RINGS[k] - r);
const SHIELD_R = ORBIT_R.proj_shield;
const FROST_R = ORBIT_R.proj_frost;

// Общие числа behavior, одинаковые для всех оружий с этим behavior.
// targetRange — дальность поиска цели, hitRadius — радиус попадания снаряда, время в секундах.
export const WEAPON_BEHAVIOR = {
  projectile: { targetRange: 360, hitRadius: 5 },
  boomerang: { targetRange: 320, hitRadius: 10 },
  // flight — полёт бомбы, fireTick — период урона огня. Метеор (fall): fallSlant — доля высоты, на которую он смещён
  // вбок в начале падения; markTint — цвет круга-предупреждения; lead — упреждение (× путь врага за время падения),
  // не дальше leadMax расстояния до героя.
  area_drop: { targetRange: 300, flight: 0.5, fireTick: 0.5, fallSlant: 0.4,
    markTint: 0xff7040, lead: 0.8, leadMax: 0.6 },
  // segment — длина звена картинки луча, px мира; alpha — прозрачность звеньев.
  beam: { segment: 14, alpha: 0.9 },
  // Огоньки: targetRange — дальность цели от огонька, hitRadius — радиус выстрела, orbitR — радиус круга вокруг героя,
  // flatten — круг сжат по вертикали, lift — высота над ногами, orbitSpeed — рад/с, follow — сила догоняния (1/с),
  // retry — повтор поиска цели, если её нет.
  summon: { targetRange: 260, hitRadius: 4, orbitR: 22, flatten: 0.6, lift: 14,
    orbitSpeed: 2.2, follow: 6, retry: 0.15 },
  // Замедление (orbit slow): босс получает только (1 - bossResist) от доли замедления.
  slow: { bossResist: 0.5 },
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
    icon: 'icon_blade_arc', sprite: 'proj_blade_arc', behavior: 'melee_arc', dmgType: 'attack', maxLevel: 5,
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
    icon: 'icon_throwing_daggers', sprite: 'proj_dagger', behavior: 'projectile', dmgType: 'attack', maxLevel: 5,
    levels: [
      { damage: 8, cooldown: 0.9, amount: 2, speed: 280,
        duration: 1.2, pierce: 1, knockback: 40 },
      { damage: 9, cooldown: 0.9, amount: 3, speed: 280,
        duration: 1.2, pierce: 1, knockback: 40 },
      { damage: 13, cooldown: 0.85, amount: 4, speed: 300,
        duration: 1.3, pierce: 2, knockback: 50 },
      { damage: 20, cooldown: 0.8, amount: 5, speed: 320,
        duration: 1.4, pierce: 3, knockback: 60 },
      { damage: 26, cooldown: 0.7, amount: 6, speed: 340,
        duration: 1.4, pierce: 3, knockback: 70 },
    ],
  },
  guardian_shields: {
    // VS King Bible: L1 10 урона, 1 книга, 3 с вращения, пауза 3 с; L8 30 × 4, 4 с.
    icon: 'icon_guardian_shields', sprite: 'proj_shield', behavior: 'orbit', dmgType: 'attack', maxLevel: 5,
    levels: [
      { damage: 18, cooldown: 2.0, amount: 2, area: onRing(1, SHIELD_R), hitRadius: 12,
        speed: 3.2, duration: 4.0, knockback: 40 },
      { damage: 23, cooldown: 2.0, amount: 3, area: onRing(1, SHIELD_R), hitRadius: 14,
        speed: 3.3, duration: 4.0, knockback: 40 },
      { damage: 33, cooldown: 1.9, amount: 4, area: onRing(1, SHIELD_R), hitRadius: 16,
        speed: 3.7, duration: 4.0, knockback: 45 },
      { damage: 45, cooldown: 1.7, amount: 5, area: onRing(1, SHIELD_R), hitRadius: 20,
        speed: 4.1, duration: 4.0, knockback: 50 },
      { damage: 54, cooldown: 1.6, amount: 6, area: onRing(1, SHIELD_R), hitRadius: 22,
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
    icon: 'icon_war_axe', sprite: 'proj_axe', behavior: 'boomerang', dmgType: 'attack', maxLevel: 5,
    levels: [
      { damage: 15, cooldown: 1.5, amount: 1, area: 110, speed: 200, duration: 4, knockback: 60 },
      { damage: 15, cooldown: 1.45, amount: 2, area: 120, speed: 210, duration: 4, knockback: 60 },
      { damage: 21, cooldown: 1.3, amount: 2, area: 145, speed: 230, duration: 4, knockback: 70 },
      { damage: 26, cooldown: 1.1, amount: 3, area: 170, speed: 250, duration: 4, knockback: 80 },
      { damage: 32, cooldown: 1.0, amount: 3, area: 185, speed: 260, duration: 4, knockback: 90 },
    ],
  },
  storm_chain: {
    // Молния бьёт (1 + jumps) врагов, всего amount × (1 + jumps) ударов за cooldown. Самая дальнобойная и бьёт
    // много целей, поэтому урон за удар у неё ниже всех (docs/BALANCE_AUDIT.md 6.4).
    icon: 'icon_storm_chain', sprite: 'proj_chain', behavior: 'chain', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 20, cooldown: 1.25, amount: 1, jumps: 2, area: 90, range: 230, knockback: 20 },
      { damage: 20, cooldown: 1.25, amount: 1, jumps: 3, area: 95, range: 240, knockback: 20 },
      { damage: 26, cooldown: 1.2, amount: 2, jumps: 4, area: 105, range: 260, knockback: 25 },
      { damage: 31, cooldown: 1.15, amount: 3, jumps: 4, area: 115, range: 280, knockback: 30 },
      { damage: 41, cooldown: 1.1, amount: 3, jumps: 4, area: 120, range: 290, knockback: 35 },
    ],
  },
  firebomb: {
    // VS Santa Water: L1 10 урона, 4.5 с, лужа 2 с с тиком 0.5 с; L8 40 × 4, 3 с, area 180%.
    // Взрыв бьёт на damage, огонь — damage × fireDamage раз в WEAPON_BEHAVIOR.area_drop.fireTick.
    icon: 'icon_firebomb', sprite: 'proj_firebomb', behavior: 'area_drop', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 7, cooldown: 3.0, amount: 1, area: 36,
        duration: 2.0, fireDamage: 0.5, knockback: 50 },
      { damage: 7, cooldown: 3.0, amount: 1, area: 40,
        duration: 2.2, fireDamage: 0.5, knockback: 50 },
      { damage: 11, cooldown: 2.8, amount: 2, area: 48,
        duration: 2.6, fireDamage: 0.5, knockback: 55 },
      { damage: 17, cooldown: 2.6, amount: 3, area: 56,
        duration: 2.9, fireDamage: 0.5, knockback: 60 },
      { damage: 21, cooldown: 2.5, amount: 3, area: 60,
        duration: 3.0, fireDamage: 0.5, knockback: 70 },
    ],
  },

  // META 1.4: новые оружия. Сталь: копьё, молот, арбалет, мины; магия: ледяной шар, ядовитое облако, луч, огонёк, метеор.
  spear: {
    // Пробивает всех на линии; один-три снаряда, медленнее ножей. Урон за удар между ножами и арбалетом.
    icon: 'icon_spear', sprite: 'proj_spear', behavior: 'projectile', dmgType: 'attack', maxLevel: 5,
    levels: [
      { damage: 10, cooldown: 1.3, amount: 1, speed: 260, duration: 1.1, pierceAll: true,
        hitRadius: 6, knockback: 30 },
      { damage: 12, cooldown: 1.25, amount: 1, speed: 270, duration: 1.15, pierceAll: true,
        hitRadius: 6, knockback: 30 },
      { damage: 16, cooldown: 1.15, amount: 2, speed: 280, duration: 1.2, pierceAll: true,
        hitRadius: 7, knockback: 35 },
      { damage: 22, cooldown: 1.05, amount: 2, speed: 300, duration: 1.25, pierceAll: true,
        hitRadius: 7, knockback: 40 },
      { damage: 27, cooldown: 0.95, amount: 3, speed: 320, duration: 1.3, pierceAll: true,
        hitRadius: 8, knockback: 45 },
    ],
  },
  hammer: {
    // Медленный тяжёлый удар конусом: самый большой урон за удар и knockback (ближний бой, docs/BALANCE_AUDIT.md 6.4).
    // Картинка — взмах клинка с цветом молота.
    icon: 'icon_hammer', sprite: 'proj_blade_arc', behavior: 'melee_arc', dmgType: 'attack', maxLevel: 5, tint: 0xd8b070,
    levels: [
      { damage: 36, cooldown: 1.7, amount: 1, area: RINGS[4], knockback: 220 },
      { damage: 42, cooldown: 1.6, amount: 1, area: RINGS[4], knockback: 230 },
      { damage: 60, cooldown: 1.5, amount: 1, area: RINGS[5], knockback: 240 },
      { damage: 86, cooldown: 1.4, amount: 2, area: RINGS[6], knockback: 250 },
      { damage: 110, cooldown: 1.3, amount: 2, area: RINGS[7], knockback: 260 },
    ],
  },
  crossbow: {
    // Один быстрый болт с большим уроном в ближайшего врага; с L4 два.
    icon: 'icon_crossbow', sprite: 'proj_bolt', behavior: 'projectile', dmgType: 'attack', maxLevel: 5,
    levels: [
      { damage: 65, cooldown: 1.4, amount: 1, speed: 440, duration: 0.9, pierce: 0, knockback: 70 },
      { damage: 79, cooldown: 1.35, amount: 1, speed: 440, duration: 0.9, pierce: 1,
        knockback: 70 },
      { damage: 108, cooldown: 1.25, amount: 1, speed: 460, duration: 1.0, pierce: 1,
        knockback: 80 },
      { damage: 146, cooldown: 1.15, amount: 2, speed: 480, duration: 1.0, pierce: 1,
        knockback: 90 },
      { damage: 178, cooldown: 1.05, amount: 2, speed: 500, duration: 1.0, pierce: 2,
        knockback: 100 },
    ],
  },
  mines: {
    // Мины вокруг героя ждут врага до duration с; взрыв без огня.
    icon: 'icon_mines', sprite: 'proj_mine', behavior: 'area_drop', dmgType: 'attack', maxLevel: 5,
    levels: [
      { damage: 25, cooldown: 2.2, amount: 1, area: 40, duration: 8, mine: true, trigger: 14,
        spread: 90, knockback: 80 },
      { damage: 29, cooldown: 2.1, amount: 2, area: 42, duration: 8, mine: true, trigger: 14,
        spread: 95, knockback: 80 },
      { damage: 37, cooldown: 2.0, amount: 2, area: 46, duration: 9, mine: true, trigger: 15,
        spread: 100, knockback: 90 },
      { damage: 48, cooldown: 1.9, amount: 3, area: 50, duration: 9, mine: true, trigger: 16,
        spread: 105, knockback: 100 },
      { damage: 60, cooldown: 1.8, amount: 3, area: 54, duration: 10, mine: true, trigger: 16,
        spread: 110, knockback: 110 },
    ],
  },
  frost_orb: {
    // Ледяные шары на орбите: урон ниже щитов, зато задетые враги замедляются. Снаряды не ловят.
    icon: 'icon_frost_orb', sprite: 'proj_frost', behavior: 'orbit', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 21, cooldown: 2.5, amount: 2, area: onRing(2, FROST_R), hitRadius: 14,
        speed: 2.4, duration: 4.0,
        knockback: 10, slow: 0.6, slowTime: 1.0, blocks: false },
      { damage: 25, cooldown: 2.4, amount: 2, area: onRing(2, FROST_R), hitRadius: 15,
        speed: 2.5, duration: 4.5,
        knockback: 10, slow: 0.6, slowTime: 1.0, blocks: false },
      { damage: 34, cooldown: 2.2, amount: 3, area: onRing(3, FROST_R), hitRadius: 16,
        speed: 2.6, duration: 5.0,
        knockback: 10, slow: 0.55, slowTime: 1.1, blocks: false },
      { damage: 48, cooldown: 2.0, amount: 3, area: onRing(3, FROST_R), hitRadius: 17,
        speed: 2.7, duration: 5.0,
        knockback: 15, slow: 0.5, slowTime: 1.1, blocks: false },
      { damage: 59, cooldown: 1.8, amount: 4, area: onRing(4, FROST_R), hitRadius: 18,
        speed: 2.8, duration: 5.5,
        knockback: 15, slow: 0.45, slowTime: 1.2, blocks: false },
    ],
  },
  poison_cloud: {
    // Облако вокруг героя: частые тики яда (cooldown — период тика), без отбрасывания: враги остаются в облаке.
    icon: 'icon_poison_cloud', sprite: 'proj_poison_cloud', behavior: 'aura', dmgType: 'magic', maxLevel: 5, tint: 0x9be04a,
    levels: [
      { damage: 7, cooldown: 0.4, area: RINGS[1], knockback: 0 },
      { damage: 10, cooldown: 0.4, area: RINGS[2], knockback: 0 },
      { damage: 12, cooldown: 0.36, area: RINGS[3], knockback: 0 },
      { damage: 17, cooldown: 0.34, area: RINGS[5], knockback: 0 },
      { damage: 19, cooldown: 0.32, area: RINGS[6], knockback: 0 },
    ],
  },
  beam: {
    // Луч вперёд по ходу: горит duration, бьёт всех на линии каждые tick с; с L2 второй луч назад.
    icon: 'icon_beam', sprite: 'proj_beam', behavior: 'beam', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 25, cooldown: 1.2, duration: 2.0, tick: 0.2, area: 120, width: 10, amount: 1,
        knockback: 0 },
      { damage: 25, cooldown: 1.2, duration: 2.0, tick: 0.2, area: 125, width: 10, amount: 2,
        knockback: 0 },
      { damage: 32, cooldown: 1.1, duration: 2.2, tick: 0.2, area: 135, width: 11, amount: 2,
        knockback: 0 },
      { damage: 40, cooldown: 1.0, duration: 2.4, tick: 0.2, area: 145, width: 11, amount: 2,
        knockback: 0 },
      { damage: 52, cooldown: 0.9, duration: 2.6, tick: 0.2, area: 155, width: 12, amount: 2,
        knockback: 0 },
    ],
  },
  wisp: {
    // Огоньки летают за героем и сами стреляют в ближайшего к себе врага.
    icon: 'icon_wisp', sprite: 'proj_wisp', shot: 'proj_wisp_shot', behavior: 'summon', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 29, cooldown: 0.9, amount: 1, speed: 240, duration: 1.2, pierce: 0, knockback: 20 },
      { damage: 31, cooldown: 0.9, amount: 2, speed: 250, duration: 1.2, pierce: 0, knockback: 20 },
      { damage: 35, cooldown: 0.9, amount: 2, speed: 260, duration: 1.2, pierce: 1, knockback: 25 },
      { damage: 44, cooldown: 0.85, amount: 3, speed: 270, duration: 1.3, pierce: 1,
        knockback: 25 },
      { damage: 58, cooldown: 0.8, amount: 4, speed: 280, duration: 1.3, pierce: 2, knockback: 30 },
    ],
  },
  meteor: {
    // Долгое падение (delay) с кругом-предупреждением и большой урон по площади; огня нет.
    icon: 'icon_meteor', sprite: 'proj_meteor', behavior: 'area_drop', dmgType: 'magic', maxLevel: 5,
    levels: [
      { damage: 48, cooldown: 3.5, amount: 1, area: 44, delay: 1.2, fall: 160, knockback: 120 },
      { damage: 58, cooldown: 3.4, amount: 1, area: 48, delay: 1.2, fall: 160, knockback: 120 },
      { damage: 77, cooldown: 3.2, amount: 2, area: 52, delay: 1.15, fall: 170, knockback: 130 },
      { damage: 101, cooldown: 3.0, amount: 2, area: 58, delay: 1.1, fall: 180, knockback: 140 },
      { damage: 132, cooldown: 2.8, amount: 3, area: 64, delay: 1.1, fall: 190, knockback: 150 },
    ],
  },

  // Эволюции: оружие на maxLevel + своя пассивка (combos.js), существующие behavior с усиленными числами.
  // blade_arc + attack
  crimson_arc: {
    icon: 'icon_crimson_arc', sprite: 'proj_blade_arc', behavior: 'melee_arc', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xff5050,
    levels: [
      { damage: 52, cooldown: 1.0, amount: 3, area: RINGS[7], knockback: 150 },
    ],
  },
  // throwing_daggers + haste
  thousand_edge: {
    icon: 'icon_thousand_edge', sprite: 'proj_dagger', behavior: 'projectile', dmgType: 'attack', maxLevel: 1, evolved: true,
    levels: [
      { damage: 34, cooldown: 0.3, amount: 3, speed: 420,
        duration: 1.4, pierce: 3, knockback: 50 },
    ],
  },
  // guardian_shields + armor
  aegis_bastion: {
    icon: 'icon_aegis_bastion', sprite: 'proj_shield', behavior: 'orbit', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xa0c8ff,
    levels: [
      { damage: 211, cooldown: 0, amount: 6, area: onRing(0, SHIELD_R * 1.4), speed: 4.4,
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
    icon: 'icon_death_spiral', sprite: 'proj_axe', behavior: 'boomerang', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xd0a0ff,
    levels: [
      { damage: 34, cooldown: 1.6, amount: 5, area: 210, speed: 300, duration: 4, knockback: 110 },
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
      { damage: 12, cooldown: 2.0, amount: 5, area: 72,
        duration: 3.8, fireDamage: 0.5, knockback: 80 },
    ],
  },
  // spear + crit_dmg
  dragon_lance: {
    icon: 'icon_dragon_lance', sprite: 'proj_spear', behavior: 'projectile', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xffb040,
    levels: [
      { damage: 22, cooldown: 0.8, amount: 4, speed: 360, duration: 1.4, pierceAll: true,
        hitRadius: 10, knockback: 50 },
    ],
  },
  // hammer + max_hp
  titan_maul: {
    icon: 'icon_titan_maul', sprite: 'proj_blade_arc', behavior: 'melee_arc', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xffd060,
    levels: [
      { damage: 70, cooldown: 1.2, amount: 3, area: RINGS[8], knockback: 320 },
    ],
  },
  // crossbow + dodge
  ballista: {
    icon: 'icon_ballista', sprite: 'proj_bolt', behavior: 'projectile', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xa0e0ff,
    levels: [
      { damage: 113, cooldown: 0.9, amount: 3, speed: 560, duration: 1.1, pierce: 4,
        knockback: 110 },
    ],
  },
  // mines + duration
  minefield: {
    icon: 'icon_minefield', sprite: 'proj_mine', behavior: 'area_drop', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xff6060,
    levels: [
      { damage: 38, cooldown: 1.5, amount: 5, area: 64, duration: 14, mine: true, trigger: 18,
        spread: 130, knockback: 120 },
    ],
  },
  // frost_orb + area
  blizzard: {
    icon: 'icon_blizzard', sprite: 'proj_frost', behavior: 'orbit', dmgType: 'magic', maxLevel: 1, evolved: true, tint: 0xc0f0ff,
    levels: [
      { damage: 71, cooldown: 0, amount: 5, area: onRing(3, FROST_R * 1.3), size: 1.3,
        hitRadius: 22, speed: 3.0,
        duration: 1e9, knockback: 20, slow: 0.35, slowTime: 1.5, blocks: false },
    ],
  },
  // poison_cloud + magic
  miasma: {
    icon: 'icon_miasma', sprite: 'proj_poison_cloud', behavior: 'aura', dmgType: 'magic', maxLevel: 1, evolved: true, tint: 0xb060ff,
    levels: [
      { damage: 11, cooldown: 0.25, area: RINGS[8], knockback: 0 },
    ],
  },
  // beam + speed
  prism_ray: {
    icon: 'icon_prism_ray', sprite: 'proj_beam', behavior: 'beam', dmgType: 'magic', maxLevel: 1, evolved: true, tint: 0xff80ff,
    levels: [
      { damage: 19, cooldown: 0.3, duration: 4, tick: 0.15, area: 190, width: 10, amount: 4,
        knockback: 0 },
    ],
  },
  // wisp + xp_gain
  spirit_choir: {
    icon: 'icon_spirit_choir', sprite: 'proj_wisp', shot: 'proj_wisp_shot', behavior: 'summon', dmgType: 'magic', maxLevel: 1,
    evolved: true, tint: 0x80ffd0,
    levels: [
      { damage: 41, cooldown: 0.6, amount: 5, speed: 300, duration: 1.3, pierce: 2, knockback: 30 },
    ],
  },
  // meteor + thorns
  starfall: {
    icon: 'icon_starfall', sprite: 'proj_meteor', behavior: 'area_drop', dmgType: 'magic', maxLevel: 1, evolved: true, tint: 0xfff080,
    levels: [
      { damage: 84, cooldown: 2.4, amount: 5, area: 76, delay: 1.0, fall: 200, knockback: 160 },
    ],
  },
};
