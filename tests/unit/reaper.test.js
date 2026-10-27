// Жница (docs/META.md, 4): ваншот, неуязвимость без Библии, урон только в круге, часы, фазы, смерть.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { createBag, place, makeUnique } from '../../src/core/items.js';
import { createRunSummaryTracker } from '../../src/core/run-summary.js';
import { BOSSES } from '../../src/data/bosses.js';
import { BOSS_DROPS } from '../../src/data/items.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { COOP } from '../../src/data/coop.js';
import { hashParts } from '../../src/core/lockstep.js';
import { t } from '../../src/i18n/index.js';

const DT = 1 / 60;
const R = BOSSES.reaper;
const idle = { x: 0, y: 0 };

function bagWith(uniqueId) {
  const u = makeUnique(uniqueId, 3, `u${uniqueId.replace(/_/g, '')}`.slice(0, 20));
  return place(createBag(9, 5), u, 0, 0);
}

// Забег после финального босса (овертайм) и Жница; bible — у игрока Библия. Жница стоит (speed 0),
// если не сказано иначе, и далеко от игрока.
function setup({ bible = false, unique = null, still = true } = {}) {
  const loadouts = bible ? [bagWith('bible')] : unique ? [bagWith(unique)] : [];
  const sim = createSim({ seed: 21, loadouts });
  const dryad = sim.spawnBoss('dryad_queen');
  sim.damageEnemy(dryad, 1e12, 'blade_arc', 0, 0, 0);
  sim.step(DT, idle);
  assert.ok(sim.overtime >= 0, 'overtime started');
  sim.player.hp = sim.player.maxHp;
  const e = sim.spawnBoss('reaper');
  e.x = sim.player.x + 400; e.y = sim.player.y;
  // стоит (def копируется, данные не трогаем)
  if (still) { e.def = { ...e.def, speed: 0 }; e.speed = 0; }
  return { sim, e, pl: sim.player };
}

// Убрать обычных врагов, чтобы касания и спавн овертайма не мешали.
function clearCrowd(sim) {
  for (const o of sim.enemies) if (!o.boss) o.dead = true;
}

// Шаги сима; игрок лечится каждый шаг (толпа овертайма не мешает проверкам Жницы).
function run(sim, seconds, input = idle) {
  const end = sim.time + seconds - DT / 2;
  for (let i = 0; i < 1e5 && sim.time < end; i++) {
    if (sim.state === 'levelup') sim.chooseCard(0);
    else if (sim.state === 'chest') sim.skipChest();
    if (sim.state === 'gameover' || sim.state === 'victory') break;
    for (const p of sim.players) p.hp = p.maxHp;
    sim.step(DT, input);
  }
}

test('reaper: slower than the heroine, keeps chase', () => {
  assert.equal(R.behavior, 'chase');
  const { e, pl } = setup({ still: false });
  assert.ok(e.speed < pl.stats.speed, `${e.speed} < ${pl.stats.speed}`);
});

test('reaper: a touch kills through resistance, dodge, i-frames and last_chance', () => {
  const { sim, e, pl } = setup({ unique: 'last_chance' });
  clearCrowd(sim);
  pl.stats.resistance = 1;
  pl.stats.dodge = 1;
  pl.iframes = 10;
  e.x = pl.x; e.y = pl.y;
  sim.step(DT, idle);
  assert.equal(pl.hp, 0);
  assert.equal(pl.cheatUsed, false, 'last_chance did not trigger');
  assert.ok(sim.events.some((ev) => ev.type === 'playerHurt' && ev.oneShot && ev.src === 'reaper'));
  assert.equal(sim.state, 'victory', 'death in overtime counts as victory');
});

test('reaper: constant base a bit below the heroes, no ramp over time', () => {
  assert.ok(R.speed < 100 && R.speed >= 80, `base ${R.speed}`);
  assert.equal(R.speedGrowth, undefined);
  const { sim, e } = setup({ still: false });
  sim.reaper.hourT = 1e9;
  run(sim, 30);
  assert.equal(e.speed, R.speed, 'no ramp');
});

// Часы прямо под игроком со стоящей Жницей далеко: разбить. Часы далеко от игрока: таймер, пропуск.
function dropAt(sim, x, y, t = 0) {
  const h = { uid: ++sim.uid, x, y, t, life: R.hourglass.life, breakRadius: R.hourglass.breakRadius };
  sim.hourglasses.push(h);
  return h;
}

