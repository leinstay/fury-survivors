// Лестница оружия по дальности и квиркам (docs/BALANCE_AUDIT.md 13). Правило владельца: чем дальше бьёт оружие
// (дальность между оружиями, а не рост радиуса по уровням одного), тем слабее; ближе всех — Blade Arc, он сильнейший.
// Оружие с квирками (отталкивание на дистанции, замедление, пробивание, ДоТ, самонаведение, блок снарядов, удар
// по кругу без наведения) ещё слабее. Цель — урон за секунду владения относительно якоря (меч L5, эволюции —
// Crimson Arc):
//   target(w) = f(R_w) × Q_w,   f(R) = 1 / (1 + k · ln(max(R, r0) / r0)),   Q = 1 / (1 + Σ q_i)
// R — дальность, на которой оружие начинает бить (из данных, по behavior), r0 — дальность якоря. f логарифмическая:
// площадь, которую контролирует оружие, растёт как R², а число целей и время до контакта — почти линейно, поэтому
// степенной штраф (r0/R)^α с α ≥ 0.5 рвёт разрыв ×3+ на дальних; логарифм даёт убывающую отдачу от дальности, как
// диминишинги в RPG (WoW/PoE: рейтинг → процент через x / (x + k), D3/D4 броня armor / (armor + 50·level)).
// Квирки складываются гиперболой 1 / (1 + Σq) (та же форма x / (x + k)): десяток квирков не уводит урон в ноль,
// каждый следующий весит чуть меньше. Отрицательный q — недостаток (промах метеора, луч в случайную сторону).
//
// node tools/simulation/ladder.mjs                       бумага: дальность, квирки, цель, бумажный DPS по цели
// node tools/simulation/ladder.mjs --lab [--n 8] [--until 600] [--from 2] [--to 9] [--workers 30] [--out x.json]
//   лаборатория: бессмертная мечница (attack = magic = 1) с одним оружием на макс. уровне, один слот оружия,
//   пассивки только защитные и сбор (не меняют урон), сундуки пропускает. Меряется сила клира power = 1 / жизнь
//   моба в рамке (по умолчанию, --metric power; --level 1 — уровень оружия вместо максимального) и урон за секунду (dps — снятый HP, упирается в приток мобов,
//   если оружие успевает; rawDps — с оверкиллом; baseDps — без стата). Окно минут --from..--to.
// node tools/simulation/ladder.mjs --bots tools/out/targets/x.json [--key normal/1/mid] [--window late]
//   то же по обычным ботам targets.mjs (оружие на макс. уровне в окне; сборка и статы смешаны).
// node tools/simulation/ladder.mjs --tune [--iters 3] [--n 8] [--experiment base.json] [--out tuned.json]
//   подбор урона (или кулдауна) каждого оружия под цель по лаборатории; пишет experiment для experiment.mjs.
// --anchor-power — якорь = LADDER.anchorPower (абсолютный), иначе текущий меч.
// [--experiment x.json] — правки данных (experiment.mjs), [--json] — таблица JSON в stdout.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { availableParallelism } from 'node:os';
import { pathToFileURL } from 'node:url';
import { WEAPONS, WEAPON_BEHAVIOR } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { COMBOS } from '../../src/data/combos.js';
import { forest } from '../../src/data/stages/forest.js';

