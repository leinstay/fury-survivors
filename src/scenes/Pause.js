import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { textStyle } from '../ui/style.js';

export function addBuildList(scene, x, y, player) {
  scene.add.text(x, y, t('pause.build'), textStyle(14, '#ffd84a')).setOrigin(0, 0);
  let cy = y + 22;
  for (const [kind, title, list] of [
    ['weapon', t('pause.weapons'), player.weapons],
    ['passive', t('pause.passives'), player.passives],
  ]) {
    scene.add.text(x, cy, title, textStyle(10, '#aaaaaa')).setOrigin(0, 0);
    cy += 14;
    if (!list.length) {
      scene.add.text(x + 4, cy, t('pause.none'), textStyle(10, '#777777')).setOrigin(0, 0);
      cy += 16;
    }
    for (const it of list) {
      addIcon(scene, x + 8, cy + 7, iconKeyFor(kind, it.id), 14, kind, it.id);
      scene.add.text(x + 22, cy + 7, `${displayName(kind, it.id)}  ${t('levelup.lv', { n: it.level })}`, textStyle(10)).setOrigin(0, 0.5);
      cy += 16;
    }
    cy += 6;
  }
}

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  init(data) {
    this.sim = data.sim;
  }

  create() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, 28, t('pause.title'), textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    this.nav = new FocusNav(this, { onBack: () => this.resume() });
    const pad = readPad();
    this.padStart = !!(pad && pad.start);

    const cx = 170;
    addButton(this, this.nav, { x: cx, y: 90, w: 180, h: 30, label: t('pause.resume'), onSelect: () => this.resume() });
    addVolumeSliders(this, this.nav, { x: cx, y: 140, w: 280 });
    addButton(this, this.nav, { x: cx, y: 230, w: 180, h: 30, label: t('pause.quit'), onSelect: () => this.quit() });
    addBuildList(this, 340, 60, this.sim.player);

    this.input.keyboard.on('keydown-P', () => this.resume());
  }

  update(time) {
    this.nav.update(time);
    const pad = readPad();
    const start = !!(pad && pad.start);
    if (start && !this.padStart) this.resume();
    this.padStart = start;
  }

  resume() {
    this.scene.resume('Game');
    this.scene.stop();
  }

  quit() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