test('reaper: hourglass timer — not broken in life seconds is a miss', () => {
  const { sim, pl } = setup();
  clearCrowd(sim);
  sim.reaper.hourT = 1e9;
  const h = dropAt(sim, pl.x + 300, pl.y);
  run(sim, R.hourglass.life - 0.5);
  assert.ok(sim.hourglasses.includes(h), 'still ticking');
  assert.equal(pl.overtimeSlow, 0);
  let missed = false;
  for (let i = 0; i < 60 && !missed; i++) {
    run(sim, DT);
    missed = sim.events.some((ev) => ev.type === 'hourglassMiss');
  }
  assert.ok(missed, 'miss event');
  assert.ok(!sim.hourglasses.includes(h), 'gone');
  assert.equal(pl.overtimeSlow, R.hourglass.missSpeed);
});

test('reaper: a miss slows every living player, stacks, not below minPlayerSpeed; stats untouched', () => {
  const sim = createSim({ seed: 8, players: 2, heroes: [] });
  sim.director = { update() {} };
  const e = sim.spawnBoss('reaper');
  e.def = { ...e.def, speed: 0 }; e.speed = 0;
  e.x = sim.players[0].x + 600;
  sim.reaper.hourT = 1e9;
  const [a, b] = sim.players;
  const base = a.stats.speed;
  dropAt(sim, a.x + 300, a.y + 200, R.hourglass.life - DT / 2);
  sim.step(DT, idle);
  assert.equal(a.overtimeSlow, R.hourglass.missSpeed);
  assert.equal(b.overtimeSlow, R.hourglass.missSpeed, 'the partner too');
  assert.equal(a.stats.speed, base, 'stats.speed untouched');
  const x0 = a.x;
  sim.step(DT, { players: [{ x: 1, y: 0 }, idle] });
  assert.ok(Math.abs(a.x - x0 - (base - R.hourglass.missSpeed) * DT) < 1e-6, 'moves slower');
  a.overtimeSlow = 1e6;
  const x1 = a.x;
  sim.step(DT, { players: [{ x: 1, y: 0 }, idle] });
  assert.ok(Math.abs(a.x - x1 - R.hourglass.minPlayerSpeed * DT) < 1e-6, 'floored at minPlayerSpeed');
});

test('reaper: a broken hourglass slows her, stacks, not below minReaperSpeed', () => {
  const { sim, e, pl } = setup({ still: false });
  clearCrowd(sim);
  sim.reaper.hourT = 1e9;
  e.x = pl.x + 2000;
  dropAt(sim, pl.x, pl.y);
  sim.step(DT, idle);
  assert.ok(sim.events.some((ev) => ev.type === 'hourglassBreak'), 'broken');
  assert.equal(e.speed, R.speed - R.hourglass.pickSpeed);
  assert.equal(pl.overtimeSlow, 0, 'no penalty for the player');
  for (let i = 0; i < 20; i++) { dropAt(sim, pl.x, pl.y); sim.step(DT, idle); }
  assert.equal(e.speed, R.hourglass.minReaperSpeed, 'floored');
});

test('reaper: 5 misses — she is faster than the hero and the hero is slower than runners; 2 are not lethal', () => {
  const H = R.hourglass;
  const hero = 100;
  const after = (n) => Math.max(H.minPlayerSpeed, hero - n * H.missSpeed);
  assert.ok(after(2) >= R.speed - 2, `2 misses: ${after(2)} vs ${R.speed}`);
  assert.ok(after(5) < R.speed - 15, `5 misses: ${after(5)} vs ${R.speed}`);
  assert.ok(after(5) <= ENEMIES.catgirl.speed, 'slower than runners');
  assert.ok(R.speed - 5 * H.pickSpeed <= H.minReaperSpeed + H.pickSpeed, 'picks can win her back');
  // в симе: 5 пропусков подряд, Жница догоняет идущего по прямой
  const { sim, e, pl } = setup({ still: false });
  clearCrowd(sim);
  sim.reaper.hourT = 1e9;
  pl.overtimeSlow = 5 * H.missSpeed;
  e.x = pl.x - 120; e.y = pl.y;
  sim.director = { update() {} };
  run(sim, 8, { x: 1, y: 0 });
  assert.ok(Math.hypot(e.x - pl.x, e.y - pl.y) < 30 || sim.state === 'victory', 'caught');
});

test('reaper: Death Touch — lethal flag, coop touch puts the hero in a coffin', () => {
  assert.equal(R.oneShot, true);
  assert.ok(Number.isFinite(R.damage), 'no Infinity in data (telemetry, codex, hash)');
  const sim = createSim({ seed: 4, players: 2, heroes: [] });
  sim.director = { update() {} };
  const pl = sim.players[1];
  pl.stats.resistance = 1; pl.stats.dodge = 1; pl.iframes = 5;
  const e = sim.spawnBoss('reaper');
  e.speed = 0;
  e.x = pl.x; e.y = pl.y;
  sim.players[0].x = pl.x + 500;
  sim.step(DT, idle);
  assert.ok(pl.dead && pl.coffinT > 0, 'coffin');
  assert.equal(sim.state, 'running', 'the partner keeps playing');
  assert.ok(JSON.stringify(R).length > 0);
});

