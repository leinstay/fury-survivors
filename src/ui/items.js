// Предметы на экране: заглушка-картинка (прямоугольник по клеткам, рамка цвета редкости, буква типа),
// подсказка (имя, редкость, тир, заточка, аффиксы с разбросом, скилл уникалки), сетка сумки и панель статов.
// Общие для инвентаря (src/scenes/Inventory.js), вкладки паузы и экрана лута после забега.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT, COMBAT } from '../data/constants.js';
import { BAG } from '../data/items.js';
import { STATS } from '../data/stats.js';
import { textStyle, COLORS } from './style.js';
import { addPanel } from './panel.js';
import { addIcon, iconKeyFor } from './icons.js';
import { itemName, affixLines, itemSize, bagBonus, bagGrid } from '../core/items.js';

export const RARITY_COLOR = { common: 0xc8c8c8, rare: 0x4fc3ff, epic: 0xc06cff, unique: 0xffa030 };
export const RARITY_CSS = { common: '#d8d8d8', rare: '#4fc3ff', epic: '#d08cff', unique: '#ffb040' };
const RARITY_FILL = { common: 0x2a2a30, rare: 0x16303f, epic: 0x2c1a3c, unique: 0x3a2610 };

const CELL_OPEN = 0x241d32;
const CELL_LOCKED = 0x09080c;
const CELL_LINE = 0x3e3354;

/** Имя предмета: [префикс] база [суффикс] [+N] (уникалка — своё имя); заточка — часть имени в конце. */
export function itemTitle(item) {
  const n = itemName(item);
  const plus = item.enchant ? `+${item.enchant}` : '';
  return [n.prefix && t(n.prefix), t(n.base), n.suffix && t(n.suffix), plus].filter(Boolean).join(' ');
}

/** Буква типа для заглушки. */
export function typeLetter(item) {
  return String(t(`item.kind.${item.type}`) || item.type).charAt(0).toUpperCase();
}

const PCT_FLAT = new Set(['crit', 'dodge', 'resistance', 'thorns']);

// Число аффикса со знаком: процентные и доли шанса в %, остальные как есть.
function num(stat, v, flat, unit = true) {
  const sign = v < 0 ? '−' : '+';
  const a = Math.abs(v);
  if (!flat || PCT_FLAT.has(stat)) return `${sign}${(a * 100).toFixed(1)}${unit ? '%' : ''}`;
  if (stat === 'regen') return `${sign}${a.toFixed(2)}${unit ? '/s' : ''}`;
  return `${sign}${a.toFixed(1)}`;
}

/** Строка аффикса: «Attack +3.2%  [−2.5 … +5.0]», цвет (минус красный, обязательный ярче). */
export function affixText(line) {
  const range = `[${num(line.stat, line.min, line.flat, false)} … ${num(line.stat, line.max, line.flat, false)}]`;
  return {
    text: `${t(`item.stat.${line.stat}`)} ${num(line.stat, line.value, line.flat)}  ${range}`,
    color: line.value < 0 ? '#ff6060' : line.implicit ? '#ffffff' : '#c8d8ff',
  };
}

/**
 * Картинка-заглушка предмета: левый верхний угол (x, y), размер w × h px.
 * @return {!Phaser.GameObjects.Container}
 */
export function drawItemBox(scene, x, y, w, h, item, opts = {}) {
  const c = scene.add.container(Math.round(x), Math.round(y));
  const g = scene.add.graphics();
  const col = RARITY_COLOR[item.rarity] || 0xffffff;
  g.fillStyle(RARITY_FILL[item.rarity] || 0x222222, 1).fillRect(0, 0, w, h);
  g.fillStyle(col, 0.18).fillRect(1, 1, w - 2, Math.max(1, Math.floor(h / 3)));
  g.lineStyle(1, col, 1).strokeRect(0.5, 0.5, w - 1, h - 1);
  c.add(g);
  if (item.unique) {
    // уникалка — сфера своего цвета (icon_unique_<id>), обычные предметы — буква типа
    const s = Math.round(Math.min(w, h, 48) * 0.75);
    c.add(addIcon(scene, w / 2, h / 2, iconKeyFor('unique', item.unique), s, 'unique', item.unique));
  } else {
    const size = Math.max(7, Math.min(14, Math.round(Math.min(w, h) * 0.5)));
    c.add(scene.add.text(w / 2, h / 2, typeLetter(item),
        textStyle(size, RARITY_CSS[item.rarity] || '#ffffff', { stroke: '#000000', strokeThickness: 2 }))
        .setOrigin(0.5));
  }
  if (item.enchant && !opts.small) {
    c.add(scene.add.text(w - 2, h - 1, `+${item.enchant}`, textStyle(7, '#ffd84a',
        { stroke: '#000000', strokeThickness: 2 })).setOrigin(1, 1));
  }
  if (item.locked) {
    g.fillStyle(0xffd84a, 1).fillRect(2, 2, 3, 3);
  }
  if (opts.alpha !== undefined) c.setAlpha(opts.alpha);
  return c;
}

