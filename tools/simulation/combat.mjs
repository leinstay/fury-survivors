// Controlled diagnostic fixtures. Inventory is installed explicitly; these are NOT draft/win-rate runs.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createSim } from '../../src/core/sim.js';
import { createRng } from '../../src/core/rng.js';
import { createMetrics, installImmortality, FIXED_STEP, sourceHash } from './record.mjs';
import { WEAPONS } from '../../src/data/weapons.js';
import { COMBOS } from '../../src/data/combos.js';

export function combatFixture({ weapons, passives = [], seed = 1, duration = 30,
  scenario = 'crowd', blocks = true, detailed = false }) {
  const sim = createSim({ seed });
  sim.player.weapons = weapons.map(([id, level]) => ({ id, level }));
  sim.player.passives = passives.map(([id, level]) => ({ id, level }));
  sim._syncBuild();
  sim.director.update = () => {};
  const spawn = sim.spawnEnemy.bind(sim);
  sim.spawnEnemy = (...args) => {
    const e = spawn(...args);
    if (e) e.xp = 0;
    return e;
  };
  // The fixture controls enemy opportunities, not the honest game director or progression.
  sim._updateChunks = () => {};
  sim.props = [];
  if (!blocks) sim._blocked = () => false;
  const interventions = installImmortality(sim, [true]);
  const metrics = createMetrics(sim, { detailed });
  const positionRng = createRng(seed + 71);
  const refill = () => {
    const desired = scenario === 'boss' ? 1 : scenario === 'ranged' ? 16 : 40;
    while (sim.enemies.filter((e) => !e.dead).length < desired && sim.canSpawn()) {
      const angle = positionRng.next() * Math.PI * 2;
      const radius = scenario === 'ranged' ? 200 : 140 + positionRng.next() * 80;
      const e = sim.spawnEnemy(scenario === 'boss' ? 'kitsune_empress' :
        scenario === 'ranged' ? 'succubus' : 'catgirl',
      sim.player.x + Math.cos(angle) * radius, sim.player.y + Math.sin(angle) * radius,
      false, scenario === 'boss');
      e.hp = e.maxHp = scenario === 'boss' ? 1000000 : scenario === 'fragile' ? 30 : 250;
      e.xp = 0;
    }
  };
  let ticks = 0;
  while (sim.time < duration) {
    if (++ticks > duration * 120 + 100) throw new Error('Fixture stopped making progress');
    refill();
    // Fixed movement tape shared by all weapons; no policy differences confound DPS.
    const a = sim.time * 0.10;
    sim.step(FIXED_STEP, { x: Math.cos(a), y: Math.sin(a) });
  }
  const dealt = Object.values(sim.player.damageByWeapon).reduce((a, b) => a + b, 0);
  const result = { seed, duration, scenario, weapons, passives, blocks,
    label: 'controlled-fixture', investment: weapons.reduce((n, [, lv]) => n + lv, 0) +
      passives.reduce((n, [, lv]) => n + lv, 0) - 1,
    dps: dealt / sim.time, kills: sim.kills, combat: metrics.combat,
    opportunities: metrics.opportunities, interceptions: metrics.blocks, incoming: metrics.incoming,
    shadowDeaths: interventions.length, interventions };
  if (detailed) result.hits = metrics.hits;
  metrics.detach();
  return result;
}

if (process.argv[1]?.endsWith('/combat.mjs')) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
  const n = Number(opt('n', 3));
  const duration = Number(opt('seconds', 30));
  const rows = [];
  // Эволюции: оружие на maxLevel + своя пассивка (combos.js). Без --all две показательные.
  const pairs = args.includes('--all') ? COMBOS :
    [COMBOS.find((c) => c.result === 'crimson_arc'), COMBOS.find((c) => c.result === 'aegis_bastion')];
  for (const recipe of pairs) {
    const [a, passive] = recipe.from;
    const max = WEAPONS[a].maxLevel;
    for (const scenario of ['crowd', 'fragile', 'ranged', 'boss']) {for (let seed = 1; seed <= n; seed++) {
      const variants = [
        { id: 'A', weapons: [[a, max]] },
        { id: 'A+passive', weapons: [[a, max]], passives: [[passive, 1]] },
        { id: 'evolution', weapons: [[recipe.result, 1]], passives: [[passive, 1]] },
      ];
      for (const variant of variants) {rows.push({ pair: recipe.result, variant: variant.id,
        // эволюция уже несёт вложения в оружие, записываем их отдельно от её уровня 1
        recipeInvestment: variant.id === 'evolution' ? max : undefined,
        ...combatFixture({ ...variant, seed, duration, scenario }) });}
    }}
  }
  // Все эволюции получают функциональную пробу; естественный драфт — отдельно.
  for (const recipe of COMBOS) {rows.push({ pair: recipe.result, variant: 'recipe-probe',
    ...combatFixture({ weapons: [[recipe.result, 1]], scenario: 'crowd', seed: 1, duration }) });}
  const shields = ['guardian_shields', 'aegis_bastion'];
  for (const id of shields) {
    for (const blocks of [true, false]) {
      for (let seed = 1; seed <= n; seed++) {
    rows.push({ pair: id, variant: blocks ? 'block-on' : 'block-off', ...combatFixture({
      weapons: [[id, WEAPONS[id].maxLevel]], blocks, seed, duration, scenario: 'ranged' }) });
  }}}
  const out = opt('out', 'tools/out/simulation/combat.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ source: sourceHash(), rows,
    limitations: ['fixture DPS is not a win rate', 'intercepted raw is not prevented HP loss',
      'post-intervention survival is diagnostic', 'evolution level is not investment cost'] }));
  console.log(`Saved ${rows.length} controlled probes to ${out}`);
}
