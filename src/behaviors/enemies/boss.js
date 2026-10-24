// Босс: медленно идёт на игрока и по очереди применяет атаки из def.attacks
// (dash, summon, fan, ring, slam, blink; параметры в шапке src/data/bosses.js).
// st: 0 ходьба, 1 замах рывка, 2 рывок, 3 исчезновение (blink), 4 появление (blink).
// e.b — индекс текущей атаки, e.cd — таймеры атак.
// Серии (fan/ring/slam): e.vl[i] — сколько залпов осталось, e.vt[i] — таймер до следующего, e.vk[i] — номер залпа.
// Серии идут независимо от состояния ходьбы/рывка.
// e.pose для рендера: 'idle' | 'windup' (замах рывка) | 'cast' (призыв, залп, короткая поза).
// e.alpha — прозрачность для рендера (blink).
// Ярость: когда hp ниже def.rage.hpFraction, кулдауны атак умножаются на def.rage.cooldownMul (один раз, событие bossRage).
import { BOSS } from '../../data/bosses.js';

const CAST_TIME = BOSS.castTime;
const TAU = Math.PI * 2;

// Один залп серии.
function volley(e, sim, a, k, dx, dy) {
  const dmg = a.damage * (e.damage / e.def.damage);
  if (a.type === 'fan') {
    const base = Math.atan2(dy, dx);
    const spread = ((a.spread || 0) * Math.PI) / 180;
    for (let j = 0; j < a.count; j++) {
      const off = a.count > 1 ? (j / (a.count - 1) - 0.5) * spread : 0;
      sim.spawnEnemyProjectile(e.x, e.y, base + off, a.speed, dmg, a.life, e.type).boss = true;
    }
  } else if (a.type === 'ring') {
    const start = (a.spin || 0) * k;
    for (let j = 0; j < a.count; j++) {
      const shot = sim.spawnEnemyProjectile(e.x, e.y, start + (j / a.count) * TAU, a.speed, dmg,
          a.life, e.type);
      shot.boss = true;
    }
  } else if (a.type === 'slam') {
    const t = sim.target(e.x, e.y);
    sim.addTelegraph(t.x, t.y, a.radius, a.delay, dmg, e.type);
  }
}

function total(a) {
  return a.type === 'slam' ? a.count : a.volleys || 1;
}

// Начать серию залпов атаки i: первый залп сразу, остальные по таймеру в update.
function startVolleys(e, sim, a, i, dx, dy) {
  e.castT = CAST_TIME;
  e.pose = 'cast';
  e.vk[i] = 0;
  volley(e, sim, a, e.vk[i]++, dx, dy);
  e.vl[i] = total(a) - 1;
  e.vt[i] = a.interval || BOSS.volleyInterval;
}

