// Выбор героя: проверка id и свободные герои для коопа (два игрока не могут взять одного героя).
// Чистые функции, список героев только из src/data/heroes.js.
import { HEROES, DEFAULT_HERO, HERO_BASE } from '../data/heroes.js';
import { PASSIVES } from '../data/passives.js';

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

/**
 * Черты героя для экрана выбора: статы, которые выше или ниже среднего героя (HERO_BASE). Сначала плюсы,
 * внутри — в порядке пассивок (у каждой черты иконка пассивки того же стата).
 * @param {string} id
 * @return {!Array<{stat: string, passive: string, up: boolean}>}
 */
export function heroTraits(id) {
  const st = HEROES[validHero(id)].stats;
  const out = [];
  for (const [pid, p] of Object.entries(PASSIVES)) {
    const d = (st[p.stat] ?? HERO_BASE[p.stat]) - HERO_BASE[p.stat];
    if (Math.abs(d) > 1e-9) out.push({ stat: p.stat, passive: pid, up: d > 0 });
  }
  return out.sort((a, b) => Number(b.up) - Number(a.up));
}
