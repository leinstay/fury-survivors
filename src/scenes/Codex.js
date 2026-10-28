// Кодекс: оружие (Armory), герои (Characters), монстры (Bestiary), боссы (Bosses) и летопись забегов (Chronicle).
// Открывается из меню и из паузы (from: 'Pause': пауза и забег остаются под кодексом, назад — в паузу).
// Записи открываются по мере игры (src/core/codex.js); закрытые — тёмный силуэт и «???».
// Вид перестраивается целиком (render) при смене вкладки, страницы, забега; детали справа — при смене фокуса.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { CODEX } from '../data/codex.js';
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { STATS } from '../data/stats.js';
import { COMBOS } from '../data/combos.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { HEROES } from '../data/heroes.js';
import { heroTraits } from '../core/heroes.js';
import { SPRITES } from '../../assets/sprites/manifest.js';
import { FocusNav, addButton, setTextFocusStyle } from '../ui/focus.js';
import { addPanel } from '../ui/panel.js';
import { addIcon, iconKeyFor, displayName } from '../ui/icons.js';
import { textStyle, COLORS, difficultyColor } from '../ui/style.js';
import { formatTime } from '../ui/hud.js';
import { copyText } from '../ui/clipboard.js';
import { createTextInput } from '../ui/dom-input.js';
import { animateCharacter } from '../render/anim.js';
import { isSeen, weaponDps, PICKUP_KINDS, validCodexId } from '../core/codex.js';
import { getCodex, fetchCodex, replaceCodex } from '../services/codex.js';
import { UNIQUES } from '../data/items.js';
import { getInventory } from '../services/inventory.js';
import {
  BUTTON, PAGE_BOTTOM, PAGE_TOP, PAGE_TAB_Y, backRect, screenTitle, menuBackdrop, GAP_TEXT,
} from '../ui/menu-layout.js';
import { weaponsForStat } from '../core/card-preview.js';

const TABS = ['armory', 'characters', 'bestiary', 'bosses', 'chronicle'];
// Рабочая область: от вкладок до нижней строки кнопок. Слева сетка (или итоги), справа детали.
// Одна сетка отступов: M от края экрана, GAP между панелями и кнопками, PAD внутри панели.
const M = 8;
const GAP = 6;
const PAD = 8;
const TAB = { y: PAGE_TAB_Y, h: BUTTON.tab.h,
  w: (GAME_WIDTH - 2 * M - (TABS.length - 1) * GAP) / TABS.length };
const TOP = PAGE_TOP;
const BAR = BUTTON.back; // Back (и Restore справа) — общий Back страниц (ui/menu-layout.js)
// Низ панелей всех вкладок — общая линия страниц над Back (PAGE_BOTTOM), подписи низа панели на FOOT_Y.
const BOTTOM = PAGE_BOTTOM;
const BAR_Y = backRect().y;
const FOOT_Y = BOTTOM - PAD;
const MID_Y = (TOP + BOTTOM) / 2;
const AREA_H = BOTTOM - TOP;
const LEFT = { x: M, w: 300 };
const RIGHT = { x: M + 300 + GAP, w: GAME_WIDTH - 2 * M - 300 - GAP };
// Ширина итогов в хронике, забеги справа от них.
const TOTALS_W = 240;
// Шаг строк в блоках «Stats» и «Your record» справа: 8 статов героя влезают до низа панели.
const STAT_LINE = 12;
// Armory: заголовок раздела над его клетками, клеток в ряд сколько влезает в панель, лишние — на новый ряд.
// Иконка ARMORY_ICON — ровно половина исходника 96 px (целое уменьшение), клетка того же размера, клетки
// вплотную (ARMORY_GAP); ARMORY_INSET от рамки панели; оставшаяся высота — поровну в зазоры между разделами
// (не больше ARMORY_SEC_MAX).
// «Discovered» — внизу справа, рядом с неполным последним рядом.
const ARMORY_ICON = 24;
const ARMORY_HEAD = 13;
const ARMORY_INSET = 4;
const ARMORY_GAP = 0;
const ARMORY_SEC_MAX = 40;
const DARK = 0x000000;
const MOVING = { moving: true };
// Параметры оружия в таблице (порядок строк); показываются только те, что есть у оружия.
// pierce: строка есть и у pierceAll (копьё), там «All».
const PARAMS = ['damage', 'cooldown', 'amount', 'bounces', 'area', 'length', 'speed', 'duration', 'tick', 'width', 'sweep', 'delay', 'trigger',
  'pierce', 'jumps', 'range', 'slow', 'slowTime', 'pin', 'burst', 'turn', 'fireDamage', 'knockback', 'size',
  'hitRadius'];
const SEC_PARAMS = new Set(['cooldown', 'duration', 'tick', 'sweep', 'delay', 'slowTime', 'pin']);
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
  if (SEC_PARAMS.has(k)) return v >= 1e6 ? t('codex.always') : t('codex.sec_unit', { v: round2(v) });
  if (k === 'slow') return `-${Math.round((1 - v) * 100)}%`; // скорость врага × slow
  if (k === 'fireDamage') return `${Math.round(v * 100)}%`;
  if (k === 'size') return `x${round2(v)}`;
  return String(round2(v));
}

