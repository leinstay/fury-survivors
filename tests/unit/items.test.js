import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import {
  ITEM_STATS, ITEM_TYPES, STAT_REF, UNIQUES, BAG, STASH, CRAFT, NAME_WORDS, CHEST_SIZE,
} from '../../src/data/items.js';
import {
  shapeBudget, affixRange, rollItem, rollChest, rollUnique, makeUnique, rollHearts, itemName,
  affixLines, createBag, bagSize, canPlace, place, remove, rotate, bagGrid, bagFull, bagTypes,
  bagBonus, resizeBag, previewEvict, stashAdd, stashLock, disassemble, disassembleValue,
  emptyWallet, addCurrency, craftCost, craftChance, rerollAll, rerollValue, upgradeRarity,
  enchant, merge, normalizeItem, normalizeInventory, emptyInventory,
} from '../../src/core/items.js';
import { t, hasKey } from '../../src/i18n/index.js';

// rng, который всегда отдаёт одно число (для путей успеха и провала)
const fixed = (v) => ({ next: () => v, range: (a, b) => a + (b - a) * v,
  int: (n) => Math.floor(v * n), pick: (arr) => arr[Math.floor(v * arr.length)] });

test('items: same seed gives the same chest', () => {
  const a = rollChest(createRng(42), 3);
  const b = rollChest(createRng(42), 3);
  assert.deepEqual(a, b);
  assert.equal(a.length, CHEST_SIZE);
  assert.notDeepEqual(rollChest(createRng(43), 3), a);
});

test('items: shape budget table', () => {
  const close = (s, v) => assert.ok(Math.abs(shapeBudget(s) - v) < 0.01, `${s}: ${shapeBudget(s)}`);
  close([1, 1], 1.0);
  close([2, 2], 5.66);
  close([2, 3], 9.39);
  close([2, 4], 13.45);
  close([3, 3], 15.59);
});

test('items: rolled items follow the rules', () => {
  const rng = createRng(7);
  for (let i = 0; i < 2000; i++) {
    const tier = 1 + (i % 4);
    const it = rollItem(rng, tier);
    const def = ITEM_TYPES[it.type];
    assert.ok(def && def.weight > 0, it.type);
    assert.ok(def.shapes.some((s) => s.size[0] === it.shape[0] && s.size[1] === it.shape[1]));
    const n = { common: 2, rare: 3, epic: 4 }[it.rarity];
    assert.equal(it.affixes.length, n);
    assert.equal(new Set(it.affixes.map((a) => a.stat)).size, n, 'no repeated affix');
    assert.equal(it.implicit, it.affixes[0].stat);
    if (def.implicit) assert.ok(def.implicit.includes(it.implicit));
    const imp = it.affixes[0];
    assert.ok(imp.value >= imp.max / 2 - 1e-4 && imp.value <= imp.max + 1e-4, 'implicit positive');
    for (const a of it.affixes.slice(1)) {
      assert.ok(a.value >= a.min - 1e-4 && a.value <= a.max + 1e-4);
      assert.ok(Math.abs(a.min + a.max / 2) < 1e-3);
    }
    assert.equal(normalizeItem(JSON.parse(JSON.stringify(it))).uid, it.uid);
  }
});

test('items: optional affix goes negative about 1/3 of the time', () => {
  const rng = createRng(11);
  let neg = 0;
  let total = 0;
  for (let i = 0; i < 4000; i++) {
    for (const a of rollItem(rng, 2, { rarity: 'epic' }).affixes.slice(1)) {
      total++;
      if (a.value < 0) neg++;
    }
  }
  const f = neg / total;
  assert.ok(f > 0.31 && f < 0.36, `negative share ${f}`);
});

