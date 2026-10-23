import { createRng, hashSeed } from '../../src/core/rng.js';
import { COMBOS } from '../../src/data/combos.js';
import { PASSIVES } from '../../src/data/passives.js';
import { cardFeatures, linearScore, probabilities } from './features.mjs';
import { MODEL } from './model.mjs';

function sample(scores, rng, temperature) {
  const ps = probabilities(scores, temperature);
  let r = rng.next();
  for (let i = 0; i < ps.length; i++) { r -= ps[i]; if (r <= 0) return i; }
  return ps.length - 1;
}

export function createPolicy({ seed = 1, profile, evolution = true, model = MODEL }) {
  const choiceRng = createRng(hashSeed(seed, 13));
  const motionRng = createRng(hashSeed(seed, 71));
  let nextMove = 0;
  let input = { x: 0, y: 0 };
  let focus = '';
  let lastTake = '';
  let target = profile.recipe || '';
  let seenEnemies = new Map();
  let lastSeenAt = 0;
  let rejected = 0;
  const intent = (o) => {
    if (!focus) focus = o.self.w[0][0];
    const known = [...o.self.w, ...o.self.p].map(([id]) => id);
    if (target && o.self.w.some(([id]) => id === target)) {
      target = '';
      focus = o.self.w.find(([id]) => !COMBOS.some((c) => c.result === id))?.[0] || focus;
    }
    if (!target && evolution && ['collab', 'evolution', 'recipe'].includes(profile.intent)) {
      const consumed = new Set(COMBOS.filter((c) =>
        known.includes(c.result)).flatMap((c) => c.from));
      const candidates = COMBOS.filter((c) => c.from.includes(focus) &&
        !known.includes(c.result) && !c.from.some((id) => consumed.has(id)) &&
        (profile.intent === 'collab' ? !PASSIVES[c.from[1]] :
          profile.intent === 'evolution' ? !!PASSIVES[c.from[1]] : true));
      if (candidates.length) target = candidates[choiceRng.int(candidates.length)].result;
    }
    // Change plan after prolonged draft rejection, never manufacture a missing component.
    if (rejected > 12 && target) {
      const alternative = COMBOS.find((c) => c.from.some((id) => known.includes(id)) &&
        !c.from.some((id) => o.banished.includes(`weapon:${id}`) ||
          o.banished.includes(`passive:${id}`)) && c.result !== target);
      if (alternative) target = alternative.result;
      rejected = 0;
    }
  };
  const value = (c, o) => {
    let v = linearScore(cardFeatures(c, o.self, lastTake), model.weights);
    const recipe = COMBOS.find((x) => x.result === target);
    if (recipe?.from.includes(c.id)) v += 1.7;
    if (c.id === target) v += 4;
    if (profile.intent === 'focus' && c.id === focus) v += 2.4;
    if (profile.intent === 'defensive' && ['armor', 'regen', 'max_hp'].includes(c.id)) v += 1.5;
    if (o.self.hp / o.self.maxHp < 0.35 && ['armor', 'regen', 'max_hp'].includes(c.id)) v += 0.9;
    return v;
  };
  const choose = (o) => {
    intent(o);
    if (o.chest.length) {
      if (!evolution) return { k: 'skipChest' };
      const i = sample(o.chest.map((c) => value(c, o)), choiceRng, profile.temperature);
      return { k: 'chest', i };
    }
    if (!o.cards.length) return null;
    const scores = o.cards.map((c) => value(c, o));
    const desired = COMBOS.find((c) => c.result === target)?.from || [focus];
    const useful = o.cards.some((c) => desired.includes(c.id));
    const rate = model.actionRates;
    if (!useful && o.budgets.reroll > 0 && choiceRng.next() < (rate.reroll || 0) * 2.5) {
      rejected++;
      return { k: 'reroll' };
    }
    const bad = o.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.kind !== 'heal' &&
      !desired.includes(c.id) && !o.self.w.some(([id]) => id === c.id));
    if (!useful && bad.length && o.budgets.banish > 0 &&
        choiceRng.next() < (rate.banish || 0) * 3) {
      return { k: 'banish', i: bad.sort((a, b) => scores[a.i] - scores[b.i])[0].i };
    }
    if (!useful && o.budgets.skip > 0 && choiceRng.next() < (rate.skip || 0)) {
      return { k: 'skip' };
    }
    const i = sample(scores, choiceRng, profile.temperature);
    lastTake = o.cards[i].id;
    rejected = useful ? 0 : rejected + 1;
    return { k: 'card', i };
  };
  const move = (o) => {
    if (o.time < nextMove) return { ...input };
    nextMove = o.time + profile.reaction * (0.8 + motionRng.next() * 0.4);
    const p = o.self;
    if (p.dead) return { x: 0, y: 0 };
    const elapsed = Math.max(0.01, o.time - lastSeenAt);
    const enemies = o.enemies.map((e) => {
      const prior = seenEnemies.get(e.uid);
      return { ...e, vx: prior ? (e.x - prior.x) / elapsed : 0,
        vy: prior ? (e.y - prior.y) / elapsed : 0 };
    });
    seenEnemies = new Map(o.enemies.map((e) => [e.uid, { x: e.x, y: e.y }]));
    lastSeenAt = o.time;
    const magnet = o.pickups.some((x) => x.kind === 'magnet');
    const banking = p.level >= 12 && o.time > 90 &&
      ((profile.collection === 'bank' && o.time % ((profile.bankSeconds || 75) + 25) <
        (profile.bankSeconds || 75)) ||
      (profile.collection === 'opportunistic' && magnet));
    const options = o.pickups.filter((x) => ['xp', 'heal', 'chest', 'magnet'].includes(x.kind) &&
      !(x.kind === 'xp' && banking))
      .map((x) => ({ ...x, priority: (x.kind === 'heal' ? (p.hp / p.maxHp < 0.6 ? 5 : 0.1) :
        x.kind === 'magnet' ? (banking ? 12 : 5) : x.kind === 'chest' ? 2.5 : 1) / Math.max(24, Math.hypot(x.x - p.x, x.y - p.y)) }));
    const dead = o.allies.find((q) => q.dead);
    if (dead) {
      options.push({ ...dead,
        priority: 3 / Math.max(24, Math.hypot(dead.x - p.x, dead.y - p.y)) });
    }
    let goal = options.sort((a, b) => b.priority - a.priority)[0];
    if (!goal) {
      const nearest = [...enemies, ...o.radarEnemies].sort((a, b) =>
        Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      goal = nearest || { x: p.x + Math.cos(o.time * 0.025 + seed) * 150,
        y: p.y + Math.sin(o.time * 0.025 + seed) * 150 };
    }
    const horizon = Math.max(0.6, profile.reaction * 2);
    const goalDistance = Math.hypot(goal.x - p.x, goal.y - p.y);
    const candidates = [{ x: 0, y: 0 }];
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      candidates.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    const utility = (v) => {
      const x = p.x + v.x * p.speed * horizon;
      const y = p.y + v.y * p.speed * horizon;
      let value = (goalDistance - Math.hypot(goal.x - x, goal.y - y)) /
        (p.speed * horizon) * profile.courage * 2;
      value += (v.x * input.x + v.y * input.y) * 0.12;
      for (const ally of o.allies) {if (!ally.dead) {
        const separation = Math.hypot(x - ally.x, y - ally.y);
        value -= Math.max(0, separation - 100) / 80;
      }}
      for (const e of enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) > 180) continue;
        let clearance = Infinity;
        for (const t of [0.15, horizon / 2, horizon]) {
          clearance = Math.min(clearance, Math.hypot(p.x + v.x * p.speed * t - e.x - e.vx * t,
            p.y + v.y * p.speed * t - e.y - e.vy * t) - p.radius - e.radius);
        }
        value -= Math.exp(-clearance / 16) * 2.5;
      }
      for (const s of o.shots) {
        let clearance = Infinity;
        for (const t of [0.15, horizon / 2, horizon]) {clearance = Math.min(clearance,
          Math.hypot(p.x + v.x * p.speed * t - s.x - s.vx * t,
            p.y + v.y * p.speed * t - s.y - s.vy * t) - p.radius - s.radius);}
        value -= Math.exp(-clearance / 14) * 3;
      }
      for (const s of o.threats) {
        const clearance = Math.hypot(x - s.x, y - s.y) - p.radius - s.radius;
        value -= Math.exp(-clearance / 18) * 3;
      }
      return value;
    };
    const values = candidates.map(utility);
    const best = candidates[values.indexOf(Math.max(...values))];
    // Imperfect heading selection; no hidden enemy state or future shots are available.
    const angle = Math.atan2(best.y, best.x) + (motionRng.next() - 0.5) * 0.10;
    input = best.x === 0 && best.y === 0 ? { x: 0, y: 0 } :
      { x: Math.round(Math.cos(angle) * 100) / 100,
        y: Math.round(Math.sin(angle) * 100) / 100 };
    return { ...input };
  };
  return { choose, move, describe: () => ({ profile: profile.id, focus, target,
    model: model.version, evolution, collection: profile.collection || 'steady' }) };
}
