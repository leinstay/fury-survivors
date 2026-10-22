import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPool, drawCards, applyCard, findEvolution, evolutionCard, chestItems, cardKey } from '../../src/core/upgrades.js';
import { createRng } from '../../src/core/rng.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { COMBOS } from '../../src/data/combos.js';
import { SLOTS } from '../../src/data/constants.js';

const fresh = () => ({ weapons: [{ id: 'blade_arc', level: 1 }], passives: [] });
const regular = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved);

test('upgrades: pool has upgrade for owned weapon and new items, never evolved weapons', () => {
  const pool = buildPool(fresh(), new Set());
  assert.ok(pool.some((c) => c.id === 'blade_arc' && c.level === 2 && !c.isNew));
  assert.ok(pool.some((c) => c.id === 'war_axe' && c.isNew));
  assert.ok(!pool.some((c) => WEAPONS[c.id] && WEAPONS[c.id].evolved));
  assert.equal(pool.length, regular.length + Object.keys(PASSIVES).length);
});

test('upgrades: draw returns 4 distinct cards deterministically', () => {
  const a = drawCards(fresh(), createRng(5), new Set());
  const b = drawCards(fresh(), createRng(5), new Set());
  assert.equal(a.length, 4);
  assert.equal(new Set(a.map(cardKey)).size, 4);
  assert.deepEqual(a, b);
});

test('upgrades: banished cards never come back', () => {
  const banned = new Set(['weapon:war_axe', 'passive:luck']);
  for (let seed = 0; seed < 30; seed++) {
    for (const c of drawCards(fresh(), createRng(seed), banned)) assert.ok(!banned.has(cardKey(c)));
  }
});

test('upgrades: slot limits', () => {
  const p = {
    weapons: regular.slice(0, SLOTS.weapons).map((id) => ({ id, level: 1 })),
    passives: [],
  };
  const pool = buildPool(p, new Set());
  assert.ok(!pool.some((c) => c.kind === 'weapon' && c.isNew), 'no new weapons when slots are full');
  const ids = Object.keys(PASSIVES).slice(0, SLOTS.passives);
  p.passives = ids.map((id) => ({ id, level: 1 }));
  assert.ok(!buildPool(p, new Set()).some((c) => c.kind === 'passive' && c.isNew), 'no new passives when slots are full');
});

test('upgrades: everything maxed gives a single heal card', () => {
  const p = {
    weapons: regular.slice(0, SLOTS.weapons).map((id) => ({ id, level: WEAPONS[id].maxLevel })),
    passives: Object.keys(PASSIVES).slice(0, SLOTS.passives)
        .map((id) => ({ id, level: PASSIVES[id].levels.length })),
  };
  const cards = drawCards(p, createRng(1), new Set());
  assert.equal(cards.length, 1);
  assert.equal(cards[0].kind, 'heal');
});

test('upgrades: applyCard levels up and adds', () => {
  const p = fresh();
  applyCard(p, { kind: 'weapon', id: 'blade_arc', level: 2 });
  applyCard(p, { kind: 'weapon', id: 'war_axe', level: 1 });
  applyCard(p, { kind: 'passive', id: 'armor', level: 1 });
  applyCard(p, { kind: 'passive', id: 'armor', level: 2 });
  assert.deepEqual(p.weapons.map((w) => [w.id, w.level]), [['blade_arc', 2], ['war_axe', 1]]);
  assert.deepEqual(p.passives, [{ id: 'armor', level: 2 }]);
});

test('upgrades: evolution needs both parts maxed, then replaces them', () => {
  for (const combo of COMBOS) {
    const [a, b] = combo.from;
    if (!WEAPONS[b]) {
      // оружие + пассивка: оружие на максимуме и пассивка взята
      const q = {
        weapons: [{ id: a, level: WEAPONS[a].maxLevel - 1 }],
        passives: [{ id: b, level: 1 }],
      };
      assert.equal(findEvolution(q), null);
      q.weapons[0].level = WEAPONS[a].maxLevel;
      assert.equal(findEvolution(q), combo);
      applyCard(q, evolutionCard(combo));
      assert.deepEqual(q.weapons.map((w) => w.id), [combo.result]);
      assert.deepEqual(q.passives.map((x) => x.id), [b]);
      continue;
    }
    const p = {
      weapons: [{ id: a, level: WEAPONS[a].maxLevel }, { id: b, level: WEAPONS[b].maxLevel - 1 }],
      passives: [],
    };
    assert.equal(findEvolution(p), null);
    p.weapons[1].level = WEAPONS[b].maxLevel;
    assert.equal(findEvolution(p), combo);
    const items = chestItems(p, createRng(1));
    assert.equal(items.length, 1);
    assert.equal(items[0].id, combo.result);
    applyCard(p, evolutionCard(combo));
    assert.deepEqual(p.weapons.map((w) => w.id), [combo.result]);
    assert.equal(findEvolution(p), null);
  }
});

test('upgrades: chest without evolution upgrades an owned weapon', () => {
  const items = chestItems(fresh(), createRng(3));
  assert.equal(items[0].kind, 'weapon');
  assert.equal(items[0].id, 'blade_arc');
  assert.equal(items[0].level, 2);
});

test('weapons consumed by an evolution are not offered again', () => {
  const player = { weapons: [{ id: 'aegis_storm', level: 1 }], passives: [] };
  const ids = buildPool(player, null).filter((c) => c.kind === 'weapon').map((c) => c.id);
  assert.ok(!ids.includes('blade_arc'));
  assert.ok(!ids.includes('guardian_shields'));
  assert.ok(ids.includes('throwing_daggers'));
});
