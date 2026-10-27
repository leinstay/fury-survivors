// Единые размеры кнопок всех экранов. Правило: одинаковая роль — одинаковый размер.
//   column — столбик главного меню и паузы (пиксель в пиксель одинаковые, MENU_COLUMN / menuRow);
//   wide   — строки на всю ширину столбца настроек (слайдеры, переключатели, Back настроек) и форма коопа;
//   action — кнопки в ряд под содержимым экрана (лобби, карточки уровня, сундук, итоги, лут, Refresh);
//   tab    — вкладки и мелкие кнопки инструментов (ширина по ряду, в одном ряду одинаковая), только высота;
//   back   — Back всех страниц и подэкранов меню (кодекс, инвентарь, ачивки, лидерборд, Play, кооп,
//            настройки, Options паузы): одна точка внизу слева, BACK_POS.
// Проверяет tests/smoke/ui-sizes.spec.js (таблица «сцена → роль → размер»).
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { textStyle, COLORS } from './style.js';

export const BUTTON = {
  column: { w: 160, h: 24 },
  wide: { w: 300, h: 24 },
  action: { w: 120, h: 24 },
  tab: { h: 20 },
  back: { w: 120, h: 24 },
};

// Отступ от края экрана и зазор между кнопками одного ряда.
export const EDGE = 8;
export const ROW_GAP = 8;

export const MENU_COLUMN = { y: 118, step: 29, ...BUTTON.column };

// Заголовок экрана: у каждого экрана и подэкрана (кроме главного меню и корня паузы) один заголовок
// стилем «Codex» по центру сверху на TITLE_Y. Под ним «каток» содержимого: от CONTENT_TOP до PAGE_BOTTOM.
export const TITLE_Y = 18;
export const TITLE = { size: 20, stroke: '#000000', strokeThickness: 4 };
export const CONTENT_TOP = TITLE_Y + 16;

// Столбец настроек (Menu → Settings и Pause → Options): шаг строк, ширина; столбец по центру катка
// (columnTop), Back — общий Back страниц (backRect).
export const OPTIONS = { step: 27, ...BUTTON.wide };

// Back полноэкранных страниц и всех подэкранов меню: левый нижний угол.
export const BACK_POS = { x: EDGE + BUTTON.back.w / 2, y: GAME_HEIGHT - EDGE - BUTTON.back.h / 2 };

// Низ панелей страниц над Back (кодекс, лидерборд, ачивки): одна линия, зазор PAGE_GAP до Back.
export const PAGE_GAP = 6;
export const PAGE_BOTTOM = BACK_POS.y - BUTTON.back.h / 2 - PAGE_GAP;
// Середина катка: столбики подэкранов (меню и пауза) центрируются по ней.
export const CONTENT_MID = Math.round((CONTENT_TOP + PAGE_BOTTOM) / 2);

/**
 * Прямоугольник i-й кнопки столбца меню (центр и размер) для addButton.
 * @param {number} i номер строки (0 — верхняя)
 * @return {{x: number, y: number, w: number, h: number}}
 */
export function menuRow(i) {
  const c = MENU_COLUMN;
  return { x: GAME_WIDTH / 2, y: c.y + i * c.step, w: c.w, h: c.h };
}

/**
 * Заголовок экрана (Codex, Achievements, Options, Choose difficulty...): один стиль и один y на всех экранах.
 * @param {!Phaser.Scene} scene
 * @param {string} text
 * @return {!Phaser.GameObjects.Text}
 */
export function screenTitle(scene, text) {
  return scene.add.text(GAME_WIDTH / 2, TITLE_Y, text, textStyle(TITLE.size, COLORS.accent,
      { stroke: TITLE.stroke, strokeThickness: TITLE.strokeThickness })).setOrigin(0.5);
}

/**
 * Центр первой строки столбика из n строк с шагом step, поставленного по центру катка (CONTENT_MID).
 * @param {number} n
 * @param {number} step
 * @return {number}
 */
export function columnTop(n, step) {
  return Math.round(CONTENT_MID - (n - 1) * step / 2);
}

/**
 * Прямоугольник i-й строки столбика подэкрана из n строк (размер и шаг столбика меню), по центру катка.
 * @param {number} i
 * @param {number} n
 * @return {{x: number, y: number, w: number, h: number}}
 */
export function subRow(i, n) {
  const c = MENU_COLUMN;
  return { x: GAME_WIDTH / 2, y: columnTop(n, c.step) + i * c.step, w: c.w, h: c.h };
}

/** Прямоугольник Back полноэкранной страницы (левый нижний угол). */
export function backRect() {
  return { ...BACK_POS, ...BUTTON.back };
}

/**
 * Центры x кнопок ряда шириной w по центру cx через ROW_GAP.
 * @param {number} n число кнопок
 * @param {number} cx центр ряда
 * @param {number=} w ширина кнопки (по умолчанию action)
 * @param {number=} gap
 * @return {!Array<number>}
 */
export function rowXs(n, cx, w = BUTTON.action.w, gap = ROW_GAP) {
  const total = n * w + (n - 1) * gap;
  return Array.from({ length: n }, (_, i) => cx - total / 2 + w / 2 + i * (w + gap));
}
