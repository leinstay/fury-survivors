// Кодекс: оружие (Armory), монстры (Bestiary), боссы (Bosses) и летопись забегов (Chronicle).
// Открывается из меню и из паузы (from: 'Pause': пауза и забег остаются под кодексом, назад — в паузу).
// Записи открываются по мере игры (src/core/codex.js); закрытые — тёмный силуэт и «???».
// Вид перестраивается целиком (render) при смене вкладки, страницы, забега; детали справа — при смене фокуса.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { CODEX } from '../data/codex.js';
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { COMBOS } from '../data/combos.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { HEROES } from '../data/heroes.js';
import { DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { SPRITES } from '../../assets/sprites/manifest.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addPanel } from '../ui/panel.js';
import { addIcon, iconKeyFor, displayName } from '../ui/icons.js';
import { textStyle, COLORS } from '../ui/style.js';
import { formatTime } from '../ui/hud.js';
import { copyText } from '../ui/clipboard.js';
import { createTextInput } from '../ui/dom-input.js';
import { animateCharacter } from '../render/anim.js';
import { isSeen, weaponDps, PICKUP_KINDS, validCodexId } from '../core/codex.js';
import { getCodex, fetchCodex, replaceCodex } from '../services/codex.js';

const TABS = ['armory', 'bestiary', 'bosses', 'chronicle'];
// Рабочая область: от вкладок до нижней строки кнопок. Слева сетка (или итоги), справа детали.
const TOP = 56;
const BOTTOM = 326;
const MID_Y = (TOP + BOTTOM) / 2;
const AREA_H = BOTTOM - TOP;
const LEFT = { x: 8, w: 300 };
const RIGHT = { x: 314, w: 318 };
const BAR_Y = 342;
const DARK = 0x000000;
const MOVING = { moving: true };
// Параметры оружия в таблице (порядок строк); показываются только те, что есть у оружия.
const PARAMS = ['damage', 'cooldown', 'amount', 'area', 'speed', 'duration', 'pierce', 'jumps', 'range',
  'fireDamage', 'knockback', 'size', 'hitRadius'];
// Масштабы показа HD-спрайтов: дроби, чтобы пиксели ложились ровно.
const SCALES = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 8];
const STATUS_COLOR = { victory: '#ffd84a', dead: '#ff8080', disconnected: '#ffb060', quit: COLORS.dim };

