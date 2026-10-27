// Экран лута после подбора сундука босса (loot_chest): state 'loot' в симе (соло и кооп через lockstep), разбор в кристаллы.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { createLockstep, hashSim, applyCommand } from '../../src/core/lockstep.js';
import { createActions } from '../../src/core/actions.js';
import { createBag, emptyInventory, rollItem, disassembleValue } from '../../src/core/items.js';
import { disassembleLoot } from '../../src/core/inventory.js';
import { createRng } from '../../src/core/rng.js';
import { CHEST_SIZE } from '../../src/data/items.js';
import { getAchievements, checkMetaAchievements, resetAchievementsCache } from
  '../../src/services/achievements.js';
import { getInventory, resetInventoryCache } from '../../src/services/inventory.js';

const DT = 1 / 60;

// Босс пал; сундук лута (если упал) кладётся под первого игрока — подберётся на следующем шаге.
function killBoss(sim, id = 'kitsune_empress') {
  const e = sim.spawnBoss(id);
  sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
  const pk = sim.pickups.find((p) => p.type === 'loot_chest');
  if (pk) { pk.x = sim.players[0].x; pk.y = sim.players[0].y; }
  return e;
}

test('boss loot chest lies on the ground until picked up, then the loot screen opens', () => {
  const sim = createSim({ seed: 5, lootScreen: true });
  const e = sim.spawnBoss('kitsune_empress');
  e.x = sim.player.x + 300;
  e.y = sim.player.y;
  sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
  const pk = sim.pickups.find((p) => p.type === 'loot_chest');
  assert.ok(pk, 'chest dropped');
  assert.equal(sim.player.loot.length, 0, 'loot is rolled on pickup');
  for (let i = 0; i < 30; i++) sim.step(DT, {});
  assert.equal(sim.state, 'running', 'no screen while the chest lies');
  pk.x = sim.player.x;
  pk.y = sim.player.y;
  sim.step(DT, {});
  assert.equal(sim.state, 'loot');
  assert.equal(sim.player.loot.length, 1);
});

test('loot screen solo: sim stands in state loot until the player is done', () => {
  const sim = createSim({ seed: 3, lootScreen: true, loadouts: [createBag()] });
  for (let i = 0; i < 10; i++) sim.step(DT, { x: 0, y: 0 });
  killBoss(sim);
  sim.step(DT, { x: 0, y: 0 });
  assert.equal(sim.state, 'loot');
  assert.equal(sim.player.loot[0].entries.length, CHEST_SIZE);
  const t0 = sim.time;
  const x0 = sim.player.x;
  for (let i = 0; i < 120; i++) sim.step(DT, { x: 1, y: 0 });
  assert.equal(sim.time, t0);
  assert.equal(sim.player.x, x0);
  const act = createActions(sim);
  assert.equal(act.lootDone(), true);
  assert.equal(sim.state, 'resume'); // мир трогается через SIM.resumeDelay, как после карточки
  assert.equal(act.lootDone(), false); // второй раз не применяется
  for (let i = 0; i < 60; i++) sim.step(DT, { x: 1, y: 0 });
  assert.ok(sim.time > t0);
});

test('loot screen waits for an open chest or level-up, then opens', () => {
  const sim = createSim({ seed: 4, lootScreen: true });
  sim._rollLoot(0, 'kitsune_empress'); // сундук подобран
  sim.state = 'chest'; // сундук с выбором открыт в тот же кадр
  sim.step(DT, {});
  assert.equal(sim.state, 'chest');
  sim.state = 'running';
  sim.step(DT, {});
  assert.equal(sim.state, 'loot');
});

test('without lootScreen (bots, tools) the run never stops for loot', () => {
  const sim = createSim({ seed: 3 });
  killBoss(sim);
  sim.step(DT, {});
  assert.equal(sim.state, 'running');
  assert.equal(sim.lootPending, 0);
  assert.equal(sim.player.loot.length, 1);
});

// Два клиента lockstep с задержанным каналом (как в lockstep.test.js), лут-экран включён.
function pair(seed, { delay = 3, lag = 1, hashEvery = 10 } = {}) {
  const q = [[], []];
  const desyncs = [];
  const mk = (local) => createLockstep({
    sim: createSim({ seed, players: 2, heroes: [], lootScreen: true }), local, delay, hashEvery,
    send: (msg) => q[1 - local].push({ msg, at: lag }),
    onDesync: (t, x, y) => desyncs.push([local, t, x, y]),
  });
  const a = mk(0);
  const b = mk(1);
  const pump = () => {
    for (let i = 0; i < 2; i++) {
      const ls = i === 0 ? a : b;
      const rest = [];
      for (const it of q[i]) { if (--it.at <= 0) ls.receive(it.msg); else rest.push(it); }
      q[i] = rest;
    }
  };
  return { a, b, pump, desyncs };
}

