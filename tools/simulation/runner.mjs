import { createSim } from '../../src/core/sim.js';
import { applyCommand, simFingerprint } from '../../src/core/lockstep.js';
import { createTelemetry } from '../../src/core/telemetry.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { observe } from './observe.mjs';
import { createPolicy } from './policy.mjs';
import { PROFILES, BUILD_PROFILES, recipeProfiles, PROFILE_VERSION } from './profiles.mjs';
import { createClearMetrics } from './clear.mjs';
import { installExperiment } from './experiment.mjs';
import { MODEL } from './model.mjs';
import { bagsFor } from './bags.mjs';
import { stateHash, sourceHash, createMetrics, installImmortality, FIXED_STEP } from './record.mjs';

export function resolveProfile(id = 'focus') {
  const p = [...PROFILES, ...BUILD_PROFILES, ...recipeProfiles()].find((x) => x.id === id);
  if (!p) throw new Error(`Unknown profile: ${id}`);
  return p;
}
export function runSimulation(options = {}) {
  const restore = installExperiment(options.experiment);
  try { return execute(options); } finally { restore(); }
}
function execute(options) {
  const config = { seed: 1, behaviorSeed: 101, players: 1, difficulty: 'normal',
    heroes: ['heroine', 'mage'], profiles: ['focus', 'evolution'], until: 1080,
    stopOnWin: true, noEvolution: [], immortal: [], record: false, telemetry: false,
    detailed: false, checkpointEvery: 600, ...options };
  if (!Number.isSafeInteger(config.seed) || !Number.isSafeInteger(config.behaviorSeed) ||
      ![1, 2].includes(config.players) || !['normal', 'cursed'].includes(config.difficulty) ||
      !Number.isFinite(config.until) || config.until <= 0) throw new Error('Invalid run config');
  // Сумки: config.loadouts (готовые, формат сохранения) или config.bag ({tier, cells, pick}) — сгенерировать.
  const loadouts = config.loadouts || bagsFor(config);
  const sim = createSim({ seed: config.seed, players: config.players, difficulty: config.difficulty,
    hero: config.heroes[0], heroes: config.heroes, ...(loadouts ? { loadouts } : {}) });
  // Fixture installation is explicit and is forbidden in honest balance runs.
  if (config.fixture) {
    if (!config.immortal.some(Boolean)) throw new Error('Fixture requires diagnostic cohort');
    sim.players[0].weapons = config.fixture.weapons.map(([id, level]) => ({ id, level }));
    sim.players[0].passives = (config.fixture.passives || []).map(([id, level]) => ({ id, level }));
    sim._syncBuild();
  }
  const interventions = installImmortality(sim, config.immortal);
  const profiles = sim.players.map((_, i) =>
    resolveProfile(config.profiles[i % config.profiles.length]));
  const policies = sim.players.map((p, i) => createPolicy({
    seed: config.behaviorSeed + i * 997, profile: profiles[i],
    evolution: !config.noEvolution[i],
  }));
  const telemetry = config.telemetry ? sim.players.map((p) => createTelemetry({ sim,
    local: p.id, coop: sim.coop, sessionId: `bot-${config.seed}-${config.behaviorSeed}`,
    fingerprint: simFingerprint().toString(16) })) : [];
  const metrics = createMetrics(sim, { detailed: config.detailed });
  const clear = config.clear ? createClearMetrics(sim) : null;
  const inputs = sim.players.map(() => ({ x: 0, y: 0 }));
  const nextThink = sim.players.map(() => 0);
  const trace = config.record ? { schema: 1, source: sourceHash(), model: MODEL.version,
    profiles: PROFILE_VERSION, config, inputs: [], actions: [], checkpoints: [] } : null;
  let inputKey = '';
  let step = 0;
  let actionsWithoutStep = 0;
  let outcome = 'timeout';
  let error = null;
  const started = performance.now();
  try {
    while (sim.time < config.until) {
      if (sim.won && config.stopOnWin) { outcome = 'victory'; break; }
      if (['gameover', 'victory'].includes(sim.state)) {
        outcome = sim.won ? 'victory' : 'defeat'; break;
      }
      if (step > config.until * 240 + 10000) throw new Error('tick watchdog');
      if (['chest', 'levelup'].includes(sim.state)) {
        const who = sim.state === 'chest' ? sim.chest.player : sim.picker;
        const command = policies[who].choose(observe(sim, who));
        if (!command || !applyCommand(sim, who, command)) throw new Error('illegal policy command');
        if (trace) trace.actions.push({ step, who, command });
        if (++actionsWithoutStep > 30) throw new Error('choice watchdog');
        continue;
      }
      if (!['running', 'resume', 'reveal'].includes(sim.state)) {
        throw new Error(`unsupported state ${sim.state}`);
      }
      actionsWithoutStep = 0;
      if (sim.state === 'running') {for (let i = 0; i < inputs.length; i++) {
        if (sim.time >= nextThink[i]) {
          inputs[i] = policies[i].move(observe(sim, i));
          nextThink[i] = sim.time + profiles[i].reaction / 2;
        }
      }}
      const key = JSON.stringify(inputs);
      if (trace && key !== inputKey) {
        trace.inputs.push([step, ...inputs.flatMap((x) => [x.x, x.y])]); inputKey = key;
      }
      sim.step(FIXED_STEP, { players: inputs });
      step++;
      for (const [i, p] of sim.players.entries()) {
        if (config.noEvolution[i] && p.weapons.some((w) => WEAPONS[w.id].evolved)) {
          throw new Error('no-evolution invariant violated');
        }
      }
      if (trace && step % config.checkpointEvery === 0) {
        trace.checkpoints.push([step, stateHash(sim)]);
      }
    }
    if (sim.won && config.stopOnWin) outcome = 'victory';
    else if (sim.state === 'gameover') outcome = 'defeat';
  } catch (err) { outcome = 'error'; error = err.stack; }
  const result = {
    config, outcome, error, time: sim.time, steps: step, kills: sim.kills, level: sim.player.level,
    won: sim.won, bossKills: sim.bossKills, fingerprint: simFingerprint().toString(16),
    model: MODEL.version,
    profileVersion: PROFILE_VERSION, policies: policies.map((p) => p.describe()),
    minutes: metrics.minutes, recipes: metrics.recipes, combat: metrics.combat,
    economy: metrics.economy, opportunities: metrics.opportunities, blocks: metrics.blocks,
    incoming: metrics.incoming, magnets: metrics.magnets,
    decisions: metrics.players, interventions,
    final: sim.players.map((p) => ({ hero: p.hero, hp: p.hp, dead: p.dead,
      weapons: p.weapons.map((w) => [w.id, w.level]),
      passives: p.passives.map((x) => [x.id, x.level]),
      dealt: p.damageByWeapon, raw: p.rawByWeapon, revives: p.revives })),
    wallMs: Math.round(performance.now() - started),
    telemetry: telemetry.map((tr) => tr.finish(sim, { status: outcome === 'defeat' ? 'dead' :
      outcome === 'victory' ? 'victory' : 'quit' })),
  };
  if (config.detailed) result.hits = metrics.hits;
  metrics.detach();
  if (clear) { result.clear = clear.result(); clear.detach(); }
  if (trace) {
    trace.steps = step; trace.finalHash = stateHash(sim); trace.outcome = outcome;
    result.trace = trace;
  }
  return result;
}

