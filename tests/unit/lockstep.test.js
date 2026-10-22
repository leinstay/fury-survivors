import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { createLockstep, hashSim, applyCommand } from '../../src/core/lockstep.js';
import { createRng } from '../../src/core/rng.js';

const DT = 1 / 60;

// Два клиента с задержанным каналом: сообщения доходят через lag вызовов pump().
function pair(seed, { delay = 4, lag = 2, hashEvery = 30 } = {}) {
  const q = [[], []]; // очереди входящих: к клиенту 0, к клиенту 1
  const desyncs = [];
  const mk = (local) => {
    const sim = createSim({ seed, players: 2 });
    const ls = createLockstep({
      sim, local, delay, hashEvery,
      send: (msg) => q[1 - local].push({ msg, at: lag }),
      onDesync: (t, a, b) => desyncs.push([local, t, a, b]),
    });
    return ls;
  };
  const a = mk(0);
  const b = mk(1);
  const pump = () => {
    for (let i = 0; i < 2; i++) {
      const ls = i === 0 ? a : b;
      const rest = [];
      for (const it of q[i]) {
        if (--it.at <= 0) ls.receive(it.msg); else rest.push(it);
      }
      q[i] = rest;
    }
  };
  return { a, b, pump, desyncs };
}

const rnd = createRng(5);
const randIn = () => ({ x: rnd.range(-1, 1), y: rnd.range(-1, 1) });

test('lockstep: two clients with random inputs over a lagged channel stay identical', () => {
  const { a, b, pump, desyncs } = pair(21);
  let steppedA = 0;
  let steppedB = 0;
  for (let i = 0; i < 600; i++) {
    const ia = randIn();
    const ib = randIn();
    if (a.sim.state === 'levelup') a.command({ k: 'card', i: 0 });
    if (b.sim.state === 'levelup') b.command({ k: 'card', i: 0 });
    if (a.advance(ia, DT)) steppedA++;
    if (b.advance(ib, DT)) steppedB++;
    pump();
  }
  assert.ok(steppedA > 500 && steppedB > 500, `${steppedA} ${steppedB}`);
  assert.equal(a.tick, b.tick);
  assert.equal(hashSim(a.sim), hashSim(b.sim));
  assert.ok(a.sim.time > 8);
  assert.deepEqual(desyncs, []);
  // ввод квантован: игроки двигались (не idle)
  assert.ok(a.sim.players[0].x !== 0 && a.sim.players[1].x !== 24);
});

test('lockstep: a tick waits for the partner input and continues when it arrives', () => {
  const { a, b, pump } = pair(3, { delay: 2, lag: 1 });
  // напарник молчит: после delay тиков клиент 0 встаёт
  for (let i = 0; i < 5; i++) a.advance({ x: 1, y: 0 }, DT);
  assert.equal(a.tick, 2);
  assert.ok(a.waitT > 0);
  pump();
  assert.equal(a.tick, 2); // ввод от b ещё не приходил: b не вызывал advance
  // напарник ожил: его ввод доходит, оба идут дальше
  for (let i = 0; i < 6; i++) {
    b.advance({ x: 0, y: 1 }, DT); pump();
    a.advance({ x: 1, y: 0 }, DT); pump();
  }
  assert.ok(a.tick > 2 && b.tick > 2);
  assert.equal(a.waitT, 0);
});

test('lockstep: card choice is a command applied on the same tick by both, only by the chooser', () => {
  const { a, b, pump, desyncs } = pair(8, { delay: 3, lag: 1 });
  const idle = { x: 0, y: 0 };
  // доводим обоих до levelup одинаково
  for (const ls of [a, b]) { ls.sim.player.xp = ls.sim.player.xpNext; }
  const run = (n, fn) => {
    for (let i = 0; i < n; i++) { if (fn) fn(); a.advance(idle, DT); b.advance(idle, DT); pump(); }
  };
  run(5);
  assert.equal(a.sim.state, 'levelup');
  assert.equal(b.sim.state, 'levelup');
  assert.equal(a.sim.levelUp.player, 0);
  // выбор не того игрока игнорируется
  b.command({ k: 'card', i: 1 });
  run(8);
  assert.equal(a.sim.state, 'levelup');
  assert.equal(b.sim.state, 'levelup');
  // выбор хозяина хода применяется у обоих на одном тике
  a.command({ k: 'card', i: 1 });
  let tickA = -1;
  let tickB = -1;
  run(8, () => {
    if (tickA < 0 && a.sim.state === 'running') tickA = a.tick;
    if (tickB < 0 && b.sim.state === 'running') tickB = b.tick;
  });
  assert.equal(a.sim.state, 'running');
  assert.equal(tickA, tickB);
  assert.equal(hashSim(a.sim), hashSim(b.sim));
  assert.deepEqual(desyncs, []);
});

test('lockstep: pause stops the sim on both, resume continues, ticks keep flowing', () => {
  const { a, b, pump } = pair(9, { delay: 2, lag: 1 });
  const idle = { x: 0, y: 0 };
  const run = (n) => {
    for (let i = 0; i < n; i++) { a.advance(idle, DT); b.advance(idle, DT); pump(); }
  };
  run(10);
  b.command({ k: 'pause' });
  run(6);
  assert.ok(a.paused && b.paused);
  const t0 = a.sim.time;
  run(20);
  assert.equal(a.sim.time, t0);
  assert.equal(b.sim.time, t0);
  assert.ok(a.tick > 30);
  a.command({ k: 'resume' });
  run(6);
  assert.ok(!a.paused && !b.paused);
  run(10);
  assert.ok(a.sim.time > t0 && a.sim.time === b.sim.time);
});

test('lockstep: a diverged state is reported as a desync', () => {
  const { a, b, pump, desyncs } = pair(4, { delay: 2, lag: 1, hashEvery: 10 });
  const idle = { x: 0, y: 0 };
  a.sim.players[1].x += 50; // клиент 0 «сломался»
  for (let i = 0; i < 40; i++) { a.advance(idle, DT); b.advance(idle, DT); pump(); }
  assert.ok(desyncs.length >= 1, JSON.stringify(desyncs));
  assert.ok(a.desynced && b.desynced);
});

test('lockstep: applyCommand respects whose turn and chest owner', () => {
  const sim = createSim({ seed: 1, players: 2 });
  assert.equal(applyCommand(sim, 0, { k: 'card', i: 0 }), false);
  sim.player.xp = sim.player.xpNext;
  sim.step(DT, { players: [{ x: 0, y: 0 }, { x: 0, y: 0 }] });
  assert.equal(sim.state, 'levelup');
  assert.equal(applyCommand(sim, 1, { k: 'card', i: 0 }), false);
  assert.equal(applyCommand(sim, 0, { k: 'reroll' }), true);
  assert.equal(applyCommand(sim, 0, { k: 'card', i: 0 }), true);
  assert.equal(sim.state, 'running');
  assert.equal(applyCommand(sim, 0, { k: 'nope' }), false);
});
