import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPool, drawCards, applyCard, findEvolution, evolutionCard, chestItems, chestChoices, cardKey, pickKind } from '../../src/core/upgrades.js';
import { createRng } from '../../src/core/rng.js';
import { CHEST } from '../../src/data/constants.js';
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

test('upgrades: evolution needs the weapon maxed and its passive, then replaces the weapon', () => {
  for (const combo of COMBOS) {
    const [a, b] = combo.from;
    assert.ok(PASSIVES[b], `${combo.result}: second part is a passive`);
    const q = {
      weapons: [{ id: a, level: WEAPONS[a].maxLevel - 1 }],
      passives: [{ id: b, level: 1 }],
    };
    assert.equal(findEvolution(q), null);
    q.weapons[0].level = WEAPONS[a].maxLevel;
    assert.equal(findEvolution(q), combo);
    const items = chestItems(q, createRng(1));
    assert.equal(items.length, 1);
    assert.equal(items[0].id, combo.result);
    applyCard(q, evolutionCard(combo));
    assert.deepEqual(q.weapons.map((w) => w.id), [combo.result]);
    assert.deepEqual(q.passives.map((x) => x.id), [b]);
    assert.equal(findEvolution(q), null);
  }
});

test('upgrades: chestChoices lists ready evolutions, chestItems can skip them', () => {
  const p = {
    weapons: [{ id: 'blade_arc', level: WEAPONS.blade_arc.maxLevel }, { id: 'war_axe', level: WEAPONS.war_axe.maxLevel }],
    passives: [{ id: 'steel', level: 1 }, { id: 'crit', level: 1 }],
  };
  // blade_arc + steel, war_axe + crit → две
  const choices = chestChoices(p, createRng(1));
  assert.deepEqual(choices.map((c) => c.id).sort(), ['crimson_arc', 'death_spiral']);
  assert.ok(choices.every((c) => c.evolved && c.from.length === 2));
  p.passives = [{ id: 'steel', level: 1 }];
  // одно готовое супероружие тоже идёт через выбор (его можно пропустить); без готовых — пусто
  assert.equal(chestChoices(p, createRng(1)).length, 1);
  p.weapons[0].level = 1;
  assert.deepEqual(chestChoices(p, createRng(1)), []);
  // пропуск: обычное содержимое без супероружия
  p.weapons[0].level = WEAPONS.blade_arc.maxLevel;
  const skipped = chestItems(p, createRng(1), true);
  assert.ok(!skipped[0].evolved);
  // четыре готовых: показываются не больше CHEST.maxChoices, все разные
  p.weapons.push({ id: 'holy_ground', level: WEAPONS.holy_ground.maxLevel },
      { id: 'storm_chain', level: WEAPONS.storm_chain.maxLevel });
  p.passives = [{ id: 'steel', level: 1 }, { id: 'crit', level: 1 }, { id: 'regen', level: 1 }, { id: 'luck', level: 1 }];
  const four = chestChoices(p, createRng(2));
  assert.equal(four.length, CHEST.maxChoices);
  assert.equal(new Set(four.map((c) => c.id)).size, four.length);
});

test('upgrades: chest without evolution upgrades an owned weapon', () => {
  const items = chestItems(fresh(), createRng(3));
  assert.equal(items[0].kind, 'weapon');
  assert.equal(items[0].id, 'blade_arc');
  assert.equal(items[0].level, 2);
});

test('weapons consumed by an evolution are not offered again, its passive still levels', () => {
  const player = { weapons: [{ id: 'aegis_bastion', level: 1 }], passives: [{ id: 'armor', level: 1 }] };
  const pool = buildPool(player, null);
  const ids = pool.filter((c) => c.kind === 'weapon').map((c) => c.id);
  assert.ok(!ids.includes('guardian_shields'));
  assert.ok(ids.includes('throwing_daggers'));
  assert.ok(pool.some((c) => c.kind === 'passive' && c.id === 'armor' && c.level === 2));
});

test('upgrades: passives with minLevel wait for the team level', () => {
  const gated = Object.keys(PASSIVES).filter((id) => PASSIVES[id].minLevel);
  assert.ok(gated.includes('xp_gain') && gated.includes('crit_dmg') && gated.includes('thorns'));
  const ids = (level) => buildPool(fresh(), null, level).map((c) => c.id);
  for (const id of gated) {
    const min = PASSIVES[id].minLevel;
    assert.ok(!ids(min - 1).includes(id), `${id} before level ${min}`);
    assert.ok(ids(min).includes(id), `${id} at level ${min}`);
  }
  // уже взятая (сундук, старое сохранение) качается и до minLevel
  const p = { weapons: [{ id: 'blade_arc', level: 1 }], passives: [{ id: 'thorns', level: 1 }] };
  assert.ok(buildPool(p, null, 1).some((c) => c.id === 'thorns' && c.level === 2));
  // без уровня (инструменты) гейтинга нет
  assert.ok(ids(undefined).includes('thorns'));
});

test('upgrades: cards alternate weapon / passive by the pick counter, other kind when one is empty', () => {
  assert.equal(pickKind(0), 'weapon');
  assert.equal(pickKind(1), 'passive');
  assert.equal(pickKind(2), 'weapon');
  for (let seed = 0; seed < 10; seed++) {
    const w = drawCards(fresh(), createRng(seed), null, 4, null, { kind: 'weapon', level: 1 });
    assert.ok(w.length === 4 && w.every((c) => c.kind === 'weapon'));
    const p = drawCards(fresh(), createRng(seed), null, 4, null, { kind: 'passive', level: 1 });
    assert.ok(p.length === 4 && p.every((c) => c.kind === 'passive'));
  }
  // оружие всё на максимуме и слоты полны: вместо оружия сразу пассивки
  const full = { passives: [],
    weapons: regular.slice(0, SLOTS.weapons).map((id) => ({ id, level: WEAPONS[id].maxLevel })) };
  const cards = drawCards(full, createRng(1), null, 4, null, { kind: 'weapon', level: 1 });
  assert.ok(cards.length > 0 && cards.every((c) => c.kind === 'passive'));
  // замена при банише того же типа, пока он есть
  const set = drawCards(fresh(), createRng(3), null, 4, null, { kind: 'passive', level: 1 });
  const repl = drawCards(fresh(), createRng(4), new Set([cardKey(set[0])]), 1, set, { kind: 'passive', level: 1 });
  assert.equal(repl.length, 1);
  assert.equal(repl[0].kind, 'passive');
  assert.ok(!set.some((c) => cardKey(c) === cardKey(repl[0])));
});
