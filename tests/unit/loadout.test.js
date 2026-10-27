// Лоадаут в симе: статы с сумкой, эффекты уникалок, лут с боссов (детерминизм, кооп), хеш lockstep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { hashParts, hashSim, simFingerprint } from '../../src/core/lockstep.js';
import { createRng } from '../../src/core/rng.js';
import { createBag, place, rollItem, makeUnique } from '../../src/core/items.js';
import { loadoutStats, normalizeLoadout, bagSnapshot } from '../../src/core/loadout.js';
import { createTelemetry } from '../../src/core/telemetry.js';
import { HEROES } from '../../src/data/heroes.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { UNIQUES, BOSS_DROPS, CHEST_SIZE } from '../../src/data/items.js';
import { CHEST } from '../../src/data/constants.js';
import { findEvolutions } from '../../src/core/upgrades.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// Сумка из уникалки и, по желанию, обычных предметов с аффиксом stat.
function bagWith(uniqueId, extras = []) {
  let bag = createBag(9, 5);
  let x = 0;
  if (uniqueId) {
    const u = makeUnique(uniqueId, 2, `u${uniqueId.replace(/_/g, '')}`.slice(0, 20));
    bag = place(bag, u, 0, 0);
    x = u.shape[0];
  }
  for (const it of extras) {
    const next = place(bag, it, x, 0);
    assert.ok(next, 'extra item fits');
    bag = next;
    x += it.shape[0];
  }
  return bag;
}

// Предмет с одним плоским аффиксом stat = v (для проверки множителей).
function flatItem(uid, type, stat, v) {
  const rng = createRng(1);
  const it = rollItem(rng, 2, { type, uid, rarity: 'common' });
  return { ...it, affixes: [{ stat, value: v, min: v / 2, max: v }], implicit: stat };
}

function solo(uniqueId, extras, seed = 3) {
  const sim = createSim({ seed, loadouts: [bagWith(uniqueId, extras)] });
  return { sim, pl: sim.player };
}

const heroStats = (sim) => sim.player.heroDef.stats;

test('loadout: player stats come from the bag (solo and each coop player)', () => {
  const rng = createRng(9);
  let a = createBag();
  a = place(a, rollItem(rng, 3, { type: 'gloves', rarity: 'epic' }), 0, 0);
  a = place(a, rollItem(rng, 3, { type: 'boots', rarity: 'rare' }), 2, 0);
  let b = createBag();
  b = place(b, rollItem(rng, 2, { type: 'armor' }), 0, 0);
  const s = createSim({ seed: 1, loadouts: [a] });
  const exp = loadoutStats(heroStats(s), [], a);
  for (const k of Object.keys(exp)) near(s.player.stats[k], exp[k]);
  near(s.player.maxHp, exp.maxHp);
  near(s.player.hp, exp.maxHp); // старт с полным HP
  const c = createSim({ seed: 1, players: 2, heroes: [], loadouts: [a, b] });
  const e0 = loadoutStats(c.players[0].heroDef.stats, [], a);
  const e1 = loadoutStats(c.players[1].heroDef.stats, [], b);
  near(c.players[0].stats.attack, e0.attack);
  near(c.players[1].stats.maxHp, e1.maxHp);
  // без сумки — как раньше
  const plain = createSim({ seed: 1 });
  assert.deepEqual(plain.player.bag.items, []);
  near(plain.player.stats.maxHp, HEROES[plain.player.hero].stats.maxHp);
  // мусор в лоадауте не ломает сим
  const junk = createSim({ seed: 1, loadouts: [{ items: [{ item: { uid: '!!' } }] }] });
  assert.equal(junk.player.bag.items.length, 0);
});

test('unique glass_cannon: ×2 damage stats, max HP 1, resistance off', () => {
  const { sim, pl } = solo('glass_cannon', [flatItem('helmres', 'helm', 'resistance', 0.05)]);
  near(pl.maxHp, 1);
  near(pl.hp, 1);
  near(pl.stats.attack, heroStats(sim).attack * 2);
  near(pl.stats.magic, heroStats(sim).magic * 2);
  near(pl.stats.resistance, 0);
});

