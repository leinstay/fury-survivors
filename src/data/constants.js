// Глобальные числа игры. Баланс конкретного контента лежит в соседних файлах.

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;
// Холст рисуется в RENDER_ZOOM раз крупнее мира: 1280×720. Мир, данные и UI остаются в координатах 640×360.
// Спрайты density 1 (manifest.js) рисуются целым множителем: арт-пиксель = квадрат 2×2 холста, без пересэмплинга.
export const RENDER_ZOOM = 2;

// Звук: ползунок громкости 100% = gain (прежние 10% ползунка; файлы сами по себе громкие).
// fadeIn / fadeOut: нарастание музыки в начале забега и затухание после смерти или победы, с.
export const AUDIO = { gain: 0.1, fadeIn: 2, fadeOut: 2.5 };

// Время в секундах, расстояния в пикселях игрового мира, скорость в px/с.
export const SIM = {
  tickRate: 60,            // шагов симуляции в секунду
  maxEnemies: 400,         // жёсткий лимит живых врагов
  despawnDistance: 520,    // дальше этого отставший враг переносится вперёд по ходу игрока
  spawnDistance: 390,      // расстояние появления врагов от игрока (за краем экрана 640x360)
  gridCellSize: 64,        // ячейка пространственной сетки
  chunkSize: 320,          // размер чанка для генерации объектов (props) вокруг игрока
  propKeepDistance: 1600,  // дальше этого объекты удаляются
  propRadius: 9,           // радиус попадания по разрушаемому объекту
  maxFrameDt: 1 / 20,      // предел шага кадра в сцене Game, с (после зависания мир не прыгает)
};

// Директор волн (src/core/director.js).
export const DIRECTOR = {
  minCheckInterval: 0.5,   // с между проверками минимума врагов (поле min в таймлайне)
  minGroupsCap: 6,         // не больше стольких групп досыпается за одну проверку минимума
  groupJitter: 36,         // разброс врагов внутри группы spawn, px (полная ширина)
  burstJitter: 80,         // разброс врагов события burst, px (полная ширина)
  ringCount: 20,           // врагов в кольце ring, если у события нет count
  ringInset: 60,           // кольцо ring без radius: spawnDistance минус это
};

export const PLAYER = {
  radius: 7,               // радиус хитбокса игрока
  iframes: 0.5,            // неуязвимость после удара, с
  hurtFlash: 0.25,         // длительность вспышки после удара, с
  knockback: 0,            // отбрасывание игрока (врагов отбрасывает оружие)
  pickupRadius: 40,        // базовый радиус подбора
  magnetSpeed: 320,        // скорость притягивания предметов
  touchRadius: 12,         // радиус касания для предметов без притягивания (еда, магнит, сундук)
};

export const COMBAT = {
  critMul: 2,              // множитель крита
  hitFlash: 0.1,           // белая вспышка врага после попадания, с
  knockbackDecay: 10,      // быстрота затухания отбрасывания (1/с)
  separation: 0.35,        // доля перекрытия, которую враги раздвигают за шаг
  armorMinDamage: 1,       // урон не падает ниже этого значения
  enemyProjectileRadius: 4, // радиус попадания вражеского снаряда
  weaponStartCooldown: 0.3, // задержка первого выстрела нового оружия до init behavior, с
};

// HUD (src/ui/hud.js).
export const HUD = {
  bossBannerTime: 3,       // с, сколько мигает предупреждение о боссе
};

export const XP = {
  // Опыт до следующего уровня, как в Vampire Survivors: 5 на 1 -> 2, затем прибавка за каждый уровень
  // steps[i].per, пока уровень меньше steps[i].below (+10 до 20-го, +13 до 40-го, дальше +16),
  // плюс extra на пороговом уровне.
  base: 5,
  steps: [{ below: 20, per: 10 }, { below: 40, per: 13 }, { below: Infinity, per: 16 }],
  thresholds: [{ level: 20, extra: 600 }, { level: 40, extra: 2400 }],
  mergeRadius: 24,         // кристаллы рядом сливаются, когда их больше mergeAbove
  mergeAbove: 300,
  mergeInterval: 0.5,      // с между проходами слияния
  mergeMinPlayerDistance: 160, // рядом с игроком кристаллы не сливаются
};

// Шансы выпадения с обычных врагов (умножаются на стат luck).
export const DROPS = {
  coinChance: 0.015,
  foodChance: 0,           // еда с врагов не падает, только из разрушаемых объектов (как курица в VS)
};

export const SLOTS = { weapons: 6, passives: 6 };