test('items: a full T2 bag is worth about 2-3 maxed passives', () => {
  // типичная полная сумка 9×5: 45 клеток, 10 типов
  const kit = [
    ['weapon', [2, 4]], ['armor', [2, 3]], ['shield', [2, 3]], ['helm', [2, 2]],
    ['gloves', [2, 2]], ['boots', [2, 2]], ['belt', [2, 1]],
    ['ring', [1, 1]], ['ring', [1, 1]], ['amulet', [1, 1]], ['amulet', [1, 1]],
    ['charm', [1, 2]], ['charm', [1, 2]], ['charm', [1, 1]], ['charm', [1, 1]], ['charm', [1, 1]],
  ];
  assert.equal(kit.reduce((s, [, z]) => s + z[0] * z[1], 0), 45);
  const rng = createRng(5);
  const N = 300;
  let sum = 0;
  for (let n = 0; n < N; n++) {
    const items = kit.map(([type, size]) => ({
      item: rollItem(rng, 2, { type, size, rarity: rng.pick(['common', 'rare', 'rare', 'epic']) }),
      x: 0, y: 0, rot: false,
    }));
    const b = bagBonus({ cols: 9, rows: 5, items });
    for (const [s, v] of Object.entries({ ...b.inc, ...b.flat })) sum += v / STAT_REF[s];
  }
  const passives = sum / N;
  assert.ok(passives >= 2 && passives <= 3, `full T2 bag = ${passives.toFixed(2)} passives`);
});

test('items: chest tables (T1 no uniques, T4 only epic, unique or scroll)', () => {
  const rng = createRng(3);
  for (let i = 0; i < 300; i++) {
    for (const e of rollChest(rng, 1)) assert.equal(e.kind, 'item');
    for (const e of rollChest(rng, 4)) {
      assert.ok(e.kind === 'scroll' || e.kind === 'unique' || e.item.rarity === 'epic');
      if (e.kind === 'unique') assert.ok(e.item.unique);
    }
  }
  for (let i = 0; i < 200; i++) assert.notEqual(rollUnique(rng, 2).unique, 'bible');
  assert.equal(rollHearts(rng, 1), 1);
  assert.equal(rollHearts(rng, 3), 2);
  assert.equal(rollHearts(fixed(0.9), 0), 0);
  assert.equal(rollHearts(fixed(0.1), 0), 1);
});

test('items: names and i18n keys exist', () => {
  const rng = createRng(9);
  for (let i = 0; i < 500; i++) {
    const it = rollItem(rng, 1 + (i % 4), { rarity: 'rare' });
    const n = itemName(it);
    for (const k of [n.prefix, n.base, n.suffix]) assert.ok(hasKey(k), k);
  }
  for (const s of ITEM_STATS) {
    assert.ok(hasKey(`item.stat.${s}`), s);
    for (let i = 0; i < NAME_WORDS; i++) {
      assert.ok(hasKey(`item.prefix.${s}.${i}`) && hasKey(`item.suffix.${s}.${i}`), `${s} ${i}`);
    }
  }
  for (const id of Object.keys(UNIQUES)) {
    assert.ok(hasKey(`unique.${id}.name`) && hasKey(`unique.${id}.desc`), id);
    assert.equal(itemName(makeUnique(id, 3, 'u1')).base, `unique.${id}.name`);
  }
  assert.equal(t('unique.bible.desc'), 'This might come in handy.');
  // слово по качеству: минимум разброса — первое, максимум — последнее
  const it = rollItem(rng, 2, { rarity: 'rare' });
  const lo = { ...it, affixes: it.affixes.map((a) => ({ ...a, value: a.min })) };
  const hi = { ...it, affixes: it.affixes.map((a) => ({ ...a, value: a.max })) };
  assert.match(itemName(lo).prefix, /\.0$/);
  assert.match(itemName(hi).prefix, new RegExp(`\\.${NAME_WORDS - 1}$`));
});

test('items: affix lines carry the enchant multiplier and range', () => {
  const it = { ...rollItem(createRng(1), 2), enchant: 2 };
  const l = affixLines(it);
  assert.ok(Math.abs(l[0].value - it.affixes[0].value * 1.1) < 1e-9);
  assert.ok(Math.abs(l[0].max - it.affixes[0].max * 1.1) < 1e-9);
  assert.equal(l[0].implicit, true);
  const r = affixRange('steel', [2, 2], 2, false);
  assert.ok(Math.abs(r.min + r.max / 2) < 1e-3);
});