test('unique kaom_heart: ×2 regen only while standing', () => {
  const { pl, sim } = solo('kaom_heart');
  near(pl.stats.regen, heroStats(sim).regen * 2);
  pl.hp = pl.maxHp / 2;
  const h = pl.hp;
  sim._movePlayer(pl, { x: 1, y: 0 }, 1);
  near(pl.hp, h);
  sim._movePlayer(pl, { x: 0, y: 0 }, 1);
  near(pl.hp, h + pl.stats.regen);
});

test('unique greed: food does not heal, one more evolution choice', () => {
  const { pl, sim } = solo('greed');
  pl.hp = 10;
  sim._collect({ kind: 'heal', value: 30 }, pl);
  near(pl.hp, 10);
  // все оружия и пассивки вкачаны: эволюций готово больше, чем показывает сундук
  const setup = (p) => {
    p.weapons = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved)
        .map((id) => ({ id, level: WEAPONS[id].maxLevel }));
    p.passives = Object.keys(PASSIVES).map((id) => ({ id, level: PASSIVES[id].levels.length }));
  };
  setup(pl);
  sim._syncBuild();
  const ready = findEvolutions(pl).length;
  sim._openChest(pl);
  assert.equal(sim.chest.cards.length,
      Math.min(ready, CHEST.maxChoices + UNIQUES.greed.evoChoicesAdd));
  const other = createSim({ seed: 3 });
  setup(other.player);
  other._syncBuild();
  other._openChest(other.player);
  assert.equal(other.chest.cards.length, Math.min(ready, CHEST.maxChoices));
  if (ready > CHEST.maxChoices) assert.ok(sim.chest.cards.length > other.chest.cards.length);
});


test('unique sprinter: damage scales with speed, −50% standing', () => {
  const { pl, sim } = solo('sprinter');
  const e = { x: 1000, y: 0 };
  pl.moving = true;
  near(sim._uniqueDmg(pl, e), 1);
  pl.moving = false;
  near(sim._uniqueDmg(pl, e), 0.5);
  const fast = solo('sprinter', [flatItem('bootsfast', 'boots', 'speed', 0.08)]);
  fast.pl.moving = true;
  near(sim._uniqueDmg(fast.pl, e), fast.pl.stats.speed / heroStats(fast.sim).speed);
  assert.ok(sim._uniqueDmg(fast.pl, e) > 1);
});

test('unique turtle: resistance ×3, speed −40%', () => {
  const { pl, sim } = solo('turtle', [flatItem('helmres', 'helm', 'resistance', 0.05)]);
  assert.ok(pl.bonus.flat.resistance > 0);
  near(pl.stats.resistance, (heroStats(sim).resistance + pl.bonus.flat.resistance) * 3);
  near(pl.stats.speed, heroStats(sim).speed * 0.6);
});

test('unique berserk: +1% damage per 1% missing HP, no regen', () => {
  const { pl, sim } = solo('berserk');
  near(pl.stats.regen, 0);
  pl.hp = pl.maxHp / 2;
  near(sim._uniqueDmg(pl, { x: 0, y: 0 }), 1.5);
  pl.hp = pl.maxHp;
  near(sim._uniqueDmg(pl, { x: 0, y: 0 }), 1);
});

test('unique spiked_shell: thorns ×3, −30% damage', () => {
  const { pl, sim } = solo('spiked_shell', [flatItem('shieldthorn', 'shield', 'thorns', 0.03)]);
  assert.ok(pl.bonus.flat.thorns > 0);
  near(pl.stats.thorns, (heroStats(sim).thorns + pl.bonus.flat.thorns) * 3);
  near(pl.stats.attack, heroStats(sim).attack * 0.7);
});