/** Подсказка предмета поверх всего: show(item, x, y, {mul}) / hide(). */
export class ItemTooltip {
  constructor(scene) {
    this.scene = scene;
    this.box = null;
    this.uid = null;
  }

  show(item, x, y, { mul = 1, extra = null } = {}) {
    const key = `${item.uid}:${item.enchant}:${item.locked}:${mul}:${item.affixes.length}:${extra}`;
    if (this.box && this.key === key) { this.place(x, y); return; }
    this.hide();
    this.key = key;
    const s = this.scene;
    const W = 210;
    const P = 6;
    const c = s.add.container(0, 0).setDepth(1000);
    const bg = s.add.graphics();
    c.add(bg);
    let yy = P;
    const line = (text, color = '#ffffff', size = 10) => {
      const tx = s.add.text(P, yy, text, textStyle(size, color, { wordWrap: { width: W - 2 * P } }))
          .setOrigin(0, 0);
      c.add(tx);
      yy += tx.height + 2;
    };
    line(itemTitle(item), RARITY_CSS[item.rarity], 12);
    const meta = [t(`item.rarity.${item.rarity}`), t('item.tier', { n: item.tier })];
    if (item.locked) meta.push(t('item.locked'));
    line(`${meta.join(' · ')}  ·  ${t(`item.kind.${item.type}`)} ${item.shape[0]}×${item.shape[1]}`,
        COLORS.dim, 9);
    yy += 2;
    if (item.unique) {
      line(t(`unique.${item.unique}.desc`), '#ffd8a0', 10);
    } else {
      for (const l of affixLines(item, mul)) {
        const a = affixText(l);
        line(a.text, a.color, 9);
      }
      if (mul > 1) line(t('item.diversity', { n: Math.round((mul - 1) * 100) }), '#8cff6a', 8);
    }
    if (extra) line(extra, '#ffb060', 9);
    const h = yy + P - 2;
    const col = RARITY_COLOR[item.rarity] || 0xffffff;
    bg.fillStyle(0x000000, 0.5).fillRect(2, 2, W, h);
    bg.fillStyle(0x0e0b16, 0.97).fillRect(0, 0, W, h);
    bg.lineStyle(1, col, 1).strokeRect(0.5, 0.5, W - 1, h - 1);
    this.box = c;
    this.w = W;
    this.h = h;
    this.place(x, y);
  }

  // Рядом с точкой, не за краем экрана.
  place(x, y) {
    if (!this.box) return;
    let px = x + 12;
    let py = y + 8;
    if (px + this.w > GAME_WIDTH - 2) px = x - this.w - 8;
    if (py + this.h > GAME_HEIGHT - 2) py = GAME_HEIGHT - 2 - this.h;
    this.box.setPosition(Math.round(Math.max(2, px)), Math.round(Math.max(2, py)));
  }

  hide() {
    if (this.box) this.box.destroy();
    this.box = null;
    this.key = null;
  }
}

/**
 * Сетка сумки BAG.w × BAG.h: открытые клетки, закрытые затемнены, предметы по местам.
 * Координаты клетки по точке: cellAt(px, py) → {x, y} или null.
 */
