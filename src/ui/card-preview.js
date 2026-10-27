// Предпросмотр на карточке уровня (LevelUp.js): строки «Стат: было » станет» и ряд иконок оружий игрока,
// на которые влияет пассивка. Числа считает core/card-preview.js.
import { t } from '../i18n/index.js';
import { textStyle } from './style.js';
import { addIcon, iconKeyFor } from './icons.js';
import { statValue } from './items.js';
import { passivePreview, weaponPreview } from '../core/card-preview.js';

const LINE = 12;     // шаг строк изменений
const ICON = 12;     // иконка оружия
const ICON_GAP = 2;
const MAX_LINES = 3; // строк изменений оружия на карточке не больше (порядок PREVIEW_PARAMS: урон первым)
const SEC = new Set(['cooldown', 'duration']);

const round1 = (v) => Math.round(v * 10) / 10;

// Значение параметра оружия: секунды с двумя знаками, остальное целым или с одним знаком.
function paramValue(k, v) {
  if (SEC.has(k)) return t('codex.sec_unit', { v: Math.round(v * 100) / 100 });
  return String(round1(v));
}

/**
 * Ряд иконок оружий по центру x (оружия, на которые влияет пассивка).
 * @param {!Phaser.Scene} scene
 * @param {number} x центр ряда
 * @param {number} y центр иконок
 * @param {!Array<string>} ids оружия
 * @param {number=} size
 * @return {number} ширина ряда
 */
export function addWeaponIcons(scene, x, y, ids, size = ICON) {
  const w = ids.length * size + Math.max(0, ids.length - 1) * ICON_GAP;
  ids.forEach((id, i) => {
    const ix = Math.round(x - w / 2 + size / 2 + i * (size + ICON_GAP));
    addIcon(scene, ix, y, iconKeyFor('weapon', id), size, 'weapon', id);
  });
  return w;
}

/**
 * Строки изменений карточки снизу вверх от bottom (последняя строка — над ней иконки).
 * @param {!Phaser.Scene} scene
 * @param {number} x центр карточки
 * @param {number} bottom нижняя граница содержимого
 * @param {number} width ширина под текст
 * @param {!Object} pl игрок sim, который выбирает
 * @param {!Object} card карточка
 * @return {number} высота нарисованного (0 — нечего показать)
 */
export function addCardPreview(scene, x, bottom, width, pl, card) {
  const lines = [];
  let icons = [];
  if (card.kind === 'passive') {
    const p = passivePreview(pl, card);
    if (!p) return 0;
    lines.push(t('levelup.change', { name: t(`item.stat.${p.stat}`), a: statValue(p.stat, p.before),
      b: statValue(p.stat, p.after) }));
    icons = p.weapons;
  } else if (card.kind === 'weapon') {
    for (const c of weaponPreview(pl, card).slice(0, MAX_LINES)) {
      lines.push(t('levelup.change', { name: t(`codex.p.${c.key}`), a: paramValue(c.key, c.before),
        b: paramValue(c.key, c.after) }));
    }
  }
  let y = bottom;
  if (icons.length) {
    y -= ICON / 2;
    addWeaponIcons(scene, x, y, icons);
    y -= ICON / 2 + 3;
  }
  const style = textStyle(10, '#8cff6a', { align: 'center', wordWrap: { width } });
  for (let i = lines.length - 1; i >= 0; i--) {
    const o = scene.add.text(x, y, lines[i], style).setOrigin(0.5, 1);
    y -= Math.max(LINE, o.height);
  }
  return bottom - y;
}
