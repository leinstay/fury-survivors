import { FX } from './constants.js';

// Окружность выхода оружия вокруг героя (constants.js FX.weaponOrigin).
const WO = FX.weaponOrigin;

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
//   status: { type: 'burning', chance: 0.35 },  // необязательно: ДоТ после удара (src/data/status.js);
//                                // может стоять и в уровне (уровень главнее записи оружия)
//   targets: 'aoe',              // целей за удар: 'aoe' — область/толпа, 'cleave' — несколько в линию, дугу или цепь,
//                                // 'single' — одна; чем больше целей, тем меньше урон на цель (две лестницы:
//                                // клир и одна цель/босс, tools/simulation/ladder.mjs LADDER.tags, docs/BALANCE_AUDIT.md 13)
//   bloom: 'early',              // необязательно: 'early' — сильно в начале и теряет актуальность к 15:00, 'late' —
//                                // наоборот; лестница сравнивает такое оружие в его окне минут (LADDER.bloom)
//   levels: [                    // levels[0] = уровень 1; каждая следующая запись — полный набор чисел
//     { damage, cooldown, amount, area, speed, duration, pierce, knockback, ... },
//   ],
// }
// Смысл полей по behavior (damage умножается на attack или magic по dmgType, cooldown делится на haste,
// area и duration, если они есть в уровне, умножаются на статы area и duration владельца):
//   melee_arc  : amount — число взмахов подряд (чередуют стороны), area — длина удара, knockback
//   slash      : росчерк клинка через самую плотную группу врагов рядом с героем (behaviors/weapons/slash.js):
//                area — длина отрезка, width — ширина полосы (оба растут со статом area), sweep — за сколько секунд
//                полоса проводится от начала к концу (бьёт каждого задетого один раз), amount — слэшей в серии
//                (по следующим группам или крест-накрест через одну), knockback — от линии
//   projectile : amount — число снарядов веером, speed, duration — время полёта, pierce — сколько врагов пробьёт сверх первого
//   orbit      : amount — число щитов, area — радиус орбиты, speed — рад/с, duration — сколько щиты активны, cooldown — пауза,
//                size — масштаб спрайта (по умолчанию 1), hitRadius — радиус попадания (по умолчанию WEAPON_BEHAVIOR.orbit.hitRadius)
//   aura       : area — радиус, cooldown — период удара по каждому врагу в зоне
//   boomerang  : amount — число топоров, area — дальность, speed, duration — предельное время жизни
//   chain      : amount — число молний, jumps — перескоков на следующего врага, area — дальность перескока, range — дальность цели
//   area_drop  : amount — число бомб, area — радиус взрыва, duration — время огня на земле, fireDamage — доля урона огня за тик
//                (нет или 0 — огня нет); delay — время полёта (по умолчанию WEAPON_BEHAVIOR.area_drop.flight);
//                fall — падает сверху с высоты fall px с кругом-предупреждением (метеор);
//                mine: true — мина: ложится в spread px от героя, лежит duration с, взрывается, когда враг подошёл на trigger px (первые area_drop.mineArm с на земле не срабатывает)
//   projectile : + pierceAll: true — пробивает всех; hitRadius — радиус попадания (по умолчанию WEAPON_BEHAVIOR.projectile)
//   orbit      : + slow, slowTime — задетые враги ходят со скоростью × slow ещё slowTime с (behaviors/status.js);
//                blocks: false — не ловит вражеские снаряды
//   aura       : knockback 0 — враги не выталкиваются и стоят в зоне
//   cloud      : облако ложится в точку героя и стоит duration с, бьёт каждого врага внутри раз в tick на damage;
//                area — радиус; amount — облаков, у каждого свой таймер cooldown, первые идут со сдвигом
//                cooldown / amount (одно облако — раз в cooldown); облака одного оружия бьют врага не чаще tick
//   beam       : «змейка»: раз в cooldown amount лучей с окружности выхода оружия в случайные стороны (RNG сима,
//                по сектору 360/amount на луч); голова летит со speed, тело растёт до length px (не area: стат area
//                не влияет) и ползёт за головой. Бьёт только голова: враг или объект — damage, поворот на 90°
//                в случайную сторону, урон × bounceDamageMul, длина вдвое; bounces — отскоков, после них луч гаснет
//   summon     : amount — огоньков за героем, каждый стреляет раз в cooldown: damage, speed, duration — полёт, pierce;
//                снаряд выстрела — спрайт shot записи оружия
//   slam       : удар по земле (молот): серия из amount ударов, первый со сдвигом к ближайшему врагу, следующие дальше
//                по той же линии; area — радиус удара (бьёт один раз, отбрасывает от центра), knockback; на месте удара
//                трещина радиусом area × WEAPON_BEHAVIOR.slam.crack на duration с: враги в ней ходят со скоростью × slow,
//                ещё slowTime с после выхода; трещина гаснет к концу
//   impale     : копьё в ближайшего врага: speed, duration — полёт, hitRadius; пробивает 1 + pierce врагов и
//                пригвождает каждого на pin с (стоит на месте, боссы вполсилы); потом втыкается в землю;
//                burst — радиус взрыва воткнувшегося копья (урон damage, пригвождение), необязательно
//   ice_orb    : amount крупных медленных шаров к ближайшему врагу: area — радиус шара, speed, duration — время жизни;
//                пробивает всех, бьёт каждого внутри раз в tick на damage и замораживает (скорость × slow ещё
//                slowTime с); turn — рад/с, шары закручиваются спиралью и выходят во все стороны (необязательно)

