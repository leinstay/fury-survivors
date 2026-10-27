// Операции экрана инвентаря (src/core/inventory.js) и формат сохранения с пресетами.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/rng.js';
import { rollItem, makeUnique, emptyInventory, normalizeInventory } from '../../src/core/items.js';
import {
  equip, unequip, savePreset, loadPreset, sortStash, takeLoot, replaceItem, dropItem, findItem,
} from '../../src/core/inventory.js';
import { STASH, BAG } from '../../src/data/items.js';

function invWith(n, seed = 1) {
  const rng = createRng(seed);
  const inv = emptyInventory();
  for (let i = 0; i < n; i++) inv.stash.push(rollItem(rng, 2, { uid: `it${i}` }));
  return inv;
}

test('inventory: equip / unequip / rotate placement through the bag', () => {
  let inv = invWith(3);
  const it = inv.stash[0];
  inv = equip(inv, it.uid, 0, 0, false);
  assert.ok(inv);
  assert.equal(inv.stash.length, 2);
  assert.equal(findItem(inv, it.uid).where, 'bag');
  assert.equal(equip(inv, inv.stash[0].uid, 0, 0), null); // клетка занята
  inv = unequip(inv, it.uid);
  assert.equal(inv.stash.length, 3);
  assert.equal(inv.bag.items.length, 0);
});

test('inventory: one unique in the bag, stash full blocks unequip', () => {
  let inv = emptyInventory();
  inv.stash.push(makeUnique('dice', 2, 'u1'), makeUnique('last_chance', 2, 'u2'));
  inv = equip(inv, 'u1', 0, 0);
  assert.equal(equip(inv, 'u2', 3, 0), null);
  const full = { ...inv, stash: invWith(STASH.size).stash };
  assert.equal(unequip(full, 'u1'), null);
});

test('inventory: presets save and load layouts, survive normalize, missing items skipped', () => {
  let inv = invWith(4);
  inv = equip(inv, 'it0', 0, 0);
  inv = savePreset(inv, 1);
  assert.equal(inv.presets.length, BAG.presets);
  assert.deepEqual(inv.presets[1], [{ uid: 'it0', x: 0, y: 0, rot: false }]);
  inv = unequip(inv, 'it0');
  const r = loadPreset(inv, 1);
  assert.ok(r.ok);
  assert.equal(findItem(r.inv, 'it0').where, 'bag');
  const back = normalizeInventory(JSON.parse(JSON.stringify(r.inv)));
  assert.deepEqual(back.presets, r.inv.presets);
  const gone = loadPreset(dropItem(inv, 'it0'), 1);
  assert.equal(gone.missing, 1);
  assert.equal(loadPreset(inv, 0).ok, false);
});

test('inventory: sort, replace, seen uniques and loot eviction', () => {
  const inv = invWith(STASH.size, 3);
  const sorted = sortStash(inv.stash, 'rarity');
  assert.equal(sorted.length, inv.stash.length);
  const rank = { common: 0, rare: 1, epic: 2 };
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(rank[sorted[i - 1].rarity] >= rank[sorted[i].rarity]);
  }
  const u = makeUnique('myopia', 2, 'newu');
  const victim = inv.stash.find((x) => x.rarity === 'common');
  const r = takeLoot(inv, u, victim.uid);
  assert.ok(r.ok);
  assert.equal(r.inv.stash.length, STASH.size);
  assert.ok(r.crystals > 0);
  assert.equal(r.inv.wallet.crystals, r.crystals);
  assert.equal(r.inv.seen.myopia, 1);
  const rep = replaceItem(r.inv, 'newu', { ...u, locked: true });
  assert.equal(findItem(rep, 'newu').item.locked, true);
});