test('reaper: invulnerable without the Bible, even inside a holy circle', () => {
  const { sim, e } = setup();
  assert.equal(sim.hasBible, false);
  run(sim, R.holy.first + R.holy.warn + 1);
  assert.equal(sim.holy.length, 0, 'no circles without the Bible');
  sim.holy.push({ uid: 1, x: e.x, y: e.y, radius: 100, t: 5, life: 15, warn: 1 });
  sim.step(DT, idle);
  const hp = e.hp;
  sim.damageEnemy(e, 1e9, 'blade_arc', 0, 0, 0);
  assert.equal(e.hp, hp);
  assert.ok(!e.dead);
});

test('reaper: with the Bible she has real HP and takes damage only inside an active circle', () => {
  const { sim, e, pl } = setup({ bible: true });
  assert.equal(e.maxHp, R.holy.hpPerLevel * pl.level);
  const hp = e.hp;
  sim.damageEnemy(e, 100, 'blade_arc', 0, 0, 0);
  assert.equal(e.hp, hp, 'outside a circle: no damage');
  // круг ещё проявляется: урона нет
  sim.holy.push({ uid: 1, x: e.x, y: e.y, radius: 80, t: 0, life: 15, warn: 1 });
  sim.step(DT, idle);
  sim.damageEnemy(e, 100, 'blade_arc', 0, 0, 0);
  assert.equal(e.hp, hp, 'circle still appearing');
  run(sim, 1.1);
  assert.ok(e.vuln);
  const before = e.hp;
  sim.damageEnemy(e, 100, 'blade_arc', 0, 0, 0);
  assert.ok(e.hp < before, 'inside an active circle: damage');
});

test('reaper: holy circles appear every 20 s near the players, not under her, live 15 s', () => {
  const { sim, e } = setup({ bible: true });
  e.x = sim.player.x + 150;
  run(sim, R.holy.first + 0.05);
  assert.equal(sim.holy.length, 1);
  const c = sim.holy[0];
  assert.ok(Math.hypot(c.x - e.x, c.y - e.y) >= R.holy.minFromReaper - 1e-6, 'not under the reaper');
  const fromView = Math.hypot(c.x - sim.view.x, c.y - sim.view.y);
  assert.ok(fromView <= R.holy.distance + R.holy.jitter + 1e-6);
  run(sim, R.holy.life);
  assert.ok(!sim.holy.includes(c), 'circle expired');
  run(sim, R.holy.every - R.holy.life);
  assert.equal(sim.holy.length, 1, 'next circle');
});

test('reaper: hourglass drops ahead of the player, far from her, with a timer', () => {
  const { sim, e } = setup();
  clearCrowd(sim);
  run(sim, R.hourglass.first + 0.05);
  assert.equal(sim.hourglasses.length, 1, 'dropped');
  const h0 = sim.hourglasses[0];
  assert.ok(Math.hypot(h0.x - e.x, h0.y - e.y) >= R.hourglass.minFromReaper - 1e-6, 'far from her');
  assert.equal(h0.life, R.hourglass.life);
  assert.ok(h0.t > 0 && h0.t < 0.1, 'timer runs');
});

test('reaper: coop drops one hourglass ahead of each living player', () => {
  const sim = createSim({ seed: 9, players: 2, heroes: [] });
  sim.director = { update() {} };
  const e = sim.spawnBoss('reaper');
  e.x = sim.players[0].x + 900;
  sim.reaper.hourT = DT / 2;
  sim.step(DT, idle);
  assert.equal(sim.hourglasses.length, COOP.hourglassPerPlayer ? 2 : 1);
});

