// Жница (docs/META.md, 4): ваншот, неуязвимость без Библии, урон только в круге, часы, фазы, смерть.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { createBag, place, makeUnique } from '../../src/core/items.js';
import { createRunSummaryTracker } from '../../src/core/run-summary.js';
import { BOSSES } from '../../src/data/bosses.js';
import { BOSS_DROPS } from '../../src/data/items.js';

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
  if (still) e.speed = 0;
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

test('reaper: a touch kills through armor, dodge, i-frames and last_chance', () => {
  const { sim, e, pl } = setup({ unique: 'last_chance' });
  clearCrowd(sim);
  pl.stats.armor = 1e6;
  pl.stats.dodge = 1;
  pl.iframes = 10;
  e.x = pl.x; e.y = pl.y;
  sim.step(DT, idle);
  assert.equal(pl.hp, 0);
  assert.equal(pl.cheatUsed, false, 'last_chance did not trigger');
  assert.ok(sim.events.some((ev) => ev.type === 'playerHurt' && ev.oneShot && ev.src === 'reaper'));
  assert.equal(sim.state, 'victory', 'death in overtime counts as victory');
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

test('reaper: hourglass slows players by half (not her) and breaks when stepped on', () => {
  const { sim, e, pl } = setup();
  clearCrowd(sim);
  run(sim, R.hourglass.first + 0.05);
  assert.equal(sim.hourglasses.length, 1, 'dropped');
  const h0 = sim.hourglasses[0];
  assert.ok(Math.hypot(h0.x - e.x, h0.y - e.y) >= R.hourglass.minFromReaper - 1e-6, 'far from her');
  // замедление: часы рядом, но не под ногами
  sim.hourglasses.length = 0;
  sim.hourglasses.push({
    uid: 1, x: pl.x, y: pl.y + 30, radius: 60, t: 0, life: 99,
    slow: R.hourglass.slow, breakRadius: 5,
  });
  const x0 = pl.x;
  sim.step(DT, { x: 1, y: 0 });
  const moved = pl.x - x0;
  assert.ok(Math.abs(moved - pl.stats.speed * DT * R.hourglass.slow) < 1e-6, `moved ${moved}`);
  // Жница внутри часов идёт с полной скоростью
  e.speed = R.speed;
  e.x = pl.x + 20; e.y = pl.y + 30;
  pl.x -= 500;
  const ex = e.x;
  sim.step(DT, idle);
  assert.ok(Math.abs(Math.hypot(e.x - ex, e.y - (pl.y + 30)) - R.speed * DT) < 0.5, 'reaper not slowed');
  e.speed = 0;
  e.x = pl.x + 600;
  // наступить на центр
  const h = sim.hourglasses[0];
  pl.x = h.x; pl.y = h.y;
  sim.step(DT, idle);
  assert.ok(!sim.hourglasses.includes(h), 'broken');
  assert.ok(sim.events.some((ev) => ev.type === 'hourglassBreak'));
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