// Лестница радиусов колец: уровни Holy Ground, дальше ауры и удары супероружия (числа уровней, до стата area). Ауры и длина удара
// конуса (melee_arc) стоят ровно на ступенях, орбиты (щиты) так, что внешний край спрайта идёт по линии кольца
// (onRing). Щиты не растут: базовые на T5 (растут числом и скоростью, как в VS), Aegis на T6 — далеко от
// героя и медленно, чтобы ловили лишь часть пуль. Проверяет tests/unit/data.test.js.
export const RINGS = [55, 62, 70, 78, 86, 95, 105, 115, 130, 150];
// Видимый радиус спрайта на орбите (px мира при size 1) по направлению от героя: шар щита без искр,
// у кинжала и полумесяца половина толщины (летят вдоль орбиты).
export const ORBIT_R = { proj_shield: 7, proj_axe: 10, proj_dagger: 4, proj_crescent: 27,
    proj_frost: 10 };
// Радиус орбиты, при котором внешний край спрайта (r с учётом size) лежит на кольце k.
const onRing = (k, r) => Math.round(RINGS[k] - r);
const SHIELD_R = ORBIT_R.proj_shield;

// Общие числа behavior, одинаковые для всех оружий с этим behavior.
// targetRange — дальность поиска цели, hitRadius — радиус попадания снаряда, время в секундах.
export const WEAPON_BEHAVIOR = {
  projectile: { targetRange: 360, hitRadius: 5 },
  boomerang: { targetRange: 320, hitRadius: 10 },
  // flight — полёт бомбы, fireTick — период урона огня. Метеор (fall): fallSlant — доля высоты, на которую он смещён
  // вбок в начале падения; markTint — цвет круга-предупреждения; lead — упреждение (× путь врага за время падения),
  // не дальше leadMax расстояния до героя.
  // mineArm — мина на земле первые столько секунд не срабатывает от касания (всегда ложится и ждёт).
  // Метеор: точки удара одного залпа не ближе meteorGap × area (круги не сливаются), meteorTries попыток найти
  // другую цель, иначе точка по кругу вокруг первой. Спрайт метеора прежний (процедурная лента отложена).
  area_drop: { targetRange: 300, flight: 0.5, fireTick: 0.5, fallSlant: 0.4,
    markTint: 0xff7040, lead: 0.8, leadMax: 0.6, mineArm: 0.5,
    meteorGap: 2, meteorTries: 6 },
  // Луч-змейка (behaviors/weapons/beam.js): first — первый каст; hitRadius — радиус головы; bounceDamageMul —
  // урон × столько за отскок; maxTravel — путь головы, px, после которого луч гаснет (не живёт вечно); fade —
  // угасание в конце, с (хвост догоняет голову); shrink — px/с, с которыми хвост догоняет вдвое укороченную длину.
  // Луч выходит с окружности выхода оружия (FX.weaponOrigin), удар считается по земле от ног, картинка поднята
  // на lift. Картинка (render/zones.js, fx 'snake') как у Victory Sword: halfWidth — полуширина у головы, px;
  // mid / core — доля полуширины середины и ядра (ядро не тоньше coreMin), их alpha; taper — сужение к хвосту
  // (степень); color / midColor / coreColor — шлейф, середина (без tint), ядро сложением цвета.
  // maxAlive — больше змеек одного оружия на экране не бывает (залп добирает до него), решение владельца.
  // targetRange / retry — цель луча как у молнии (storm_chain range 230–260): без цели залп ждёт retry с.
  beam: { first: 0.3, targetRange: 250, retry: 0.15, hitRadius: 5, maxAlive: 6,
    bounceDamageMul: 0.75, maxTravel: 420, fade: 0.22, shrink: 260,
    lift: WO.lift, halfWidth: 4, mid: 0.45, core: 0.2, coreMin: 0.75,
    trailAlpha: 0.35, midAlpha: 0.75, coreAlpha: 1, taper: 0.8,
    color: 0xdcecff, midColor: 0xf0f7ff, coreColor: 0xffffff },
  // Облако: first — первое облако после взятия; spriteWorld — ширина кадра спрайта в мире при scale 1;
  // alpha — прозрачность, fadeIn / fadeOut — появление и угасание, с; propRange — врагов ближе нет, объект
  // ближе есть: облако ложится на объект, а не под героя.
  cloud: { first: 0.3, spriteWorld: 64, alpha: 1, fadeIn: 0.3, fadeOut: 0.6, propRange: 120 },
  // Огоньки: targetRange — дальность цели от огонька, hitRadius — радиус выстрела, orbitR — радиус круга вокруг героя,
  // flatten — круг сжат по вертикали, lift — высота центра круга над ногами, follow — сила
  // догоняния (1/с), retry — повтор поиска цели, если её нет. Огоньки кружат снаружи окружности выхода оружия:
  // центр круга — центр тела (WO.lift), orbitR = WO.radius + видимый радиус огонька (proj_wisp 28 px текстуры при
  // density 2 → 7 px) + 1, круг не сжат (иначе сверху и снизу огонёк заходит в тело).
  // Огоньки не кружат: у каждого своё место на окружности (угол по номеру, первый сверху-справа) и он медленно
  // блуждает вокруг него (wander px, wanderSpeed — рад/с, три синуса с разными частотами на огонёк).
  summon: { targetRange: 260, hitRadius: 5, shotTurn: 10, orbitR: WO.radius + 8, flatten: 1,
    lift: WO.lift, slotAngle: -0.7, wander: 7, wanderSpeed: 1.3, follow: 6, retry: 0.15 },
  // Замедление (orbit slow) задаётся статусом chill; боссы к нему иммунны.
  slow: {},  // боссы иммунны к замедлению (behaviors/status.js)
  // Молния: каждый прыжок — снаряд-картинка (fx 'bolt', render/zones.js), живёт visualLife с и гаснет. Рваная
  // ломаная: сегмент на segLen px, но не меньше minSegs и не больше maxSegs; изломы поперёк линии на
  // jitter × (0.5..1) px попеременно в разные стороны (форма от uid, не RNG сима), форма меняется каждые flicker с
  // (мерцание); halo — полуширина голубого ореола (color, haloAlpha), core — толщина белого ядра (coreColor);
  // flash — радиус вспышки в точке попадания; lift — подъём над ногами (по телам).
  // propWidth — полуширина удара молнии по разрушаемым объектам вдоль её пути, px.
  chain: {
    visualLife: 0.2, propWidth: 4, segLen: 14, minSegs: 4, maxSegs: 7, jitter: 8, flicker: 0.05,
    halo: 2.5, haloAlpha: 0.45, core: 1, color: 0x7cc8ff, coreColor: 0xffffff, flash: 4, lift: 10,
  },
  // hitRadius по умолчанию (перекрывается params.hitRadius; спрайт щита 22 px мира), rehit — повторный удар
  // того же щита по той же цели (у каждого щита свой таймер).
  // blockR — радиус ловли вражеских снарядов при size 1: видимый радиус щита (ORBIT_R), не hitRadius удара
  orbit: { hitRadius: 12, rehit: 0.5, blockR: ORBIT_R.proj_shield },
  // swingGap — пауза между взмахами серии, swingLife — время жизни взмаха, aimRange — дальность выбора цели (× area).
  // Удар конусом из героя: длина arcRadius × area, половина угла arcSpan° вокруг направления удара.
  // Картинка — край конуса, кусок кольца вокруг героя: внешняя дуга на arcRadius × area от середины тела
  // (bodyLift px над ногами), середина дуги на линии удара. Кадр спрайта (tools/make-slash.mjs): tex × tex px,
  // центр окружности в (texCenterX, tex / 2), внешний радиус texRadius, толщина полосы посередине texThickness;
  // spriteWorld — ширина кадра в мире при scale 1.
  // Молот (slam): first — первый удар после взятия; gap — пауза между ударами серии; aimRange — дальность выбора
  // цели (× area); offset — центр первого удара сдвинут к цели на area × offset, step — каждый следующий дальше
  // следующие удары серии — по кругу вокруг героя (amount направлений), той же дистанции; ring — время жизни ударной волны (картинка boom); crack — радиус трещины (× area);
  // fade — трещина гаснет последние fade её жизни; tint — цвет волны и трещины, если у оружия нет своего.
  slam: { first: 0.4, gap: 0.3, aimRange: 1.5, offset: 0.4, ring: 0.3, crack: 0.8,
    fade: 0.6, tint: 0xd8b070 },
  // Копьё (impale): spread — угол между копьями залпа (рад), retry — повтор поиска цели; stuck — сколько торчит
  // в земле, stuckAlpha — его прозрачность, fadeOut — угасание в конце; burstLife — время картинки взрыва.
  impale: { targetRange: 340, hitRadius: 6, spread: 0.2, first: 0.3, retry: 0.1, stuck: 1.2,
    stuckAlpha: 0.9, fadeOut: 0.4, burstLife: 0.3 },
  // Ледяной шар (ice_orb): spread — угол веера (рад) без turn; spin — вращение картинки (рад/с); fadeIn / fadeOut —
  // появление и угасание, с; spriteR — видимый радиус спрайта при scale 1, если его нет в ORBIT_R;
  // visual — видимый радиус шара как доля радиуса удара area (крупный спрайт-заглушка выглядит плоско).
  ice_orb: { targetRange: 300, first: 0.4, retry: 0.15, spread: 0.35, spin: 1.5, fadeIn: 0.2,
    fadeOut: 0.4, spriteR: 10, visual: 0.6 },
  // Слэш (slash): first — первый удар после взятия; gap — пауза между слэшами серии; searchRange — радиус поиска
  // группы вокруг героя; clusterR — радиус группы (враги в круге вокруг кандидата); candidates — сколько врагов
  // проверить кандидатами в центр (равномерно по списку, дёшево при толпе); apart — следующая группа серии
  // дальше apart × clusterR от взятых; elongation — группа «вытянута», если малая ось ковариации меньше
  // elongation × большой, тогда слэш вдоль неё, иначе поперёк направления от героя. width, sweep — если их нет
  // в уровне. clear — зазор между краем полосы и героем (px; слэш не выходит из героя), slide — до какой доли длины слэш
  // можно сдвинуть вдоль оси от героя (дальше он разворачивается поперёк); idle — без целей росчерк
  // впереди героя на idle × длины. Картинка (render/zones.js): fade — угасание после sweep, lag — хвост
  // полосы начинает догонять голову
  // через lag × sweep; trail / mid / core — полуширина шлейфа, середины и ядра как доля полуширины удара (ядро не
  // тоньше coreMin px), их alpha; taper — заострение концов линзы (степень sin, больше — острее); bow — изгиб
  // дуги как доля длины; lift — полоса поднята на столько px над линией удара (по телам, а не по ногам; удар
  // считается по земле); color / midColor / coreColor — цвет шлейфа, середины (без tint) и ядра. Сложение цвета только у ядра.
  slash: {
    first: 0.3, gap: 0.12, searchRange: 170, clusterR: 36, candidates: 48, apart: 1.5,
    elongation: 0.6, width: 20, sweep: 0.15, fade: 0.12, lag: 0.3,
    clear: 4, slide: 0.3, idle: 0.35,
    trail: 0.6, mid: 0.16, core: 0.05, coreMin: 0.75, trailAlpha: 0.3, midAlpha: 0.6, coreAlpha: 1,
    taper: 1.3, bow: 0.05, lift: 12, color: 0x9fd8ff, midColor: 0xcfefff, coreColor: 0xffffff,
  },
  melee_arc: {
    swingGap: 0.18, swingLife: 0.16, aimRange: 2.6,
    arcRadius: 1, arcSpan: 50, bodyLift: 22,
    tex: 256, texCenterX: 92, texRadius: 156, texThickness: 30, spriteWorld: 64,
  },
};