test('reaper: 50% HP summons ghosts once, 25% teleports behind the nearest player after a 1 s telegraph', () => {
  const { sim, e, pl } = setup({ bible: true });
  clearCrowd(sim);
  e.hp = e.maxHp * R.summon.hpFraction - 1;
  const ghosts = () => sim.enemies.filter((o) => o.type === R.summon.enemy && !o.dead).length;
  const g0 = ghosts();
  sim.step(DT, idle);
  assert.ok(sim.events.some((ev) => ev.type === 'reaperSummon'));
  assert.ok(ghosts() - g0 >= R.summon.count * 0.5, 'ghosts summoned');
  const g1 = ghosts();
  sim.step(DT, idle);
  assert.ok(!sim.events.some((ev) => ev.type === 'reaperSummon'), 'only once');
  assert.ok(ghosts() <= g1);
  clearCrowd(sim);

  e.hp = e.maxHp * R.teleport.hpFraction - 1;
  e.speed = R.speed;
  pl.dirX = 1; pl.dirY = 0;
  sim.step(DT, idle);
  const tp = sim.reaper.tp;
  assert.ok(tp, 'telegraph started');
  assert.ok(Math.abs(tp.x - (pl.x - R.teleport.distance)) < 1e-6 && Math.abs(tp.y - pl.y) < 1e-6, 'behind the player');
  const sx = e.x;
  run(sim, R.teleport.telegraph * 0.5);
  assert.equal(e.x, sx, 'stands still during the telegraph');
  assert.ok(sim.state === 'running');
  pl.x += 200; // ушёл из-под метки
  run(sim, R.teleport.telegraph * 0.5 + 2 * DT);
  assert.equal(sim.reaper.tp, null);
  assert.ok(Math.hypot(e.x - tp.x, e.y - tp.y) < R.speed * DT * 3, 'appeared at the mark');
  // повтор по кулдауну
  run(sim, R.teleport.cooldown + 2 * DT, { x: 1, y: 0 });
  assert.ok(sim.reaper.tp || sim.events.some((ev) => ev.type === 'reaperBlink'), 'repeats');
});

test('reaper: death grants T4 loot to every player and ends overtime with victory', () => {
  const { sim, e, pl } = setup({ bible: true });
  const tr = createRunSummaryTracker({ local: 0 });
  const lootBefore = pl.loot.length;
  sim.holy.push({ uid: 1, x: e.x, y: e.y, radius: 80, t: 5, life: 15, warn: 1 });
  sim.step(DT, idle);
  sim.damageEnemy(e, 1e12, 'blade_arc', 0, 0, 0);
  assert.ok(e.dead);
  assert.equal(sim.state, 'victory');
  assert.ok(sim.events.some((ev) => ev.type === 'victory'));
  assert.equal(pl.loot.length, lootBefore + 1);
  assert.equal(pl.loot[pl.loot.length - 1].tier, BOSS_DROPS[R.lootIndex].tier);
  assert.equal(pl.loot[pl.loot.length - 1].tier, 4);
  tr.onEvents(sim.events, sim);
  assert.equal(tr.s.reaperKilled, true);
});

test('reaper: coop — Bible on either player, loot for both, one-shot downs one player only', () => {
  const sim = createSim({ seed: 5, players: 2, heroes: [], loadouts: [createBag(), bagWith('bible')] });
  assert.ok(sim.hasBible);
  const e = sim.spawnBoss('reaper');
  e.speed = 0;
  clearCrowd(sim);
  const [a, b] = sim.players;
  e.x = a.x; e.y = a.y;
  b.x = a.x + 200;
  sim.step(DT, idle);
  assert.ok(a.dead && !b.dead);
  assert.equal(sim.state, 'running');
  sim.holy.push({ uid: 1, x: e.x, y: e.y, radius: 80, t: 5, life: 15, warn: 1 });
  sim.step(DT, idle);
  sim.damageEnemy(e, 1e12, 'blade_arc', 0, 0, 0, b);
  assert.equal(sim.state, 'victory');
  for (const p of sim.players) assert.equal(p.loot[p.loot.length - 1].tier, 4);
});

test('reaper: deterministic (same seed, same circles and hourglasses)', () => {
  const trace = () => {
    const { sim } = setup({ bible: true, still: false });
    const out = [];
    for (let i = 0; i < 40 * 60 && sim.state !== 'gameover' && sim.state !== 'victory'; i++) {
      if (sim.state === 'levelup') sim.chooseCard(0);
      else if (sim.state === 'chest') sim.skipChest();
      sim.step(DT, { x: Math.cos(i / 90), y: Math.sin(i / 90) });
      for (const ev of sim.events) if (ev.type === 'holyCircle' || ev.type === 'hourglass') out.push(ev.x, ev.y);
    }
    return out;
  };
  const a = trace();
  assert.ok(a.length > 0);
  assert.deepEqual(trace(), a);
});

test('reaper: lockstep hash includes player and reaper speed penalties', () => {
  const hash = (f) => {
    const { sim } = setup();
    f(sim);
    return JSON.stringify(hashParts(sim));
  };
  const base = hash(() => {});
  assert.notEqual(hash((sim) => { sim.player.overtimeSlow = 8; }), base, 'player penalty');
  assert.notEqual(hash((sim) => { sim.reaper.slow = 8; }), base, 'reaper penalty');
});

test('reaper: codex lists Death Touch, Clock Is Ticking, Borrowed Time with descriptions', () => {
  assert.deepEqual(R.codexAttacks, ['death_touch', 'clock_ticking', 'borrowed_time']);
  for (const id of R.codexAttacks) {
    for (const k of [`codex.atk.${id}`, `codex.atk.${id}.desc`]) assert.notEqual(t(k), k, k);
  }
});