export const boss = {
  init(e) {
    const n = e.def.attacks.length;
    e.cd = e.def.attacks.map((a) => a.cooldown * 0.5);
    e.vl = new Array(n).fill(0);
    e.vt = new Array(n).fill(0);
    e.vk = new Array(n).fill(0);
    e.st = 0;
    e.b = 0;
    e.pose = 'idle';
    e.rage = false;
    e.castT = 0;
    e.alpha = 1;
    e.rec = 0;   // передышка после рывка и телепорта (BOSS.recover)
  },
  update(e, sim, dt) {
    const attacks = e.def.attacks;
    const rage = e.def.rage;
    if (rage && !e.rage && e.hp <= e.maxHp * rage.hpFraction) {
      e.rage = true;
      for (let i = 0; i < e.cd.length; i++) e.cd[i] *= rage.cooldownMul;
      sim.events.push({ type: 'bossRage', x: e.x, y: e.y });
    }
    const cdMul = e.rage ? rage.cooldownMul : 1;
    const speedMul = e.rage && rage.speedMul ? rage.speedMul : 1;
    const pl = sim.target(e.x, e.y);
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (e.castT > 0) e.castT -= dt;

    // серии залпов
    for (let i = 0; i < attacks.length; i++) {
      if (e.vl[i] <= 0) continue;
      e.vt[i] -= dt;
      if (e.vt[i] > 0) continue;
      const a = attacks[i];
      volley(e, sim, a, e.vk[i]++, dx, dy);
      e.vl[i]--;
      e.vt[i] = a.interval || BOSS.volleyInterval;
      e.castT = CAST_TIME;
    }

    if (e.st === 0 && e.rec > 0) {
      // передышка: стоит на месте, откаты атак не идут
      e.rec -= dt;
      e.moving = false;
      e.facing = dx >= 0 ? 1 : -1;
      e.pose = 'idle';
    } else if (e.st === 0) {
      const k = (e.speed * speedMul * dt) / d;
      e.x += dx * k;
      e.y += dy * k;
      e.moving = true;
      e.facing = dx >= 0 ? 1 : -1;
      e.pose = e.castT > 0 ? 'cast' : 'idle';
      for (let i = 0; i < attacks.length; i++) {
        const a = attacks[i];
        if (a.rageOnly && !e.rage) continue;
        e.cd[i] -= dt;
        if (e.cd[i] > 0) continue;
        e.cd[i] = a.cooldown * cdMul;
        if (a.type === 'dash') {
          e.st = 1; e.a = a.windup; e.b = i;
          e.pose = 'windup';
          break;
        }
        if (a.type === 'blink') {
          e.st = 3; e.a = a.delay; e.b = i;
          e.pose = 'cast';
          break;
        }
        if (a.type === 'summon') {
          e.castT = CAST_TIME;
          e.pose = 'cast';
          for (let j = 0; j < a.count; j++) {
            if (!sim.canSpawn()) break;
            const ang = (j / a.count) * TAU;
            sim.spawnEnemy(a.enemy,
                e.x + Math.cos(ang) * a.radius, e.y + Math.sin(ang) * a.radius, false);
          }
        } else if (a.type === 'fan' || a.type === 'ring') {
          if (d < BOSS.minRange) {
            e.cd[i] = 0;   // героиня вплотную: ждём, пока отойдёт, откат не тратим
            continue;
          }
          // замах перед первым залпом, чтобы успеть отойти
          e.st = 5; e.a = BOSS.castDelay; e.b = i;
          e.pose = 'cast';
          break;
        } else if (a.type === 'slam') {
          startVolleys(e, sim, a, i, dx, dy);   // удары по земле сами предупреждают кругом
        }
      }
    } else if (e.st === 1) {
      e.moving = false;
      e.pose = 'windup';
      e.facing = dx >= 0 ? 1 : -1;
      e.a -= dt;
      if (e.a <= 0) {
        const a = attacks[e.b];
        e.st = 2;
        e.a = a.time;
        e.vx = (dx / d) * a.speed;
        e.vy = (dy / d) * a.speed;
        e.pose = 'idle';
      }
    } else if (e.st === 2) {
      e.moving = true;
      e.pose = 'idle';
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.a -= dt;
      // рывок обрывается, не долетев до героини
      if (e.a <= 0 || d < BOSS.dashStop) {
        e.st = 0;
        e.rec = BOSS.recover;
      }
    } else if (e.st === 5) {
      // замах перед веером или кольцом
      e.moving = false;
      e.pose = 'cast';
      e.facing = dx >= 0 ? 1 : -1;
      e.a -= dt;
      if (e.a <= 0) {
        e.st = 0;
        startVolleys(e, sim, attacks[e.b], e.b, dx, dy);
      }
    } else if (e.st === 3) {
      // исчезает, затем появляется рядом с игроком
      const a = attacks[e.b];
      e.moving = false;
      e.pose = 'cast';
      e.facing = dx >= 0 ? 1 : -1;
      e.a -= dt;
      e.alpha = Math.max(0, e.a / a.delay);
      if (e.a <= 0) {
        const ang = sim.rng.next() * TAU;
        e.x = pl.x + Math.cos(ang) * a.distance;
        e.y = pl.y + Math.sin(ang) * a.distance;
        e.kx = 0; e.ky = 0;
        e.st = 4;
        e.a = a.fadeIn || 0.3;
        sim.events.push({ type: 'bossBlink', x: e.x, y: e.y });
      }
    } else {
      const a = attacks[e.b];
      e.moving = false;
      e.pose = 'idle';
      e.facing = dx >= 0 ? 1 : -1;
      e.a -= dt;
      e.alpha = 1 - Math.max(0, e.a / (a.fadeIn || 0.3));
      if (e.a <= 0) {
        e.st = 0;
        e.alpha = 1;
        e.rec = BOSS.recover;
      }
    }
  },
};