export const LEVEL_UP = {
  cards: 4,
  rerolls: 3,
  skips: 3,
  banishes: 3,
  healFraction: 0.3,       // карточка лечения (когда всё на максимуме) лечит эту долю maxHp
};

export const FEEL = {
  hitstop: 0.04,           // с, на крупных ударах
  shake: 0.08,
};

// Эффекты рендера (src/render/fx.js, anim.js, world.js). Время в секундах, расстояния в px мира.
export const FX = {
  dmgText: { max: 60, life: 0.6, rise: 18, size: 8, critSize: 12, color: '#ffffff', critColor: '#ffb52e', stroke: '#1a1426' },
  sparks: { min: 2, max: 4, speed: 70, life: 0.25, color: 0xfff2a0, critColor: 0xffb52e },
  puff: {
    count: 5, eliteCount: 10, bossCount: 20, speed: 60, life: 0.45, size: 3, eliteSize: 1.6,
    colors: [0xffffff, 0xd0d0d0, 0x9a9a9a],
  },
  maxParticles: 320,
  ghost: { max: 24, life: 0.25, squashY: 0.25, stretchX: 1.25, eliteScale: 1.25 },
  // Тряска экрана как в Vampire Survivors: урон по герою, смерть элиты, босс. Отключается в настройках.
  // Хитстоп и сплющивание при ударе выключены по просьбе владельца (0 = выкл), прежние значения в комментариях.
  shake: { hurt: [2, 0.15], elite: [3, 0.2], boss: [5, 0.35] }, // [амплитуда px мира, длительность с]
  hitstop: { crit: 0, hurt: 0, elite: 0, boss: 0, cap: 0.1, cooldown: 0.3 }, // было 0.03, 0.06, 0.07, 0.08
  levelup: { ringTime: 0.5, ringRadius: 70, ringColor: 0xffe88a }, // белая вспышка на весь экран убрана
  pickupSpark: { count: 2, color: 0x7fd8ff, life: 0.25, speed: 40 },
  // Мягкое свечение под снарядами, чтобы их было видно на траве: спрайт → цвет, диаметр px мира, яркость.
  // Аддитивное наложение; у снаряда с tint (супероружие) свечение берёт его цвет. У звеньев молнии свечения нет:
  // их десятки на цепь, и перекрывающиеся ореолы тормозили телефоны.
  projGlow: {
    proj_enemy: { color: 0xff4a4a, size: 26, alpha: 0.75 },
    proj_dagger: { color: 0xbfe6ff, size: 18, alpha: 0.35 },
    proj_axe: { color: 0xffd9a0, size: 30, alpha: 0.3 },
    proj_firebomb: { color: 0xffa040, size: 28, alpha: 0.4 },
    proj_shield: { color: 0xfff0a0, size: 28, alpha: 0.3 },
  },
  hitSquash: { x: 1, y: 1 }, // было 1.18 × 0.82
  // Ходьба (src/render/anim.js): fps — кадров ходьбы в секунду у спрайтов с кадрами; однокадровые подпрыгивают
  // на hop целых px мира, steps шагов в секунду; летуны парят на hoverHeight px, качаясь на ±hover px.
  walk: { fps: 8, steps: 2.4, hop: 0, hover: 0, hoverHeight: 6, hoverSpeed: 4 }, // было hop 1, hover 2
  // Поза босса: при замахе приседает на windupDrop px, при касте подпрыгивает на castLift px.
  bossPose: { windupDrop: 0, castLift: 0 }, // было 2 и 3
  shadow: { alpha: 0.3, widthK: 0.5, height: 0.3, yOffset: -1, depth: -50000 },
  // Зоны на земле (src/render/zones.js): прозрачности слоёв, дыхание и волны ауры (wavesPerHit — волна на столько ударов).
  zones: {
    aura: {
      color: 0xfff1a8, fill: 0.1, core: 0.06, breathe: 0.03, breatheSpeed: 4,
      wave: 0.45, waveWidth: 1.5, wavesPerHit: 2, rimWidth: 1.5, rim: 0.55,
    },
    boom: { color: 0xff8030, core: 0xfff0b0, alpha: 0.5 },
    fire: { color: 0xff6a20, core: 0xffc040, fill: 0.13, rim: 0.45, flicker: 0.08, fadeOut: 0.5 },
  },
  // Живость без движения камеры: след за летящими снарядами, блеск кристаллов опыта, искры над огнём.
  // every — раз в столько секунд, max — сколько объектов за раз.
  trail: { every: 0.05, life: 0.2, max: 12 },
  twinkle: { every: 0.15, life: 0.45, color: 0xffffff },
  embers: { every: 0.07, life: 0.6, rise: 22, colors: [0xffc040, 0xff7a20] },
};
