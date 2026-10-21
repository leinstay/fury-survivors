// Общая раскладка экранов GameOver / Victory.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from './focus.js';
import { textStyle } from './style.js';
import { formatTime } from './hud.js';
import { displayName } from './icons.js';

export function buildResults(scene, sim, { titleKey, titleColor }) {
  scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setOrigin(0, 0);
  scene.add.text(GAME_WIDTH / 2, 34, t(titleKey), textStyle(28, titleColor, { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);

  const rows = [
    [t('result.time'), formatTime(sim.time)],
    [t('result.level'), String(sim.player.level)],
    [t('result.kills'), String(sim.kills)],
  ];
  rows.forEach(([k, v], i) => {
    scene.add.text(GAME_WIDTH / 2 - 90, 80 + i * 20, k, textStyle(14, '#aaaaaa')).setOrigin(0, 0);
    scene.add.text(GAME_WIDTH / 2 + 90, 80 + i * 20, v, textStyle(14)).setOrigin(1, 0);
  });

  scene.add.text(GAME_WIDTH / 2, 150, t('result.damage'), textStyle(12, '#ffd84a')).setOrigin(0.5, 0);
  const dmg = Object.entries(sim.damageByWeapon || {}).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = Math.max(1, ...dmg.map((d) => d[1]));
  dmg.forEach(([id, v], i) => {
    const y = 170 + i * 14;
    scene.add.text(GAME_WIDTH / 2 - 130, y, displayName('weapon', id), textStyle(10)).setOrigin(0, 0);
    scene.add.rectangle(GAME_WIDTH / 2 - 10, y + 5, Math.max(1, Math.round(80 * v / max)), 6, 0xff7a3d).setOrigin(0, 0.5);
    scene.add.text(GAME_WIDTH / 2 + 130, y, String(Math.round(v)), textStyle(10)).setOrigin(1, 0);
  });

  const nav = new FocusNav(scene, {});
  addButton(scene, nav, {
    x: GAME_WIDTH / 2 - 80, y: 310, w: 130, h: 30, label: t('result.retry'),
    onSelect: () => { scene.scene.stop('Game'); scene.scene.start('Game'); },
  });
  addButton(scene, nav, {
    x: GAME_WIDTH / 2 + 80, y: 310, w: 130, h: 30, label: t('result.menu'),
    onSelect: () => { scene.scene.stop('Game'); scene.scene.start('Menu'); },
  });
  return nav;
}
