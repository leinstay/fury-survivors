// Плашки «Ачивка получена» сверху по центру: появляются по очереди и гаснут сами.
import { t } from '../i18n/index.js';
import { GAME_WIDTH } from '../data/constants.js';
import { textStyle } from './style.js';
import { addPanel } from './panel.js';
import { playSfx } from '../audio/sfx.js';

const W = 220;
const H = 30;
const SHOW_MS = 3200;

/**
 * Показать полученные ачивки (ids из recordRunAchievements / checkMetaAchievements).
 * @param {!Phaser.Scene} scene
 * @param {!Array<string>} ids
 */
export function showAchievementToasts(scene, ids) {
  if (!ids || !ids.length) return;
  ids.forEach((id, i) => {
    scene.time.delayedCall(i * 600, () => {
      if (!scene.sys || !scene.sys.isActive()) return;
      const y = 22 + (i % 4) * (H + 4);
      const cx = GAME_WIDTH / 2;
      const panel = addPanel(scene, cx, y, W, H).setDepth(2000);
      const a = scene.add.text(cx, y - 6, t('ach.unlocked'), textStyle(8, '#ffd84a')).setOrigin(0.5).setDepth(2001);
      const b = scene.add.text(cx, y + 6, t(`ach.${id}.name`), textStyle(11)).setOrigin(0.5).setDepth(2001);
      playSfx(scene, 'levelup');
      scene.tweens.add({
        targets: [panel.g, a, b], alpha: 0, delay: SHOW_MS, duration: 400,
        onComplete: () => { panel.destroy(); a.destroy(); b.destroy(); },
      });
    });
  });
}