// Параметры лестницы (инструмент, не игра; числа игры — в src/data).
export const LADDER = {
  k: 0.6,                  // крутизна f: R = 3 × r0 → f ≈ 0.6, R = 4 × r0 → 0.55
  anchor: 'blade_arc', anchorEvo: 'crimson_arc',
  // Абсолютная сила якоря в лаборатории (1 / жизнь в рамке, 2:00–9:59): Blade Arc L5 и Crimson Arc до переделки
  // в slash (27.10). Цели остальных считаются от неё, а не от текущего меча: правка меча не сдвигает лестницу,
  // а сам меч сверяется с ней же (--anchor-power).
  anchorPower: { base: 0.16, evo: 0.19 },
  // q каждого квирка. Положительный — свойство, за которое платят уроном; отрицательный — недостаток.
  quirks: {
    knockbackRanged: 0.10,  // отталкивание у оружия дальше ближнего боя (молния, ножи): держит толпу на расстоянии
    heavyKnockback: 0.10,   // отталкивание ≥ heavyKnockback px/с у ближнего боя (молот): контроль толпы
    slow: 0.15,             // замедление
    pierce: 0.04,           // за каждого пробитого сверх первого (до pierceCap)
    pierceAll: 0.20,        // пробивает всех (луч, ледяной шар)
    root: 0.15,             // пригвождает (копьё: цель стоит на месте pin с)
    dot: 0.15,              // урон со временем: огонь на земле (fireDamage) или status (яд, кровь, горение) × chance
    trap: 0.10,             // ловушка: лежит до касания и бьёт по площади сама (мины)
    homing: 0.15,           // бьёт без промаха, сам находит цель (цепь молнии)
    autoAim: 0.10,          // стреляет само от призыва, не от героя (огоньки)
    block: 0.15,            // ловит вражеские снаряды (щиты)
    omni: 0.15,             // бьёт по кругу без наведения, всё время (аура, орбита, облако)
    delayed: -0.10,         // долгий замах (delay ≥ delayedMin с): промахи по движущимся
    random: -0.10,          // бьёт в случайную сторону, направление не выбрать (луч)
  },
  // Решения владельца поверх формулы (цель относительно якоря): молния не сильнее ножей, луч слабый.
  owner: { storm_chain: 0.46, thunder_loop: 0.46, beam: 0.45, prism_ray: 0.45 },
  // Чем подбирать силу в --tune: урон (по умолчанию) или кулдаун — у оружия, где урон уходит в оверкилл
  // (один сильный удар: копьё, арбалет, баллиста), у луча (добивает всех на линии при любом уроне) и у мин (урон за удар задан: почти ваншот).
  cooldownKnob: ['spear', 'crossbow', 'mines', 'ballista', 'dragon_lance', 'minefield', 'beam',
    'prism_ray'],
  // ближний бой: отталкивание — защита, а не квирк дальнего оружия
  melee: ['melee_arc', 'slash', 'slam', 'aura', 'cloud', 'orbit'],
  heavyKnockback: 200, knockbackMin: 20, pierceCap: 4, delayedMin: 0.9, meleeRange: 130,
};

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const B = WEAPON_BEHAVIOR;
export const BASE = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved);
export const EVOS = COMBOS.map((c) => c.result).filter((id) => WEAPONS[id]);
const maxLv = (id) => WEAPONS[id].levels[WEAPONS[id].levels.length - 1];

/** Дальность R (px), с которой оружие начинает бить: по behavior и числам уровня. */
export function reach(def, lv) {
  switch (def.behavior) {
    case 'melee_arc': return lv.area;
    // росчерк (Blade Arc): полоса длиной area через группу в searchRange от героя; дальность — длина полосы
    case 'slash': return Math.min(lv.area, B.slash?.searchRange || lv.area);
    // молот: первый удар по кругу радиусом area, центр сдвинут к цели на area × offset
    case 'slam': return lv.area * (1 + (B.slam?.offset || 0));
    // копьё: как снаряд, своя дальность цели
    case 'impale': return Math.min(B.impale?.targetRange || B.projectile.targetRange,
      lv.speed * lv.duration);
    // ледяной шар медленный: бьёт в основном на середине пути, плюс свой радиус
    case 'ice_orb': return Math.min(B.ice_orb?.targetRange || B.projectile.targetRange,
      lv.speed * lv.duration / 2) + lv.area;
    case 'aura': return lv.area;
    case 'cloud': return lv.area;
    case 'orbit': return lv.area + (lv.hitRadius || B.orbit.hitRadius);
    case 'boomerang': return Math.min(B.boomerang.targetRange, lv.area);
    case 'chain': return lv.range;
    case 'beam': return lv.area;
    case 'summon': return Math.min(B.summon.targetRange, lv.speed * lv.duration) + B.summon.orbitR;
    case 'projectile': return Math.min(B.projectile.targetRange, lv.speed * lv.duration);
    case 'area_drop':
      return lv.mine ? lv.spread + (lv.trigger || 0) : (lv.range || B.area_drop.targetRange);
    default: return lv.range || lv.area || 100;
  }
}

