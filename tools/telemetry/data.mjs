import { gunzipSync } from 'node:zlib';
import { COMBOS } from '../../src/data/combos.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { HEROES } from '../../src/data/heroes.js';

export function decodeRun(run) {
  const out = structuredClone(run);
  if (out.detail) {
    if (out.detail.encoding !== 'gzip-base64') throw new Error('unknown detail encoding');
    const raw = gunzipSync(Buffer.from(out.detail.data, 'base64'), { maxOutputLength: 32000000 });
    Object.assign(out, JSON.parse(raw.toString('utf8')));
    delete out.detail;
  }
  return out;
}

export function validateRun(r) {
  const errors = [];
  if (!r || typeof r !== 'object') return ['not an object'];
  for (const k of ['time', 'level']) {
    if (!Number.isFinite(r[k]) || r[k] < 0) errors.push(`invalid ${k}`);
  }
  if (!['solo', 'duo'].includes(r.mode)) errors.push('invalid mode');
  if (!['normal', 'cursed'].includes(r.difficulty)) errors.push('invalid difficulty');
  if (!['victory', 'dead', 'quit', 'disconnected'].includes(r.status)) errors.push('invalid status');
  for (const k of ['picks', 'snaps']) if (!Array.isArray(r[k])) errors.push(`missing ${k}`);
  let t = -1;
  for (const p of r.picks || []) {
    if (!Array.isArray(p) || p.length !== 4 || !Number.isFinite(p[0]) ||
        p[0] < t || p[0] > r.time + 0.2 || !Array.isArray(p[3])) {
      errors.push('invalid pick sequence'); break;
    }
    t = p[0];
  }
  t = -1;
  for (const s of r.snaps || []) {
    if (!Number.isFinite(s.t) || s.t <= t || s.t > r.time + 0.2 ||
        !Array.isArray(s.w) || !Number.isFinite(s.lv)) {
      errors.push('invalid snapshot sequence'); break;
    }
    t = s.t;
  }
  if (!r.end || !Array.isArray(r.end.w)) errors.push('missing final snapshot');
  return errors;
}

export function parseCard(text) {
  const [kind, id, level] = (text || '').split(':');
  return { kind, id, level: Number(level) || 0 };
}

// Коллабы (оружие + оружие) убраны из игры (docs/META.md 1.4), но старые забеги их брали: рецепты нужны,
// чтобы восстановить сборку (коллаб забирал оба оружия).
const LEGACY_COLLABS = [
  ['blade_arc', 'guardian_shields', 'aegis_storm'], ['throwing_daggers', 'storm_chain', 'thunder_knives'],
  ['blade_arc', 'throwing_daggers', 'phantom_blades'], ['blade_arc', 'holy_ground', 'sacred_edge'],
  ['blade_arc', 'war_axe', 'reaper_crescent'], ['blade_arc', 'storm_chain', 'storm_edge'],
  ['blade_arc', 'firebomb', 'inferno_slash'], ['throwing_daggers', 'guardian_shields', 'knife_carousel'],
  ['throwing_daggers', 'holy_ground', 'holy_rain'], ['throwing_daggers', 'war_axe', 'gale_cutters'],
  ['throwing_daggers', 'firebomb', 'ember_knives'], ['guardian_shields', 'holy_ground', 'sanctuary'],
  ['guardian_shields', 'war_axe', 'bulwark_spin'], ['guardian_shields', 'storm_chain', 'tesla_ward'],
  ['guardian_shields', 'firebomb', 'comet_ring'], ['holy_ground', 'war_axe', 'judgement_wheel'],
  ['holy_ground', 'storm_chain', 'divine_storm'], ['holy_ground', 'firebomb', 'hellfire'],
  ['war_axe', 'storm_chain', 'thunder_axe'], ['war_axe', 'firebomb', 'blast_axe'],
  ['storm_chain', 'firebomb', 'plasma_storm'],
].map(([a, b, result]) => ({ from: [a, b], result }));
const RECIPES = [...COMBOS, ...LEGACY_COLLABS];

function apply(b, text) {
  const c = parseCard(text);
  if (!['weapon', 'passive'].includes(c.kind)) return;
  const list = c.kind === 'weapon' ? b.w : b.p;
  const recipe = RECIPES.find((x) => x.result === c.id);
  if (recipe) b.w = b.w.filter(([id]) => !recipe.from.includes(id));
  const target = c.kind === 'weapon' ? b.w : b.p;
  const own = target.find(([id]) => id === c.id);
  if (own) own[1] = c.level;
  else target.push([c.id, c.level]);
}

