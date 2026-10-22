// Выбор героя (меню соло и лобби коопа). Два вида по числу героев:
//   карточки — героев меньше GRID_FROM (базовые два): спрайт (кадр 0 ленты, стойка), имя,
//              стартовое оружие с иконкой, в полном виде ещё HP и скорость;
//   сетка    — героев GRID_FROM и больше: плитки со спрайтом под размер области, ряды поровну
//              (7 = 4 + 3, 13 = 7 + 6) и каждый по центру; описание героя в фокусе (или выбранного)
//              одной строкой под сеткой, как в выборе персонажа VS.
// Фокус — жёлтая рамка; выбранный (mark) — зелёная рамка и галочка; занятый напарником — тусклый.
import { t } from '../i18n/index.js';
import { HEROES } from '../data/heroes.js';
import { addPanel, PANEL } from './panel.js';
import { addIcon, iconKeyFor, displayName } from './icons.js';
import { textStyle } from './style.js';
import { spriteScale } from '../render/density.js';

const SELECTED = PANEL.borderSelected;
const PICKER_MAX_W = 600;  // ширина ряда карточек на экране 640
const GRID_FROM = 3;       // с стольких героев карточки сменяются сеткой
const TILE_GAP = 4;        // зазор между плитками сетки
const TILE_MAX = 64;       // плитка не крупнее
const INFO_H = 14;         // строка описания под сеткой
const ICON = 14;           // иконка стартового оружия
const ICON_GAP = 4;

// Галочка графикой (в пиксельном шрифте может не быть такого символа), правый верхний угол рамки.
function addCheck(scene, right, top, size) {
  const x = right - size - 3;
  const y = top + 3;
  return scene.add.graphics().lineStyle(size > 8 ? 3 : 2, SELECTED, 1).beginPath()
      .moveTo(x, y + size * 0.45).lineTo(x + size * 0.35, y + size * 0.8).lineTo(x + size, y)
      .strokePath().setVisible(false);
}

// Спрайт героя ногами на feetY, не выше maxH.
function addHeroSprite(scene, def, x, feetY, maxH, grow) {
  const key = def.sprite;
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.sprite(x, feetY, key, 0).setOrigin(0.5, 1);
  img.setScale(Math.min(spriteScale(key) * grow, maxH / img.height));
  return img;
}

// Иконка и название оружия одной группой по центру x.
function addWeaponRow(scene, def, x, y) {
  const label = scene.add.text(0, y, displayName('weapon', def.startWeapon), textStyle(9, '#d8d0f0'))
      .setOrigin(0, 0.5);
  const gx = Math.round(x - (ICON + ICON_GAP + label.width) / 2);
  const icon = addIcon(scene, gx + ICON / 2, y, iconKeyFor('weapon', def.startWeapon), ICON, 'weapon',
      def.startWeapon);
  label.x = gx + ICON + ICON_GAP;
  return [icon, label];
}

// Сетка: число рядов, при котором плитка крупнее всего в области w×h (при равенстве — меньше рядов).
// Герои делятся по рядам поровну: первые n % rows рядов на одну плитку длиннее.
// @return {{rows: number, size: number, counts: !Array<number>}}
function gridFor(n, w, h) {
  let best = null;
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const byW = (w - TILE_GAP * (cols - 1)) / cols;
    const byH = (h - TILE_GAP * (rows - 1)) / rows;
    const size = Math.min(Math.floor(Math.min(byW, byH)), TILE_MAX);
    if (!best || size > best.size) best = { rows, size };
  }
  const base = Math.floor(n / best.rows);
  const extra = n % best.rows;
  best.counts = Array.from({ length: best.rows }, (_, r) => base + (r < extra ? 1 : 0));
  return best;
}

/**
 * @param {!Phaser.Scene} scene
 * @param {?Object} nav FocusNav; null — только показ
 * @param {{x: number, y: number, w: (number|undefined), h: (number|undefined), gap: (number|undefined),
 *     selected: string, onPick: function(string), compact: (boolean|undefined), mark: (boolean|undefined),
 *     taken: (Array<string>|undefined), maxWidth: (number|undefined), gridWidth: (number|undefined)}} o
 *     x, y — центр области; w, h — карточка (h — высота всей области); maxWidth — ширина ряда карточек;
 *     gridWidth — ширина сетки, когда героев много (по умолчанию maxWidth);
 *     compact — без строки статов (лобби); mark — отмечать выбранного (лобби); без mark selected только
 *     ставит начальный фокус; taken — герои напарника, выбрать нельзя
 * @return {{objects: !Array<!Object>, grid: boolean}}
 */