// Строки таблицы пассивки: по умолчанию одна (стат), удача множит сразу два шанса.
const PASSIVE_ROWS = { crit: ['crit_chance'], luck: ['crit_chance', 'drop_chance'] };

function fmtPassive(def, v) {
  // удача множит шансы: x1.1 понятнее, чем +10% рядом с +5% крита
  if (def.stat === 'luck') return `x${round2(1 + v)}`;
  if (STATS[def.stat] === 'percent' || ['crit', 'critDmg', 'dodge', 'resistance', 'thorns'].includes(def.stat)) return `+${Math.round(v * 100)}%`;
  if (def.stat === 'regen') return t('codex.per_s', { v: round2(v) });
  return `+${round2(v)}`;
}

// Границы фигуры в кадре 0 (px текстуры, x0..x1 и y0..y1 включительно): масштаб и место считаются по фигуре,
// а не по пустому запасу кадра. Без пикселей (заглушка не загрузилась) — весь кадр.
const BOUNDS = new Map();
function figureBounds(scene, key) {
  if (BOUNDS.has(key)) return BOUNDS.get(key);
  const s = SPRITES[key];
  let b = { x0: 0, y0: 0, x1: s.frameWidth - 1, y1: s.frameHeight - 1 };
  const img = scene.textures.get(key).getSourceImage();
  if (img && img.width) {
    const c = document.createElement('canvas');
    c.width = s.frameWidth;
    c.height = s.frameHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const a = g.getImageData(0, 0, c.width, c.height).data;
    const n = { x0: c.width, y0: c.height, x1: -1, y1: -1 };
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (!a[(y * c.width + x) * 4 + 3]) continue;
        n.x0 = Math.min(n.x0, x);
        n.x1 = Math.max(n.x1, x);
        n.y0 = Math.min(n.y0, y);
        n.y1 = Math.max(n.y1, y);
      }
    }
    if (n.x1 >= 0) b = n;
  }
  BOUNDS.set(key, b);
  return b;
}

// Самый крупный масштаб из SCALES, при котором фигура каждого из keys влезает в w×h
// (одна вкладка — один масштаб).
function fitScale(scene, keys, w, h) {
  const list = (Array.isArray(keys) ? keys : [keys])
      .filter((k) => SPRITES[k] && scene.textures.exists(k));
  const fits = (v) => list.every((k) => {
    const b = figureBounds(scene, k);
    return (b.x1 - b.x0 + 1) * v <= w && (b.y1 - b.y0 + 1) * v <= h;
  });
  return SCALES.find(fits) || SCALES[SCALES.length - 1];
}

// Спрайт фигурой по центру x и низом фигуры на bottom (ноги, у летающих — нижний край).
// Возвращает y опоры (для покачивания ходьбы в update).
function placeFigure(scene, sp, key, scale, x, bottom) {
  const s = SPRITES[key];
  const b = figureBounds(scene, key);
  sp.setOrigin(0.5, 1).setScale(scale);
  sp.x = Math.round(x + (s.frameWidth / 2 - (b.x0 + b.x1 + 1) / 2) * scale);
  sp.y = Math.round(bottom + (s.frameHeight - 1 - b.y1) * scale);
  return sp.y;
}

// Высота фигуры кадра 0 в px текстуры (0, если текстуры нет).
function figureHeight(scene, key) {
  if (!scene.textures.exists(key)) return 0;
  const b = figureBounds(scene, key);
  return b.y1 - b.y0 + 1;
}

// Сетка вкладок Bestiary и Bosses: монстры 4×2, боссы 2×2; ячейки по всей высоте панели, все фигуры
// вкладки в одном масштабе. Масштаб по самой большой высоте, что даёт панель (минус строка подписей
// внизу), высота ячейки — под фигуры. Вкладка героев берёт ту же сетку боссов (одинаковые карточки).
// @return {{cols: number, w: number, h: number, scale: number, figH: number}} figH — высота самой
//     высокой фигуры на экране
function foeGrid(scene, kind) {
  const boss = kind === 'boss';
  const defs = boss ? BOSSES : ENEMIES;
  const ids = Object.keys(defs);
  const cols = boss ? 2 : 4;
  const w = boss ? 138 : 66;
  const rowsN = Math.ceil(ids.length / cols);
  const edge = (LEFT.w - cols * (w + GAP) + GAP) / 2;
  const keys = ids.map((id) => defs[id].sprite);
  const maxH = Math.floor((AREA_H - 2 * edge - 14 - (rowsN - 1) * GAP) / rowsN);
  const scale = fitScale(scene, keys, w - 8, maxH - 18);
  const tallest = Math.max(...keys.map((k) => figureHeight(scene, k)));
  const h = Math.min(maxH, Math.ceil(tallest * scale) + 24);
  return { cols, w, h, scale, figH: tallest * scale };
}

