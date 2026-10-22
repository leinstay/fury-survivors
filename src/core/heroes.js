// Выбор героя: проверка id и свободные герои для коопа (два игрока не могут взять одного героя).
// Чистые функции, список героев только из src/data/heroes.js.
import { HEROES, DEFAULT_HERO } from '../data/heroes.js';

/** @return {!Array<string>} id героев в порядке записей data/heroes.js */
export function heroIds() {
  return Object.keys(HEROES);
}

/**
 * @param {*} id
 * @return {string} id, если такой герой есть, иначе DEFAULT_HERO
 */
export function validHero(id) {
  return typeof id === 'string' && HEROES[id] ? id : DEFAULT_HERO;
}

/**
 * Первый герой не из taken; want — если свободен, он.
 * @param {!Array<string>} taken
 * @param {string=} want
 * @return {string}
 */
export function freeHero(taken, want) {
  if (want && HEROES[want] && !taken.includes(want)) return want;
  return heroIds().find((h) => !taken.includes(h)) || DEFAULT_HERO;
}

/**
 * Герои на n игроков: каждому свой (заданный, если он есть и ещё не занят, иначе первый свободный).
 * @param {number} n
 * @param {!Array<string>=} wanted
 * @return {!Array<string>}
 */
export function distinctHeroes(n, wanted = []) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(freeHero(out, wanted[i]));
  return out;
}