export function replay(trace) {
  const restore = installExperiment(trace.config.experiment);
  try { return replayExact(trace); } finally { restore(); }
}
function replayExact(trace) {
  if (trace.source !== sourceHash()) throw new Error('Replay requires original source hash');
  const c = trace.config;
  const loadouts = c.loadouts || bagsFor(c);
  const sim = createSim({ seed: c.seed, players: c.players, difficulty: c.difficulty,
    hero: c.heroes[0], heroes: c.heroes, ...(loadouts ? { loadouts } : {}) });
  if (c.fixture) {
    sim.player.weapons = c.fixture.weapons.map(([id, level]) => ({ id, level }));
    sim.player.passives = (c.fixture.passives || []).map(([id, level]) => ({ id, level }));
    sim._syncBuild();
  }
  installImmortality(sim, c.immortal);
  let ai = 0;
  let ii = 0;
  let ci = 0;
  let input = sim.players.map(() => ({ x: 0, y: 0 }));
  for (let step = 0; step <= trace.steps; step++) {
    while (trace.actions[ai]?.step === step) {
      const a = trace.actions[ai++];
      if (!applyCommand(sim, a.who, a.command)) throw new Error(`Illegal replay command at ${step}`);
    }
    if (step === trace.steps) break;
    if (trace.inputs[ii]?.[0] === step) {
      const row = trace.inputs[ii++];
      input = sim.players.map((_, i) => ({ x: row[1 + i * 2], y: row[2 + i * 2] }));
    }
    sim.step(FIXED_STEP, { players: input });
    if (trace.checkpoints[ci]?.[0] === step + 1) {
      if (trace.checkpoints[ci][1] !== stateHash(sim)) throw new Error(`Replay diverged at ${step + 1}`);
      ci++;
    }
  }
  const hash = stateHash(sim);
  if (hash !== trace.finalHash) throw new Error('Replay final state differs');
  return { matched: true, steps: trace.steps, finalHash: hash };
}
