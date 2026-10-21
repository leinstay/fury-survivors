// Босс: медленно идёт на игрока и по очереди применяет атаки из def.attacks (dash, summon).
// st: 0 ходьба, 1 замах рывка, 2 рывок. e.b — индекс текущей атаки, e.cd — таймеры атак.
// e.pose для рендера: 'idle' | 'windup' (замах рывка) | 'cast' (призыв, короткая поза).
// Ярость: когда hp ниже def.rage.hpFraction, кулдауны атак умножаются на def.rage.cooldownMul (один раз, событие bossRage).
const CAST_TIME = 0.6;

export default {
  init(e) {
    e.cd = e.def.attacks.map((a) => a.cooldown * 0.5);
    e.st = 0;
    e.b = 0;
    e.pose = 'idle';
    e.rage = false;
    e.castT = 0;
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
    const pl = sim.player;
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (e.castT > 0) e.castT -= dt;
    if (e.st === 0) {
      const k = (e.speed * dt) / d;
      e.x += dx * k;
      e.y += dy * k;
      e.moving = true;
      e.facing = dx >= 0 ? 1 : -1;
      e.pose = e.castT > 0 ? 'cast' : 'idle';
      for (let i = 0; i < attacks.length; i++) {
        e.cd[i] -= dt;
        if (e.cd[i] > 0) continue;
        const a = attacks[i];
        e.cd[i] = a.cooldown * cdMul;
        if (a.type === 'dash') {
          e.st = 1; e.a = a.windup; e.b = i;
          e.pose = 'windup';
          break;
        }
        if (a.type === 'summon') {
          e.castT = CAST_TIME;
          e.pose = 'cast';
          for (let j = 0; j < a.count; j++) {
            if (!sim.canSpawn()) break;
            const ang = (j / a.count) * Math.PI * 2;
            sim.spawnEnemy(a.enemy, e.x + Math.cos(ang) * a.radius, e.y + Math.sin(ang) * a.radius, false);
          }
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
    } else {
      e.moving = true;
      e.pose = 'idle';
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.a -= dt;
      if (e.a <= 0) e.st = 0;
    }
  },
};