export const WEAPONS = {
  blade_arc: {
    // Росчерк через самую плотную группу рядом (как Victory Sword в VS), не конус. Урон за удар как у прежнего
    // конуса (ближний бой бьёт сильнее дальнобойного, docs/BALANCE_AUDIT.md 6.4); растут длина и ширина полосы,
    // скорость (sweep и cooldown) и число слэшей на L3 и L5.
    icon: 'icon_blade_arc', sprite: 'proj_blade_arc', behavior: 'slash', dmgType: 'attack', targets: 'cleave', maxLevel: 5,
    status: { type: 'bleeding', chance: 0.25 },
    levels: [
      { damage: 6, cooldown: 1.0, amount: 1, area: 120, width: 20, sweep: 0.16, knockback: 90 },
      { damage: 8, cooldown: 0.95, amount: 1, area: 130, width: 22, sweep: 0.15, knockback: 95 },
      { damage: 10, cooldown: 0.9, amount: 2, area: 140, width: 24, sweep: 0.14, knockback: 100 },
      { damage: 12, cooldown: 0.85, amount: 2, area: 155, width: 26, sweep: 0.13, knockback: 110 },
      { damage: 14, cooldown: 0.8, amount: 3, area: 170, width: 28, sweep: 0.12, knockback: 120 },
    ],
  },
  throwing_daggers: {
    // VS Knife: L1 6.5 / 1.0 с, 1 нож; L8 16.5 × 6, pierce 3.
    icon: 'icon_throwing_daggers', sprite: 'proj_dagger', behavior: 'projectile', dmgType: 'attack', bloom: 'early', targets: 'cleave', maxLevel: 5,
    levels: [
      { damage: 5, cooldown: 0.9, amount: 2, speed: 280,
        duration: 1.2, pierce: 1, knockback: 40 },
      { damage: 5, cooldown: 0.9, amount: 3, speed: 280,
        duration: 1.2, pierce: 1, knockback: 40 },
      { damage: 9, cooldown: 0.85, amount: 4, speed: 300,
        duration: 1.3, pierce: 2, knockback: 50 },
      { damage: 12, cooldown: 0.8, amount: 5, speed: 320,
        duration: 1.4, pierce: 3, knockback: 60 },
      { damage: 17, cooldown: 0.7, amount: 6, speed: 340,
        duration: 1.4, pierce: 3, knockback: 70 },
    ],
  },
  guardian_shields: {
    // VS King Bible: L1 10 урона, 1 книга, 3 с вращения, пауза 3 с; L8 30 × 4, 4 с.
    // Защитное оружие (ловит снаряды): самое слабое по урону, решение владельца. Кольцо 4 и медленное
    // вращение: стрелки вокруг пробивают L1 ~95%, L3 ~85%, L5 ~65% пуль (щит ловит касанием, orbit.blockR).
    icon: 'icon_guardian_shields', sprite: 'proj_shield', behavior: 'orbit', dmgType: 'attack', targets: 'aoe', maxLevel: 5,
    levels: [
      { damage: 3, cooldown: 2.0, amount: 2, area: onRing(4, SHIELD_R), hitRadius: 22,
        speed: 1.0, duration: 4.0, knockback: 40 },
      { damage: 4, cooldown: 2.0, amount: 3, area: onRing(4, SHIELD_R), hitRadius: 26,
        speed: 1.2, duration: 4.0, knockback: 40 },
      { damage: 7, cooldown: 1.9, amount: 4, area: onRing(4, SHIELD_R), hitRadius: 29,
        speed: 1.5, duration: 4.0, knockback: 45 },
      { damage: 10, cooldown: 1.7, amount: 5, area: onRing(4, SHIELD_R), hitRadius: 36,
        speed: 1.7, duration: 4.0, knockback: 50 },
      { damage: 12, cooldown: 1.6, amount: 6, area: onRing(4, SHIELD_R), hitRadius: 40,
        speed: 2.0, duration: 4.0, knockback: 55 },
    ],
  },
  holy_ground: {
    // VS Garlic: L1 5 урона раз в 1.3 с; L8 15 раз в 1.0 с, area 100% -> 200%. cooldown — период удара по врагу.
    icon: 'icon_holy_ground', sprite: 'proj_holy_ground', behavior: 'aura', dmgType: 'magic', bloom: 'early', targets: 'aoe', maxLevel: 5,
    levels: [
      { damage: 7, cooldown: 1.04, area: RINGS[0], knockback: 15 },
      { damage: 9, cooldown: 1.0, area: RINGS[1], knockback: 15 },
      { damage: 16, cooldown: 0.92, area: RINGS[3], knockback: 20 },
      { damage: 23, cooldown: 0.84, area: RINGS[5], knockback: 25 },
      { damage: 26, cooldown: 0.8, area: RINGS[6], knockback: 30 },
    ],
  },
  war_axe: {
    // VS Axe: L1 20 / 4.0 с; L8 80 × 3, pierce 7. Наш топор возвращается и бьёт дважды, поэтому урон ниже.
    icon: 'icon_war_axe', sprite: 'proj_axe', behavior: 'boomerang', dmgType: 'attack', targets: 'cleave', maxLevel: 5,
    levels: [
      { damage: 6, cooldown: 1.5, amount: 1, area: 110, speed: 200, duration: 4, knockback: 60 },
      { damage: 6, cooldown: 1.45, amount: 2, area: 120, speed: 210, duration: 4, knockback: 60 },
      { damage: 10, cooldown: 1.3, amount: 2, area: 145, speed: 230, duration: 4, knockback: 70 },
      { damage: 12, cooldown: 1.1, amount: 3, area: 170, speed: 250, duration: 4, knockback: 80 },
      { damage: 15, cooldown: 1.0, amount: 3, area: 185, speed: 260, duration: 4, knockback: 90 },
    ],
  },
  storm_chain: {
    // Молния бьёт (1 + jumps) врагов, всего amount × (1 + jumps) ударов за cooldown. Самая дальнобойная и бьёт
    // много целей, поэтому урон за удар у неё ниже всех (docs/BALANCE_AUDIT.md 6.4).
    icon: 'icon_storm_chain', sprite: 'proj_chain', behavior: 'chain', dmgType: 'magic', bloom: 'early', targets: 'cleave', maxLevel: 5,
    levels: [
      { damage: 10, cooldown: 1.25, amount: 1, jumps: 2, area: 90, range: 230, knockback: 50 },
      { damage: 10, cooldown: 1.25, amount: 1, jumps: 3, area: 95, range: 240, knockback: 50 },
      { damage: 14, cooldown: 1.2, amount: 2, jumps: 4, area: 105, range: 260, knockback: 55 },
      { damage: 17, cooldown: 1.15, amount: 3, jumps: 4, area: 115, range: 280, knockback: 55 },
      { damage: 23, cooldown: 1.1, amount: 3, jumps: 4, area: 120, range: 290, knockback: 60 },
    ],
  },
  firebomb: {
    // VS Santa Water: L1 10 урона, 4.5 с, лужа 2 с с тиком 0.5 с; L8 40 × 4, 3 с, area 180%.
    // Взрыв бьёт на damage, огонь — damage × fireDamage раз в WEAPON_BEHAVIOR.area_drop.fireTick.
    // Поджог с шансом 0.3: огонь на земле бьёт часто, и каждый его удар тоже может поджечь.
    icon: 'icon_firebomb', sprite: 'proj_firebomb', behavior: 'area_drop', dmgType: 'magic', targets: 'aoe', maxLevel: 5,
    status: { type: 'burning', chance: 0.3 },
    levels: [
      { damage: 2, cooldown: 3.0, amount: 1, area: 36,
        duration: 2.0, fireDamage: 0.5, knockback: 50 },
      { damage: 2, cooldown: 3.0, amount: 1, area: 40,
        duration: 2.2, fireDamage: 0.5, knockback: 50 },
      { damage: 5, cooldown: 2.8, amount: 2, area: 48,
        duration: 2.6, fireDamage: 0.5, knockback: 55 },
      { damage: 7, cooldown: 2.6, amount: 3, area: 56,
        duration: 2.9, fireDamage: 0.5, knockback: 60 },
      { damage: 9, cooldown: 2.5, amount: 3, area: 60,
        duration: 3.0, fireDamage: 0.5, knockback: 70 },
    ],
  },

  // META 1.4: новые оружия. Сталь: копьё, молот, арбалет, мины; магия: ледяной шар, ядовитое облако, луч, огонёк, метеор.
  spear: {
    // Одно копьё в ближайшего врага (amount 1 на всех уровнях): пробивает 1 + pierce врагов и пригвождает их
    // на pin с. Сильное за удар (между ножами и арбалетом), в отличие от луча: тот случайный, бьёт всех и слабо.
    // Отбрасывание малое: пригвождённый стоит на месте.
    icon: 'icon_spear', sprite: 'proj_spear', behavior: 'impale', dmgType: 'attack', bloom: 'early', targets: 'single', maxLevel: 5,
    levels: [
      { damage: 13, cooldown: 0.87, amount: 1, speed: 300, duration: 0.9, pierce: 4, pin: 0.6,
        hitRadius: 6, knockback: 10 },
      { damage: 17, cooldown: 0.84, amount: 1, speed: 310, duration: 0.95, pierce: 6, pin: 0.7,
        hitRadius: 6, knockback: 10 },
      { damage: 24, cooldown: 0.78, amount: 1, speed: 320, duration: 1.0, pierce: 7, pin: 0.8,
        hitRadius: 7, knockback: 10 },
      { damage: 35, cooldown: 0.71, amount: 1, speed: 340, duration: 1.05, pierce: 8, pin: 0.9,
        hitRadius: 7, knockback: 15 },
      { damage: 44, cooldown: 0.63, amount: 1, speed: 360, duration: 1.1, pierce: 10, pin: 1.0,
        hitRadius: 8, knockback: 15 },
    ],
  },
  hammer: {
    // Удар по земле кругом (slam): самый большой урон за удар и knockback (ближний бой, docs/BALANCE_AUDIT.md 6.4),
    // трещины на duration с замедляют врагов. Кровотечения нет: удар тупой (и bleeding только у клинков: melee_arc, slash).
    // Картинки — зоны render/zones.js (boom и crack) цвета tint; sprite нужен только как ключ снаряда.
    icon: 'icon_hammer', sprite: 'proj_blade_arc', behavior: 'slam', dmgType: 'attack', targets: 'aoe', maxLevel: 5, tint: 0xd8b070,
    levels: [
      { damage: 14, cooldown: 1.7, amount: 1, area: 70, duration: 2.5, slow: 0.6, slowTime: 0.3,
        knockback: 200 },
      { damage: 15, cooldown: 1.6, amount: 1, area: 75, duration: 2.8, slow: 0.55, slowTime: 0.3,
        knockback: 210 },
      { damage: 25, cooldown: 1.5, amount: 1, area: 83, duration: 3.1, slow: 0.55, slowTime: 0.35,
        knockback: 220 },
      { damage: 39, cooldown: 1.4, amount: 2, area: 90, duration: 3.4, slow: 0.5, slowTime: 0.35,
        knockback: 230 },
      { damage: 49, cooldown: 1.3, amount: 2, area: 98, duration: 3.8, slow: 0.45, slowTime: 0.4,
        knockback: 240 },
    ],
  },
  crossbow: {
    // Один быстрый болт с большим уроном в ближайшего врага; с L4 два.
    icon: 'icon_crossbow', sprite: 'proj_bolt', behavior: 'projectile', dmgType: 'attack', targets: 'single', maxLevel: 5,
    levels: [
      { damage: 18, cooldown: 2.11, amount: 1, speed: 440, duration: 0.9, pierce: 4,
        knockback: 70 },
      { damage: 21, cooldown: 2.02, amount: 1, speed: 440, duration: 0.9, pierce: 6,
        knockback: 70 },
      { damage: 32, cooldown: 1.88, amount: 1, speed: 460, duration: 1.0, pierce: 8,
        knockback: 80 },
      { damage: 47, cooldown: 1.7, amount: 2, speed: 480, duration: 1.0, pierce: 10,
        knockback: 90 },
      { damage: 59, cooldown: 1.56, amount: 2, speed: 500, duration: 1.0, pierce: 12,
        knockback: 100 },
    ],
  },
  mines: {
    // Мины вокруг героя ждут врага до duration с; взрыв без огня.
    icon: 'icon_mines', sprite: 'proj_mine', behavior: 'area_drop', dmgType: 'attack', bloom: 'late', targets: 'aoe', maxLevel: 5,
    levels: [
      { damage: 40, cooldown: 8.36, amount: 1, area: 70, duration: 30, mine: true, trigger: 14,
        spread: 90, knockback: 80 },
      { damage: 55, cooldown: 7.99, amount: 2, area: 74, duration: 30, mine: true, trigger: 14,
        spread: 95, knockback: 80 },
      { damage: 90, cooldown: 6.79, amount: 2, area: 80, duration: 30, mine: true, trigger: 15,
        spread: 100, knockback: 90 },
      { damage: 125, cooldown: 6.04, amount: 3, area: 86, duration: 30, mine: true, trigger: 16,
        spread: 105, knockback: 100 },
      { damage: 160, cooldown: 5.71, amount: 3, area: 92, duration: 30, mine: true, trigger: 16,
        spread: 110, knockback: 110 },
    ],
  },
  frost_orb: {
    // Ледяной шар как Ice Shard / Frost Orb из PoE: один очень крупный медленный шар в ближайшего врага, пробивает
    // всех, бьёт слабо, но часто (раз в tick) и замораживает всех, кто прошёл сквозь него. Без отбрасывания.
    // Заморозка — статус chill в уровне (slow — множитель скорости, duration — сколько держится после выхода).
    icon: 'icon_frost_orb', sprite: 'proj_frost', behavior: 'ice_orb', dmgType: 'magic', targets: 'aoe', maxLevel: 5,
    levels: [
      { damage: 9, cooldown: 2.6, amount: 1, area: 20, speed: 50, duration: 4.0, tick: 0.5,
        status: { type: 'chill', chance: 1, slow: 0.5, duration: 1.5 }, knockback: 0 },
      { damage: 12, cooldown: 2.5, amount: 1, area: 22, speed: 52, duration: 4.3, tick: 0.5,
        status: { type: 'chill', chance: 1, slow: 0.5, duration: 1.5 }, knockback: 0 },
      { damage: 15, cooldown: 2.4, amount: 1, area: 25, speed: 55, duration: 4.6, tick: 0.45,
        status: { type: 'chill', chance: 1, slow: 0.45, duration: 1.6 }, knockback: 0 },
      { damage: 20, cooldown: 2.3, amount: 1, area: 28, speed: 58, duration: 5.0, tick: 0.45,
        status: { type: 'chill', chance: 1, slow: 0.4, duration: 1.7 }, knockback: 0 },
      { damage: 24, cooldown: 2.2, amount: 1, area: 32, speed: 60, duration: 5.5, tick: 0.4,
        status: { type: 'chill', chance: 1, slow: 0.35, duration: 1.8 }, knockback: 0 },
    ],
  },
  poison_cloud: {
    // Облако ложится под героя и стоит duration с, как святая земля, но на месте и слабее: урон за тик ниже
    // Holy Ground, зато каждый тик вешает яд (шанс 1, стаки, src/data/status.js). Одно облако до L5, на L5 два.
    icon: 'icon_poison_cloud', sprite: 'proj_poison_cloud', behavior: 'cloud', dmgType: 'magic', targets: 'aoe', maxLevel: 5, tint: 0x9be04a,
    status: { type: 'poison', chance: 1 },
    levels: [
      { damage: 2, cooldown: 4.0, tick: 0.5, duration: 3.5, area: 40, amount: 1, knockback: 0 },
      { damage: 2, cooldown: 3.8, tick: 0.5, duration: 4.0, area: 44, amount: 1, knockback: 0 },
      { damage: 3, cooldown: 3.6, tick: 0.5, duration: 4.5, area: 50, amount: 1, knockback: 0 },
      { damage: 6, cooldown: 3.4, tick: 0.5, duration: 5.0, area: 56, amount: 1, knockback: 0 },
      { damage: 6, cooldown: 3.2, tick: 0.5, duration: 5.5, area: 62, amount: 2, knockback: 0 },
    ],
  },
  beam: {
    // Луч-змейка: amount лучей в случайные стороны, голова отскакивает от врагов и объектов bounces раз
    // (урон × 0.75 и длина вдвое за отскок). Каждый уровень растёт часть из урона, числа лучей, отскоков, длины;
    // по экрану (tools/simulation/dps.mjs) на каждом уровне чуть сильнее молнии (storm_chain), решение владельца.
    icon: 'icon_beam', sprite: 'proj_beam', behavior: 'beam', dmgType: 'magic', bloom: 'late', targets: 'cleave', maxLevel: 5,
    levels: [
      { damage: 26, cooldown: 1.6, amount: 1, bounces: 1, length: 60, speed: 220 },
      { damage: 26, cooldown: 1.6, amount: 1, bounces: 2, length: 70, speed: 220 },
      { damage: 38, cooldown: 1.35, amount: 2, bounces: 2, length: 80, speed: 220 },
      { damage: 38, cooldown: 1.25, amount: 3, bounces: 3, length: 90, speed: 220 },
      { damage: 38, cooldown: 1.25, amount: 4, bounces: 4, length: 100, speed: 220 },
    ],
  },
  wisp: {
    // Огоньки летают за героем и сами стреляют в ближайшего к себе врага.
    icon: 'icon_wisp', sprite: 'proj_wisp', shot: 'proj_wisp_shot', behavior: 'summon', dmgType: 'magic', bloom: 'early', targets: 'single', maxLevel: 5,
    levels: [
      { damage: 22, cooldown: 0.8, amount: 1, speed: 240, duration: 1.2, pierce: 1, knockback: 20 },
      { damage: 22, cooldown: 0.8, amount: 1, speed: 250, duration: 1.2, pierce: 2, knockback: 20 },
      { damage: 22, cooldown: 0.8, amount: 2, speed: 260, duration: 1.2, pierce: 4, knockback: 25 },
      { damage: 23, cooldown: 0.8, amount: 2, speed: 270, duration: 1.3, pierce: 5,
        knockback: 25 },
      { damage: 29, cooldown: 0.8, amount: 2, speed: 280, duration: 1.3, pierce: 6, knockback: 30 },
    ],
  },
  meteor: {
    // Долгое падение (delay) с кругом-предупреждением и большой урон по площади; огня нет.
    // Один большой удар, поэтому шанс поджога выше, чем у бомб.
    icon: 'icon_meteor', sprite: 'proj_meteor', behavior: 'area_drop', dmgType: 'magic', targets: 'aoe', maxLevel: 5,
    status: { type: 'burning', chance: 0.5 },
    levels: [
      { damage: 18, cooldown: 3.5, amount: 1, area: 44, delay: 1.2, fall: 160, knockback: 120 },
      { damage: 22, cooldown: 3.4, amount: 1, area: 48, delay: 1.2, fall: 160, knockback: 120 },
      { damage: 32, cooldown: 3.2, amount: 2, area: 52, delay: 1.15, fall: 170, knockback: 130 },
      { damage: 44, cooldown: 3.0, amount: 2, area: 58, delay: 1.1, fall: 180, knockback: 140 },
      { damage: 59, cooldown: 2.8, amount: 3, area: 64, delay: 1.1, fall: 190, knockback: 150 },
    ],
  },

  // Эволюции: оружие на maxLevel + своя пассивка (combos.js), существующие behavior с усиленными числами.
  // blade_arc + attack
  crimson_arc: {
    // Крупнее, быстрее и больше слэшей, чем Blade Arc L5; кровотечение чаще и сильнее (share 0.4 вместо 0.3).
    icon: 'icon_crimson_arc', sprite: 'proj_blade_arc', behavior: 'slash', dmgType: 'attack', targets: 'cleave', maxLevel: 1, evolved: true, tint: 0xff5050,
    status: { type: 'bleeding', chance: 0.4, share: 0.4 },
    levels: [
      { damage: 11, cooldown: 0.7, amount: 4, area: 200, width: 34, sweep: 0.1, knockback: 150 },
    ],
  },
  // throwing_daggers + haste
  thousand_edge: {
    icon: 'icon_thousand_edge', sprite: 'proj_dagger', behavior: 'projectile', dmgType: 'attack', targets: 'cleave', maxLevel: 1, evolved: true,
    levels: [
      { damage: 13, cooldown: 0.3, amount: 3, speed: 420,
        duration: 1.4, pierce: 3, knockback: 50 },
    ],
  },
  // guardian_shields + resistance
  aegis_bastion: {
    // кольцо 5, скорость 1.6: стрелки вокруг пробивают ~50% пуль (4.4 на кольце 2 — сплошная стена, 100%)
    icon: 'icon_aegis_bastion', sprite: 'proj_shield', behavior: 'orbit', dmgType: 'attack', targets: 'aoe', maxLevel: 1, evolved: true, tint: 0xa0c8ff,
    levels: [
      { damage: 5, cooldown: 0, amount: 6, area: onRing(5, SHIELD_R * 1.4), speed: 1.6,
        duration: 1e9, knockback: 0, size: 1.4, hitRadius: 54},
    ],
  },
  // holy_ground + regen
  soul_garden: {
    icon: 'icon_soul_garden', sprite: 'proj_holy_ground', behavior: 'aura', dmgType: 'magic', targets: 'aoe', maxLevel: 1, evolved: true, tint: 0x80ffa0,
    levels: [
      { damage: 13, cooldown: 0.7, area: RINGS[9], knockback: 40 },
    ],
  },
  // war_axe + crit
  death_spiral: {
    icon: 'icon_death_spiral', sprite: 'proj_axe', behavior: 'boomerang', dmgType: 'attack', targets: 'cleave', maxLevel: 1, evolved: true, tint: 0xd0a0ff,
    levels: [
      { damage: 18, cooldown: 1.6, amount: 5, area: 210, speed: 300, duration: 4, knockback: 110 },
    ],
  },
  // storm_chain + luck
  thunder_loop: {
    icon: 'icon_thunder_loop', sprite: 'proj_chain', behavior: 'chain', dmgType: 'magic', targets: 'cleave', maxLevel: 1, evolved: true,
    levels: [
      { damage: 16, cooldown: 1.0, amount: 4, jumps: 5, area: 140, range: 320, knockback: 65 },
    ],
  },
  // firebomb + pickup
  napalm_rain: {
    icon: 'icon_napalm_rain', sprite: 'proj_firebomb', behavior: 'area_drop', dmgType: 'magic', targets: 'aoe', maxLevel: 1, evolved: true,
    status: { type: 'burning', chance: 0.4 },
    levels: [
      { damage: 4, cooldown: 2.0, amount: 5, area: 72,
        duration: 3.8, fireDamage: 0.5, knockback: 80 },
    ],
  },
  // spear + crit_dmg
  dragon_lance: {
    // Одно копьё, как у spear: пробивает больше, пригвождает дольше, воткнувшись взрывается (burst) и
    // пригвождает всех вокруг.
    icon: 'icon_dragon_lance', sprite: 'proj_spear', behavior: 'impale', dmgType: 'attack', targets: 'single', maxLevel: 1, evolved: true, tint: 0xffb040,
    levels: [
      { damage: 64, cooldown: 1.02, amount: 1, speed: 400, duration: 1.2, pierce: 9, pin: 1.4,
        burst: 34, hitRadius: 10, knockback: 15 },
    ],
  },
  // hammer + max_hp
  titan_maul: {
    // Три удара подряд волной вперёд, крупнее и с долгими трещинами.
    icon: 'icon_titan_maul', sprite: 'proj_blade_arc', behavior: 'slam', dmgType: 'attack', targets: 'aoe', maxLevel: 1, evolved: true, tint: 0xffd060,
    levels: [
      { damage: 22, cooldown: 1.2, amount: 3, area: 99, duration: 5.0, slow: 0.35, slowTime: 0.5,
        knockback: 320 },
    ],
  },
  // crossbow + dodge
  ballista: {
    icon: 'icon_ballista', sprite: 'proj_bolt', behavior: 'projectile', dmgType: 'attack', targets: 'single', maxLevel: 1, evolved: true, tint: 0xa0e0ff,
    levels: [
      { damage: 42, cooldown: 1.68, amount: 3, speed: 560, duration: 1.1, pierce: 16,
        knockback: 110 },
    ],
  },
  // mines + duration
  minefield: {
    icon: 'icon_minefield', sprite: 'proj_mine', behavior: 'area_drop', dmgType: 'attack', targets: 'aoe', maxLevel: 1, evolved: true, tint: 0xff6060,
    levels: [
      { damage: 200, cooldown: 9.17, amount: 5, area: 110, duration: 15, mine: true, trigger: 18,
        spread: 130, knockback: 120 },
    ],
  },
  // frost_orb + area
  blizzard: {
    // Четыре шара во все стороны, закручиваются спиралью-смерчем (turn), замораживают сильнее.
    icon: 'icon_blizzard', sprite: 'proj_frost', behavior: 'ice_orb', dmgType: 'magic', targets: 'aoe', maxLevel: 1, evolved: true, tint: 0xc0f0ff,
    levels: [
      { damage: 8, cooldown: 2.2, amount: 4, area: 34, speed: 70, duration: 6.0, tick: 0.4,
        turn: 1.2, status: { type: 'chill', chance: 1, slow: 0.3,
          duration: 2.0 }, knockback: 0 },
    ],
  },
  // poison_cloud + magic
  miasma: {
    icon: 'icon_miasma', sprite: 'proj_poison_cloud', behavior: 'cloud', dmgType: 'magic', targets: 'aoe', maxLevel: 1, evolved: true, tint: 0xb060ff,
    status: { type: 'poison', chance: 1 },
    levels: [
      { damage: 4, cooldown: 3.0, tick: 0.4, duration: 6.0, area: 72, amount: 3, knockback: 0 },
    ],
  },
  // beam + speed
  prism_ray: {
    icon: 'icon_prism_ray', sprite: 'proj_beam', behavior: 'beam', dmgType: 'magic', targets: 'cleave', maxLevel: 1, evolved: true, tint: 0xff80ff,
    levels: [
      { damage: 58, cooldown: 2.9, amount: 6, bounces: 5, length: 120, speed: 250 },
    ],
  },
  // wisp + xp_gain
  spirit_choir: {
    icon: 'icon_spirit_choir', sprite: 'proj_wisp', shot: 'proj_wisp_shot', behavior: 'summon', dmgType: 'magic', targets: 'single', maxLevel: 1,
    evolved: true, tint: 0x80ffd0,
    levels: [
      { damage: 13, cooldown: 0.8, amount: 5, speed: 300, duration: 1.3, pierce: 6, knockback: 30 },
    ],
  },
  // meteor + thorns
  starfall: {
    icon: 'icon_starfall', sprite: 'proj_meteor', behavior: 'area_drop', dmgType: 'magic', targets: 'aoe', maxLevel: 1, evolved: true, tint: 0xfff080,
    status: { type: 'burning', chance: 0.5 },
    levels: [
      { damage: 29, cooldown: 2.4, amount: 5, area: 76, delay: 1.0, fall: 200, knockback: 160 },
    ],
  },
};
