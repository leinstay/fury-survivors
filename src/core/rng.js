// Сидируемый RNG (mulberry32). В core никакого Math.random.

/**
 * Смешать до трёх чисел в 32-битный сид.
 * @param {number} a
 * @param {number=} b
 * @param {number=} c
 * @return {number} беззнаковое 32-битное число
 */
export function hashSeed(a, b = 0, c = 0) {
  let h = (a | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * @param {number=} seed
 * @return {{next: function(): number, range: function(number, number): number,
 *     int: function(number): number, pick: function(!Array): *, state: number}}
 *     next() в [0, 1), range(a, b), int(n) в [0, n), pick(arr), state
 */
export function createRng(seed = 1) {
  let s = seed >>> 0;
  const rng = {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) { return a + (b - a) * rng.next(); },
    int(n) { return Math.floor(rng.next() * n); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    get state() { return s; },
  };
  return rng;
}