/** Квирки оружия на этом уровне: [{ id, q }]. */
export function quirks(def, lv) {
  const Q = LADDER.quirks;
  const out = [];
  const add = (id, mul = 1, label = id) => out.push({ id: label, q: Q[id] * mul });
  const R = reach(def, lv);
  const kb = lv.knockback || 0;
  const melee = LADDER.melee.includes(def.behavior);
  if (kb >= LADDER.knockbackMin && !melee && R > LADDER.meleeRange && def.behavior !== 'area_drop') {
    add('knockbackRanged');
  }
  if (kb >= LADDER.heavyKnockback && melee) add('heavyKnockback');
  const status = lv.status || def.status;
  const chill = status && ['chill', 'freeze', 'slow'].includes(status.type);
  if (lv.slow || chill) add('slow', 1, chill ? status.type : 'slow'); // замедление, трещина, заморозка
  if (lv.pierceAll || ['beam', 'ice_orb'].includes(def.behavior)) add('pierceAll');
  else if (lv.pierce > 0) add('pierce', Math.min(lv.pierce, LADDER.pierceCap));
  if (lv.pin > 0) add('root');
  if (lv.fireDamage > 0) add('dot', 1, 'fire');
  if (status && !chill) add('dot', status.chance ?? 1, status.type || 'dot');
  if (lv.mine) add('trap');
  if (def.behavior === 'chain') add('homing');
  if (def.behavior === 'summon') add('autoAim');
  if (def.behavior === 'orbit' && lv.blocks !== false) add('block');
  if (['aura', 'orbit', 'cloud'].includes(def.behavior)) add('omni');
  if ((lv.delay || 0) >= LADDER.delayedMin) add('delayed');
  if (def.behavior === 'beam' || lv.random) add('random');
  return out;
}

/** Бумажный урон в секунду по одной цели (без статов): урон × попаданий за цикл / цикл. */
export function paperDps(def, lv) {
  const cd = Math.max(0.05, lv.cooldown || 0);
  const n = lv.amount || 1;
  switch (def.behavior) {
    case 'orbit': {
      const up = lv.cooldown ? lv.duration / (lv.duration + lv.cooldown) : 1;
      const perSec = Math.min(n * lv.speed / (2 * Math.PI), 1 / B.orbit.rehit);
      return lv.damage * perSec * up;
    }
    case 'aura': return lv.damage / cd;
    case 'cloud': return lv.damage * n * Math.min(1, lv.duration * n / cd) / lv.tick / n;
    case 'boomerang': return lv.damage * 2 / cd; // туда и обратно, одна цель
    case 'chain': return lv.damage / cd;          // цепь бьёт цель раз за молнию
    case 'beam': {
      const ticks = lv.duration / lv.tick;
      return lv.damage * ticks / (lv.duration + cd);
    }
    case 'area_drop': {
      const fire = lv.fireDamage ? lv.fireDamage * lv.duration / B.area_drop.fireTick : 0;
      return lv.damage * (1 + fire) / cd;
    }
    case 'melee_arc': return lv.damage * Math.ceil(n / 2) / cd; // взмахи чередуют стороны
    case 'slash': return lv.damage * n / cd;               // каждый слэш серии может задеть цель
    case 'ice_orb': {
      // цель внутри шара 2 × area / speed с (не дольше жизни шара), тик раз в tick
      const inside = Math.min(lv.duration, 2 * lv.area / lv.speed);
      return lv.damage * Math.max(1, inside / lv.tick) / cd;
    }
    default: return lv.damage / cd;              // projectile, summon: в цель летит один
  }
}