test('bag: placement, overlap, rotation, unlocked bounds', () => {
  const rng = createRng(2);
  const sword = rollItem(rng, 1, { type: 'weapon', size: [1, 4] });
  const helm = rollItem(rng, 1, { type: 'helm' });
  let bag = createBag();
  assert.deepEqual([bag.cols, bag.rows], [BAG.startCols, BAG.startRows]);
  assert.ok(canPlace(bag, sword, 0, 0, false));
  assert.ok(!canPlace(bag, sword, 0, 1, false), 'sticks out of the 4 open rows');
  assert.ok(!canPlace(bag, sword, 4, 0, true), 'rotated 4×1 needs columns 4..7');
  assert.ok(canPlace(bag, sword, 3, 0, true));
  bag = place(bag, sword, 0, 0, false);
  assert.ok(!canPlace(bag, helm, 0, 0), 'overlap');
  assert.ok(canPlace(bag, helm, 1, 0));
  bag = place(bag, helm, 1, 0);
  assert.equal(bagGrid(bag)[3][0], sword.uid);
  assert.equal(bagGrid(bag)[1][2], helm.uid);
  // поворот на месте: 1×4 → 4×1 в (0,0) упирается в шлем
  assert.equal(rotate(bag, sword.uid), null);
  bag = remove(bag, helm.uid);
  bag = rotate(bag, sword.uid);
  assert.ok(bag && bag.items[0].rot);
  // перемещение того же предмета не мешает самому себе
  assert.ok(place(bag, sword, 1, 0, true));
  assert.equal(bagTypes(bag), 1);
  assert.ok(!bagFull(bag));
  // ачивки открывают столбцы и ряд
  assert.deepEqual(bagSize(['three_crowns']), { cols: 8, rows: 4 });
  assert.deepEqual(bagSize({ three_crowns: 1, hoarder: 1, tetris: 1 }), { cols: 9, rows: 5 });
  assert.deepEqual(bagSize(new Set(['tetris'])), { cols: 7, rows: 5 });
  const small = resizeBag(place(createBag(9, 5), sword, 8, 0), 7, 4);
  assert.equal(small.dropped.length, 1);
});

test('bag: one unique at most, diversity bonus, unique more', () => {
  let bag = createBag(9, 5);
  const gc = makeUnique('glass_cannon', 2, 'u1');
  const greed = makeUnique('greed', 2, 'u2');
  bag = place(bag, gc, 0, 0);
  assert.ok(bag);
  assert.ok(!canPlace(bag, greed, 5, 0), 'second unique');
  assert.ok(canPlace(bag, makeUnique('greed', 2, 'u1'), 5, 0), 'moving the same unique is fine');
  const ring = { uid: 'r1', type: 'ring', shape: [1, 1], tier: 1, rarity: 'common',
    implicit: 'crit', affixes: [{ stat: 'crit', value: 0.01, min: 0.005, max: 0.01 },
      { stat: 'steel', value: 0.02, min: -0.01, max: 0.02 }], enchant: 2, unique: null,
    locked: false };
  bag = place(bag, ring, 3, 0);
  const b = bagBonus(bag);
  assert.equal(b.types, 2);
  assert.ok(Math.abs(b.diversity - 1.04) < 1e-9);
  assert.ok(Math.abs(b.flat.crit - 0.01 * 1.1 * 1.04) < 1e-9);
  assert.ok(Math.abs(b.inc.steel - 0.02 * 1.1 * 1.04) < 1e-9);
  assert.deepEqual(b.more, { steel: 1, magic: 1 });
  assert.deepEqual(b.uniques, ['glass_cannon']);
});

test('stash: eviction preview takes the lowest unlocked rarity, add and disassemble', () => {
  const rng = createRng(4);
  let stash = [];
  for (let i = 0; i < STASH.size; i++) {
    const r = stashAdd(stash, rollItem(rng, 1, { rarity: i < 3 ? 'common' : 'epic' }));
    assert.ok(r.ok);
    stash = r.stash;
  }
  assert.equal(previewEvict(stash.slice(1), rng), null, 'not full');
  stash = stashLock(stash, stash[0].uid, true);
  const commons = stash.filter((x) => x.rarity === 'common' && !x.locked).map((x) => x.uid);
  for (let i = 0; i < 20; i++) assert.ok(commons.includes(previewEvict(stash, rng)));
  const item = rollItem(rng, 2);
  assert.equal(stashAdd(stash, item).reason, 'full');
  const ev = previewEvict(stash, rng);
  const r = stashAdd(stash, item, ev);
  assert.ok(r.ok);
  assert.equal(r.evicted.uid, ev);
  assert.equal(r.crystals, 1);
  assert.equal(r.stash.length, STASH.size);
  assert.equal(stashAdd(stash, item, stash[0].uid).reason, 'full', 'locked is never evicted');
  // всё залочено: вытеснять нечего
  let all = stash;
  for (const x of stash) all = stashLock(all, x.uid, true);
  assert.equal(previewEvict(all, rng), null);
  // разборка
  assert.equal(disassemble(stash, stash[0].uid, emptyWallet()).reason, 'locked');
  const d = disassemble(stash, stash[5].uid, emptyWallet());
  assert.ok(d.ok);
  assert.equal(d.wallet.crystals, 9);
  assert.equal(disassembleValue(makeUnique('dice', 4, 'x')), 160);
});

