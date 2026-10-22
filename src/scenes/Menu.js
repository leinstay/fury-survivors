import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { textStyle, COLORS } from '../ui/style.js';
import { stopMusic } from '../audio/sfx.js';
import { spriteScale } from '../render/density.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.nav = new FocusNav(this, { onBack: () => { if (this.view !== 'main') this.show('main'); } });
    this.objs = [];
    // Фон шире экрана на несколько пикселей; позиция целая, чтобы клетки фона легли ровно на пиксели холста.
    if (this.textures.exists('menu_bg')) {
      const k = spriteScale('menu_bg');
      const img = this.textures.get('menu_bg').getSourceImage();
      this.add.image(Math.floor((GAME_WIDTH - img.width * k) / 2), Math.floor((GAME_HEIGHT - img.height * k) / 2), 'menu_bg').setOrigin(0, 0).setScale(k);
    }
    this.show('main');
    // В меню тишина: музыка играет только в забеге (выход из паузы в меню её обрывает).
    stopMusic();
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
      if (this.textures.exists('heroine_menu')) this.add.image(cx + 170, 318, 'heroine_menu').setOrigin(0.5, 1).setScale(spriteScale('heroine_menu'));
      const bw = 160;
      const bh = 30;
      addButton(this, this.nav, { x: cx, y: 150, w: bw, h: bh, label: t('menu.play'), onSelect: () => this.scene.start('Game') });
      addButton(this, this.nav, { x: cx, y: 190, w: bw, h: bh, label: t('menu.leaderboard'), onSelect: () => this.scene.start('Leaderboard') });
      addButton(this, this.nav, { x: cx, y: 230, w: bw, h: bh, label: t('menu.settings'), onSelect: () => this.show('settings') });
      this.add.text(cx, GAME_HEIGHT - 14, t('menu.hint'), textStyle(10, '#dddddd', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
    } else {
      this.add.text(cx, 108, t('settings.title'), textStyle(16)).setOrigin(0.5);
      addVolumeSliders(this, this.nav, { x: cx, y: 150, w: 300 });
      addButton(this, this.nav, { x: cx, y: 230, w: 120, h: 30, label: t('settings.back'), onSelect: () => this.show('main') });
    }
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(0);
  }
}