const round2 = (v) => Math.round(v * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');

function fmtBig(v) {
  const n = Math.round(v);
  if (n >= 1e6) return `${round2(n / 1e6)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

function fmtDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 3600) return formatTime(s);
  return `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}

function fmtDate(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtParam(k, v) {
  if (v === undefined) return '-';
  if (k === 'cooldown' || k === 'duration') return v >= 1e6 ? t('codex.always') : t('codex.sec_unit', { v: round2(v) });
  if (k === 'fireDamage') return `${Math.round(v * 100)}%`;
  if (k === 'size') return `x${round2(v)}`;
  return String(round2(v));
}

function fmtPassive(def, v) {
  if (def.mode === 'mul' || def.stat === 'crit') return `+${Math.round(v * 100)}%`;
  if (def.stat === 'regen') return t('codex.per_s', { v: round2(v) });
  return `+${round2(v)}`;
}

// Самый крупный масштаб из SCALES, при котором кадр влезает в w×h.
function fitScale(key, w, h) {
  const s = SPRITES[key];
  if (!s) return 1;
  const k = SCALES.find((v) => s.frameWidth * v <= w && s.frameHeight * v <= h);
  return k || SCALES[SCALES.length - 1];
}

// Записи оружейной по разделам: оружие, эволюции (оружие + пассивка), коллабы (два оружия), улучшения.
function armoryEntries() {
  const recipe = {};
  for (const c of COMBOS) recipe[c.result] = c.from;
  const base = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved);
  const evolved = Object.keys(WEAPONS).filter((id) => WEAPONS[id].evolved);
  const isEvo = (id) => recipe[id] && PASSIVES[recipe[id][1]];
  return [
    { sec: 'weapon', items: base.map((id) => ({ kind: 'weapon', type: 'weapon', id })) },
    { sec: 'evolution', items: evolved.filter(isEvo).map((id) => ({ kind: 'weapon', type: 'evolution', id, from: recipe[id] })) },
    { sec: 'collab', items: evolved.filter((id) => !isEvo(id)).map((id) => ({ kind: 'weapon', type: 'collab', id, from: recipe[id] || null })) },
    { sec: 'passive', items: Object.keys(PASSIVES).map((id) => ({ kind: 'passive', type: 'passive', id })) },
  ];
}

// Иконка-силуэт: картинка залита тёмным, у заглушки вместо буквы «?».
function darken(icon) {
  for (const ch of icon.list) {
    if (ch.setTintFill) ch.setTintFill(DARK);
    else if (ch.type === 'Rectangle') ch.setFillStyle(DARK);
    else if (ch.type === 'Text') ch.setText('?');
  }
  icon.setAlpha(0.85);
}

export class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex');
    this.tab = 'armory';
    this.sel = {};
  }

  init(data) {
    this.from = (data && data.from) || 'Menu';
  }

  create() {
    this.alive = true;
    this.codex = getCodex();
    this.page = 0;
    this.runIdx = -1;
    this.modal = null;
    this.objs = [];
    this.detailObjs = [];
    this.modalObjs = [];
    this.anims = [];
    this.focusKey = '';
    this.shown = '';
    this.idInput = null;
    this.events.once('shutdown', () => {
      this.alive = false;
      this.dropInput();
    });
    // Фон: картинка меню под тёмной вуалью (поверх паузы закрывает забег целиком).
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0d0a16, 1).setOrigin(0, 0);
    if (this.textures.exists('menu_bg')) {
      const img = this.textures.get('menu_bg').getSourceImage();
      const k = Math.max(GAME_WIDTH / img.width, GAME_HEIGHT / img.height);
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'menu_bg').setScale(k).setAlpha(0.35);
    }
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setOrigin(0, 0);
    this.nav = new FocusNav(this, { onBack: () => this.back() });
    this.render();
  }

  update(time) {
    this.nav.update(time);
    if (this.idInput) this.idInput.place();
    for (const a of this.anims) {
      if (!a.sprite.active) continue;
      a.sprite.y = a.y + animateCharacter(a.sprite, a.key, MOVING, time / 1000, a.seed);
    }
  }

  // ---------- общий каркас ----------

  // Создаёт объекты в fn и возвращает их (без зон фокуса: их убирает nav.clear).
  capture(fn) {
    const before = new Set(this.children.list);
    fn();
    return this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
  }

  // Пункт фокуса с ключом: после перестройки фокус возвращается на пункт с тем же ключом.
  keyed(item, key) {
    item.key = key;
    const base = item.setFocus.bind(item);
    item.setFocus = (f) => {
      base(f);
      if (f) this.focusKey = key;
    };
    return item;
  }

  button(key, opts) {
    return this.keyed(addButton(this, this.nav, opts), key);
  }

  clearAll() {
    for (const o of this.objs) o.destroy();
    for (const o of this.detailObjs) o.destroy();
    this.objs = [];
    this.detailObjs = [];
    this.anims = [];
    this.shown = '';
    this.nav.clear();
  }

  render(defaultKey = '') {
    this.clearAll();
    let entry = null;
    this.objs = this.capture(() => {
      const cx = GAME_WIDTH / 2;
      this.add.text(cx, 18, t('codex.title'), textStyle(20, COLORS.accent, { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
      TABS.forEach((id, i) => {
        this.button(`tab:${id}`, {
          x: cx + (i - 1.5) * 112, y: 40, w: 104, h: 20, size: 11, label: t(`codex.tab.${id}`),
          selected: id === this.tab, onSelect: () => this.setTab(id),
        });
      });
      this.button('back', { x: 52, y: BAR_Y, w: 84, h: 22, size: 12, label: t('codex.back'), onSelect: () => this.back() });
      if (this.tab === 'armory') entry = this.buildArmory();
      else if (this.tab === 'bestiary') entry = this.buildFoes('enemy');
      else if (this.tab === 'bosses') entry = this.buildFoes('boss');
      else this.buildChronicle();
    });
    if (entry) this.showEntry(entry, true);
    const keys = this.nav.items.map((it) => it.key);
    let i = keys.indexOf(this.focusKey);
    if (i < 0) i = keys.indexOf(defaultKey);
    if (i < 0) i = keys.indexOf(`tab:${this.tab}`);
    this.nav.silent = true;
    this.nav.focus(Math.max(0, i));
    this.nav.silent = false;
  }

  setTab(id) {
    if (id === this.tab) return;
    this.tab = id;
    this.page = 0;
    this.runIdx = -1;
    this.focusKey = `tab:${id}`;
    this.render();
  }

  back() {
    if (this.modal) { this.closeModal(); return; }
    if (this.tab === 'chronicle' && this.runIdx >= 0) {
      const i = this.runIdx;
      this.runIdx = -1;
      this.focusKey = `run:${i}`;
      this.render();
      return;
    }
    this.leave();
  }

  leave() {
    if (this.from === 'Pause') {
      const pause = this.scene.get('Pause');
      this.scene.stop();
      if (pause && pause.codexClosed) pause.codexClosed();
      return;
    }
    this.scene.start('Menu');
  }

  // Ячейка сетки: рамка, внутри рисует draw(); фокус показывает запись справа.
  cell(key, x, y, w, h, entry, draw) {
    const panel = addPanel(this, x, y, w, h);
    draw();
    const item = {
      x, y, w, h, disabled: false,
      setFocus: (f) => {
        panel.setFocus(f);
        if (f) this.showEntry(entry);
      },
      onSelect: () => this.showEntry(entry),
    };
    item.setFocus(false);
    this.keyed(this.nav.add(item), key);
  }

  showEntry(entry, force = false) {
    if (!force && this.shown === entry.key) return;
    this.shown = entry.key;
    this.sel[this.tab] = entry.key;
    for (const o of this.detailObjs) o.destroy();
    this.anims = [];
    this.detailObjs = this.capture(() => {
      addPanel(this, RIGHT.x + RIGHT.w / 2, MID_Y, RIGHT.w, AREA_H);
      if (entry.kind === 'enemy' || entry.kind === 'boss') this.foeDetail(entry);
      else this.armoryDetail(entry);
    });
  }

  // ---------- Armory ----------

  buildArmory() {
    addPanel(this, LEFT.x + LEFT.w / 2, MID_Y, LEFT.w, AREA_H);
    const step = 26;
    const cols = 11;
    const x0 = LEFT.x + 20;
    let y = TOP + 8;
    let first = null;
    let found = 0;
    let total = 0;
    for (const sec of armoryEntries()) {
      this.add.text(LEFT.x + 8, y, t(`codex.sec.${sec.sec}`), textStyle(10, '#ffd84a')).setOrigin(0, 0);
      y += 26;
      sec.items.forEach((it, i) => {
        const x = x0 + (i % cols) * step;
        const cy = y + Math.floor(i / cols) * step;
        it.key = `${it.type}:${it.id}`;
        it.seen = isSeen(this.codex, it.kind, it.id);
        total++;
        if (it.seen) found++;
        if (!first || this.sel.armory === it.key) first = it;
        this.cell(it.key, x, cy, 24, 24, it, () => {
          const icon = addIcon(this, x, cy, iconKeyFor(it.kind, it.id), 20, it.kind, it.id);
          if (!it.seen) darken(icon);
        });
      });
      y += Math.ceil(sec.items.length / cols) * step + 2;
    }
    this.add.text(LEFT.x + LEFT.w - 8, BOTTOM - 8, t('codex.found', { n: found, m: total }),
        textStyle(9, COLORS.dim)).setOrigin(1, 1);
    return first;
  }

  armoryDetail(it) {
    const L = RIGHT.x + 10;
    let y = TOP + 8;
    const icon = addIcon(this, L + 14, y + 14, iconKeyFor(it.kind, it.id), 28, it.kind, it.id);
    if (!it.seen) darken(icon);
    this.add.text(L + 36, y, it.seen ? displayName(it.kind, it.id) : t('codex.locked'), textStyle(14)).setOrigin(0, 0);
    this.add.text(L + 36, y + 18, t(`codex.kind.${it.type}`), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    y += 36;
    const desc = it.seen ? t(`${it.kind}.${it.id}.desc`) : t('codex.locked_desc');
    const d = this.add.text(L, y, desc, textStyle(10, '#dddddd', { wordWrap: { width: RIGHT.w - 20 } })).setOrigin(0, 0);
    y += d.height + 8;
    if (it.from) {
      y = this.recipe(L, y, it) + 8;
    }
    if (!it.seen) return;
    if (it.kind === 'passive') this.passiveTable(L, y, PASSIVES[it.id]);
    else this.weaponTable(L, y, WEAPONS[it.id]);
  }

  // «Рецепт: A Lv 7 + B» с иконками; у закрытой записи «??? + ???».
  recipe(L, y, it) {
    let x = L;
    const put = (s, color = '#ffffff') => {
      const tx = this.add.text(x, y + 7, s, textStyle(10, color)).setOrigin(0, 0.5);
      x += tx.width + 4;
    };
    put(t('codex.recipe'), COLORS.dim);
    it.from.forEach((id, i) => {
      if (i > 0) put('+', COLORS.dim);
      const kind = WEAPONS[id] ? 'weapon' : 'passive';
      if (!it.seen) { put(t('codex.locked')); return; }
      addIcon(this, x + 7, y + 7, iconKeyFor(kind, id), 14, kind, id);
      x += 17;
      put(kind === 'weapon' ? t('codex.recipe_lv', { name: displayName(kind, id), n: WEAPONS[id].maxLevel }) :
        displayName(kind, id));
    });
    return y + 14;
  }

  // Таблица: строки — параметры, столбцы — уровни (или части коллаба). Изменившееся к прошлому уровню ярче.
  table(L, y, heads, rows) {
    const labelW = 64;
    const colW = Math.min(36, Math.floor((RIGHT.w - 20 - labelW) / Math.max(1, heads.length)));
    const head = textStyle(9, COLORS.dim);
    heads.forEach((h, i) => {
      this.add.text(L + labelW + (i + 1) * colW, y, h, head).setOrigin(1, 0);
    });
    y += 14;
    for (const r of rows) {
      this.add.text(L, y, r.label, textStyle(9, '#dddddd')).setOrigin(0, 0);
      r.cells.forEach((c, i) => {
        const changed = i === 0 || c !== r.cells[i - 1];
        this.add.text(L + labelW + (i + 1) * colW, y, c, textStyle(9, changed ? '#ffffff' : '#8a8299')).setOrigin(1, 0);
      });
      y += 12;
    }
    return y;
  }

  weaponTable(L, y, def) {
    if (!def) return;
    const cols = def.parts ? def.parts : def.levels;
    const heads = def.parts ? def.parts.map((p) => t(`codex.beh.${p.behavior}`)) :
      cols.length === 1 ? [t('codex.col.value')] : cols.map((_, i) => t('codex.col.lv', { n: i + 1 }));
    const rows = PARAMS.filter((k) => cols.some((c) => c[k] !== undefined))
        .map((k) => ({ label: t(`codex.p.${k}`), cells: cols.map((c) => fmtParam(k, c[k])) }));
    this.table(L, y, heads, rows);
  }

  passiveTable(L, y, def) {
    if (!def) return;
    const heads = def.levels.map((_, i) => t('codex.col.lv', { n: i + 1 }));
    this.table(L, y, heads, [{ label: t(`trait.${def.stat}`), cells: def.levels.map((v) => fmtPassive(def, v)) }]);
  }

  // ---------- Bestiary / Bosses ----------

  buildFoes(kind) {
    addPanel(this, LEFT.x + LEFT.w / 2, MID_Y, LEFT.w, AREA_H);
    const defs = kind === 'boss' ? BOSSES : ENEMIES;
    const ids = Object.keys(defs);
    // монстры 4×2 мелкими ячейками, боссы 2×2 крупными
    const boss = kind === 'boss';
    const cols = boss ? 2 : 4;
    const w = boss ? 138 : 66;
    const h = boss ? 116 : 70;
    const sx = w + 6;
    const sy = h + 6;
    const x0 = LEFT.x + 6 + w / 2 + 3;
    const y0 = TOP + 8 + h / 2;
    let first = null;
    let found = 0;
    ids.forEach((id, i) => {
      const x = x0 + (i % cols) * sx;
      const y = y0 + Math.floor(i / cols) * sy;
      const e = { kind, id, key: `${kind}:${id}`, seen: isSeen(this.codex, kind, id) };
      if (e.seen) found++;
      if (!first || this.sel[this.tab] === e.key) first = e;
      this.cell(e.key, x, y, w, h, e, () => {
        const key = defs[id].sprite;
        if (this.textures.exists(key)) {
          const sp = this.add.sprite(x, y + h / 2 - 14, key, 0).setOrigin(0.5, 1)
              .setScale(fitScale(key, w - 8, h - 18));
          if (!e.seen) sp.setTintFill(DARK);
        }
        this.add.text(x, y + h / 2 - 3, e.seen ? displayName(kind, id) : t('codex.locked'),
            textStyle(8, e.seen ? '#ffffff' : COLORS.dim)).setOrigin(0.5, 1);
      });
    });
    this.add.text(LEFT.x + LEFT.w - 8, BOTTOM - 8, t('codex.found', { n: found, m: ids.length }),
        textStyle(9, COLORS.dim)).setOrigin(1, 1);
    return first;
  }

  foeDetail(e) {
    const boss = e.kind === 'boss';
    const def = (boss ? BOSSES : ENEMIES)[e.id];
    const L = RIGHT.x + 10;
    const T = TOP + 6;
    // слева фигура с циклом ходьбы, справа имя, описание, атаки
    const key = def.sprite;
    if (this.textures.exists(key)) {
      const sp = this.add.sprite(L + 52, T + 132, key, 0).setOrigin(0.5, 1);
      sp.baseScale = fitScale(key, 104, 128);
      sp.setScale(sp.baseScale);
      if (e.seen) this.anims.push({ sprite: sp, key, y: T + 132, seed: 0 });
      else sp.setTintFill(DARK);
    }
    const tx = L + 112;
    const tw = RIGHT.w - 136;
    this.add.text(tx, T + 2, e.seen ? displayName(e.kind, e.id) : t('codex.locked'), textStyle(14)).setOrigin(0, 0);
    this.add.text(tx, T + 20, t(`codex.kind.${e.kind}`), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    const d = this.add.text(tx, T + 34, e.seen ? t(`${e.kind}.${e.id}.desc`) : t('codex.foe_locked_desc'),
        textStyle(10, '#dddddd', { wordWrap: { width: tw } })).setOrigin(0, 0);
    if (!e.seen) return;
    if (boss) {
      let y = T + 40 + d.height;
      this.add.text(tx, y, t('codex.attacks'), textStyle(10, '#ffd84a')).setOrigin(0, 0);
      y += 13;
      const atks = def.attacks && def.attacks.length ? def.attacks : [{ type: 'touch' }];
      for (const a of atks) {
        let name = t(`codex.atk.${a.type}`, a.enemy ? { enemy: displayName('enemy', a.enemy) } : null);
        if (a.rageOnly) name = t('codex.atk.rage_only', { name });
        this.add.text(tx + 4, y, `- ${name}`, textStyle(9)).setOrigin(0, 0);
        y += 11;
      }
    }

    // статы и свой счёт двумя колонками
    const sy = T + 148;
    const stats = [];
    if (def.invulnerable) stats.push([t('codex.stat.hp'), t('codex.invulnerable')]);
    else if (def.hpPerLevel) stats.push([t('codex.stat.hp_level'), t('codex.stat.hp_per_level', { n: def.hpPerLevel })]);
    else stats.push([t('codex.stat.hp'), String(def.hp)]);
    stats.push([t('codex.stat.speed'), String(def.speed)], [t('codex.stat.damage'), String(def.damage)]);
    if (def.xp > 0) stats.push([t('codex.stat.xp'), String(def.xp)]);
    if (def.rage) stats.push([t('codex.stat.rage'), t('codex.stat.rage_at', { n: Math.round(def.rage.hpFraction * 100) })]);
    const rec = this.codex.foes[e.id] || {};
    const mine = [];
    if (boss) mine.push([t('codex.rec.met'), rec.met || 0]);
    mine.push([t('codex.rec.kills'), rec.kills || 0]);
    if (!boss) mine.push([t('codex.rec.elites'), rec.elites || 0]);
    mine.push([t('codex.rec.hits'), rec.hits || 0], [t('codex.rec.taken'), fmtBig(rec.taken || 0)]);
    const colW = (RIGHT.w - 30) / 2;
    [[t('codex.stats'), stats, L], [t('codex.rec.title'), mine, L + colW + 10]].forEach(([title, list, x]) => {
      this.add.text(x, sy, title, textStyle(10, '#ffd84a')).setOrigin(0, 0);
      list.forEach(([k, v], i) => {
        this.add.text(x, sy + 15 + i * 13, k, textStyle(9, COLORS.dim)).setOrigin(0, 0);
        this.add.text(x + colW, sy + 15 + i * 13, String(v), textStyle(9)).setOrigin(1, 0);
      });
    });
    if (!boss && def.elite) {
      this.add.text(L, BOTTOM - 8, t('codex.elite', { hp: def.elite.hpMul, dmg: def.elite.damageMul }),
          textStyle(9, '#ff9ab0')).setOrigin(0, 1);
    }
  }

  // ---------- Chronicle ----------

  buildChronicle() {
    this.totals();
    const run = this.runIdx >= 0 ? this.codex.runs[this.runIdx] : null;
    if (run) this.runSummary(run);
    else this.runList();
    // id кодекса (тап копирует) и восстановление по id
    const idLabel = () => t('codex.id', { id: this.codex.id });
    const idBtn = this.button('id', {
      x: 334, y: BAR_Y, w: 300, h: 22, size: 10, label: idLabel(), color: '#9ad0ff',
      onSelect: () => {
        copyText(this.codex.id);
        this.flashId(t('codex.copied'));
      },
    });
    this.idBtn = idBtn;
    this.idLabel = idLabel;
    this.button('restore', {
      x: 566, y: BAR_Y, w: 120, h: 22, size: 12, label: t('codex.restore'), onSelect: () => this.openModal(),
    });
    if (this.pendingFlash) {
      this.flashId(this.pendingFlash);
      this.pendingFlash = '';
    }
  }

  flashId(msg) {
    const btn = this.idBtn;
    btn.setLabel(msg);
    this.time.delayedCall(1500, () => {
      if (this.alive && this.idBtn === btn && btn.text.active) btn.setLabel(this.idLabel());
    });
  }

  totals() {
    const w = 240;
    const L = LEFT.x;
    addPanel(this, L + w / 2, MID_Y, w, AREA_H);
    const tt = this.codex.totals;
    this.add.text(L + 8, TOP + 6, t('codex.tot.title'), textStyle(11, '#ffd84a')).setOrigin(0, 0);
    const heroes = Object.keys(HEROES).map((id) => `${displayName('hero', id)} ${tt.heroes[id] || 0}`).join('  ');
    const rows = [
      [t('codex.tot.runs'), `${tt.runs.solo} / ${tt.runs.duo}`],
      [t('codex.tot.wins'), `${tt.wins.solo} / ${tt.wins.duo}`],
      [t('codex.tot.time'), fmtDuration(tt.time)],
      [t('codex.tot.dist'), t('codex.meters', { n: Math.round(tt.dist / CODEX.pxPerMeter) })],
      [t('codex.tot.kills'), String(Math.round(tt.kills))],
      [t('codex.tot.damage'), fmtBig(tt.damage)],
      [t('codex.tot.coins'), String(Math.round(tt.coins))],
      [t('codex.tot.best_solo'), String(tt.best.solo)],
      [t('codex.tot.best_duo'), String(tt.best.duo)],
      null,
      ...PICKUP_KINDS.filter((k) => k !== 'coin').map((k) => [t(`codex.pick.${k}`), String(tt.pickups[k] || 0)]),
      null,
      [t('codex.tot.heroes'), heroes],
    ];
    let y = TOP + 24;
    for (const r of rows) {
      if (!r) { y += 5; continue; }
      this.add.text(L + 10, y, r[0], textStyle(10, COLORS.dim)).setOrigin(0, 0);
      this.add.text(L + w - 10, y, r[1], textStyle(10)).setOrigin(1, 0);
      y += 14;
    }
  }

  runList() {
    const L = LEFT.x + 248;
    const w = GAME_WIDTH - 8 - L;
    const cx = L + w / 2;
    addPanel(this, cx, MID_Y, w, AREA_H);
    const runs = this.codex.runs;
    const per = CODEX.runsPerPage;
    const pages = Math.max(1, Math.ceil(runs.length / per));
    this.page = Math.min(this.page, pages - 1);
    this.add.text(L + 8, TOP + 6, t('codex.runs.title'), textStyle(11, '#ffd84a')).setOrigin(0, 0);
    if (!runs.length) {
      this.add.text(cx, MID_Y, t('codex.runs.empty'), textStyle(11, COLORS.dim)).setOrigin(0.5);
      return;
    }
    const rw = w - 12;
    const rl = cx - rw / 2;
    for (let k = 0; k < per; k++) {
      const i = this.page * per + k;
      const r = runs[i];
      if (!r) break;
      const y = TOP + 34 + k * 23;
      const panel = addPanel(this, cx, y, rw, 20);
      const st = textStyle(9);
      const mode = r.mode === 'duo' ? (r.partner ? `${t('codex.mode.duo')} +${r.partner}` : t('codex.mode.duo')) : t('codex.mode.solo');
      const cursed = r.difficulty && r.difficulty !== DEFAULT_DIFFICULTY;
      this.add.text(rl + 6, y, fmtDate(r.at), textStyle(9, COLORS.dim)).setOrigin(0, 0.5);
      this.add.text(rl + 70, y, mode, st).setOrigin(0, 0.5);
      this.add.text(rl + 140, y, displayName('hero', r.hero), st).setOrigin(0, 0.5);
      this.add.text(rl + 186, y, t(`difficulty.${r.difficulty}.short`), textStyle(9, cursed ? COLORS.cursed : COLORS.dim)).setOrigin(0, 0.5);
      this.add.text(rl + 228, y, t(`codex.status.${r.status}`), textStyle(9, STATUS_COLOR[r.status])).setOrigin(0, 0.5);
      this.add.text(rl + 316, y, formatTime(r.time), st).setOrigin(1, 0.5);
      this.add.text(rl + rw - 6, y, String(r.score), textStyle(9, '#ffd84a')).setOrigin(1, 0.5);
      const item = {
        x: cx, y, w: rw, h: 20, disabled: false,
        setFocus: (f) => panel.setFocus(f),
        onSelect: () => {
          this.runIdx = i;
          this.focusKey = 'runback';
          this.render();
        },
      };
      item.setFocus(false);
      this.keyed(this.nav.add(item), `run:${i}`);
    }
    const py = BOTTOM - 16;
    const prev = this.button('prev', { x: cx - 50, y: py, w: 28, h: 20, size: 12, label: t('codex.prev'), onSelect: () => this.turn(-1) });
    this.add.text(cx, py, t('codex.page', { n: this.page + 1, m: pages }), textStyle(10, COLORS.dim)).setOrigin(0.5);
    const next = this.button('next', { x: cx + 50, y: py, w: 28, h: 20, size: 12, label: t('codex.next'), onSelect: () => this.turn(1) });
    prev.setDisabled(this.page === 0);
    next.setDisabled(this.page >= pages - 1);
  }

  turn(d) {
    const pages = Math.max(1, Math.ceil(this.codex.runs.length / CODEX.runsPerPage));
    const p = Math.max(0, Math.min(pages - 1, this.page + d));
    if (p === this.page) return;
    this.page = p;
    // фокус остаётся на стрелке, если она ещё живая, иначе на другой
    const edge = (d < 0 && p === 0) || (d > 0 && p === pages - 1);
    this.focusKey = edge ? (d < 0 ? 'next' : 'prev') : (d < 0 ? 'prev' : 'next');
    this.render();
  }

  runSummary(r) {
    const L = LEFT.x + 248;
    const w = GAME_WIDTH - 8 - L;
    const cx = L + w / 2;
    addPanel(this, cx, MID_Y, w, AREA_H);
    const x0 = L + 10;
    const T = TOP + 6;
    const mode = r.mode === 'duo' ? (r.partner ? t('codex.mode.duo_with', { name: r.partner }) : t('codex.mode.duo')) : t('codex.mode.solo');
    this.add.text(x0, T, `${fmtDate(r.at)}   ${mode}`, textStyle(11)).setOrigin(0, 0);
    const cursed = r.difficulty && r.difficulty !== DEFAULT_DIFFICULTY;
    let x = x0;
    for (const [s, c] of [[displayName('hero', r.hero), '#dddddd'],
      [t(`difficulty.${r.difficulty}.name`), cursed ? COLORS.cursed : COLORS.dim],
      [t(`codex.status.${r.status}`), STATUS_COLOR[r.status]]]) {
      const tx = this.add.text(x, T + 16, s, textStyle(10, c)).setOrigin(0, 0);
      x += tx.width + 12;
    }
    // итоги слева (как на экране конца забега)
    const rows = [
      [t('result.time'), formatTime(r.time)],
      [t('result.level'), String(r.level)],
      [t('result.kills'), String(r.kills)],
      [t('codex.tot.coins'), String(r.coins)],
      [t('codex.run.walked'), t('codex.meters', { n: Math.round(r.dist / CODEX.pxPerMeter) })],
    ];
    let y = T + 36;
    for (const [k, v] of rows) {
      this.add.text(x0, y, k, textStyle(10, COLORS.dim)).setOrigin(0, 0);
      this.add.text(x0 + 120, y, v, textStyle(10)).setOrigin(1, 0);
      y += 14;
    }
    this.add.text(x0, y + 2, t('result.score'), textStyle(12, COLORS.accent)).setOrigin(0, 0);
    this.add.text(x0 + 120, y + 2, String(r.score), textStyle(12, '#ffd84a')).setOrigin(1, 0);

    // билд справа: оружие и пассивки иконками с уровнем
    const bx = x0 + 140;
    this.add.text(bx, T + 36, t('codex.run.build'), textStyle(10, '#ffd84a')).setOrigin(0, 0);
    [['weapon', r.weapons, T + 62], ['passive', r.passives, T + 96]].forEach(([kind, list, by]) => {
      if (!list.length) this.add.text(bx, by - 6, t('pause.none'), textStyle(9, '#777777')).setOrigin(0, 0);
      list.slice(0, 6).forEach(([id, lv], i) => {
        const ix = bx + 10 + i * 34;
        addIcon(this, ix, by, iconKeyFor(kind, id), 20, kind, id);
        this.add.text(ix + 12, by + 11, String(lv), textStyle(8, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(1, 1);
      });
    });

    // урон и DPS по оружию
    const ty = T + 130;
    this.add.text(x0, ty, t('codex.run.damage'), textStyle(10, '#ffd84a')).setOrigin(0, 0);
    const right = L + w - 10;
    this.add.text(right - 52, ty + 2, t('codex.run.dmg'), textStyle(9, COLORS.dim)).setOrigin(1, 0);
    this.add.text(right, ty + 2, t('codex.run.dps'), textStyle(9, COLORS.dim)).setOrigin(1, 0);
    const dmg = Object.entries(r.damage).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...dmg.map((d) => d[1]));
    dmg.forEach(([id, v], i) => {
      const ry = ty + 16 + i * 15;
      addIcon(this, x0 + 6, ry + 6, iconKeyFor('weapon', id), 12, 'weapon', id);
      this.add.text(x0 + 16, ry, displayName('weapon', id), textStyle(9)).setOrigin(0, 0);
      const bw = Math.max(1, Math.round(90 * v / max));
      this.add.rectangle(x0 + 150, ry + 6, bw, 5, 0xff7a3d).setOrigin(0, 0.5);
      this.add.text(right - 52, ry, fmtBig(v), textStyle(9)).setOrigin(1, 0);
      this.add.text(right, ry, String(Math.round(weaponDps(r, id))), textStyle(9)).setOrigin(1, 0);
    });
    this.button('runback', {
      x: L + 52, y: BOTTOM - 14, w: 84, h: 20, size: 11, label: `< ${t('codex.run.back')}`, onSelect: () => this.back(),
    });
  }

  // ---------- восстановление по id ----------

  dropInput() {
    if (this.idInput) this.idInput.destroy();
    this.idInput = null;
  }

  openModal() {
    this.modal = { stage: 'input', status: '', color: COLORS.dim, value: '', codex: null };
    this.drawModal();
  }

  closeModal() {
    this.modal = null;
    this.token = (this.token || 0) + 1;
    this.dropInput();
    for (const o of this.modalObjs) o.destroy();
    this.modalObjs = [];
    this.focusKey = 'restore';
    this.render();
  }

  drawModal() {
    const m = this.modal;
    if (this.idInput) m.value = this.idInput.el.value;
    this.dropInput();
    for (const o of this.modalObjs) o.destroy();
    this.nav.clear();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.modalObjs = this.capture(() => {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8)
          .setOrigin(0, 0).setInteractive();
      addPanel(this, cx, cy, 360, 170);
      this.add.text(cx, cy - 68, t('codex.restore.title'), textStyle(14, '#ffd84a')).setOrigin(0.5);
      const status = this.add.text(cx, cy + 26, m.status, textStyle(10, m.color)).setOrigin(0.5);
      m.statusText = status;
      if (m.stage === 'input') {
        this.add.text(cx, cy - 44, t('codex.restore.hint'), textStyle(10, '#dddddd')).setOrigin(0.5);
        const rect = { x: cx, y: cy - 10, w: 260, h: 26 };
        const fieldPanel = addPanel(this, rect.x, rect.y, rect.w, rect.h);
        const input = createTextInput(this, rect, { maxLength: CODEX.idLength, placeholder: '••••••••••••••••••••' });
        input.el.value = m.value.toUpperCase();
        input.el.style.textTransform = 'lowercase';
        this.idInput = input;
        input.el.addEventListener('nick-enter', () => this.loadRemote());
        this.nav.add({
          x: rect.x, y: rect.y, w: rect.w, h: rect.h, setFocus: (f) => fieldPanel.setFocus(f),
          onSelect: () => input.el.focus(),
        });
        addButton(this, this.nav, { x: cx - 64, y: cy + 56, w: 110, h: 24, size: 12, label: t('codex.restore.load'), onSelect: () => this.loadRemote() });
      } else {
        const c = m.codex;
        const nick = c.nick || t('codex.nonick');
        const found = Object.values(c.seen).reduce((s, o) => s + Object.keys(o).length, 0);
        this.add.text(cx, cy - 44, t('codex.restore.confirm', { nick }), textStyle(11)).setOrigin(0.5);
        this.add.text(cx, cy - 26, t('codex.restore.summary', { n: c.runs.length, m: found }), textStyle(10, '#dddddd')).setOrigin(0.5);
        this.add.text(cx, cy - 6, t('codex.restore.warn'), textStyle(10, '#ff8080')).setOrigin(0.5);
        addButton(this, this.nav, { x: cx - 64, y: cy + 56, w: 110, h: 24, size: 12, label: t('codex.restore.replace'), color: '#ffd84a', onSelect: () => this.applyRemote() });
      }
      addButton(this, this.nav, { x: cx + 64, y: cy + 56, w: 110, h: 24, size: 12, label: t('codex.restore.cancel'), onSelect: () => this.closeModal() });
    });
    this.nav.focus(m.stage === 'input' && !m.value ? 0 : 1);
  }

  async loadRemote() {
    const m = this.modal;
    if (!m || m.stage !== 'input' || m.busy) return;
    const id = (this.idInput ? this.idInput.el.value : '').trim().toLowerCase();
    const say = (key, color) => {
      m.status = t(key, { n: CODEX.idLength });
      m.color = color;
      if (m.statusText && m.statusText.active) m.statusText.setText(m.status).setColor(color);
    };
    if (!validCodexId(id)) { say('codex.restore.invalid', '#ff8080'); return; }
    if (this.idInput) this.idInput.el.blur();
    m.busy = true;
    say('codex.restore.loading', COLORS.dim);
    const token = this.token = (this.token || 0) + 1;
    let c = null;
    let err = '';
    try {
      c = await fetchCodex(id);
    } catch (e) {
      err = (e && e.message) || 'offline';
    }
    if (!this.alive || token !== this.token || this.modal !== m) return;
    m.busy = false;
    if (!c) {
      say(err === 'notfound' ? 'codex.restore.notfound' : err === 'invalid' ? 'codex.restore.invalid' : 'codex.restore.offline', '#ff8080');
      return;
    }
    m.stage = 'confirm';
    m.codex = c;
    m.status = '';
    this.drawModal();
  }

  applyRemote() {
    const m = this.modal;
    if (!m || !m.codex) return;
    replaceCodex(m.codex);
    this.codex = getCodex();
    this.pendingFlash = t('codex.restored');
    this.closeModal();
  }
}