export class BagView {
  constructor(scene, { x, y, cell }) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.cell = cell;
    this.objs = [];
    this.bag = null;
    this.grid = null;
    this.mul = 1;
  }

  get width() {
    return BAG.w * this.cell;
  }

  get height() {
    return BAG.h * this.cell;
  }

  draw(bag, { hideUid = null } = {}) {
    this.clear();
    this.bag = bag;
    this.grid = bagGrid(bag);
    this.mul = bagBonus(bag).diversity;
    const s = this.scene;
    const C = this.cell;
    const g = s.add.graphics();
    g.__box = { x: this.x, y: this.y, w: BAG.w * C, h: BAG.h * C }; // для проверки отступов (spacing.spec)
    this.objs.push(g);
    g.fillStyle(0x000000, 0.45).fillRect(this.x + 2, this.y + 2, BAG.w * C, BAG.h * C);
    for (let yy = 0; yy < BAG.h; yy++) {
      for (let xx = 0; xx < BAG.w; xx++) {
        const open = xx < bag.cols && yy < bag.rows;
        g.fillStyle(open ? CELL_OPEN : CELL_LOCKED, 1)
            .fillRect(this.x + xx * C, this.y + yy * C, C, C);
        g.lineStyle(1, open ? CELL_LINE : 0x1a1622, 1)
            .strokeRect(this.x + xx * C + 0.5, this.y + yy * C + 0.5, C - 1, C - 1);
      }
    }
    for (const e of bag.items) {
      if (e.item.uid === hideUid) continue;
      const [w, h] = itemSize(e.item, e.rot);
      this.objs.push(drawItemBox(s, this.x + e.x * C + 1, this.y + e.y * C + 1,
          w * C - 2, h * C - 2,
          e.item));
    }
  }

  cellAt(px, py) {
    const cx = Math.floor((px - this.x) / this.cell);
    const cy = Math.floor((py - this.y) / this.cell);
    if (cx < 0 || cy < 0 || cx >= BAG.w || cy >= BAG.h) return null;
    return { x: cx, y: cy };
  }

  /** Предмет в клетке или null. */
  entryAt(cx, cy) {
    if (!this.grid || !this.grid[cy]) return null;
    const uid = this.grid[cy][cx];
    return uid ? this.bag.items.find((e) => e.item.uid === uid) || null : null;
  }

  clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }
}

// Показ значения стата в панели (и в предпросмотре карточек уровня, ui/card-preview.js).
export function statValue(k, v) {
  switch (k) {
    case 'maxHp': case 'speed': return String(Math.round(v));
    case 'crit': case 'dodge': case 'resistance': case 'thorns': return `${Math.round(v * 100)}%`;
    case 'critDmg': return `${Math.round((COMBAT.critMul + v) * 100)}%`; // итоговый урон крита, база ×critMul
    case 'regen': return `${(Math.round(v * 100) / 100).toFixed(2)}/s`;
    default: return `${Math.round(v * 100)}%`;
  }
}

function statOver(k, v) {
  switch (k) {
    case 'crit': case 'dodge': case 'resistance': case 'thorns': case 'critDmg':
      return `+${Math.round(v * 100)}%`;
    case 'maxHp': case 'speed': return `+${Math.round(v * 10) / 10}`;
    case 'regen': return `+${(Math.round(v * 100) / 100).toFixed(2)}`;
    default: return `+${Math.round(v * 100)}%`;
  }
}

/**
 * Прибавка к стату: «+2%», «+0.5», «+0.10/s» (процентные и доли шанса — в процентах).
 * @param {string} k стат
 * @param {number} v increased у процентных, прибавка у плоских
 * @return {string}
 */
export function statDelta(k, v) {
  const sign = v < 0 ? '−' : '+';
  const a = Math.abs(v);
  if (k === 'regen') return `${sign}${a.toFixed(2)}/s`;
  if (STATS[k] === 'flat' && !PCT_FLAT.has(k) && k !== 'critDmg') {
    return `${sign}${Math.round(a * 10) / 10}`;
  }
  return `${sign}${Math.round(a * 1000) / 10}%`;
}

/** Бонус ачивки ({stat: v}) строкой: «+2% Attack, +2% Magic». */
export function bonusText(bonus) {
  return Object.keys(bonus || {}).filter((k) => STATS[k] && bonus[k])
      .map((k) => t('ach.bonus.part', { v: statDelta(k, bonus[k]), stat: t(`item.stat.${k}`) }))
      .join(', ');
}

