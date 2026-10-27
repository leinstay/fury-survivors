// Предпросмотр на карточке уровня (LevelUp.js): строки «Стат: было » станет» (у нового — «Стат: значение»
// или «Стат: +прибавка») и ряд иконок оружий игрока, на которые влияет пассивка, в зоне фиксированной высоты
// внизу карточки. Шрифт строк на ступень мельче описания. Скрывается настройкой detailStats (Options).
// Числа считает core/card-preview.js.
import { t } from '../i18n/index.js';
import { textStyle } from './style.js';
import { addIcon, iconKeyFor } from './icons.js';
import { statValue } from './items.js';
import { getSetting } from './settings.js';
import { passivePreview, weaponPreview, weaponStats } from '../core/card-preview.js';

const LINE = 11;     // шаг строк изменений
const SIZE = 9;      // шрифт строк (описание карточки — 10)
const ICON = 12;     // иконка оружия
const ICON_GAP = 2;
const MAX_LINES = 3; // строк изменений оружия на карточке не больше (порядок PREVIEW_PARAMS: урон первым)
const SEC = new Set(['cooldown', 'duration']);

const round1 = (v) => Math.round(v * 10) / 10;

// Прибавка стата в том же виде, что значение (statValue): «+24» у HP, «+15%» у процентных.
function gain(stat, d) {
  return `${d < 0 ? '-' : '+'}${statValue(stat, Math.abs(d)).replace(/^\+/, '')}`;
}

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

/** Высота зоны предпросмотра внизу карточки: MAX_LINES строк (у пассивки вторая и третья — ряд иконок). */
export const PREVIEW_H = Math.max(MAX_LINES * LINE, LINE + 3 + ICON);

/**
 * Зона предпросмотра внизу карточки фиксированной раскладки (на всех карточках одинаково): строки изменений
 * сверху вниз от bottom - PREVIEW_H (первая строка всегда на одном y), ряд иконок пассивки — под первой
 * строкой (тоже на одном y). Строка не переносится: длинная сжимается по ширине.
 * @param {!Phaser.Scene} scene
 * @param {number} x центр карточки
 * @param {number} bottom нижняя граница содержимого
 * @param {number} width ширина под текст
 * @param {!Object} pl игрок sim, который выбирает
 * @param {!Object} card карточка
 * @return {number} высота зоны (0 — нечего показать)
 */
export function addCardPreview(scene, x, bottom, width, pl, card) {
  const lines = [];
  let icons = [];
  if (card.kind === 'passive') {
    const p = passivePreview(pl, card);
    if (!p) return 0;
    const name = t(`item.stat.${p.stat}`);
    // новая пассивка — прибавка («Attack: +15%»), следующий уровень — было » станет
    lines.push(card.isNew ? t('levelup.value', { name, v: gain(p.stat, p.after - p.before) }) :
      t('levelup.change', { name, a: statValue(p.stat, p.before), b: statValue(p.stat, p.after) }));
    icons = p.weapons;
  } else if (card.kind === 'weapon' && weaponPreview(pl, card).length === 0) {
    // новое оружие или эволюция: значения уровня («Damage: 20»)
    for (const c of weaponStats(pl, card).slice(0, MAX_LINES)) {
      lines.push(t('levelup.value', { name: t(`codex.p.${c.key}`), v: paramValue(c.key, c.value) }));
    }
  } else if (card.kind === 'weapon') {
    for (const c of weaponPreview(pl, card).slice(0, MAX_LINES)) {
      lines.push(t('levelup.change', { name: t(`codex.p.${c.key}`), a: paramValue(c.key, c.before),
        b: paramValue(c.key, c.after) }));
    }
  }
  if (!getSetting('detailStats')) return 0;
  if (!lines.length && !icons.length) return 0;
  const top = bottom - PREVIEW_H;
  // иконки (только у пассивки, у неё одна строка) — сразу под первой строкой, на одном y у всех карточек
  if (icons.length) addWeaponIcons(scene, x, top + LINE + 3 + ICON / 2, icons);
  const style = textStyle(SIZE, '#8cff6a', { align: 'center' });
  lines.forEach((s, i) => {
    const o = scene.add.text(x, top + i * LINE, s, style).setOrigin(0.5, 0);
    if (o.width > width) o.setScale(width / o.width, 1);
  });
  return PREVIEW_H;
}
