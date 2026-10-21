// Карточки улучшений: пул, добор, применение, супероружие, содержимое сундука.
// Работает с «данными игрока»: { weapons: [{id, level}], passives: [{id, level}] }.
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { COMBOS } from '../data/combos.js';
import { SLOTS, LEVEL_UP } from '../data/constants.js';

export function cardKey(c) {
  return c.kind + ':' + c.id;
}

export function healCard() {
  return { kind: 'heal', id: 'heal', level: 1, isNew: false, icon: 'food' };
}

function find(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

// Все карточки, доступные сейчас (без лечения). banished — Set ключей kind:id.
export function buildPool(player, banished) {
  const pool = [];
  const weapons = player.weapons;
  const passives = player.passives;
  for (const id in WEAPONS) {
    const def = WEAPONS[id];
    if (def.evolved) continue;
    const own = find(weapons, id);
    const card = own
      ? (own.level < def.maxLevel ? { kind: 'weapon', id, level: own.level + 1, isNew: false, icon: def.icon } : null)
      : (weapons.length < SLOTS.weapons ? { kind: 'weapon', id, level: 1, isNew: true, icon: def.icon } : null);
    if (card && !(banished && banished.has(cardKey(card)))) pool.push(card);
  }
  for (const id in PASSIVES) {
    const def = PASSIVES[id];
    const max = def.levels.length;
    const own = find(passives, id);
    const card = own
      ? (own.level < max ? { kind: 'passive', id, level: own.level + 1, isNew: false, icon: def.icon } : null)
      : (passives.length < SLOTS.passives ? { kind: 'passive', id, level: 1, isNew: true, icon: def.icon } : null);
    if (card && !(banished && banished.has(cardKey(card)))) pool.push(card);
  }
  return pool;
}

// До count случайных различных карточек. Если выбрать нечего (всё на максимуме) — одна карточка лечения.
// exclude — массив карточек, которые нельзя повторять (замена при banish).
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

// Применить карточку к данным игрока. Для 'heal' данные не меняются (лечит sim).
export function applyCard(player, card) {
  if (card.kind === 'weapon') {
    if (card.from) {
      for (const id of card.from) {
        const idx = player.weapons.findIndex((w) => w.id === id);
        if (idx >= 0) {
          player.weapons[idx].removed = true;
          player.weapons.splice(idx, 1);
        }
      }
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

// Готовая к слиянию пара: обе части на максимуме, результата ещё нет. Возвращает запись из COMBOS или null.
export function findEvolution(player) {
  for (const c of COMBOS) {
    const a = find(player.weapons, c.from[0]);
    const b = find(player.weapons, c.from[1]);
    if (a && b && a.level >= WEAPONS[a.id].maxLevel && b.level >= WEAPONS[b.id].maxLevel && !find(player.weapons, c.result)) return c;
  }
  return null;
}

export function evolutionCard(combo) {
  return { kind: 'weapon', id: combo.result, level: 1, isNew: true, evolved: true, from: combo.from.slice(), icon: WEAPONS[combo.result].icon };
}

// Содержимое сундука: супероружие, иначе апгрейд случайного оружия, иначе пассивки, иначе лечение.
export function chestItems(player, rng) {
  const combo = findEvolution(player);
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
