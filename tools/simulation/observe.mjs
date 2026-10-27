import { GAME_WIDTH, GAME_HEIGHT, HUD } from '../../src/data/constants.js';

// Snapshot contains player-visible data only. Never pass sim, rng, hidden cooldowns or future drops.
export function observe(sim, who) {
  const p = sim.players[who];
  const visible = (x) => Math.abs(x.x - sim.view.x) <= GAME_WIDTH / 2 &&
    Math.abs(x.y - sim.view.y) <= GAME_HEIGHT / 2;
  const point = (x) => ({ x: x.x, y: x.y, radius: x.radius || x.size || 0 });
  const lu = p.levelUp;
  return {
    time: sim.time, frame: sim.frame, state: sim.state, local: who,
    self: { ...point(p), hp: p.hp, maxHp: p.maxHp, dead: p.dead,
      level: sim.player.level, speed: p.stats.speed, hero: p.hero,
      w: p.weapons.map((w) => [w.id, w.level]), p: p.passives.map((x) => [x.id, x.level]) },
    allies: sim.players.filter((q) => q.id !== who).map((q) => ({ ...point(q), dead: q.dead })),
    enemies: sim.enemies.filter((e) => !e.dead && visible(e)).map((e) =>
      ({ ...point(e), uid: e.uid, type: e.type, elite: e.elite, boss: e.boss, pose: e.pose })),
    shots: sim.projectiles.filter((s) => s.owner === 'enemy' && visible(s))
      .map((s) => ({ ...point(s), vx: s.vx, vy: s.vy })),
    threats: sim.telegraphs.filter(visible).map(point),
    pickups: sim.pickups.filter((x) => visible(x) || (x.kind !== 'xp' &&
      Math.hypot(x.x - sim.view.x, x.y - sim.view.y) <= HUD.minimap.range))
      .map((x) => {
        if (visible(x)) return { ...point(x), kind: x.kind, source: 'screen' };
        const k = HUD.minimap.radius / HUD.minimap.range;
        return { x: sim.view.x + Math.round((x.x - sim.view.x) * k) / k,
          y: sim.view.y + Math.round((x.y - sim.view.y) * k) / k,
          kind: x.kind, source: 'minimap' };
      }),
    radarEnemies: sim.enemies.filter((e) => !e.dead && (e.boss || e.elite) &&
      Math.hypot(e.x - sim.view.x, e.y - sim.view.y) <= HUD.minimap.range)
      .map((e) => ({ x: Math.round(e.x / 27) * 27, y: Math.round(e.y / 27) * 27,
        kind: e.boss ? 'boss' : 'elite' })),
    cards: sim.state === 'levelup' && sim.picker === who ? structuredClone(lu.cards) : [],
    // сундук: варианты эволюции (у того, кому достался) или выпавшие апгрейды (уже применены, только Ok)
    chest: sim.state !== 'chest' ? [] : sim.chest.cards.length ?
      (sim.chest.player === who ? structuredClone(sim.chest.cards) : []) :
      structuredClone(sim.chest.rolls.filter((r) => r.player === who).flatMap((r) => r.cards)),
    budgets: { reroll: lu.rerolls, skip: lu.skips, banish: lu.banishes },
    banished: [...lu.banished], slots: { ...p.slots },
  };
}