// Масштаб героя под ту же высоту фигуры, что у боссов (figH), не шире maxW.
function heroScale(scene, key, figH, maxW) {
  const b = figureBounds(scene, key);
  return Math.min(figH / (b.y1 - b.y0 + 1), maxW / (b.x1 - b.x0 + 1));
}

// Записи оружейной по разделам: оружие, эволюции (оружие + пассивка), улучшения, уникалки (открыты,
// когда уникалка хоть раз была у игрока: inventory.seen).
function armoryEntries() {
  const recipe = {};
  for (const c of COMBOS) recipe[c.result] = c.from;
  const base = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved);
  const evolved = Object.keys(WEAPONS).filter((id) => WEAPONS[id].evolved);
  return [
    { sec: 'weapon', items: base.map((id) => ({ kind: 'weapon', type: 'weapon', id })) },
    { sec: 'evolution', items: evolved.map((id) => ({ kind: 'weapon', type: 'evolution', id, from: recipe[id] || null })) },
    { sec: 'passive', items: Object.keys(PASSIVES).map((id) => ({ kind: 'passive', type: 'passive', id })) },
    { sec: 'unique', items: Object.keys(UNIQUES).map((id) => ({ kind: 'unique', type: 'unique', id })) },
  ];
}

// Видел ли игрок запись оружейной: уникалки — по инвентарю, остальное — по кодексу.
function armorySeen(codex, it) {
  if (it.kind !== 'unique') return isSeen(codex, it.kind, it.id);
  const inv = getInventory();
  return !!(inv.seen && inv.seen[it.id]);
}