/** Строка лестницы: R, f, квирки, Q и цель относительно якоря (R якоря — его дальность на макс. уровне). */
export function ladderRow(id) {
  const def = WEAPONS[id];
  const lv = maxLv(id);
  const anchor = WEAPONS[def.evolved ? LADDER.anchorEvo : LADDER.anchor];
  const r0 = reach(anchor, anchor.levels[anchor.levels.length - 1]);
  const R = reach(def, lv);
  const f = 1 / (1 + LADDER.k * Math.log(Math.max(R, r0) / r0));
  const qs = quirks(def, lv);
  const Q = 1 / (1 + qs.reduce((s, x) => s + x.q, 0));
  return { id, behavior: def.behavior, dmgType: def.dmgType, R: Math.round(R), f: r2(f),
    owner: LADDER.owner[id] ?? null,
    quirks: qs.map((x) => `${x.id}${x.q < 0 ? '' : '+'}${r2(x.q)}`), Q: r2(Q), target: r2(f * Q),
    paper: r1(paperDps(def, lv)) };
}

function printTable(rows, cols) {
  const w = cols.map(([h, k]) => Math.max(h.length, ...rows.map((r) => String(r[k] ?? '').length)));
  console.log(cols.map(([h], i) => h.padEnd(w[i])).join('  '));
  for (const r of rows) console.log(cols.map(([, k], i) => String(r[k] ?? '').padEnd(w[i])).join('  '));
}

// Лаборатория: одно оружие, бессмертная мечница с attack = magic = 1, пассивки не трогают урон.
const LAB_ALLOW = ['max_hp', 'resistance', 'regen', 'dodge', 'speed', 'pickup', 'xp_gain']
  .filter((id) => PASSIVES[id]);
const LAB_PROFILE = { id: 'lab', intent: 'evolution', collection: 'opportunistic', reaction: 0.28,
  courage: 0.8, temperature: 0.7, allow: LAB_ALLOW };

