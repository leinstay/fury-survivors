// Карточки выбора героя (меню соло и лобби коопа): спрайт героя (первый кадр, как стоит в игре), имя,
// стартовое оружие с иконкой, HP и скорость. Фокус — жёлтая рамка; выбранная (mark) — зелёная рамка и галочка.
import { t } from '../i18n/index.js';
import { HEROES } from '../data/heroes.js';
import { addPanel, PANEL } from './panel.js';
import { addIcon, iconKeyFor, displayName } from './icons.js';
import { textStyle } from './style.js';
import { spriteScale } from '../render/density.js';

const SELECTED = 0x8cff6a; // рамка выбранного героя
const PICKER_MAX_W = 600;  // ширина ряда карточек на экране 640
const ICON = 14;           // иконка стартового оружия
const ICON_GAP = 4;

/**
 * @param {!Phaser.Scene} scene
 * @param {?Object} nav FocusNav; null — карточки только показываются (выбор напарника)
 * @param {{x: number, y: number, w: (number|undefined), h: (number|undefined), gap: (number|undefined),
 *     selected: string, onPick: function(string), compact: (boolean|undefined), mark: (boolean|undefined),
 *     taken: (Array<string>|undefined), maxWidth: (number|undefined)}} o
 *     taken — герои, занятые напарником: карточка тусклая с подписью, выбрать её нельзя
 *     x, y — центр ряда карточек; compact — без строки статов (лобби); mark — отмечать выбранную
 *     (лобби: выбор остаётся на экране); без mark selected только ставит начальный фокус
 * @return {{select: function(string), objects: !Array<!Object>}}
 */
export function addHeroPicker(scene, nav, o) {
  const ids = Object.keys(HEROES);
  const gap = o.gap || 16;
  // карточки ужимаются, чтобы ряд влез в maxWidth при любом числе героев
  const fit = Math.floor(((o.maxWidth || PICKER_MAX_W) - gap * (ids.length - 1)) / ids.length);
  const w = Math.min(o.w || 120, fit);
  const h = o.h || 150;
  const total = ids.length * w + (ids.length - 1) * gap;
  const before = new Set(scene.children.list);
  const panels = {};
  const checks = {};
  const focus = {};
  let selected = o.selected;
  const paint = (id, focused) => {
    const p = panels[id];
    focus[id] = focused;
    const sel = o.mark && id === selected;
    if (focused) p.draw(PANEL.fillFocus, PANEL.borderFocus);
    else if (sel) p.draw(PANEL.fillFocus, SELECTED);
    else p.setFocus(false);
    if (checks[id]) checks[id].setVisible(sel);
  };
  ids.forEach((id, i) => {
    const def = HEROES[id];
    const x = o.x - total / 2 + w / 2 + i * (w + gap);
    const top = o.y - h / 2;
    panels[id] = addPanel(scene, x, o.y, w, h);
    // галочка графикой: в пиксельном шрифте может не быть такого символа
    const cx0 = x + w / 2 - 16;
    const cy0 = top + 6;
    checks[id] = scene.add.graphics().lineStyle(3, SELECTED, 1).beginPath()
        .moveTo(cx0, cy0 + 5).lineTo(cx0 + 4, cy0 + 9).lineTo(cx0 + 11, cy0).strokePath()
        .setVisible(false);
    // спрайт стоит ногами на линии; кадр 0 ленты — стойка
    const key = def.sprite;
    if (scene.textures.exists(key)) {
      const k = spriteScale(key);
      const feetY = top + h * (o.compact ? 0.62 : 0.56);
      const img = scene.add.sprite(x, feetY, key, 0).setOrigin(0.5, 1);
      const maxH = h * (o.compact ? 0.52 : 0.46);
      img.setScale(Math.min(k * 1.2, maxH / img.height));
    }
    const nameY = top + h * (o.compact ? 0.7 : 0.62);
    scene.add.text(x, nameY, t(`hero.${id}.name`), textStyle(o.compact ? 11 : 13)).setOrigin(0.5, 0);
    const wy = nameY + (o.compact ? 18 : 22);
    // иконка и название оружия одной группой по центру карточки
    const label = scene.add.text(0, wy, displayName('weapon', def.startWeapon), textStyle(9, '#d8d0f0'))
        .setOrigin(0, 0.5);
    const group = ICON + ICON_GAP + label.width;
    const gx = Math.round(x - group / 2);
    addIcon(scene, gx + ICON / 2, wy, iconKeyFor('weapon', def.startWeapon), ICON, 'weapon', def.startWeapon);
    label.x = gx + ICON + ICON_GAP;
    if (!o.compact) {
      const st = def.stats;
      scene.add.text(x, wy + 16, `${t('stat.hp')} ${st.maxHp}   ${t('stat.spd')} ${st.speed}`,
          textStyle(9, '#aaaaaa')).setOrigin(0.5, 0);
    }
    const taken = (o.taken || []).includes(id);
    if (taken) {
      scene.add.rectangle(x, o.y, w - 2, h - 2, 0x000000, 0.55);
      scene.add.text(x, top + 8, t('lobby.taken'), textStyle(9, '#ff8080')).setOrigin(0.5, 0);
    }
    if (nav && !taken) {
      nav.add({
        x, y: o.y, w, h,
        setFocus: (f) => paint(id, f),
        onSelect: () => o.onPick(id),
      });
    }
  });
  for (const id of ids) paint(id, false);
  const objects = scene.children.list.filter((c) => !before.has(c) && c.type !== 'Zone');
  return {
    objects,
    select(id) {
      const prev = selected;
      selected = id;
      if (panels[prev]) paint(prev, !!focus[prev]);
      if (panels[id]) paint(id, !!focus[id]);
    },
  };
}
