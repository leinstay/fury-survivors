// Карточки улучшений: пул, добор (оружие и пассивки по очереди), применение, эволюции, сундук скиллов.
// Работает с «данными игрока»: { weapons: [{id, level}], passives: [{id, level}] }.
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { COMBOS } from '../data/combos.js';
import { SLOTS, LEVEL_UP, CHEST } from '../data/constants.js';

/**
 * @param {{kind: string, id: string}} c карточка
 * @return {string} ключ kind:id
 */
export function cardKey(c) {
  return c.kind + ':' + c.id;
}

/**
 * @return {!Object} карточка лечения
 */
export function healCard() {
  return { kind: 'heal', id: 'heal', level: 1, isNew: false, icon: 'food' };
}

function find(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

/**
 * Все карточки, доступные сейчас (без лечения).
 * @param {!Object} player данные игрока
 * @param {?Set<string>} banished ключи kind:id
 * @param {number=} level уровень команды: пассивки с minLevel выше него не предлагаются (по умолчанию все)
 * @return {!Array<!Object>}
 */
export function buildPool(player, banished, level = Infinity) {
  const pool = [];
  const weapons = player.weapons;
  const passives = player.passives;
  const slots = player.slots || SLOTS; // в коопе слотов на игрока меньше (data/coop.js)
  // Оружие, поглощённое эволюцией игрока, больше не предлагается (как в VS); пассивка эволюции остаётся.
  const consumed = new Set();
  for (const c of COMBOS) {
    if (find(weapons, c.result)) for (const id of c.from) if (WEAPONS[id]) consumed.add(id);
  }
  for (const id in WEAPONS) {
    const def = WEAPONS[id];
    if (def.evolved || consumed.has(id)) continue;
    const own = find(weapons, id);
    const card = own
      ? (own.level < def.maxLevel ? { kind: 'weapon', id, level: own.level + 1, isNew: false, icon: def.icon } : null)
      : (weapons.length < slots.weapons ? { kind: 'weapon', id, level: 1, isNew: true, icon: def.icon } : null);
    if (card && !(banished && banished.has(cardKey(card)))) pool.push(card);
  }
  for (const id in PASSIVES) {
    const def = PASSIVES[id];
    const max = def.levels.length;
    const own = find(passives, id);
    if (!own && def.minLevel && level < def.minLevel) continue;
    const card = own
      ? (own.level < max ? { kind: 'passive', id, level: own.level + 1, isNew: false, icon: def.icon } : null)
      : (passives.length < slots.passives ? { kind: 'passive', id, level: 1, isNew: true, icon: def.icon } : null);
    if (card && !(banished && banished.has(cardKey(card)))) pool.push(card);
  }
  return pool;
}

/**
 * Тип набора карточек на выбор номер picks игрока (docs/META.md 1.3): чётный — оружие, нечётный — пассивки.
 * @param {number} picks сколько своих уровней игрок уже разобрал
 * @return {string} 'weapon' | 'passive'
 */
export function pickKind(picks) {
  return picks % 2 === 0 ? 'weapon' : 'passive';
}

/**
 * До count случайных различных карточек. Если выбрать нечего (всё на максимуме) — одна карточка лечения.
 * С opts.kind карточки только этого типа ('weapon' | 'passive'); если таких нет, сразу другого типа.
 * @param {!Object} player данные игрока
 * @param {{int: function(number): number}} rng
 * @param {?Set<string>} banished ключи kind:id
 * @param {number=} count
 * @param {?Array<!Object>=} exclude карточки, которые нельзя повторять (замена при banish)
 * @param {{kind: (string|undefined), level: (number|undefined)}=} opts тип набора и уровень команды (minLevel)
 * @return {!Array<!Object>}
 */
export function drawCards(player, rng, banished, count = LEVEL_UP.cards, exclude = null,
    opts = {}) {
  let pool = buildPool(player, banished, opts.level);
  if (exclude && exclude.length) {
    const ex = new Set();
    for (const c of exclude) ex.add(cardKey(c));
    pool = pool.filter((c) => !ex.has(cardKey(c)));
  }
  if (opts.kind) {
    const same = pool.filter((c) => c.kind === opts.kind);
    if (same.length) pool = same;
  }
  const out = [];
  while (out.length < count && pool.length > 0) {
    const i = rng.int(pool.length);
    out.push(pool[i]);
    pool[i] = pool[pool.length - 1];
    pool.pop();
  }
  if (out.length === 0 && !exclude) out.push(healCard());
  return out;
}

/**
 * Применить карточку к данным игрока. Для 'heal' данные не меняются (лечит sim).
 * @param {!Object} player данные игрока
 * @param {!Object} card
 */
export function applyCard(player, card) {
  if (card.kind === 'weapon') {
    if (card.from) {
      // супероружие занимает слот первой части, остальные части убираются
      let at = -1;
      for (const id of card.from) {
        const idx = player.weapons.findIndex((w) => w.id === id);
        if (idx < 0) continue;
        player.weapons[idx].removed = true;
        if (at < 0) { at = idx; player.weapons[idx] = { id: card.id, level: card.level }; } else {
          player.weapons.splice(idx, 1);
          if (idx < at) at--;
        }
      }
      if (at < 0) player.weapons.push({ id: card.id, level: card.level });
      return;
    }
    const own = find(player.weapons, card.id);
    if (own) own.level = card.level;
    else player.weapons.push({ id: card.id, level: card.level });
  } else if (card.kind === 'passive') {
    const own = find(player.passives, card.id);
    if (own) own.level = card.level;
    else player.passives.push({ id: card.id, level: card.level });
  }
}

// Готовая к слиянию пара, результата ещё нет. Возвращает запись из COMBOS или null.
// Оружие должно быть на максимуме; пассивка (эволюция как в VS) — просто взята, любой уровень.
function ready(player, id) {
  if (PASSIVES[id]) return !!find(player.passives, id);
  const w = find(player.weapons, id);
  return !!w && w.level >= WEAPONS[id].maxLevel;
}

/**
 * @param {!Object} player данные игрока
 * @return {!Array<!Object>} все готовые к слиянию записи из COMBOS (в порядке файла)
 */
export function findEvolutions(player) {
  const out = [];
  for (const c of COMBOS) {
    if (ready(player, c.from[0]) && ready(player, c.from[1]) &&
        !find(player.weapons, c.result)) {
      out.push(c);
    }
  }
  return out;
}

/**
 * @param {!Object} player данные игрока
 * @return {?Object} первая готовая к слиянию запись из COMBOS или null
 */
export function findEvolution(player) {
  const all = findEvolutions(player);
  return all.length ? all[0] : null;
}

/**
 * @param {{from: !Array<string>, result: string}} combo запись из COMBOS
 * @return {!Object} карточка супероружия
 */
export function evolutionCard(combo) {
  return { kind: 'weapon', id: combo.result, level: 1, isNew: true, evolved: true, from: combo.from.slice(), icon: WEAPONS[combo.result].icon };
}

/**
 * Выбор в сундуке скиллов (sim.state = 'chest'): карточки готовых эволюций, не больше max случайных.
 * Даже одна эволюция идёт через выбор: игрок может её пропустить (sim.skipChest) ради обычных апгрейдов.
 * @param {!Object} player данные игрока
 * @param {{int: function(number): number}} rng
 * @param {number=} max сколько вариантов показать
 * @return {!Array<!Object>} карточки или пустой массив, если готовых эволюций нет
 */
export function chestChoices(player, rng, max = CHEST.maxChoices) {
  const all = findEvolutions(player);
  if (!all.length) return [];
  const out = [];
  while (out.length < max && all.length) {
    out.push(all.splice(rng.int(all.length), 1)[0]);
  }
  return out.map(evolutionCard);
}

/**
 * Сундук скиллов без эволюций (docs/META.md 1.4): +1 уровень случайной своей пассивке и +1 уровень
 * случайному своему оружию (не новые), если есть что поднять. Эволюции здесь не выпадают (только выбором,
 * chestChoices). Поднять нечего — карточка лечения (её sim применяет без экрана).
 * Карточки с prev — уровень до подъёма (показ «Lv 2 → 3»).
 * @param {!Object} player данные игрока
 * @param {{int: function(number): number}} rng
 * @return {!Array<!Object>} пассивка, затем оружие (или одно лечение)
 */
export function skillChest(player, rng) {
  const out = [];
  const ps = [];
  for (const p of player.passives) {
    const def = PASSIVES[p.id];
    if (p.level < def.levels.length) {
      ps.push({ kind: 'passive', id: p.id, level: p.level + 1, prev: p.level, isNew: false, icon: def.icon });
    }
  }
  if (ps.length) out.push(ps[rng.int(ps.length)]);
  const ws = [];
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    if (!def.evolved && w.level < def.maxLevel) {
      ws.push({ kind: 'weapon', id: w.id, level: w.level + 1, prev: w.level, isNew: false, icon: def.icon });
    }
  }
  if (ws.length) out.push(ws[rng.int(ws.length)]);
  if (!out.length) out.push(healCard());
  return out;
}