export async function lab({ n, until, from, to, workers, experiment, ids, level = 0 }) {
  const lvOf = (id) => (level ? Math.min(level, WEAPONS[id].maxLevel) : WEAPONS[id].maxLevel);
  const { runMatrix } = await import('./matrix.mjs');
  const exp = { ...(experiment || {}), heroSet: { ...(experiment?.heroSet || {}),
    heroine: { attack: 1, magic: 1, ...(experiment?.heroSet?.heroine || {}) } } };
  // без элиток: сундук скиллов (+1 случайной пассивке и оружию) испортил бы замер одного оружия
  exp.timeline = (experiment?.timeline || forest.timeline).filter((x) => x.type !== 'elite');
  const jobs = [];
  for (const id of ids) {
    for (let i = 0; i < n; i++) {
      jobs.push({ seed: 10000 + i * 1009, behaviorSeed: 10037 + i * 1031, difficulty: 'normal',
        players: 1, until, heroes: ['heroine'], profiles: [LAB_PROFILE], immortal: [true],
        noEvolution: [], clear: true, experiment: exp, split: 'tuning', weapon: id,
        fixture: { weapons: [[id, lvOf(id)]], weaponSlots: 1 } });
    }
  }
  const t0 = Date.now();
  const rows = await runMatrix(jobs, { concurrency: workers, onResult: (r, done, total) => {
    if (done % 64 === 0 || done === total) {
      console.error(`${done}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } });
  const out = {};
  for (const id of ids) {
    const data = rows.filter((r) => r.config.weapon === id);
    const acc = { dealt: 0, raw: 0, base: 0, held: 0, hits: 0, kills: 0, dist: 0, frame: 0,
      frameN: 0, inFrame: 0, samples: 0, pre: 0, killsAll: 0, err: 0 };
    for (const r of data) {
      if (r.outcome === 'error') { acc.err++; continue; }
      for (let m = from; m <= to; m++) {
        const x = r.clear?.minutes[m];
        if (!x) continue;
        const w = x.weapons[`${id}@${lvOf(id)}`];
        if (w) {
          for (const k of ['dealt', 'raw', 'base', 'held', 'hits', 'kills', 'dist']) {
            acc[k] += w[k];
          }
        }
        acc.frame += x.frame; acc.frameN += x.frameN; acc.inFrame += x.inFrame;
        acc.samples += x.samples; acc.pre += x.preFrame; acc.killsAll += x.kills;
      }
    }
    out[id] = { n: data.length, errors: acc.err, dps: r1(acc.dealt / acc.held),
      rawDps: r1(acc.raw / acc.held), power: r2(acc.frameN / acc.frame),
      baseDps: r1(acc.base / acc.held), dist: acc.dealt ? Math.round(acc.dist / acc.dealt) : null,
      killsPerMin: r1(acc.kills * 60 / acc.held), frameLife: r1(acc.frame / acc.frameN),
      inFrame: r1(acc.inFrame / acc.samples), preFrame: r1(100 * acc.pre / acc.killsAll) };
  }
  return out;
}

function compare(rows, measured, key, fixed = false) {
  for (const group of [BASE, EVOS]) {
    const anchor = group === BASE ? LADDER.anchor : LADDER.anchorEvo;
    const a = fixed && key === 'power' ? LADDER.anchorPower[group === BASE ? 'base' : 'evo'] :
      measured[anchor]?.[key];
    const at = rows.find((x) => x.id === anchor)?.target || 1;
    for (const r of rows.filter((x) => group.includes(x.id))) {
      const m = measured[r.id];
      if (!m || !a) continue;
      const rel = r.owner ?? r.target / at;
      const goal = a * rel; // цель якоря — его текущая сила
      Object.assign(r, { now: m[key], nowRel: r2(m[key] / a), goal: r2(goal),
        goalRel: r2(rel), mul: r2(goal / m[key]), dist: m.dist, frameLife: m.frameLife,
        inFrame: m.inFrame,
        preFrame: m.preFrame, held: m.heldMin });
    }
  }
}

/** Ранговая корреляция Спирмена: выполняется ли «дальше — слабее» (−1 — идеально). */
export function spearman(xs, ys) {
  const rank = (a) => {
    const s = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = Array(a.length);
    s.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const d2 = rx.reduce((s, v, i) => s + (v - ry[i]) ** 2, 0);
  return n > 1 ? 1 - 6 * d2 / (n * (n * n - 1)) : null;
}

/**
 * Подбор по лаборатории: множитель урона (или кулдауна, LADDER.cooldownKnob) каждого оружия, пока сила клира
 * относительно якоря не станет целью (owner или f × Q). Якоря не трогаются: общий уровень — отдельно (targets.mjs).
 * Возвращает experiment (experiment.mjs) с полными числами уровней.
 */
export async function tune({ iters = 3, gamma = 0.8, base = null, skip = [], fixed = false,
  ...opts }) {
  const ids = [...BASE, ...EVOS];
  const rows = ids.map(ladderRow);
  const mul = Object.fromEntries(ids.map((id) => [id, 1]));
  const build = () => {
    const weapons = structuredClone(base?.weapons || {});
    for (const id of ids) {
      if (mul[id] === 1) continue;
      const cd = LADDER.cooldownKnob.includes(id);
      weapons[id] = WEAPONS[id].levels.map((lv, i) => {
        const patch = { ...(weapons[id]?.[i] || {}) };
        const dmg = patch.damage ?? lv.damage;
        if (cd) patch.cooldown = r2((patch.cooldown ?? lv.cooldown) / mul[id]);
        else patch.damage = Math.max(1, Math.round(dmg * mul[id]));
        return patch;
      });
    }
    return { ...(base || {}), weapons };
  };
  let measured = null;
  for (let it = 0; it <= iters; it++) {
    const experiment = build();
    measured = await lab({ ...opts, experiment, ids });
    compare(rows, measured, 'power', fixed);
    console.error(`итерация ${it}: ` + rows.map((r) => `${r.id} ${r.nowRel}/${r.goalRel}`).join(', '));
    if (it === iters) return { experiment, rows, measured, mul };
    for (const r of rows) {
      if ((!fixed && [LADDER.anchor, LADDER.anchorEvo].includes(r.id)) || skip.includes(r.id) ||
        !r.now) continue;
      const step = Math.min(1.8, Math.max(0.55, (r.goalRel / r.nowRel) ** gamma));
      mul[r.id] = Math.min(4, Math.max(0.1, mul[r.id] * step));
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
  const experiment = opt('experiment', '') ?
    JSON.parse(await readFile(opt('experiment'), 'utf8')) : null;
  let restore = () => {};
  if (experiment) {
    const { installExperiment } = await import('./experiment.mjs');
    restore = installExperiment(experiment);
  }
  const rows = [...BASE, ...EVOS].map(ladderRow);
  restore();
  let measured = null;
  let key = 'baseDps';
  if (args.includes('--tune')) {
    const res = await tune({ iters: Number(opt('iters', 3)), base: experiment,
      skip: opt('skip', '') ? opt('skip').split(',') : [], fixed: args.includes('--anchor-power'),
      n: Number(opt('n', 8)), from: Number(opt('from', 2)), to: Number(opt('to', 9)),
      until: (Number(opt('to', 9)) + 1) * 60 + 5,
      workers: Number(opt('workers', Math.max(1, availableParallelism() - 2))) });
    const out = opt('out', 'tools/out/ladder/tuned.json');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(res.experiment, null, 1));
    await writeFile(out.replace(/.json$/, '-rows.json'), JSON.stringify(res, null, 1));
    console.log(`experiment: ${out}`, JSON.stringify(res.mul));
    return;
  }
  if (args.includes('--lab')) {
    const from = Number(opt('from', 2));
    const to = Number(opt('to', 9));
    key = opt('metric', 'power');
    measured = await lab({ n: Number(opt('n', 8)), until: Number(opt('until', (to + 1) * 60 + 5)),
      from, to, workers: Number(opt('workers', Math.max(1, availableParallelism() - 2))),
      experiment, ids: (opt('ids', '') ? opt('ids').split(',') : [...BASE, ...EVOS]),
      level: Number(opt('level', 0)) });
  } else if (opt('bots', '')) {
    const file = JSON.parse(await readFile(opt('bots'), 'utf8'));
    const rep = file.report[opt('key', 'normal/1/mid')];
    const win = rep.weapons[opt('window', 'all')];
    measured = {};
    for (const id of [...BASE, ...EVOS]) {
      const m = win[`${id}@${WEAPONS[id].maxLevel}`];
      if (m) measured[id] = m;
    }
    key = opt('metric', 'baseDps');
  }
  if (measured) compare(rows, measured, key, args.includes('--anchor-power'));
  if (args.includes('--json')) { console.log(JSON.stringify({ LADDER, rows, measured }, null, 1)); return; }
  const cols = [['оружие', 'id'], ['behavior', 'behavior'], ['R', 'R'], ['f(R)', 'f'],
    ['квирки', 'quirks'], ['Q', 'Q'], ['цель', 'target'], ['бумага DPS/цель', 'paper']];
  if (measured) {
    cols.push(['сейчас', 'now'], ['сейчас/якорь', 'nowRel'], ['цель/якорь', 'goalRel'], ['цель DPS', 'goal'], ['× к цели', 'mul'],
      ['дист', 'dist'], ['рамка с', 'frameLife'], ['в рамке', 'inFrame'], ['до рамки%', 'preFrame']);
  }
  for (const [name, group] of [['Базовые (макс. уровень)', BASE], ['Эволюции', EVOS]]) {
    console.log(`\n${name}`);
    const g = rows.filter((r) => group.includes(r.id)).sort((a, b) => b.target - a.target);
    for (const r of g) r.quirks = r.quirks.join(' ');
    printTable(g, cols);
    const withNow = g.filter((r) => Number.isFinite(r.now));
    if (withNow.length > 2) {
      console.log(`Спирмен (R, сейчас): ${r2(spearman(withNow.map((r) => r.R), withNow.map((r) => r.now)))}` +
        `; (цель, сейчас): ${r2(spearman(withNow.map((r) => r.target), withNow.map((r) => r.now)))}` +
        ' — правило выполняется, если первое ≈ −1, второе ≈ +1');
    }
  }
  const out = opt('out', '');
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify({ LADDER, rows, measured }, null, 1));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
