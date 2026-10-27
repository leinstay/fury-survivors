// Плашки «Ачивка получена» в стиле Google Play Games: полоска по центру сверху под полосой опыта,
// кружок с кубком слева, «Achievement unlocked», название и постоянный бонус; выезжает сверху и уезжает.
// Рисует сцена Toast (src/scenes/Toast.js) поверх всех экранов, поэтому плашка видна и в забеге,
// и поверх LevelUp, сундука, паузы и итогов. Плашки идут по очереди.
import { ACHIEVEMENTS } from '../data/achievements.js';
import { GAME_WIDTH } from '../data/constants.js';
import { t } from '../i18n/index.js';
import { textStyle } from './style.js';
import { bonusText } from './items.js';

export const TOAST = {
  w: 250,
  h: 32,
  y: 16,          // верх плашки: под полосой опыта (HUD, высота 13.5)
  slideMs: 260,
  showMs: 3200,
  gapMs: 150,
};

const FILL = 0x202124;     // тёмная подложка, как у плашки Google Play Games
const EDGE = 0x3c4043;
const BADGE = 0x34a853;    // зелёный кружок
const BADGE_RING = 0x9be8b0;
const CUP = 0xffd84a;

// Кубок в кружке (процедурно, заглушка иконки ачивки): центр (cx, cy), радиус r.
function drawBadge(g, cx, cy, r) {
  g.fillStyle(0x000000, 0.35).fillCircle(cx + 1, cy + 1, r);
  g.fillStyle(BADGE, 1).fillCircle(cx, cy, r);
  g.lineStyle(1, BADGE_RING, 1).strokeCircle(cx, cy, r - 0.5);
  g.fillStyle(CUP, 1);
  g.fillRect(cx - 4, cy - 5, 8, 5);      // чаша
  g.fillRect(cx - 6, cy - 5, 2, 3);      // ручки
  g.fillRect(cx + 4, cy - 5, 2, 3);
  g.fillRect(cx - 1, cy, 2, 3);          // ножка
  g.fillRect(cx - 3, cy + 3, 6, 2);      // подставка
}

/**
 * Нарисовать плашку в сцене (контейнер с центром по x, верх по y = 0): id ачивки или свой текст
 * ({ head, name, bonus }, например лут босса).
 * @param {!Phaser.Scene} scene
 * @param {string|{head: string, name: string, bonus: string}} id
 * @return {!Phaser.GameObjects.Container}
 */
export function drawAchievementToast(scene, id) {
  const custom = typeof id === 'object' && id ? id : null;
  const { w, h } = TOAST;
  const c = scene.add.container(GAME_WIDTH / 2, 0);
  const g = scene.add.graphics();
  const L = -w / 2;
  g.fillStyle(0x000000, 0.4).fillRoundedRect(L + 2, 2, w, h, 8);
  g.fillStyle(EDGE, 1).fillRoundedRect(L, 0, w, h, 8);
  g.fillStyle(FILL, 1).fillRoundedRect(L + 1, 1, w - 2, h - 2, 7);
  drawBadge(g, L + h / 2 + 1, h / 2, h / 2 - 4);
  const tx = L + h + 4;
  const head = scene.add.text(tx, 4, custom ? custom.head : t('ach.unlocked'), textStyle(7, '#bdc1c6'))
      .setOrigin(0, 0);
  const name = scene.add.text(tx, 13, custom ? custom.name : t(`ach.${id}.name`), textStyle(10, '#ffffff'))
      .setOrigin(0, 0);
  const def = custom ? null : ACHIEVEMENTS[id];
  const bonus = custom ? custom.bonus || '' : def && def.bonus ? bonusText(def.bonus) : '';
  const right = w / 2 - 8;
  const b = scene.add.text(right, 15, bonus, textStyle(8, '#8cff6a')).setOrigin(1, 0);
  // длинное название: бонус уходит в строку заголовка справа
  if (name.x + name.width + 6 > b.x - b.width) b.setY(4).setFontSize(textStyle(7).fontSize);
  c.add([g, head, name, b]);
  return c;
}

// Очередь плашек: showAchievementToasts кладёт, сцена Toast забирает (takeToast).
const queue = [];

/** Следующая ачивка из очереди или null. */
export function takeToast() {
  return queue.length ? queue.shift() : null;
}

/**
 * Показать полученные ачивки (ids из recordRunAchievements, checkLiveAchievements, checkMetaAchievements).
 * Сцена-источник нужна только для доступа к менеджеру сцен.
 * @param {!Phaser.Scene} scene
 * @param {!Array<string>} ids
 */
export function showAchievementToasts(scene, ids) {
  if (!ids || !ids.length) return;
  for (const id of ids) if (ACHIEVEMENTS[id]) queue.push(id);
  wake(scene);
}

/**
 * Плашка со своим текстом (лут босса: предметы закреплены, выбор после забега).
 * @param {!Phaser.Scene} scene
 * @param {{head: string, name: string, bonus: string}} toast
 */
export function showToast(scene, toast) {
  queue.push(toast);
  wake(scene);
}

function wake(scene) {
  const mgr = scene.sys.game.scene;
  if (!mgr.getScene('Toast')) return;
  if (!mgr.isActive('Toast')) mgr.start('Toast');
  mgr.bringToTop('Toast');
}
