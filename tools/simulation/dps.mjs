// DPS оружия на бессмертных манекенах (docs/BALANCE_AUDIT.md 13): проверка лестницы без ботов и без толпы, которая
// умирает. Герой — средний (HERO_BASE: статы 100%, без пассивок и сумки), стоит в центре, одно оружие. Манекены не
// двигаются, не бьют, не умирают (HP 1e12, отталкивание не сдвигает), ДоТы и статусы на них работают. Директор волн и
// ящики выключены. Прогрев warm с, затем замер window с; DPS = снятый HP за окно / window. Детерминировано по --seed.
// Сцены:
//   one    — 1 манекен на расстоянии d (орбита — на кольце, иначе ONE_DIST)
//   group  — 10 манекенов кучкой радиусом GROUP_R вокруг той же точки
//   screen — рамка героя (CLEAR) плотно заставлена манекенами с шагом SCREEN_STEP (до лимита SIM.maxEnemies)
// Колонки: дальность R (с какой дистанции начинает бить, ladder.mjs reach), радиус удара (px) и квирки (ladder.mjs).
// node tools/simulation/dps.mjs [--experiment x.json] [--seed 1] [--warm 5] [--window 60] [--json out.json] [--md]
import { readFile, writeFile } from 'node:fs/promises';
import { createSim } from '../../src/core/sim.js';
import { WEAPONS, WEAPON_BEHAVIOR as B } from '../../src/data/weapons.js';
import { HERO_BASE } from '../../src/data/heroes.js';
import { SIM, CLEAR } from '../../src/data/constants.js';
import { installExperiment } from './experiment.mjs';
import { BASE, EVOS, reach, quirks, LADDER } from './ladder.mjs';

const ONE_DIST = 40;      // px от героя до манекена (внутри дальности любого оружия, кроме орбит)
const GROUP_R = 20;       // радиус кучки из 10
const SCREEN_STEP = 18;   // шаг сетки манекенов в рамке
const DUMMY = 'catgirl';  // вид манекена (размер хитбокса)
const STILL = { update() {} };

/** Радиус (или полуширина) одного удара, px: что накрывает удар. */
export function hitSize(def, lv) {
  switch (def.behavior) {
    case 'melee_arc': return lv.area;                      // конус длиной area
    case 'aura': case 'cloud': case 'slam': case 'ice_orb': case 'area_drop': return lv.area;
    case 'orbit': return lv.hitRadius || B.orbit.hitRadius;
    case 'chain': return lv.area;                          // радиус прыжка
    case 'beam': case 'slash': return lv.width;            // полуширина полосы длиной area
    case 'impale': return lv.burst || lv.hitRadius || B.impale?.hitRadius;
    case 'summon': return B.summon.hitRadius;
    default: return lv.hitRadius || B.projectile.hitRadius;
  }
}

function placeDummies(sim, scene, dist) {
  const pts = [];
  if (scene === 'one') pts.push([dist, 0]);
  else if (scene === 'group') {
    pts.push([dist, 0]);
    for (let i = 0; i < 9; i++) {
      const a = i * 2 * Math.PI / 9;
      pts.push([dist + Math.cos(a) * GROUP_R, Math.sin(a) * GROUP_R]);
    }
  } else {
    const hw = CLEAR.frameW / 2;
    const hh = CLEAR.frameH / 2;
    for (let y = -hh; y <= hh; y += SCREEN_STEP) {
      for (let x = -hw; x <= hw; x += SCREEN_STEP) {
        if (Math.hypot(x, y) < 16) continue;
        pts.push([x, y]);
      }
    }
    pts.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    pts.length = Math.min(pts.length, SIM.maxEnemies - 1);
  }
  for (const [x, y] of pts) {
    const e = sim.spawnEnemy(DUMMY, x, y);
    if (!e) break;
    e.maxHp = e.hp = 1e12; e.speed = 0; e.damage = 0; e.xp = 0; e.resist = 1; e.beh = STILL;
  }
  return pts.length;
}

/** DPS одного оружия на уровне level в сцене scene. */
export function measure(id, level, scene, { seed = 1, warm = 5, window = 60 } = {}) {
  const sim = createSim({ seed, players: 1, hero: 'heroine', heroes: ['heroine'] });
  sim.director = { update() {} };
  sim._genChunk = () => {};
  sim.props.length = 0;
  const p = sim.player;
  p.heroDef = { ...p.heroDef, stats: { ...HERO_BASE } }; // средний герой, статы 100%
  p.weapons = [{ id, level }];
  sim._syncBuild();
  p.hp = p.maxHp;
  const def = WEAPONS[id];
  const lv = def.levels[level - 1];
  const dist = def.behavior === 'orbit' ? lv.area : ONE_DIST;
  const n = placeDummies(sim, scene, dist);
  const step = 1 / SIM.tickRate;
  const input = { players: [{ x: 0, y: 0 }] };
  let start = 0;
  for (let t = 0; t < warm + window; t += step) {
    if (t < warm && t + step >= warm) start = p.damageByWeapon[id] || 0;
    if (sim.state !== 'running') sim.state = 'running'; // уровней нет (опыта нет), страховка
    sim.step(step, input);
    p.hp = p.maxHp;
  }
  return { dps: ((p.damageByWeapon[id] || 0) - start) / window, dummies: n };
}

export function table(opts = {}) {
  const rows = [];
  const add = (id, level) => {
    const def = WEAPONS[id];
    const lv = def.levels[level - 1];
    const r = { id, level: def.evolved ? 'evo' : `L${level}`, R: Math.round(reach(def, lv)),
      size: Math.round(hitSize(def, lv)), quirks: quirks(def, lv).map((q) => q.id).join(' ') };
    for (const scene of ['one', 'group', 'screen']) r[scene] = Math.round(measure(id, level, scene, opts).dps);
    rows.push(r);
  };
  for (const id of BASE) { add(id, 1); add(id, WEAPONS[id].maxLevel); }
  for (const id of EVOS) add(id, 1);
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
  const experiment = opt('experiment', '') ?
    JSON.parse(await readFile(opt('experiment'), 'utf8')) : null;
  const restore = installExperiment(experiment);
  try {
    const rows = table({ seed: Number(opt('seed', 1)), warm: Number(opt('warm', 5)),
      window: Number(opt('window', 60)) });
    if (args.includes('--md')) {
      console.log('| оружие | уровень | DPS 1 цель | DPS 10 | DPS экран | дальность, px | радиус удара, px | квирки |');
      console.log('|---|---|---|---|---|---|---|---|');
      for (const r of rows) {
        console.log(`| ${r.id} | ${r.level} | ${r.one} | ${r.group} | ${r.screen} | ${r.R} | ${r.size} | ` +
          `${r.quirks || '—'} |`);
      }
    } else {
      for (const r of rows) {
        console.log(`${r.id.padEnd(17)} ${String(r.level).padEnd(4)} ${String(r.one).padStart(6)} ` +
          `${String(r.group).padStart(6)} ${String(r.screen).padStart(7)}  R ${String(r.R).padStart(3)}  ` +
          `r ${String(r.size).padStart(3)}  ${r.quirks}`);
      }
    }
    if (opt('json', '')) await writeFile(opt('json'), JSON.stringify({ LADDER, rows }, null, 1));
  } finally {
    restore();
  }
}

if (process.argv[1]?.endsWith('dps.mjs')) await main();