// Не открытая запись: у всех одинаковый тёмный квадрат размера иконки, без силуэта и буквы.
function darken(icon) {
  for (const ch of icon.list) ch.setVisible(false);
  const s = icon.iconSize;
  icon.add(icon.scene.add.rectangle(0, 0, s, s, DARK));
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
    // Фон: арт меню без героинь, как у всех подменю (поверх паузы закрывает забег целиком).
    menuBackdrop(this);
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
      screenTitle(this, t('codex.title'));
      TABS.forEach((id, i) => {
        this.button(`tab:${id}`, {
          x: M + TAB.w / 2 + i * (TAB.w + GAP), y: TAB.y, w: TAB.w, h: TAB.h, size: 11, label: t(`codex.tab.${id}`),
          selected: id === this.tab, onSelect: () => this.setTab(id),
        });
      });
      // Back по левому краю панелей
      this.button('back', { ...backRect(), size: 12, label: t('codex.back'), onSelect: () => this.back() });
      if (this.tab === 'armory') entry = this.buildArmory();
      else if (this.tab === 'characters') entry = this.buildHeroes();
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
      else if (entry.kind === 'hero') this.heroDetail(entry);
      else this.armoryDetail(entry);
    });
  }

  // ---------- Armory ----------

  buildArmory() {
    addPanel(this, LEFT.x + LEFT.w / 2, MID_Y, LEFT.w, AREA_H);
    const secs = armoryEntries();
    const inset = ARMORY_INSET;
    const size = ARMORY_ICON;
    const step = size + ARMORY_GAP;
    const perRow = Math.floor((LEFT.w - 2 * inset + ARMORY_GAP) / step);
    const rowsOf = (sec) => Math.ceil(sec.items.length / perRow);
    const pad = Math.floor((LEFT.w - perRow * step + ARMORY_GAP) / 2);
    // «Discovered» внизу справа: если последний ряд доходит под него, строка уходит ниже рядов
    const all = secs.reduce((a, sec) => a + sec.items.length, 0);
    const foot = this.add.text(LEFT.x + LEFT.w - pad, FOOT_Y + PAD - inset,
        t('codex.found', { n: all, m: all }),
        textStyle(9, COLORS.dim)).setOrigin(1, 1);
    const last = secs[secs.length - 1].items.length % perRow || perRow;
    const under = last * step - ARMORY_GAP > LEFT.w - 2 * pad - foot.width - GAP_TEXT;
    const avail = AREA_H - 2 * inset - (under ? foot.height + GAP_TEXT : 0);
    const used = secs.reduce((a, sec) => a + ARMORY_HEAD + rowsOf(sec) * step - ARMORY_GAP, 0);
    const secGap = Math.min(ARMORY_SEC_MAX,
        Math.floor((avail - used) / Math.max(1, secs.length - 1)));
    const x0 = LEFT.x + pad + size / 2;
    let y = TOP + inset;
    let first = null;
    let found = 0;
    let total = 0;
    secs.forEach((sec) => {
      this.add.text(LEFT.x + pad, y, t(`codex.sec.${sec.sec}`), textStyle(9, '#ffd84a')).setOrigin(0, 0);
      y += ARMORY_HEAD;
      sec.items.forEach((it, i) => {
        const x = x0 + (i % perRow) * step;
        const cy = y + Math.floor(i / perRow) * step + size / 2;
        it.key = `${it.type}:${it.id}`;
        it.seen = armorySeen(this.codex, it);
        total++;
        if (it.seen) found++;
        if (!first || this.sel.armory === it.key) first = it;
        this.cell(it.key, x, cy, size, size, it, () => {
          const key = iconKeyFor(it.kind, it.id);
          const icon = addIcon(this, x, cy, key, ARMORY_ICON, it.kind, it.id);
          if (!it.seen) darken(icon);
        });
      });
      y += rowsOf(sec) * step - ARMORY_GAP + secGap;
    });
    foot.setText(t('codex.found', { n: found, m: total }));
    return first;
  }

  armoryDetail(it) {
    const L = RIGHT.x + PAD;
    let y = TOP + PAD;
    const icon = addIcon(this, L + 14, y + 14, iconKeyFor(it.kind, it.id), 28, it.kind, it.id);
    if (!it.seen) darken(icon);
    this.add.text(L + 36, y, it.seen ? displayName(it.kind, it.id) : t('codex.locked'), textStyle(14)).setOrigin(0, 0);
    // у оружия под видом записи — теги: тип урона (dmgType) и цели (targets)
    const w = it.kind === 'weapon' && it.seen ? WEAPONS[it.id] : null;
    const kind = [t(`codex.kind.${it.type}`)];
    if (w && w.dmgType) kind.push(t(`codex.dmg.${w.dmgType}`));
    if (w && w.targets) kind.push(t(`codex.targets.${w.targets}`));
    this.add.text(L + 36, y + 18, kind.join(' · '), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    y += 36;
    const locked = { unique: 'codex.unique_locked_desc', evolution: 'codex.evolution_locked_desc' };
    const desc = it.seen ? t(`${it.kind}.${it.id}.desc`) : t(locked[it.type] || 'codex.locked_desc');
    const d = this.add.text(L, y, desc, textStyle(10, '#dddddd', { wordWrap: { width: RIGHT.w - 2 * PAD } })).setOrigin(0, 0);
    y += d.height + 8;
    if (it.from) {
      y = this.recipe(L, y, it) + 8;
    }
    // пассивка с гейтингом: «Появляется с N уровня» (видно и у закрытой записи)
    const minLevel = it.kind === 'passive' && PASSIVES[it.id].minLevel;
    if (minLevel) {
      this.add.text(L, y, t('codex.min_level', { n: minLevel }), textStyle(9, '#ffd84a')).setOrigin(0, 0);
      y += 16;
    }
    if (!it.seen || it.kind === 'unique') return;
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
      const kind = WEAPONS[id] ? 'weapon' : 'passive';
      const label = !it.seen ? t('codex.locked') : kind === 'weapon' ?
        t('codex.recipe_lv', { name: displayName(kind, id), n: WEAPONS[id].maxLevel }) :
        displayName(kind, id);
      const tx = this.add.text(0, 0, label, textStyle(10)).setOrigin(0, 0.5);
      const width = tx.width + (it.seen ? 17 : 0) + (i > 0 ? 12 : 0);
      if (x + width > RIGHT.x + RIGHT.w - PAD) { x = L; y += 14; }
      if (i > 0) put('+', COLORS.dim);
      if (it.seen) {
        addIcon(this, x + 7, y + 7, iconKeyFor(kind, id), 14, kind, id);
        x += 17;
      }
      tx.setPosition(x, y + 7);
      x += tx.width + 4;
    });
    return y + 14;
  }

  // Таблица: строки — параметры, столбцы — уровни. Изменившееся к прошлому уровню ярче.
  table(L, y, heads, rows) {
    const labelW = 64;
    const colW = Math.min(36, Math.floor((RIGHT.w - 2 * PAD - labelW) / Math.max(1, heads.length)));
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
    const cols = def.levels;
    const heads = cols.length === 1 ? [t('codex.col.value')] : cols.map((_, i) => t('codex.col.lv', { n: i + 1 }));
    const label = (k) => {
      if (k === 'area') {
        return ({ melee_arc: 'reach', slash: 'length', orbit: 'orbit_radius', chain: 'jump_radius',
          area_drop: 'blast_radius', aura: 'radius', cloud: 'radius', boomerang: 'reach',
          slam: 'blast_radius', ice_orb: 'orb_radius' })[def.behavior] || k;
      }
      if (k === 'duration' && def.behavior === 'slam') return 'crack_time';
      if (k === 'speed') return def.behavior === 'orbit' ? 'orbit_speed' : 'shot_speed';
      if (k === 'cooldown' && def.behavior === 'aura') return 'hit_interval';
      if (k === 'cooldown' && def.behavior === 'orbit') return 'rest_time';
      return k;
    };
    const has = (c, k) => c[k] !== undefined || (k === 'pierce' && c.pierceAll);
    const cell = (c, k) => (k === 'pierce' && c.pierceAll ? t('codex.p.pierce_all') : fmtParam(k, c[k]));
    const rows = PARAMS.filter((k) => cols.some((c) => has(c, k)))
        .map((k) => ({ label: t(`codex.p.${label(k)}`),
          cells: cols.map((c) => cell(c, k)) }));
    // статус-ДоТ (src/data/status.js): строка «Poison chance» с шансом по уровням (уровень главнее оружия)
    const st = (c) => c.status || def.status || null;
    const types = [...new Set(cols.map((c) => st(c) && st(c).type).filter(Boolean))];
    for (const type of types) {
      rows.push({ label: t(`codex.p.status_${type}`), cells: cols.map((c) => {
        const s = st(c);
        return s && s.type === type ? `${Math.round((s.chance ?? 1) * 100)}%` : '-';
      }) });
      // холод: сила и время замедления из статуса
      if (type === 'chill') {
        for (const [k, f] of [['slow', 'slow'], ['slowTime', 'duration']]) {
          rows.push({ label: t(`codex.p.${k}`), cells: cols.map((c) => {
            const s = st(c);
            return s && s.type === type && s[f] !== undefined ? fmtParam(k, s[f]) : '-';
          }) });
        }
      }
    }
    this.table(L, y, heads, rows);
  }

  passiveTable(L, y, def) {
    if (!def) return;
    const heads = def.levels.map((_, i) => t('codex.col.lv', { n: i + 1 }));
    const cells = def.levels.map((v) => fmtPassive(def, v));
    const labels = PASSIVE_ROWS[def.stat] ? PASSIVE_ROWS[def.stat].map((k) => t(`codex.p.${k}`)) : [t(`trait.${def.stat}`)];
    y = this.table(L, y, heads, labels.map((label) => ({ label, cells }))) + 8;
    // оружия, на которые влияет стат (как на карточке уровня); незнакомые — силуэтом
    const ids = weaponsForStat(def.stat, Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved));
    if (!ids.length) return;
    this.add.text(L, y, t('codex.affects'), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    const size = 14;
    const perRow = Math.max(1, Math.floor((RIGHT.w - 2 * PAD) / (size + 2)));
    ids.forEach((id, i) => {
      const icon = addIcon(this, L + size / 2 + (i % perRow) * (size + 2),
          y + 14 + size / 2 + Math.floor(i / perRow) * (size + 2), iconKeyFor('weapon', id), size, 'weapon', id);
      if (!isSeen(this.codex, 'weapon', id)) darken(icon);
    });
  }

  // ---------- Bestiary / Bosses ----------

  buildFoes(kind) {
    addPanel(this, LEFT.x + LEFT.w / 2, MID_Y, LEFT.w, AREA_H);
    const defs = kind === 'boss' ? BOSSES : ENEMIES;
    const ids = Object.keys(defs);
    const boss = kind === 'boss';
    const { cols, w, h, scale } = foeGrid(this, kind);
    const sx = w + GAP;
    const sy = h + GAP;
    const pad = (LEFT.w - cols * sx + GAP) / 2;
    const x0 = LEFT.x + pad + w / 2;
    const y0 = TOP + pad + h / 2;
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
          const sp = this.add.sprite(x, 0, key, 0);
          placeFigure(this, sp, key, scale, x, y + h / 2 - 14);
          if (!e.seen) sp.setTintFill(DARK);
        }
        this.add.text(x, y + h / 2 - 3, e.seen ? displayName(kind, id) : t('codex.locked'),
            textStyle(8, e.seen ? '#ffffff' : COLORS.dim)).setOrigin(0.5, 1);
      });
    });
    this.add.text(LEFT.x + LEFT.w - pad, FOOT_Y, t('codex.found', { n: found, m: ids.length }),
        textStyle(9, COLORS.dim)).setOrigin(1, 1);
    // элитки у всех монстров одинаковые: одна строка на вкладку
    const el = !boss && Object.values(ENEMIES).find((d) => d.elite);
    if (el) {
      this.add.text(LEFT.x + pad, FOOT_Y, t('codex.elite', { hp: el.elite.hpMul, dmg: el.elite.damageMul }),
          textStyle(9, '#ff9ab0')).setOrigin(0, 1);
    }
    return first;
  }

  foeDetail(e) {
    const boss = e.kind === 'boss';
    const def = (boss ? BOSSES : ENEMIES)[e.id];
    const L = RIGHT.x + PAD;
    const T = TOP + PAD;
    // слева фигура с циклом ходьбы, справа имя, описание, атаки
    const key = def.sprite;
    if (this.textures.exists(key)) {
      const sp = this.add.sprite(0, 0, key, 0);
      sp.baseScale = fitScale(this, key, 104, 128);
      const y = placeFigure(this, sp, key, sp.baseScale, L + 52, T + 132);
      if (e.seen) this.anims.push({ sprite: sp, key, y, seed: 0 });
      else sp.setTintFill(DARK);
    }
    const tx = L + 112;
    const tw = RIGHT.w - 2 * PAD - 112;
    this.add.text(tx, T + 2, e.seen ? displayName(e.kind, e.id) : t('codex.locked'), textStyle(14)).setOrigin(0, 0);
    this.add.text(tx, T + 20, t(`codex.kind.${e.kind}`), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    const d = this.add.text(tx, T + 34, e.seen ? t(`${e.kind}.${e.id}.desc`) : t('codex.foe_locked_desc'),
        textStyle(10, '#dddddd', { wordWrap: { width: tw } })).setOrigin(0, 0);
    if (!e.seen) return;
    if (boss) {
      let y = T + 40 + d.height;
      this.add.text(tx, y, t('codex.attacks'), textStyle(10, '#ffd84a')).setOrigin(0, 0);
      y += 13;
      // Жница (oneShot): касание — Death Touch, убивает всегда
      const touch = { type: def.oneShot ? 'death_touch' : 'touch' };
      // codexAttacks (Жница): свой список способностей вместо attacks/касания
      const atks = def.codexAttacks ? def.codexAttacks.map((type) => ({ type })) :
          def.attacks && def.attacks.length ? def.attacks : [touch];
      for (const a of atks) {
        let name = t(`codex.atk.${a.type}`, a.enemy ? { enemies: t(`enemy.${a.enemy}.plural`) } : null);
        if (a.rageOnly) name = t('codex.atk.rage_only', { name });
        this.add.text(tx + 4, y, `- ${name}`, textStyle(9)).setOrigin(0, 0);
        y += 11;
      }
    }

    // статы и свой счёт двумя колонками
    const sy = T + 140;
    const stats = [];
    if (def.invulnerable) stats.push([t('codex.stat.hp'), t('codex.unknown')]); // жница: HP не раскрываем
    else if (def.hpPerLevel) stats.push([t('codex.stat.hp_level'), t('codex.stat.hp_per_level', { n: def.hpPerLevel })]);
    else stats.push([t('codex.stat.hp'), String(def.hp)]);
    stats.push([t('codex.stat.speed'), String(def.speed)],
        [t('codex.stat.damage'), def.oneShot ? t('codex.stat.lethal') : String(def.damage)]);
    if (def.xp > 0) stats.push([t('codex.stat.xp'), String(def.xp)]);
    if (def.rage) stats.push([t('codex.stat.rage'), t('codex.stat.rage_at', { n: Math.round(def.rage.hpFraction * 100) })]);
    const rec = this.codex.foes[e.id] || {};
    const mine = [];
    if (boss) mine.push([t('codex.rec.met'), rec.met || 0]);
    mine.push([t('codex.rec.kills'), rec.kills || 0]);
    if (!boss) mine.push([t('codex.rec.elites'), rec.elites || 0]);
    mine.push([t('codex.rec.hits'), rec.hits || 0], [t('codex.rec.taken'), fmtBig(rec.taken || 0)]);
    const colW = (RIGHT.w - 4 * PAD) / 2;
    [[t('codex.base_stats'), stats, L], [t('codex.rec.title'), mine, L + colW + 2 * PAD]].forEach(([title, list, x]) => {
      this.add.text(x, sy, title, textStyle(10, '#ffd84a')).setOrigin(0, 0);
      list.forEach(([k, v], i) => {
        this.add.text(x, sy + 15 + i * STAT_LINE, k, textStyle(9, COLORS.dim)).setOrigin(0, 0);
        this.add.text(x + colW, sy + 15 + i * STAT_LINE, String(v), textStyle(9)).setOrigin(1, 0);
      });
    });
  }

  // ---------- Characters ----------

  // Герои всегда открыты (их выбирают в меню): ячейки той же сетки и того же размера, что у боссов,
  // фигура героя той же высоты, что самая высокая фигура босса (foeGrid).
  buildHeroes() {
    addPanel(this, LEFT.x + LEFT.w / 2, MID_Y, LEFT.w, AREA_H);
    const { cols, w, h, figH } = foeGrid(this, 'boss');
    const pad = (LEFT.w - cols * (w + GAP) + GAP) / 2;
    const keys = Object.values(HEROES).map((d) => d.sprite).filter((k) => this.textures.exists(k));
    const scale = Math.min(...keys.map((k) => heroScale(this, k, figH, w - 8)));
    const x0 = LEFT.x + pad + w / 2;
    const y0 = TOP + pad + h / 2;
    let first = null;
    Object.keys(HEROES).forEach((id, i) => {
      const x = x0 + (i % cols) * (w + GAP);
      const y = y0 + Math.floor(i / cols) * (h + GAP);
      const e = { kind: 'hero', id, key: `hero:${id}`, seen: true };
      if (!first || this.sel.characters === e.key) first = e;
      this.cell(e.key, x, y, w, h, e, () => {
        const key = HEROES[id].sprite;
        if (this.textures.exists(key)) {
          placeFigure(this, this.add.sprite(x, 0, key, 0), key, scale, x, y + h / 2 - 14);
        }
        this.add.text(x, y + h / 2 - 3, t(`hero.${id}.name`), textStyle(8)).setOrigin(0.5, 1);
      });
    });
    return first;
  }

  heroDetail(e) {
    const def = HEROES[e.id];
    const st = def.stats;
    const L = RIGHT.x + PAD;
    const T = TOP + PAD;
    const key = def.sprite;
    if (this.textures.exists(key)) {
      // фигура той же высоты, что самый крупный босс справа (foeDetail: рамка 104×128), по своим границам
      const sp = this.add.sprite(0, 0, key, 0);
      const figH = Math.max(...Object.values(BOSSES).map((b) => b.sprite)
          .filter((k) => this.textures.exists(k))
          .map((k) => fitScale(this, k, 104, 128) * figureHeight(this, k)));
      sp.baseScale = heroScale(this, key, figH, 104);
      const y = placeFigure(this, sp, key, sp.baseScale, L + 52, T + 132);
      this.anims.push({ sprite: sp, key, y, seed: 0 });
    }
    const tx = L + 112;
    const tw = RIGHT.w - 2 * PAD - 112;
    this.add.text(tx, T + 2, t(`hero.${e.id}.name`), textStyle(14)).setOrigin(0, 0);
    this.add.text(tx, T + 20, t('codex.kind.hero'), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    const d = this.add.text(tx, T + 34, t(`hero.${e.id}.desc`),
        textStyle(10, '#dddddd', { wordWrap: { width: tw } })).setOrigin(0, 0);
    let y = T + 40 + d.height;
    // черты (как на карточке выбора) и стартовое оружие
    let x = tx;
    for (const tr of heroTraits(e.id)) {
      const tt = this.add.text(x, y, `${tr.up ? '+' : '-'}${t(`trait.${tr.stat}`)}`,
          textStyle(9, tr.up ? '#8cff6a' : '#ff7a7a')).setOrigin(0, 0);
      x += tt.width + 6;
    }
    y += 16;
    this.add.text(tx, y, t('codex.start_weapon'), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    addIcon(this, tx + 70, y + 5, iconKeyFor('weapon', def.startWeapon), 12, 'weapon', def.startWeapon);
    this.add.text(tx + 80, y, displayName('weapon', def.startWeapon), textStyle(9)).setOrigin(0, 0);

    const pct = (v) => `${Math.round(v * 100)}%`;
    const stats = [
      [t('stat.hp'), String(st.maxHp)], [t('stat.attack'), pct(st.attack)], [t('stat.magic'), pct(st.magic)],
      [t('stat.spd'), String(st.speed)], [t('stat.crt'), pct(st.crit)], [t('stat.haste'), pct(st.haste)],
      [t('stat.pickup'), pct(st.pickup)], [t('stat.resistance'), pct(st.resistance)],
    ];
    // свой счёт героем: забеги из итогов, победы, лучший счёт и время — по истории забегов
    const runs = this.codex.runs.filter((r) => r.hero === e.id);
    const best = runs.reduce((m, r) => Math.max(m, r.score || 0), 0);
    const longest = runs.reduce((m, r) => Math.max(m, r.time || 0), 0);
    const mine = [
      [t('codex.rec.runs'), String(this.codex.totals.heroes[e.id] || 0)],
      [t('codex.rec.wins'), String(runs.filter((r) => r.status === 'victory').length)],
      [t('codex.rec.best'), String(best)],
      [t('codex.rec.longest'), formatTime(longest)],
    ];
    const sy = T + 140;
    const colW = (RIGHT.w - 4 * PAD) / 2;
    [[t('codex.base_stats'), stats, L], [t('codex.rec.title'), mine, L + colW + 2 * PAD]].forEach(([title, list, cx]) => {
      this.add.text(cx, sy, title, textStyle(10, '#ffd84a')).setOrigin(0, 0);
      list.forEach(([k, v], i) => {
        this.add.text(cx, sy + 15 + i * STAT_LINE, k, textStyle(9, COLORS.dim)).setOrigin(0, 0);
        this.add.text(cx + colW, sy + 15 + i * STAT_LINE, v, textStyle(9)).setOrigin(1, 0);
      });
    });
  }

  // ---------- Chronicle ----------

  buildChronicle() {
    this.totals();
    const run = this.runIdx >= 0 ? this.codex.runs[this.runIdx] : null;
    if (run) this.runSummary(run);
    else this.runList();
    // id кодекса кликабельным текстом внизу итогов (клик копирует), восстановление по id справа
    const idLabel = () => t('codex.id', { id: this.codex.id });
    const idText = this.add.text(LEFT.x + PAD, BOTTOM - PAD, idLabel(), textStyle(9, '#9ad0ff')).setOrigin(0, 1);
    const item = {
      x: idText.x + idText.width / 2, y: idText.y - idText.height / 2,
      w: idText.width + 6, h: idText.height + 4,
      disabled: false,
      setFocus: (f) => setTextFocusStyle(idText, f, '#9ad0ff'),
      setLabel: (s) => idText.setText(s),
      text: idText,
      onSelect: () => {
        copyText(this.codex.id);
        this.flashId(t('codex.copied'));
      },
    };
    item.setFocus(false);
    this.idBtn = this.keyed(this.nav.add(item), 'id');
    this.idLabel = idLabel;
    // Restore по правому краю панелей
    this.button('restore', {
      x: GAME_WIDTH - M - BAR.w / 2, y: BAR_Y, w: BAR.w, h: BAR.h, size: 12, label: t('codex.restore'), onSelect: () => this.openModal(),
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
    const w = TOTALS_W;
    const L = LEFT.x;
    addPanel(this, L + w / 2, MID_Y, w, AREA_H);
    const tt = this.codex.totals;
    this.add.text(L + PAD, TOP + PAD, t('codex.tot.title'), textStyle(11, '#ffd84a')).setOrigin(0, 0);
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
    ];
    let y = TOP + PAD + 18;
    for (const r of rows) {
      if (!r) { y += 5; continue; }
      this.add.text(L + PAD, y, r[0], textStyle(10, COLORS.dim)).setOrigin(0, 0);
      this.add.text(L + w - PAD, y, r[1], textStyle(10)).setOrigin(1, 0);
      y += 14;
    }
  }

  runList() {
    const L = LEFT.x + TOTALS_W + GAP;
    const w = GAME_WIDTH - M - L;
    const cx = L + w / 2;
    addPanel(this, cx, MID_Y, w, AREA_H);
    const runs = this.codex.runs;
    const per = CODEX.runsPerPage;
    const pages = Math.max(1, Math.ceil(runs.length / per));
    this.page = Math.min(this.page, pages - 1);
    this.add.text(L + PAD, TOP + PAD, t('codex.runs.title'), textStyle(11, '#ffd84a')).setOrigin(0, 0);
    if (!runs.length) {
      this.add.text(cx, MID_Y, t('codex.runs.empty'), textStyle(11, COLORS.dim)).setOrigin(0.5);
      return;
    }
    const rw = w - 2 * PAD;
    const rl = cx - rw / 2;
    for (let k = 0; k < per; k++) {
      const i = this.page * per + k;
      const r = runs[i];
      if (!r) break;
      const y = TOP + PAD + 28 + k * 23;
      const panel = addPanel(this, cx, y, rw, 20);
      const st = textStyle(9);
      const mode = r.mode === 'duo' ? (r.partner ? `${t('codex.mode.duo')} & ${r.partner}` : t('codex.mode.duo')) : t('codex.mode.solo');
      this.add.text(rl + 6, y, fmtDate(r.at), textStyle(9, COLORS.dim)).setOrigin(0, 0.5);
      this.add.text(rl + 70, y, mode, st).setOrigin(0, 0.5);
      this.add.text(rl + 140, y, displayName('hero', r.hero), st).setOrigin(0, 0.5);
      this.add.text(rl + 186, y, t(`difficulty.${r.difficulty}.short`), textStyle(9, difficultyColor(r.difficulty, COLORS.dim))).setOrigin(0, 0.5);
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
    const py = BOTTOM - PAD - 10;
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
    const L = LEFT.x + TOTALS_W + GAP;
    const w = GAME_WIDTH - M - L;
    const cx = L + w / 2;
    addPanel(this, cx, MID_Y, w, AREA_H);
    const x0 = L + PAD;
    const T = TOP + PAD;
    const mode = r.mode === 'duo' ? (r.partner ? t('codex.mode.duo_with', { name: r.partner }) : t('codex.mode.duo')) : t('codex.mode.solo');
    this.add.text(x0, T, `${fmtDate(r.at)}   ${mode}`, textStyle(11)).setOrigin(0, 0);
    let x = x0;
    for (const [s, c] of [[displayName('hero', r.hero), '#dddddd'],
      [t(`stage.${r.stage}.name`), '#9ad0ff'],
      [t(`difficulty.${r.difficulty}.name`), difficultyColor(r.difficulty, COLORS.dim)],
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
    const right = L + w - PAD;
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
      x: L + PAD + 42, y: BOTTOM - PAD - 10, w: 84, h: 20, size: 11, label: `< ${t('codex.run.back')}`, onSelect: () => this.back(),
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
        addButton(this, this.nav, { x: cx - 64, y: cy + 56, ...BUTTON.action, size: 12, label: t('codex.restore.load'), onSelect: () => this.loadRemote() });
      } else {
        const c = m.codex;
        const nick = c.nick || t('codex.nonick');
        const found = Object.values(c.seen).reduce((s, o) => s + Object.keys(o).length, 0);
        this.add.text(cx, cy - 44, t('codex.restore.confirm', { nick }), textStyle(11)).setOrigin(0.5);
        this.add.text(cx, cy - 26, t('codex.restore.summary', { n: c.runs.length, m: found }), textStyle(10, '#dddddd')).setOrigin(0.5);
        this.add.text(cx, cy - 6, t('codex.restore.warn'), textStyle(10, '#ff8080')).setOrigin(0.5);
        addButton(this, this.nav, { x: cx - 64, y: cy + 56, ...BUTTON.action, size: 12, label: t('codex.restore.replace'), color: '#ffd84a', onSelect: () => this.applyRemote() });
      }
      addButton(this, this.nav, { x: cx + 64, y: cy + 56, ...BUTTON.action, size: 12, label: t('codex.restore.cancel'), onSelect: () => this.closeModal() });
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
