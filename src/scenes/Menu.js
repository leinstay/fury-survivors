import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { textStyle, COLORS } from '../ui/style.js';
import { playMusic } from '../audio/sfx.js';
import { spriteScale } from '../render/density.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.nav = new FocusNav(this, { onBack: () => { if (this.view !== 'main') this.show('main'); } });
    this.objs = [];
    this.show('main');
    // Звук разблокируется первым жестом; Phaser сам запустит отложенную музыку. Повторный вход не перезапускает.
    playMusic(this);
  }

  update(time) {
    this.nav.update(time);
  }

  show(view) {
    this.view = view;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    const before = new Set(this.children.list);
    const cx = GAME_WIDTH / 2;

    this.add.text(cx, 62, t('game.title'), textStyle(32, COLORS.accent, { stroke: '#000000', strokeThickness: 6 })).setOrigin(0.5);

    if (view === 'main') {
      if (this.textures.exists('heroine')) this.add.sprite(cx + 150, 200, 'heroine', 0).setOrigin(0.5, 1).setScale(2 * spriteScale('heroine'));
      const bw = 160, bh = 30;
      addButton(this, this.nav, { x: cx, y: 150, w: bw, h: bh, label: t('menu.play'), onSelect: () => this.scene.start('Game') });
      addButton(this, this.nav, { x: cx, y: 190, w: bw, h: bh, label: t('menu.leaderboard'), onSelect: () => this.scene.start('Leaderboard') });
      addButton(this, this.nav, { x: cx, y: 230, w: bw, h: bh, label: t('menu.settings'), onSelect: () => this.show('settings') });
      this.add.text(GAME_WIDTH - 6, GAME_HEIGHT - 4, t('menu.version'), textStyle(8, '#777777')).setOrigin(1, 1);
      this.add.text(cx, GAME_HEIGHT - 14, t('menu.hint'), textStyle(10, COLORS.dim)).setOrigin(0.5);
    } else {
      this.add.text(cx, 108, t('settings.title'), textStyle(16)).setOrigin(0.5);
      addVolumeSliders(this, this.nav, { x: cx, y: 150, w: 300 });
      addButton(this, this.nav, { x: cx, y: 230, w: 120, h: 30, label: t('settings.back'), onSelect: () => this.show('main') });
    }
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(0);
  }
}
