// Сумки для ботов (createSim({loadouts})): типичная полная сумка тира, собранная из случайных предметов.
// Редкость по таблице сундука тира (rollItem без rarity: common/rare/epic по весам CHEST_TABLES; уникалки
// не кладутся, их эффект не «типичен»). Предметы ставятся первым подходящим местом (можно с поворотом),
// пока не заполнено cells клеток или не кончились попытки. pick — из скольких случайных предметов игрок
// оставляет лучший (по сумме value/max аффиксов): 1 — без отбора. Детерминировано от seed.
import { createRng, hashSeed } from '../../src/core/rng.js';
import { rollItem, createBag, place, itemSize } from '../../src/core/items.js';
import { BAG } from '../../src/data/items.js';

function firstFit(bag, item) {
  for (const rot of [false, true]) {
    const [w, h] = itemSize(item, rot);
    for (let y = 0; y + h <= bag.rows; y++) {
      for (let x = 0; x + w <= bag.cols; x++) {
        const next = place(bag, item, x, y, rot);
        if (next) return next;
      }
    }
  }
  return null;
}

function score(item) {
  return item.affixes.reduce((s, a) => s + (a.max ? a.value / a.max : 0), 0);
}

function used(bag) {
  return bag.items.reduce((s, e) => s + e.item.shape[0] * e.item.shape[1], 0);
}

/**
 * @param {number} seed
 * @param {{tier?: number, cells?: number, cols?: number, rows?: number, tries?: number}=} opts
 * @return {{cols: number, rows: number, items: !Array}}
 */
export function rollBag(seed, { tier = 2, cells = 45, cols = BAG.w, rows = BAG.h, tries = 400,
  pick = 1 } = {}) {
  const rng = createRng(hashSeed(seed, 4243, tier));
  let bag = createBag(cols, rows);
  for (let i = 0; i < tries && used(bag) < Math.min(cells, cols * rows); i++) {
    let best = null;
    for (let k = 0; k < pick; k++) {
      const next = firstFit(bag, rollItem(rng, tier));
      const v = next ? score(next.items[next.items.length - 1].item) : -Infinity;
      if (next && (!best || v > best.v)) best = { next, v };
    }
    if (best) bag = best.next;
  }
  return bag;
}

/** Сумки на игроков забега по описанию config.bag ({tier, cells}) или null. */
export function bagsFor(config) {
  if (!config.bag) return null;
  return Array.from({ length: config.players }, (_, i) =>
    rollBag(config.seed * 31 + i * 7919 + 17, config.bag));
}