// Reconstruct only known state. v1 has no HP/budget at a choice: leave these unknown.
export function normalizeRun(run, index = 0) {
  const r = decodeRun(run);
  const errors = validateRun(r);
  if (errors.length) throw new Error(errors.join('; '));
  const b = { w: [[HEROES[r.hero]?.startWeapon || 'blade_arc', 1]], p: [] };
  const decisions = [];
  const ownership = b.w.map(([id]) => ({ id, start: 0, end: null }));
  const grant = (card, at) => {
    const before = new Set(b.w.map(([id]) => id));
    apply(b, card);
    const after = new Set(b.w.map(([id]) => id));
    for (const id of before) {if (!after.has(id)) {
      const segment = ownership.findLast((x) => x.id === id && x.end === null);
      if (segment) segment.end = at;
    }}
    for (const id of after) if (!before.has(id)) ownership.push({ id, start: at, end: null });
  };
  let detailCursor = 0;
  let lastTake = '';
  let focusCount = 0;
  for (let i = 0; i < r.picks.length; i++) {
    const pick = r.picks[i];
    const [t, act, chosen, offered] = pick;
    const detailIndex = r.decisions?.findIndex((d, j) => j >= detailCursor &&
      d.pick?.[0] === t && d.pick?.[1] === act && d.pick?.[2] === chosen &&
      JSON.stringify(d.pick?.[3]) === JSON.stringify(offered));
    const detail = detailIndex >= 0 ? r.decisions[detailIndex] : null;
    if (detail) detailCursor = detailIndex + 1;
    const before = detail?.phase !== 'after' ? detail?.context : null;
    const ctx = before ? structuredClone(before) : { ...structuredClone(b), hp: null, mhp: null,
      budgets: null, banished: null };
    decisions.push({ run: index, index: i, t, act, chosen, offered, context: ctx,
      lastTake, focusCount, source: before ? 'observed' : 'reconstructed',
      voluntary: ['take', 'reroll', 'skip', 'banish', 'evo', 'evoSkip'].includes(act) });
    if (act === 'take') {
      grant(chosen, t);
      const id = parseCard(chosen).id;
      focusCount = lastTake === id ? focusCount + 1 : 1;
      lastTake = id;
    }
    // evo is a choice; following chest is the application. Do not apply twice.
    if (act === 'chest') for (const card of offered) grant(card, t);
  }
  for (const x of ownership) if (x.end === null) x.end = r.time;
  const points = [...r.snaps, { ...r.end, t: r.time }]
    .filter((s, i, a) => i === 0 || s.t > a[i - 1].t);
  const intervals = [];
  for (let i = 0; i < points.length; i++) {
    const end = points[i];
    const prev = i ? points[i - 1] : null;
    const start = prev?.t || 0;
    const changes = r.picks.filter((p) => p[0] > start && p[0] <= end.t &&
      ['take', 'chest', 'evo'].includes(p[1]));
    const ids = new Set([...(prev?.w || []), ...end.w,
      ...(prev?.damage || []), ...(end.damage || [])].map((w) => w[0]));
    for (const id of ids) {
      const all = end.damage?.find((w) => w[0] === id);
      const old = prev?.damage?.find((w) => w[0] === id);
      const w = end.w.find((w) => w[0] === id);
      const pw = prev?.w.find((w) => w[0] === id);
      const changed = changes.some((p) => parseCard(p[2]).id === id || p[1] !== 'take');
      const complete = !!all || (!!w && (!!pw || start === 0) && !changed);
      const dealt = all ? all[1] - (old?.[1] || 0) : complete ? w[2] - (pw?.[2] || 0) : null;
      intervals.push({ start, end: end.t, duration: end.t - start, weapon: id, dealt,
        complete, ownershipChanged: changed,
        heldSeconds: ownership.filter((x) => x.id === id).reduce((n, x) =>
          n + Math.max(0, Math.min(x.end, end.t) - Math.max(x.start, start)), 0),
        source: all ? 'all-weapon-counters' : 'v1-slots' });
    }
  }
  // Version mapping is not proven for legacy runs; mismatches are reported, never repaired by fiat.
  const finalIds = b.w.map(([id]) => id).sort().join(',');
  const endIds = r.end.w.map(([id]) => id).sort().join(',');
  return { id: `run-${String(index).padStart(4, '0')}`, source: r.source || null, version: r.ver || r.fingerprint || '',
    mode: r.mode, difficulty: r.difficulty, status: r.status, time: r.time,
    hero: r.hero, session: r.sessionId || null, local: r.local ?? null,
    decisions, intervals, ownership, snapshots: r.snaps, end: r.end,
    warnings: [...(finalIds !== endIds ? ['reconstructed build differs from final snapshot'] : []),
      ...(!r.v || r.v < 2 ? ['legacy recipe version mapping unverified'] : []),
      ...(Object.values(r.capture?.dropped || {}).some((n) => n > 0) ? ['truncated capture'] : [])],
    recipes: r.picks.filter((p) => p[1] === 'evo').map((p) => ({ t: p[0], id: parseCard(p[2]).id })),
    autoHealAt: r.picks.find((p) => p[1] === 'heal')?.[0] ?? null,
    unknownWeapons: r.end.w.filter(([id]) => !WEAPONS[id]).map(([id]) => id) };
}