// Цвета вкладов в панели статов: пассивки, предметы сумки, ачивки.
export const PART_CSS = { passives: '#7fb8ff', items: '#d29bff', ach: '#ffd84a' };
const PARTS = ['passives', 'items', 'ach'];

/** Легенда вкладов (passives items achiev.) правым краем в точке (right, y), oy — origin по y; вернёт ширину. */
export function addStatsLegend(scene, right, y, style = textStyle, oy = 0) {
  let lx = right;
  for (const part of [...PARTS].reverse()) {
    const o = scene.add.text(lx, y, t(`inv.part.${part}`), style(7, PART_CSS[part])).setOrigin(1, oy);
    lx -= o.width + 4;
  }
  return right - lx - 4;
}

/**
 * Панель статов героя (loadoutReport): итог, отличие от базы цветом, упор в кап «(max)» и перебор,
 * перед итогом — вклады источников (parts): пассивки, предметы (и × more уникалок), ачивки.
 * Легенда цветов вкладов — в строке заголовка справа.
 * @param {!Object} report loadoutReport(...)
 * @param {!Object} base итог без сумки (statReport без extra) для сравнения
 * @param {string=} title
 * @param {{legend: (boolean|undefined)}=} o legend: false — без строки заголовка и легенды (строки статов
 *     сразу сверху панели; заголовок, если нужен, рисует сцена над панелью)
 * @return {!Array} созданные объекты
 */
export function addStatsPanel(scene, x, y, w, h, report, base, title = t('inv.stats'), o = {}) {
  const before = new Set(scene.children.list);
  const legend = o.legend !== false;
  addPanel(scene, x + w / 2, y + h / 2, w, h);
  if (legend) {
    scene.add.text(x + 6, y + 4, title, textStyle(10, '#ffd84a')).setOrigin(0, 0);
    let lx = x + w - 6;
    for (const part of [...PARTS].reverse()) {
      const o = scene.add.text(lx, y + 6, t(`inv.part.${part}`), textStyle(7, PART_CSS[part])).setOrigin(1, 0);
      lx -= o.width + 4;
    }
  }
  const top = legend ? 20 : 6;
  const keys = Object.keys(STATS);
  const line = Math.min(12, Math.floor((h - top - 2) / keys.length));
  keys.forEach((k, i) => {
    const r = report[k];
    if (!r) return;
    const yy = y + top + i * line;
    const label = scene.add.text(x + 6, yy, t(`item.stat.${k}`), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    const b = base && base[k] ? base[k].value : r.value;
    const diff = r.value - b;
    const color = Math.abs(diff) < 1e-6 ? '#ffffff' : diff > 0 ? '#8cff6a' : '#ff7070';
    let text = statValue(k, r.value);
    if (r.capped && Number.isFinite(r.cap)) {
      const over = r.raw - r.cap;
      text += over > 1e-6 ? ` ${t('inv.max_over', { n: statOver(k, over) })}` : ` ${t('inv.max')}`;
    }
    const val = scene.add.text(x + w - 6, yy, text, textStyle(9, r.capped ? '#ffd84a' : color))
        .setOrigin(1, 0);
    // вклады справа налево перед итогом; не влезают — не рисуются (итог важнее)
    const pr = r.parts;
    if (!pr) return;
    const segs = [];
    for (const p of PARTS) {
      if (Math.abs(pr[p]) > 1e-6) segs.push({ p, s: t('inv.part', { v: statDelta(k, pr[p]) }) });
      if (p === 'items' && Math.abs(pr.more - 1) > 1e-6) {
        segs.push({ p, s: t('inv.part.more', { v: Math.round(pr.more * 100) / 100 }) });
      }
    }
    let px = val.x - val.width - 3;
    const minX = label.x + label.width + 3;
    for (const seg of segs.reverse()) {
      const o = scene.add.text(px, yy + 1, seg.s, textStyle(7, PART_CSS[seg.p])).setOrigin(1, 0);
      if (o.x - o.width < minX) { o.destroy(); break; }
      px -= o.width + 2;
    }
  });
  return scene.children.list.filter((o) => !before.has(o));
}