test('craft: costs, funds, reroll paths', () => {
  const rng = createRng(8);
  const it = rollItem(rng, 3, { rarity: 'rare', type: 'gloves' });
  assert.deepEqual(craftCost('rerollAll', it), { crystals: 18, hearts: 0, scrolls: 0 });
  assert.deepEqual(craftCost('rerollValue', it), { crystals: 45, hearts: 0, scrolls: 0 });
  assert.deepEqual(craftCost('upgradeRarity', it), { crystals: 120, hearts: 3, scrolls: 0 });
  assert.deepEqual(craftCost('enchant', it), { crystals: 15, hearts: 0, scrolls: 0 });
  assert.equal(craftCost('rerollAll', makeUnique('dice', 3, 'u')), null, 'uniques are not craftable');
  assert.equal(craftCost('upgradeRarity', { ...it, rarity: 'epic' }), null);
  assert.equal(craftCost('enchant', { ...it, enchant: 9 }), null);

  assert.equal(rerollAll(rng, it, emptyWallet()).reason, 'funds');
  const w = addCurrency(emptyWallet(), { crystals: 100 });
  const ra = rerollAll(rng, it, w);
  assert.ok(ra.ok && ra.success);
  assert.equal(ra.wallet.crystals, 82);
  assert.equal(ra.item.uid, it.uid);
  assert.equal(ra.item.affixes.length, 3);
  assert.ok(ITEM_TYPES.gloves.implicit.includes(ra.item.implicit));
  const rv = rerollValue(rng, it, 1, w);
  assert.equal(rv.item.affixes[1].stat, it.affixes[1].stat);
  assert.equal(rv.item.affixes[2], it.affixes[2]);
  assert.equal(rv.wallet.crystals, 55);
  assert.equal(rerollValue(rng, it, 5, w).reason, 'invalid');
});

test('craft: rarity upgrade success, break and scroll', () => {
  const it = rollItem(createRng(6), 1, { rarity: 'common' });
  const w = addCurrency(emptyWallet(), { crystals: 100, hearts: 5, scrolls: 1 });
  assert.equal(craftChance('upgradeRarity', it), CRAFT.upgradeRarity.chance.rare);
  const ok = upgradeRarity(fixed(0.1), it, w);
  assert.ok(ok.success);
  assert.equal(ok.item.rarity, 'rare');
  assert.equal(ok.item.affixes.length, 3);
  assert.deepEqual(ok.wallet, { crystals: 60, scrolls: 1, hearts: 4 });
  const br = upgradeRarity(fixed(0.95), it, w);
  assert.ok(br.ok && br.broken && !br.item);
  assert.equal(br.refund, 0);
  const sv = upgradeRarity(fixed(0.95), it, w, { scroll: true });
  assert.ok(sv.saved && !sv.broken);
  assert.equal(sv.item, it);
  assert.equal(sv.wallet.scrolls, 0);
  const sOk = upgradeRarity(fixed(0.1), it, w, { scroll: true });
  assert.equal(sOk.wallet.scrolls, 1, 'scroll kept on success');
  assert.equal(upgradeRarity(fixed(0.1), it, emptyWallet(), { scroll: true }).reason, 'funds');
});

test('craft: enchant is safe to +3, then risky and breaks into crystals', () => {
  let it = rollItem(createRng(12), 2, { rarity: 'rare' });
  let w = addCurrency(emptyWallet(), { crystals: 1000, scrolls: 1 });
  for (let n = 1; n <= 3; n++) {
    const r = enchant(fixed(0.999), it, w, { scroll: true });
    assert.ok(r.success, `+${n}`);
    assert.equal(r.cost.crystals, 5 * n * 2);
    assert.equal(r.wallet.scrolls, 1, 'no scroll spent on safe levels');
    it = r.item;
    w = r.wallet;
  }
  assert.equal(it.enchant, 3);
  assert.equal(craftChance('enchant', it), 0.7);
  const br = enchant(fixed(0.8), it, w);
  assert.ok(br.broken);
  assert.equal(br.refund, disassembleValue(it));
  assert.equal(br.wallet.crystals, w.crystals - 40 + br.refund);
  const sv = enchant(fixed(0.8), it, w, { scroll: true });
  assert.ok(sv.saved);
  assert.equal(sv.item.enchant, 3);
});