test('unique last_chance: one fatal hit grants invulnerability and full HP, then −50% max HP', () => {
  const { pl, sim } = solo('last_chance');
  const max = pl.maxHp;
  sim.hurtPlayer(max * 10, pl);
  assert.equal(sim.state, 'running');
  near(pl.hp, max);
  near(pl.iframes, UNIQUES.last_chance.cheatDeath.invuln);
  assert.ok(sim.events.some((ev) => ev.type === 'lastChance'));
  sim.hurtPlayer(max * 10, pl); // неуязвим
  near(pl.hp, max);
  for (let i = 0; i < 4 * 60; i++) sim._movePlayer(pl, null, 1 / 60);
  near(pl.maxHp, max * 0.5);
  assert.ok(pl.hp <= pl.maxHp + 1e-9);
  pl.iframes = 0;
  sim.hurtPlayer(max * 10, pl);
  assert.equal(sim.state, 'gameover');
});

test('unique myopia: +60% near, −40% far', () => {
  const { pl, sim } = solo('myopia');
  near(sim._uniqueDmg(pl, { x: pl.x + 50, y: pl.y }), 1.6);
  near(sim._uniqueDmg(pl, { x: pl.x + 300, y: pl.y }), 0.6);
});

test('unique clock: cooldowns −30%, duration −30%', () => {
  const { pl, sim } = solo('clock');
  const plain = createSim({ seed: 3 });
  const w = pl.weapons[0];
  const w0 = plain.player.weapons[0];
  near(w.params.cooldown, w0.params.cooldown * 0.7);
  near(pl.stats.duration, heroStats(sim).duration * 0.7);
  if (w0.params.duration !== undefined) near(w.params.duration, w0.params.duration * 0.7);
});

test('unique monk: no new weapons, passives doubled, +2 passive slots', () => {
  const { pl, sim } = solo('monk');
  const plain = createSim({ seed: 3 });
  assert.equal(pl.slots.weapons, pl.weapons.length);
  assert.equal(pl.slots.passives, plain.player.slots.passives + 2);
  pl.passives = [{ id: 'attack', level: 2 }];
  plain.player.passives = [{ id: 'attack', level: 2 }];
  sim._syncBuild();
  plain._syncBuild();
  const base = heroStats(sim).attack;
  near(pl.stats.attack - base, 2 * (plain.player.stats.attack - base));
  // карточки нового оружия не выпадают
  for (let i = 0; i < 30; i++) {
    const cards = sim._draw(pl);
    assert.ok(!cards.some((c) => c.kind === 'weapon' && c.isNew));
  }
});

test('unique dice: each minute one stat +30%, another −15% (sim rng, deterministic)', () => {
  const a = solo('dice', [], 8);
  const b = solo('dice', [], 8);
  const hs = heroStats(a.sim);
  const run = (sim, secs) => {
    for (let i = 0; i < secs * 60; i++) sim.step(1 / 60, { x: 0, y: 0 });
  };
  run(a.sim, 1);
  run(b.sim, 1);
  const d = a.pl.dice;
  assert.ok(d && d.up !== d.down);
  assert.deepEqual(b.pl.dice, d);
  const st = a.pl.stats;
  // стат «вверх» ×1.3 (с капом), «вниз» ×0.85 к значению без костей
  const plain = loadoutStats(hs, a.pl.passives, a.pl.bag);
  if (plain[d.up] > 0) assert.ok(st[d.up] >= plain[d.up] - 1e-9);
  if (plain[d.down] > 0) near(st[d.down], plain[d.down] * 0.85, 1e-6);
  assert.equal(a.pl.diceNext, UNIQUES.dice.dice.interval);
});

test('unique bible: sim.hasBible for any player', () => {
  assert.equal(createSim({ seed: 1 }).hasBible, false);
  assert.equal(solo('bible').sim.hasBible, true);
  const coop = createSim({ seed: 1, players: 2, heroes: [], loadouts: [createBag(), bagWith('bible')] });
  assert.equal(coop.hasBible, true);
});

// Убить босса id в симе (лут катится в _killEnemy).
function killBoss(sim, id) {
  const e = sim.spawnBoss(id);
  sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
  return e;
}

