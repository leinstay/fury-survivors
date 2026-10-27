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
import { spriteScale } from '../render/density.js';
import { HEROES } from '../data/heroes.js';

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

// Зазоры (проверяет tests/smoke/spacing.spec.js):
//   GAP_LABEL — от низа заголовка строки (текст с обводкой) до рамки блока под ним;
//   GAP_TEXT  — от рамки блока до текста под ним; GAP_BLOCK — между панелями; PAD — внутри панели.
// LABEL_ROW — на сколько верх заголовка строки (размер 10 с обводкой, ~14 px) выше блока под ним.
export const GAP_LABEL = 4;
export const GAP_TEXT = 4;
export const GAP_BLOCK = 6;
export const PAD = 6;
export const LABEL_ROW = 14 + GAP_LABEL;

export const MENU_COLUMN = { y: 118, step: 29, ...BUTTON.column };

// Заголовок экрана: у каждого экрана и подэкрана (кроме главного меню и корня паузы) один заголовок
// стилем «Codex» по центру сверху на TITLE_Y. Под ним содержимое: от CONTENT_TOP до PAGE_BOTTOM.
export const TITLE_Y = 16;
export const TITLE = { size: 20, stroke: '#000000', strokeThickness: 4 };
export const CONTENT_TOP = TITLE_Y + 16;
// Заголовок экранов поверх забега (overlayTitle): по линии полосы HP в HUD — закрывает таймер, не задевает
// полосу опыта сверху.
export const OVERLAY_TITLE_Y = 26;
export const OVERLAY_TITLE = { size: 24, color: '#ffd84a', stroke: '#000000', strokeThickness: 4 };

// Столбец настроек (Menu → Settings и Pause → Options): шаг строк, ширина; первая строка на SUBMENU_Y,
// Back — общий Back страниц (backRect).
export const OPTIONS = { step: 27, ...BUTTON.wide };

// Back полноэкранных страниц и всех подэкранов меню: левый нижний угол.
export const BACK_POS = { x: EDGE + BUTTON.back.w / 2, y: GAME_HEIGHT - EDGE - BUTTON.back.h / 2 };

// Низ панелей страниц над Back (кодекс, лидерборд, ачивки): одна линия, зазор PAGE_GAP до Back.
export const PAGE_GAP = GAP_BLOCK;
export const PAGE_BOTTOM = BACK_POS.y - BUTTON.back.h / 2 - PAGE_GAP;
// Страницы с вкладками (кодекс, лидерборд): строка вкладок на PAGE_TAB_Y на всю ширину (от EDGE до EDGE),
// панели от PAGE_TOP до PAGE_BOTTOM.
export const PAGE_TAB_Y = 43;
export const PAGE_TOP = PAGE_TAB_Y + BUTTON.tab.h / 2 + PAGE_GAP;
// Первая строка столбика всех подменю (меню и Options паузы): один y. Самый длинный столбик (Options,
// 9 строк по OPTIONS.step) от него заканчивается над Back.
export const SUBMENU_Y = 70;
// Вуаль подменю поверх арта (menuVeil): доли тёмного и чёрного слоя.
export const MENU_VEIL = { dark: 0.65, black: 0.45 };
// Героини главного меню: зазор от центра до первой, шаг между соседними, линия ног.
export const MENU_ART = { gap: 135, step: 6, y: 318 };

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
 * Прямоугольник i-й строки столбика подменю (размер и шаг столбика меню) от общего SUBMENU_Y.
 * @param {number} i
 * @return {{x: number, y: number, w: number, h: number}}
 */
export function subRow(i) {
  const c = MENU_COLUMN;
  return { x: GAME_WIDTH / 2, y: SUBMENU_Y + i * c.step, w: c.w, h: c.h };
}

/**
 * Фон всех подменю (в меню и подэкраны паузы): арт главного меню целиком, на целых пикселях, под тёмной
 * вуалью (menuVeil, как было в кодексе). Корень главного меню — без вуали и с героинями по краям
 * (heroines: true; HEROES[id].menu). dim: false — без вуали (Menu рисует вуаль сама у подменю).
 * @param {!Phaser.Scene} scene
 * @param {{heroines: (boolean|undefined), dim: (boolean|undefined)}=} o
 * @return {!Array<!Phaser.GameObjects.GameObject>}
 */
export function menuBackdrop(scene, o = {}) {
  const out = [scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0d0a16, 1).setOrigin(0, 0)];
  if (scene.textures.exists('menu_bg')) {
    const k = spriteScale('menu_bg');
    const img = scene.textures.get('menu_bg').getSourceImage();
    out.push(scene.add.image(Math.floor((GAME_WIDTH - img.width * k) / 2),
        Math.floor((GAME_HEIGHT - img.height * k) / 2), 'menu_bg').setOrigin(0, 0).setScale(k));
  }
  if (o.heroines) out.push(...menuHeroines(scene));
  else if (o.dim !== false) out.push(...menuVeil(scene));
  return out;
}

/**
 * Тёмная вуаль поверх арта меню у подменю: то же затемнение, что было в кодексе (арт 0.35 на тёмном и чёрная
 * вуаль 0.45) — тёмный слой MENU_VEIL.dark, затем чёрный MENU_VEIL.black.
 * @param {!Phaser.Scene} scene
 * @return {!Array<!Phaser.GameObjects.Rectangle>}
 */
export function menuVeil(scene) {
  return [
    scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0d0a16, MENU_VEIL.dark).setOrigin(0, 0),
    scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, MENU_VEIL.black).setOrigin(0, 0),
  ];
}

/**
 * Героини по бокам главного меню (HEROES[id].menu): справа как есть, слева отражённые; внутренний край
 * первой на каждой стороне на MENU_ART.gap от центра, следующие дальше через MENU_ART.step, ноги на MENU_ART.y.
 * @param {!Phaser.Scene} scene
 * @return {!Array<!Phaser.GameObjects.Image>}
 */
export function menuHeroines(scene) {
  const cx = GAME_WIDTH / 2;
  const edge = { right: MENU_ART.gap, left: MENU_ART.gap };
  const out = [];
  for (const def of Object.values(HEROES)) {
    const m = def.menu;
    if (!m || !scene.textures.exists(m.art)) continue;
    const right = m.side !== 'left';
    const side = right ? 'right' : 'left';
    const img = scene.add.image(0, MENU_ART.y, m.art).setOrigin(0.5, 1)
        .setScale(spriteScale(m.art));
    const half = img.displayWidth / 2;
    img.x = right ? cx + edge[side] + half : cx - edge[side] - half;
    img.setFlipX(!right);
    edge[side] += img.displayWidth + MENU_ART.step;
    out.push(img);
  }
  return out;
}

/**
 * Заголовок экрана поверх забега (LevelUp, сундук, лут, корень паузы, итоги): один y и один стиль, цвет по
 * смыслу (по умолчанию жёлтый, у поражения — красный).
 * @param {!Phaser.Scene} scene
 * @param {string} text
 * @param {string=} color
 * @return {!Phaser.GameObjects.Text}
 */
export function overlayTitle(scene, text, color = OVERLAY_TITLE.color) {
  const o = OVERLAY_TITLE;
  return scene.add.text(GAME_WIDTH / 2, OVERLAY_TITLE_Y, text,
      textStyle(o.size, color, { stroke: o.stroke, strokeThickness: o.strokeThickness }))
      .setOrigin(0.5);
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