test('loot screen coop: both clients enter loot, each finishes for itself, hashes match', () => {
  const { a, b, pump, desyncs } = pair(17);
  const tick = (n, cb) => {
    for (let i = 0; i < n; i++) {
      if (cb) cb(i);
      a.advance({ x: 1, y: 0 }, DT);
      b.advance({ x: 0, y: 1 }, DT);
      pump();
    }
  };
  tick(20);
  assert.equal(a.tick, b.tick);
  killBoss(a.sim);
  killBoss(b.sim);
  tick(5);
  assert.equal(a.sim.state, 'loot');
  assert.equal(b.sim.state, 'loot');
  const t0 = a.sim.time;
  // у каждого свой лут
  assert.notDeepEqual(a.sim.players[0].loot[0].entries, a.sim.players[1].loot[0].entries);
  // игрок 0 закончил: мир ещё стоит у обоих
  createActions(a.sim, a).lootDone();
  tick(30);
  assert.equal(a.sim.state, 'loot');
  assert.equal(b.sim.state, 'loot');
  assert.deepEqual(a.sim.lootDone, [true, false]);
  assert.deepEqual(b.sim.lootDone, [true, false]);
  assert.equal(a.sim.time, t0);
  // чужое «закончил» за игрока не считается (команда с who = 0 повторно)
  assert.equal(applyCommand(a.sim, 0, { k: 'lootDone' }), false);
  createActions(b.sim, b).lootDone();
  tick(60);
  assert.equal(a.sim.state, b.sim.state);
  assert.notEqual(a.sim.state, 'loot');
  assert.ok(a.sim.time > t0);
  assert.equal(a.tick, b.tick);
  assert.equal(hashSim(a.sim), hashSim(b.sim));
  assert.deepEqual(desyncs, []);
});

test('disassemble from loot: crystals by the disassembly rules, counted for recycler', () => {
  const rng = createRng(9);
  const item = rollItem(rng, 2, { type: 'gloves', rarity: 'rare' });
  const inv = emptyInventory(createBag());
  const r = disassembleLoot(inv, item);
  assert.equal(r.crystals, disassembleValue(item));
  assert.ok(r.crystals > 0);
  assert.equal(r.inv.wallet.crystals, (inv.wallet.crystals || 0) + r.crystals);
  assert.equal(r.inv.stash.length, inv.stash.length); // в стеш не попал
  assert.equal(inv.wallet.crystals || 0, 0); // вход не меняется

  // счётчик recycler: экран лута шлёт {disassembled: n} в checkMetaAchievements
  resetAchievementsCache();
  resetInventoryCache();
  const before = getAchievements().counters.disassembled || 0;
  checkMetaAchievements({ disassembled: 3 });
  assert.equal(getAchievements().counters.disassembled, before + 3);
  const res = checkMetaAchievements({ disassembled: 100 });
  assert.ok(res.unlocked.includes('recycler'));
  assert.ok(getInventory());
});

test('loot screen: a victory boss (no overtime) wins only after its loot is decided', () => {
  const sim = createSim({ seed: 6, lootScreen: true });
  const e = sim.spawnBoss('kitsune_empress');
  e.def = { ...e.def, final: false, victory: true }; // как Жница: убийство — победа
  sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
  assert.notEqual(sim.state, 'victory');
  assert.equal(sim.winAfterLoot, true);
  sim.step(DT, {});
  assert.equal(sim.state, 'loot');
  sim.lootFinish(0);
  assert.equal(sim.state, 'victory');
  assert.ok(sim.events.some((ev) => ev.type === 'victory'));
});

test('skill chest coop over lockstep: each presses Ok, both close on the same tick, hashes match', () => {
  const { a, b, pump, desyncs } = pair(23);
  const tick = (n) => {
    for (let i = 0; i < n; i++) {
      a.advance({ x: 0, y: 0 }, DT);
      b.advance({ x: 0, y: 0 }, DT);
      pump();
    }
  };
  tick(12);
  a.sim._openChest(a.sim.players[0]);
  b.sim._openChest(b.sim.players[0]);
  assert.equal(a.sim.state, 'chest');
  assert.deepEqual(a.sim.chest.rolls, b.sim.chest.rolls);
  createActions(b.sim, b).chestOk();
  tick(20);
  assert.equal(a.sim.state, 'chest');
  assert.deepEqual(a.sim.chest.done, [false, true]);
  createActions(a.sim, a).chestOk();
  tick(40);
  assert.notEqual(a.sim.state, 'chest');
  assert.equal(a.sim.state, b.sim.state);
  assert.equal(hashSim(a.sim), hashSim(b.sim));
  assert.deepEqual(desyncs, []);
});