test('craft: merge keeps values, takes the lower enchant, same type only', () => {
  const rng = createRng(13);
  const a = { ...rollItem(rng, 2, { type: 'boots', rarity: 'epic' }), enchant: 5 };
  const b = { ...rollItem(rng, 3, { type: 'boots', rarity: 'common' }), enchant: 1 };
  const w = addCurrency(emptyWallet(), { crystals: 500, hearts: 10 });
  for (let i = 0; i < 50; i++) {
    const r = merge(rng, a, b, w);
    assert.ok(r.ok && r.success);
    const m = r.item;
    assert.ok(m.rarity === a.rarity || m.rarity === b.rarity);
    assert.equal(m.affixes.length, { common: 2, epic: 4 }[m.rarity]);
    assert.equal(m.enchant, 1);
    assert.ok(m.uid !== a.uid && m.uid !== b.uid);
    assert.ok(m.affixes[0].stat === a.affixes[0].stat || m.affixes[0].stat === b.affixes[0].stat);
    const src = [...a.affixes, ...b.affixes];
    for (const x of m.affixes) {
      assert.ok(src.some((s) => s.stat === x.stat && s.value === x.value) ||
        !src.some((s) => s.stat === x.stat), 'value carried over unchanged');
    }
    assert.equal(r.cost.crystals, 60);
    assert.equal(r.cost.hearts, m.rarity === 'epic' ? 3 : 0);
  }
  const ring = rollItem(rng, 2, { type: 'ring' });
  assert.equal(merge(rng, a, ring, w).reason, 'invalid');
  assert.equal(merge(rng, a, { ...b, locked: true }, w).reason, 'locked');
});

test('normalize: bad data dropped, numbers clamped, bag overflow goes to stash', () => {
  assert.equal(normalizeItem(null), null);
  assert.equal(normalizeItem({ uid: 'a', type: 'nope', tier: 1 }), null);
  const it = rollItem(createRng(14), 2, { type: 'ring', rarity: 'rare' });
  assert.equal(normalizeItem({ ...it, uid: 'BAD UID' }), null);
  assert.equal(normalizeItem({ ...it, shape: [2, 2] }), null);
  assert.equal(normalizeItem({ ...it, tier: 9 }), null);
  const hacked = normalizeItem({ ...it, enchant: 99,
    affixes: [{ ...it.affixes[0], value: 50, max: 50 }, ...it.affixes.slice(1)] });
  assert.equal(hacked.enchant, CRAFT.enchant.max);
  assert.ok(hacked.affixes[0].value < 1);
  assert.equal(normalizeItem({ ...it, affixes: [it.affixes[1], it.affixes[0]] }) === null,
    !ITEM_TYPES.ring.implicit.includes(it.affixes[1].stat));
  const u = normalizeItem({ uid: 'u1', tier: 3, rarity: 'unique', unique: 'bible', locked: true });
  assert.deepEqual(u.shape, UNIQUES.bible.size);
  assert.equal(u.locked, true);
  assert.equal(normalizeItem({ uid: 'u1', tier: 3, unique: 'nope' }), null);

  assert.deepEqual(normalizeInventory(null), emptyInventory());
  assert.equal(normalizeInventory({ v: 999 }), null);
  const big = rollItem(createRng(15), 1, { type: 'weapon', size: [1, 4] });
  const inv = normalizeInventory({
    v: 1,
    bag: { cols: 9, rows: 5, items: [{ item: big, x: 8, y: 1, rot: false },
      { item: it, x: 0, y: 0 }, { item: it, x: 1, y: 0 }] },
    stash: [it, { junk: true }],
    wallet: { crystals: 12.7, hearts: -3, scrolls: 'x' },
  }, { cols: 7, rows: 4 });
  assert.equal(inv.bag.items.length, 1);
  assert.equal(inv.stash.length, 1, 'big moved to stash, duplicates and junk dropped');
  assert.equal(inv.stash[0].uid, big.uid);
  assert.deepEqual(inv.wallet, { crystals: 12, scrolls: 0, hearts: 0 });
});
