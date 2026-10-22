// Карточки улучшений: пул, добор, применение, супероружие, содержимое сундука.
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
 * @param {!Set<string>} banished ключи kind:id
 * @return {!Array<!Object>}
 */
export function buildPool(player, banished) {
  const pool = [];
  const weapons = player.weapons;
  const passives = player.passives;
  const slots = player.slots || SLOTS; // в коопе слотов на игрока меньше (data/coop.js)
  // Оружие, поглощённое супероружием игрока, больше не предлагается (как в VS).
  const consumed = new Set();
  for (const c of COMBOS) if (find(weapons, c.result)) for (const id of c.from) consumed.add(id);
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
    const card = own
      ? (own.level < max ? { kind: 'passive', id, level: own.level + 1, isNew: false, icon: def.icon } : null)
      : (passives.length < slots.passives ? { kind: 'passive', id, level: 1, isNew: true, icon: def.icon } : null);
    if (card && !(banished && banished.has(cardKey(card)))) pool.push(card);
  }
  return pool;
}

/**
 * До count случайных различных карточек. Если выбрать нечего (всё на максимуме) — одна карточка лечения.
 * @param {!Object} player данные игрока
 * @param {{int: function(number): number}} rng
 * @param {!Set<string>} banished ключи kind:id
 * @param {number=} count
 * @param {?Array<!Object>=} exclude карточки, которые нельзя повторять (замена при banish)
 * @return {!Array<!Object>}
 */
export function drawCards(player, rng, banished, count = LEVEL_UP.cards, exclude = null) {
  let pool = buildPool(player, banished);
  if (exclude && exclude.length) {
    const ex = new Set();
    for (const c of exclude) ex.add(cardKey(c));
    pool = pool.filter((c) => !ex.has(cardKey(c)));
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
 * Выбор в сундуке (sim.state = 'chest'): карточки готовых супероружий, не больше CHEST.maxChoices случайных.
 * Даже одно супероружие идёт через выбор: игрок может его пропустить (sim.skipChest) ради обычного апгрейда.
 * @param {!Object} player данные игрока
 * @param {{int: function(number): number}} rng
 * @return {!Array<!Object>} карточки или пустой массив, если готовых супероружий нет
 */
export function chestChoices(player, rng) {
  const all = findEvolutions(player);
  if (!all.length) return [];
  const out = [];
  while (out.length < CHEST.maxChoices && all.length) {
    out.push(all.splice(rng.int(all.length), 1)[0]);
  }
  return out.map(evolutionCard);
}

/**
 * Содержимое сундука: супероружие, иначе апгрейд случайного оружия, иначе пассивки, иначе лечение.
 * @param {!Object} player данные игрока
 * @param {{int: function(number): number}} rng
 * @param {boolean=} skipEvolution не предлагать супероружие (игрок пропустил выбор)
 * @return {!Array<!Object>} одна карточка
 */
export function chestItems(player, rng, skipEvolution = false) {
  const combo = skipEvolution ? null : findEvolution(player);
  if (combo) return [evolutionCard(combo)];
  const ups = [];
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    if (!def.evolved && w.level < def.maxLevel) ups.push({ kind: 'weapon', id: w.id, level: w.level + 1, isNew: false, icon: def.icon });
  }
  if (ups.length) return [ups[rng.int(ups.length)]];
  for (const p of player.passives) {
    const def = PASSIVES[p.id];
    if (p.level < def.levels.length) ups.push({ kind: 'passive', id: p.id, level: p.level + 1, isNew: false, icon: def.icon });
  }
  if (ups.length) return [ups[rng.int(ups.length)]];
  return [healCard()];
}
