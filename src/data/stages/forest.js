// Этап «Лес». Строки интерфейса: stage.forest.name.
// Формат:
// {
//   id, name: 'stage.forest',
//   duration: 900,               // с, на этой секунде финальный босс (bosses.js: final: true)
//   bossWarning: 10,             // с до босса: событие bossWarning
//   tiles: ['grass', ...],       // ключи тайлсета
//   roads: { spacing, width, chance, trunkChance, segmentChance, wobble, wave, wave2 },  // сеть песчаных дорог
//     (src/core/roads.js): полосы через spacing px по обеим осям, каждая есть с шансом chance; доля trunkChance
//     из них магистрали (сплошные), остальные ветки из отрезков между магистралями (каждый с шансом segmentChance,
//     концы только на магистралях: тройники и повороты без тупиков); извилистость wobble px с периодами wave, wave2
//   props: [{ sprite, density, breakable, hp, drop, place, big }],
//     density — среднее число на чанк SIM.chunkSize x SIM.chunkSize;
//     sim создаёт только breakable-объекты (sim.props), остальные — декор, его рисует рендер сам;
//     drop — { pickupId: шанс } для разрушаемых (шансы умножаются на luck)
//     place — 'ground' (по умолчанию: не на дороге), 'any' (где угодно), 'roadside' (у обочины, вагонетки,
//             указатели, фонари; полотно дороги остаётся пустым), 'road' (на оси дороги, сейчас не используется);
//             fallback — куда ставить объект roadside, если дороги в чанке нет (без него объект пропускается);
//             big — крупный объект, занимает клетку чанка, чтобы не расти в соседе
//   scaling: { hpPerMinute, damagePerMinute },  // рост здоровья и урона врагов со временем
//   timeline: [                  // события по времени, сортированы по at
//     { at, type: 'spawn', enemy, rate, rateEnd?, until?, group, min?, minEnd? }
//        rate — групп в секунду, линейно к rateEnd до until; min — сколько живых врагов этого вида держать минимум (линейно к minEnd)
//     { at, type: 'ring', enemy, count, radius? }                   // кольцо вокруг игрока
//     { at, type: 'elite', enemy }                                  // элитный враг, дроп — сундук
//     { at, type: 'burst', enemy, count }                           // разовая кучка врагов у края экрана
//     { at, type: 'boss', boss }                                    // несколько боссов: убийство нефинального даёт сундук, забег идёт дальше
//     { at, type: 'wall', enemy, count?, length?, speed? }          // шеренга через весь экран прямым курсом сквозь игрока (VS)
//     { at, type: 'flyby', enemy, count?, speed? }                  // стая пролетает мимо игрока случайным курсом и исчезает
//   ],
//   chestHorde: { count, radius },  // мини-орда врагов типа элиты вокруг её сундука
//   overtime: {                  // после финального босса: бесконечные волны, пока героиня не погибнет (смерть = победа)
//     enemies, group,            // типы по кругу, врагов в группе
//     rate, rateRamp,            // групп в секунду в начале и прибавка каждую секунду овертайма
//     ringEvery, ringEnemy, ringCount, eliteEvery,   // кольцо и элита раз в столько секунд
//     hpRamp, damageRamp,        // HP и урон врагов × (1 + ramp × секунды овертайма), поверх scaling
//     reaper, reaperAt,          // неуязвимый босс (bosses.js) через reaperAt секунд овертайма, предупреждение за bossWarning
//   },
// }
export const forest = {
  id: 'forest',
  name: 'stage.forest',
  duration: 900,
  bossWarning: 10,             // за сколько секунд до каждого босса отправить событие bossWarning
  tiles: ['grass'],
  // Дороги примерно через два экрана, извилистые; перекрёстки там, где полосы пересекаются.
  roads: {
    spacing: 1100, width: 40, chance: 0.75, trunkChance: 0.45, segmentChance: 0.6,
    wobble: 110, wave: 520, wave2: 190,
  },
  props: [
    { sprite: 'tree', density: 2.5, breakable: false, big: true },
    { sprite: 'rock', density: 2, breakable: false },
    { sprite: 'bush', density: 3, breakable: false, big: true },
    { sprite: 'flower', density: 6, breakable: false },
    { sprite: 'barrel', density: 0.6, breakable: true, hp: 1, place: 'any', drop: { food: 0.15, coin: 0.35, magnet: 0.05 } },
    { sprite: 'lantern', density: 0.4, breakable: true, hp: 1, place: 'roadside', fallback: 'ground', drop: { magnet: 0.25, food: 0.15, coin: 0.2 } },
    // Дорожные объекты (env_props2) стоят у обочины: само полотно дороги всегда свободно.
    { sprite: 'cart', density: 0.5, breakable: true, hp: 2, place: 'roadside', drop: { coin: 0.6, food: 0.2, magnet: 0.1 } },
    { sprite: 'signpost', density: 0.35, breakable: false, place: 'roadside' },
    { sprite: 'fence', density: 0.5, breakable: false, place: 'roadside' },
    { sprite: 'stump', density: 0.8, breakable: false },
  ],
  // HP врагов × (1 + hpPerMinute × минуты): ранние типы повторяются поздно, поэтому к 15:00 они втрое крепче
  // (catgirl 16 -> 48, lamia к 15:00 ~600, как Mantichana в VS). Скорость не растёт.
  scaling: { hpPerMinute: 0.133, damagePerMinute: 0.03 },
  chestHorde: { count: 10, radius: 44 },
  // Ритм как в Mad Forest: 0-5 мин летучие и слизни, ряд колец призраков; 5:00 босс 1; 5-10 стрелки и лисы;
  // 10:00 босс 2; 10-15 всё сразу, волны стрелков, стены призраков, финал 15:00.
  timeline: [
    { at: 0, type: 'spawn', enemy: 'harpy', rate: 0.5, rateEnd: 1.2, until: 240, group: 3, min: 12, minEnd: 30 },
    { at: 60, type: 'spawn', enemy: 'slime', rate: 0.3, rateEnd: 0.8, until: 330, group: 2, min: 6, minEnd: 16 },
    { at: 120, type: 'spawn', enemy: 'catgirl', rate: 0.3, rateEnd: 0.9, until: 420, group: 2, min: 8, minEnd: 20 },
    { at: 150, type: 'ring', enemy: 'ghost', count: 16 },
    { at: 150, type: 'flyby', enemy: 'harpy', count: 24 },
    { at: 180, type: 'ring', enemy: 'ghost', count: 20 },
    { at: 200, type: 'burst', enemy: 'catgirl', count: 20 },
    { at: 210, type: 'ring', enemy: 'ghost', count: 24 },
    { at: 240, type: 'elite', enemy: 'slime' },
    { at: 240, type: 'ring', enemy: 'ghost', count: 28 },
    { at: 250, type: 'spawn', enemy: 'succubus', rate: 0.03, rateEnd: 0.1, until: 400, group: 1 },
    { at: 270, type: 'spawn', enemy: 'bunnygirl', rate: 0.3, rateEnd: 0.7, until: 540, group: 2, min: 4, minEnd: 12 },
    { at: 270, type: 'wall', enemy: 'slime', count: 22 },
    { at: 300, type: 'boss', boss: 'kitsune_empress' },
    { at: 300, type: 'spawn', enemy: 'foxgirl', rate: 0.5, rateEnd: 1.0, until: 480, group: 3 },
    { at: 300, type: 'spawn', enemy: 'harpy', rate: 0.6, rateEnd: 1.1, until: 420, group: 4 },
    { at: 330, type: 'ring', enemy: 'ghost', count: 30 },
    { at: 330, type: 'spawn', enemy: 'succubus', rate: 0.1, rateEnd: 0.2, until: 360, group: 1 },
    { at: 345, type: 'burst', enemy: 'harpy', count: 40 },
    { at: 360, type: 'spawn', enemy: 'succubus', rate: 0.4, rateEnd: 0.6, until: 420, group: 3 },
    { at: 390, type: 'spawn', enemy: 'succubus', rate: 0.15, rateEnd: 0.35, until: 620, group: 2 },
    { at: 390, type: 'flyby', enemy: 'harpy', count: 36 },
    { at: 420, type: 'spawn', enemy: 'lamia', rate: 0.15, rateEnd: 0.35, until: 600, group: 2 },
    { at: 420, type: 'spawn', enemy: 'succubus', rate: 0.15, rateEnd: 0.3, until: 660, group: 2 },
    { at: 450, type: 'elite', enemy: 'catgirl' },
    { at: 480, type: 'elite', enemy: 'succubus' },
    { at: 480, type: 'wall', enemy: 'catgirl', count: 26 },
    { at: 510, type: 'spawn', enemy: 'catgirl', rate: 1.0, rateEnd: 1.6, until: 570, group: 4, min: 60, minEnd: 120 },
    { at: 510, type: 'spawn', enemy: 'harpy', rate: 1.0, rateEnd: 1.6, until: 570, group: 4, min: 60, minEnd: 120 },
    { at: 510, type: 'burst', enemy: 'slime', count: 30 },
    { at: 540, type: 'elite', enemy: 'lamia' },
    { at: 570, type: 'ring', enemy: 'ghost', count: 36 },
    { at: 600, type: 'boss', boss: 'harpy_queen' },
    { at: 600, type: 'spawn', enemy: 'bunnygirl', rate: 0.5, rateEnd: 1.0, until: 900, group: 3, min: 20, minEnd: 50 },
    { at: 600, type: 'spawn', enemy: 'foxgirl', rate: 0.5, rateEnd: 0.9, until: 900, group: 3 },
    { at: 630, type: 'ring', enemy: 'ghost', count: 40 },
    { at: 630, type: 'spawn', enemy: 'lamia', rate: 0.25, rateEnd: 0.5, until: 900, group: 2 },
    { at: 660, type: 'elite', enemy: 'succubus' },
    { at: 660, type: 'spawn', enemy: 'succubus', rate: 0.3, rateEnd: 0.6, until: 780, group: 2 },
    { at: 660, type: 'flyby', enemy: 'harpy', count: 48 },
    { at: 690, type: 'burst', enemy: 'harpy', count: 60 },
    { at: 720, type: 'spawn', enemy: 'succubus', rate: 0.5, rateEnd: 0.8, until: 800, group: 3 },
    { at: 720, type: 'elite', enemy: 'foxgirl' },
    { at: 720, type: 'wall', enemy: 'bunnygirl', count: 28 },
    { at: 750, type: 'spawn', enemy: 'catgirl', rate: 1.2, rateEnd: 1.8, until: 840, group: 4, min: 60, minEnd: 110 },
    { at: 780, type: 'ring', enemy: 'ghost', count: 44 },
    { at: 800, type: 'burst', enemy: 'slime', count: 30 },
    { at: 810, type: 'spawn', enemy: 'harpy', rate: 1.0, rateEnd: 1.6, until: 870, group: 4, min: 60, minEnd: 110 },
    { at: 810, type: 'flyby', enemy: 'harpy', count: 60 },
    { at: 840, type: 'elite', enemy: 'lamia' },
    { at: 840, type: 'elite', enemy: 'slime' },
    { at: 870, type: 'ring', enemy: 'ghost', count: 48 },
    { at: 870, type: 'wall', enemy: 'lamia', count: 20 },
    { at: 900, type: 'boss', boss: 'dryad_queen' },
  ],
  // Овертайм ради очков в таблице: через минуту враги почти вдвое крепче, через две — почти втрое, и толпа растёт
  // без предела. Выжить нельзя, но каждая секунда и каждый кил идут в счёт (бот живёт ~1.5 мин, человек 2-3).
  overtime: {
    enemies: ['harpy', 'catgirl', 'bunnygirl', 'foxgirl', 'succubus', 'lamia', 'slime'],
    group: 4,
    rate: 2, rateRamp: 0.03,
    ringEvery: 20, ringEnemy: 'ghost', ringCount: 48,
    eliteEvery: 15,
    hpRamp: 0.015, damageRamp: 0.008,
    reaper: 'reaper', reaperAt: 300,
  },
};
