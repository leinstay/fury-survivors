// Единые размеры кнопок всех экранов. Правило: одинаковая роль — одинаковый размер.
//   column — столбик главного меню и паузы (пиксель в пиксель одинаковые, MENU_COLUMN / menuRow);
//   wide   — строки на всю ширину столбца настроек (слайдеры, переключатели, Back настроек) и форма коопа;
//   action — кнопки в ряд под содержимым экрана (лобби, карточки уровня, сундук, итоги, лут, Refresh);
//   tab    — вкладки и мелкие кнопки инструментов (ширина по ряду, в одном ряду одинаковая), только высота;
//   back   — Back полноэкранных страниц (кодекс, инвентарь, ачивки, лидерборд): внизу слева, BACK_POS.
// Проверяет tests/smoke/ui-sizes.spec.js (таблица «сцена → роль → размер»).
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';

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

// Столбец настроек (Menu → Settings и Pause → Options): подзаголовок, первая строка, шаг строк.
export const OPTIONS = { title: 100, y: 126, step: 28, ...BUTTON.wide };

// Back полноэкранных страниц: левый нижний угол.
export const BACK_POS = { x: EDGE + BUTTON.back.w / 2, y: GAME_HEIGHT - EDGE - BUTTON.back.h / 2 };

/**
 * Прямоугольник i-й кнопки столбца меню (центр и размер) для addButton.
 * @param {number} i номер строки (0 — верхняя)
 * @return {{x: number, y: number, w: number, h: number}}
 */
export function menuRow(i) {
  const c = MENU_COLUMN;
  return { x: GAME_WIDTH / 2, y: c.y + i * c.step, w: c.w, h: c.h };
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
