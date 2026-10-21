// Общая раскладка экранов GameOver / Victory.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from './focus.js';
import { textStyle } from './style.js';
import { formatTime } from './hud.js';
import { displayName, addIcon, iconKeyFor } from './icons.js';
import { addPanel } from './panel.js';

const CONFETTI = [0xffd84a, 0xff7a3d, 0x4fc3ff, 0xff6fb0, 0x8cff6a, 0xffffff];

function addConfetti(scene) {
  for (let i = 0; i < 44; i++) {
    const w = 3 + Math.floor(Math.random() * 3);
    const r = scene.add.rectangle(Math.random() * GAME_WIDTH, -10, w, w + 2, CONFETTI[i % CONFETTI.length]);
    scene.tweens.add({
      targets: r,
      y: GAME_HEIGHT + 10,
      x: r.x + (Math.random() - 0.5) * 60,
      angle: 360 * (Math.random() < 0.5 ? -1 : 1),
      duration: 2500 + Math.random() * 2500,
      delay: Math.random() * 3000,
      repeat: -1,
    });
  }
}

export function buildResults(scene, sim, { titleKey, titleColor, confetti = false }) {
  scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setOrigin(0, 0);
  addPanel(scene, GAME_WIDTH / 2, 175, 370, 336);
  if (confetti) addConfetti(scene);
  scene.add.text(GAME_WIDTH / 2, 36, t(titleKey), textStyle(28, titleColor, { stroke: '#000000', strokeThickness: 5 })).setOrigin(0.5);

  const rows = [
    [t('result.time'), formatTime(sim.time)],
    [t('result.level'), String(sim.player.level)],
    [t('result.kills'), String(sim.kills)],
  ];
  rows.forEach(([k, v], i) => {
    scene.add.text(GAME_WIDTH / 2 - 90, 80 + i * 20, k, textStyle(14, '#aaaaaa')).setOrigin(0, 0);
    scene.add.text(GAME_WIDTH / 2 + 90, 80 + i * 20, v, textStyle(14)).setOrigin(1, 0);
  });

  scene.add.text(GAME_WIDTH / 2, 148, t('result.damage'), textStyle(12, '#ffd84a')).setOrigin(0.5, 0);
  const dmg = Object.entries(sim.damageByWeapon || {}).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = Math.max(1, ...dmg.map((d) => d[1]));
  dmg.forEach(([id, v], i) => {
    const y = 172 + i * 17;
    addIcon(scene, GAME_WIDTH / 2 - 150, y + 7, iconKeyFor('weapon', id), 14, 'weapon', id);
    scene.add.text(GAME_WIDTH / 2 - 138, y, displayName('weapon', id), textStyle(10)).setOrigin(0, 0);
    scene.add.rectangle(GAME_WIDTH / 2 + 2, y + 7, Math.max(1, Math.round(80 * v / max)), 6, 0xff7a3d).setOrigin(0, 0.5);
    scene.add.text(GAME_WIDTH / 2 + 150, y, String(Math.round(v)), textStyle(10)).setOrigin(1, 0);
  });

  const nav = new FocusNav(scene, {});
  addButton(scene, nav, {
    x: GAME_WIDTH / 2 - 80, y: 316, w: 130, h: 28, label: t('result.retry'),
    onSelect: () => { scene.scene.stop('Game'); scene.scene.start('Game'); },
  });
  addButton(scene, nav, {
    x: GAME_WIDTH / 2 + 80, y: 316, w: 130, h: 28, label: t('result.menu'),
    onSelect: () => { scene.scene.stop('Game'); scene.scene.start('Menu'); },
  });
  return nav;
}
