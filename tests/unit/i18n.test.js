// Строки интерфейса против данных: у каждой записи контента есть имя и описание, лишних ключей нет,
// плейсхолдеры подставлены, устаревших слов (Armor, Steel) не осталось.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../../src/i18n/en.js';
import { enItems } from '../../src/i18n/en-items.js';
import { enAchievements } from '../../src/i18n/en-achievements.js';
import { t } from '../../src/i18n/index.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { BOSSES } from '../../src/data/bosses.js';
import { HEROES } from '../../src/data/heroes.js';
import { STATUS } from '../../src/data/status.js';
import { ITEM_TYPES, ITEM_STATS, UNIQUES, RARITIES, CURRENCIES, NAME_WORDS } from '../../src/data/items.js';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../../src/data/achievements.js';
import { achievementParams } from '../../src/core/achievements.js';

const dict = { ...enItems, ...enAchievements, ...en };
const has = (k) => typeof dict[k] === 'string' && dict[k].trim().length > 0;
// Источники урона, которые не оружие, но пишутся как weapon.<id> (итоги, DPS): шипы.
const EXTRA_WEAPON_IDS = new Set(['thorns']);

function missing(keys) {
  return keys.filter((k) => !has(k));
}

function nameDesc(prefix, ids) {
  return ids.flatMap((id) => [`${prefix}.${id}.name`, `${prefix}.${id}.desc`]);
}

// Ключи вида <prefix>.<id>.<field> из словаря: id, которых нет в данных.
function orphans(prefix, ids, extra = new Set()) {
  const known = new Set(ids);
  const re = new RegExp(`^${prefix}\\.([a-z0-9_]+)\\.(name|desc)$`);
  return Object.keys(dict).filter((k) => {
    const m = k.match(re);
    return m && !known.has(m[1]) && !extra.has(m[1]);
  });
}

test('i18n: weapons, evolutions, passives have name and desc', () => {
  assert.deepEqual(missing(nameDesc('weapon', Object.keys(WEAPONS))), []);
  assert.deepEqual(missing(nameDesc('passive', Object.keys(PASSIVES))), []);
});

test('i18n: enemies, bosses and heroes have name and desc', () => {
  assert.deepEqual(missing(nameDesc('enemy', Object.keys(ENEMIES))), []);
  assert.deepEqual(missing(nameDesc('boss', Object.keys(BOSSES))), []);
  assert.deepEqual(missing(nameDesc('hero', Object.keys(HEROES))), []);
});

test('i18n: uniques, achievements have name and desc', () => {
  assert.deepEqual(missing(nameDesc('unique', Object.keys(UNIQUES))), []);
  assert.deepEqual(missing(nameDesc('ach', Object.keys(ACHIEVEMENTS))), []);
  assert.deepEqual(missing(ACHIEVEMENT_CATEGORIES.map((c) => `ach.cat.${c}`)), []);
});

test('i18n: no orphan keys for weapons, passives, enemies, bosses, uniques, achievements', () => {
  assert.deepEqual(orphans('weapon', Object.keys(WEAPONS), EXTRA_WEAPON_IDS), []);
  assert.deepEqual(orphans('passive', Object.keys(PASSIVES)), []);
  assert.deepEqual(orphans('enemy', Object.keys(ENEMIES)), []);
  assert.deepEqual(orphans('boss', Object.keys(BOSSES)), []);
  assert.deepEqual(orphans('unique', Object.keys(UNIQUES)), []);
  assert.deepEqual(orphans('ach', Object.keys(ACHIEVEMENTS), new Set(['hidden'])), []);
  for (const id of EXTRA_WEAPON_IDS) assert.ok(has(`weapon.${id}.name`), id);
});

test('i18n: item types, shapes, stats, rarities, currencies and name words', () => {
  const keys = [];
  for (const [type, def] of Object.entries(ITEM_TYPES)) {
    keys.push(`item.kind.${type}`);
    for (const s of def.shapes) keys.push(`item.type.${type}.${s.size[0]}x${s.size[1]}`);
  }
  for (const u of Object.values(UNIQUES)) keys.push(`item.type.${u.type}.${u.size[0]}x${u.size[1]}`);
  for (const stat of ITEM_STATS) {
    keys.push(`item.stat.${stat}`);
    for (let i = 0; i < NAME_WORDS; i++) keys.push(`item.prefix.${stat}.${i}`, `item.suffix.${stat}.${i}`);
  }
  for (const r of RARITIES) keys.push(`item.rarity.${r}`);
  for (const c of CURRENCIES) keys.push(`currency.${c}`);
  assert.deepEqual(missing(keys), []);
});

test('i18n: codex labels for weapon params, statuses and boss attacks', () => {
  // поля уровней, которых нет в таблице кодекса (флаги и служебные числа)
  const hidden = new Set(['mine', 'spread', 'fall', 'status', 'pierceAll']);
  const params = new Set();
  for (const w of Object.values(WEAPONS)) {
    for (const lv of w.levels) for (const k of Object.keys(lv)) if (!hidden.has(k)) params.add(k);
  }
  assert.deepEqual(missing([...params].map((k) => `codex.p.${k}`)), []);
  assert.deepEqual(missing(Object.keys(STATUS).map((s) => `codex.p.status_${s}`)), []);
  const atks = new Set(['touch', 'death_touch']);
  for (const b of Object.values(BOSSES)) for (const a of b.attacks || []) atks.add(a.type);
  assert.deepEqual(missing([...atks].map((a) => `codex.atk.${a}`)), []);
  assert.ok(has('codex.p.pierce_all'));
  assert.ok(has('codex.unique_locked_desc'));
});

test('i18n: achievement descriptions have every placeholder filled', () => {
  for (const id of Object.keys(ACHIEVEMENTS)) {
    const s = t(`ach.${id}.desc`, achievementParams(id));
    assert.doesNotMatch(s, /\{[a-z]+\}/, `${id}: ${s}`);
  }
});

test('i18n: content descriptions have no placeholders', () => {
  const ids = [
    ...nameDesc('weapon', Object.keys(WEAPONS)), ...nameDesc('passive', Object.keys(PASSIVES)),
    ...nameDesc('enemy', Object.keys(ENEMIES)), ...nameDesc('boss', Object.keys(BOSSES)),
    ...nameDesc('unique', Object.keys(UNIQUES)), ...nameDesc('hero', Object.keys(HEROES)),
  ];
  for (const k of ids) assert.doesNotMatch(dict[k], /\{[a-z]+\}/, k);
});

test('i18n: no outdated words (Armor, Steel) in any string', () => {
  const bad = Object.entries(dict).filter(([, v]) => /\b(armor|steel)\b/i.test(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});