export function addHeroPicker(scene, nav, o) {
  const ids = Object.keys(HEROES);
  const gap = o.gap || 16;
  const areaW = o.maxWidth || PICKER_MAX_W;
  const h = o.h || 150;
  const fit = Math.floor((areaW - gap * (ids.length - 1)) / ids.length);
  const grid = ids.length >= GRID_FROM;
  const before = new Set(scene.children.list);
  const panels = {};
  const checks = {};
  const focus = {};
  const selected = o.selected;
  let info = null;
  // строка описания живёт в одном контейнере: при смене героя пересобирается, удаляется вместе с выбором
  const showInfo = (id) => {
    if (!info) return;
    info.box.removeAll(true);
    const def = HEROES[id];
    const st = def.stats;
    const name = scene.add.text(0, info.y, t(`hero.${id}.name`), textStyle(10)).setOrigin(0, 0.5);
    const stats = scene.add.text(0, info.y, `${t('stat.hp')} ${st.maxHp}  ${t('stat.spd')} ${st.speed}`,
        textStyle(9, '#aaaaaa')).setOrigin(0, 0.5);
    const wrow = addWeaponRow(scene, def, 0, info.y);
    const ww = ICON + ICON_GAP + wrow[1].width;
    const total = name.width + 10 + ww + 10 + stats.width;
    let x = Math.round(o.x - total / 2);
    name.x = x;
    x += name.width + 10;
    wrow[0].x = x + ICON / 2;
    wrow[1].x = x + ICON + ICON_GAP;
    x += ww + 10;
    stats.x = x;
    info.box.add([name, stats, ...wrow]);
  };
  const paint = (id, focused) => {
    const p = panels[id];
    focus[id] = focused;
    const sel = o.mark && id === selected;
    if (focused) p.draw(PANEL.fillFocus, PANEL.borderFocus);
    else if (sel) p.draw(PANEL.fillFocus, SELECTED);
    else p.setFocus(false);
    if (checks[id]) checks[id].setVisible(sel);
    if (focused) showInfo(id);
    else if (info && !Object.values(focus).some(Boolean)) showInfo(selected);
  };
  const addItem = (id, x, y, w, ih) => {
    const taken = (o.taken || []).includes(id);
    if (taken) {
      scene.add.rectangle(x, y, w - 2, ih - 2, 0x000000, 0.55);
      if (!grid) {
        scene.add.text(x, y - ih / 2 + 8, t('lobby.taken'), textStyle(9, '#ff8080')).setOrigin(0.5, 0);
      }
    }
    if (nav && !taken) {
      nav.add({ x, y, w, h: ih, setFocus: (f) => paint(id, f), onSelect: () => o.onPick(id) });
    }
  };

  if (!grid) {
    const w = Math.min(o.w || 120, fit);
    const total = ids.length * w + (ids.length - 1) * gap;
    ids.forEach((id, i) => {
      const def = HEROES[id];
      const x = o.x - total / 2 + w / 2 + i * (w + gap);
      const top = o.y - h / 2;
      panels[id] = addPanel(scene, x, o.y, w, h);
      checks[id] = addCheck(scene, x + w / 2, top, 11);
      const feetY = top + h * (o.compact ? 0.62 : 0.56);
      addHeroSprite(scene, def, x, feetY, h * (o.compact ? 0.52 : 0.46), 1.2);
      const nameY = top + h * (o.compact ? 0.7 : 0.62);
      scene.add.text(x, nameY, t(`hero.${id}.name`), textStyle(o.compact ? 11 : 13)).setOrigin(0.5, 0);
      const wy = nameY + (o.compact ? 18 : 22);
      addWeaponRow(scene, def, x, wy);
      if (!o.compact) {
        const st = def.stats;
        scene.add.text(x, wy + 16, `${t('stat.hp')} ${st.maxHp}   ${t('stat.spd')} ${st.speed}`,
            textStyle(9, '#aaaaaa')).setOrigin(0.5, 0);
      }
      addItem(id, x, o.y, w, h);
    });
  } else {
    const gridW = o.gridWidth || areaW;
    const g = gridFor(ids.length, gridW, h - INFO_H);
    const gh = g.rows * g.size + (g.rows - 1) * TILE_GAP;
    // сетка и строка описания одним блоком по центру области
    const top0 = o.y - (gh + TILE_GAP + INFO_H) / 2;
    let i = 0;
    g.counts.forEach((count, row) => {
      // каждый ряд по центру области
      const rw = count * g.size + (count - 1) * TILE_GAP;
      const y = top0 + g.size / 2 + row * (g.size + TILE_GAP);
      for (let c = 0; c < count; c++, i++) {
        const id = ids[i];
        const x = o.x - rw / 2 + g.size / 2 + c * (g.size + TILE_GAP);
        panels[id] = addPanel(scene, x, y, g.size, g.size);
        const mark = Math.max(6, Math.round(g.size / 5));
        checks[id] = addCheck(scene, x + g.size / 2, y - g.size / 2, mark);
        addHeroSprite(scene, HEROES[id], x, y + g.size / 2 - 2, g.size - 6, 1);
        addItem(id, x, y, g.size, g.size);
      }
    });
    info = { y: top0 + gh + TILE_GAP + INFO_H / 2, box: scene.add.container(0, 0) };
  }
  for (const id of ids) paint(id, false);
  const objects = scene.children.list.filter((c) => !before.has(c) && c.type !== 'Zone');
  return { objects, grid };
}