test('loot: boss chests per player by kill order, deterministic in coop, world RNG untouched', () => {
  const mk = () => createSim({ seed: 42, players: 2, heroes: [],
    loadouts: [createBag(), createBag()] });
  const a = mk();
  const b = mk();
  for (const sim of [a, b]) {
    killBoss(sim, 'kitsune_empress');
    assert.ok(sim.events.some((ev) => ev.type === 'loot' && ev.tier === 1));
    killBoss(sim, 'harpy_queen');
  }
  for (const sim of [a, b]) {
    for (const p of sim.players) {
      assert.equal(p.loot.length, 2);
      assert.deepEqual(p.loot.map((c) => c.tier), [BOSS_DROPS[0].tier, BOSS_DROPS[1].tier]);
      for (const c of p.loot) assert.equal(c.entries.length, CHEST_SIZE);
      assert.equal(p.loot[1].hearts, BOSS_DROPS[1].hearts.n);
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(a.players.map((p) => p.loot))),
      JSON.parse(JSON.stringify(b.players.map((p) => p.loot))));
  // у каждого игрока свой сундук
  assert.notDeepEqual(a.players[0].loot[0].entries, a.players[1].loot[0].entries);
  // мировой RNG одинаков с забегом без лута: лут катится отдельным RNG
  const c = mk();
  const e1 = c.spawnBoss('kitsune_empress');
  const s0 = c.rng.state;
  c.bossKills = 0;
  c._bossLoot(e1);
  assert.equal(c.rng.state, s0);
});

test('lockstep: hash covers loadout and loot; fingerprint is stable', () => {
  const rng = createRng(5);
  const bag = place(createBag(), rollItem(rng, 2, { type: 'ring' }), 0, 0);
  const a = createSim({ seed: 7, players: 2, heroes: [], loadouts: [bag, createBag()] });
  const b = createSim({ seed: 7, players: 2, heroes: [], loadouts: [bag, createBag()] });
  const c = createSim({ seed: 7, players: 2, heroes: [], loadouts: [createBag(), createBag()] });
  assert.equal(hashSim(a), hashSim(b));
  assert.notEqual(hashSim(a), hashSim(c));
  const keys = hashParts(a).map((kv) => kv[0]);
  assert.ok(keys.includes('p0.bag') && keys.includes('p1.loot') && keys.includes('lootRng'));
  killBoss(a, 'kitsune_empress');
  killBoss(b, 'kitsune_empress');
  assert.equal(hashSim(a), hashSim(b));
  b.players[1].loot[0].entries.reverse();
  assert.notEqual(hashSim(a), hashSim(b));
  assert.equal(simFingerprint(true), simFingerprint(true));
});

test('loadout helpers: normalize is idempotent, snapshot has no affix values', () => {
  const rng = createRng(2);
  let bag = createBag();
  bag = place(bag, rollItem(rng, 2, { type: 'helm' }), 0, 0);
  bag = place(bag, makeUnique('dice', 2, 'dice1'), 3, 0);
  const n1 = normalizeLoadout(JSON.parse(JSON.stringify(bag)));
  assert.deepEqual(normalizeLoadout(JSON.parse(JSON.stringify(n1))), n1);
  const snap = bagSnapshot(n1);
  assert.equal(snap.unique, 'dice');
  assert.equal(snap.items.length, 2);
  assert.deepEqual(Object.keys(snap.items[0]).sort(), ['enchant', 'rarity', 'shape', 'tier', 'type']);
  assert.ok(Object.keys(snap.inc).length + Object.keys(snap.flat).length > 0);
  // телеметрия забега несёт слепок сумки
  const sim = createSim({ seed: 1, loadouts: [n1] });
  const tr = createTelemetry({ sim });
  for (let i = 0; i < 40 * 60; i++) sim.step(1 / 60, { x: 0, y: 0 });
  const run = tr.finish(sim, { status: 'quit' });
  if (run) assert.equal(run.bag.unique, 'dice');
});
