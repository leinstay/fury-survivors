import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { textStyle, COLORS } from '../ui/style.js';
import { stopMusic } from '../audio/sfx.js';
import { spriteScale } from '../render/density.js';
import { requestFullscreen } from '../ui/fullscreen.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { getSetting, setSetting } from '../ui/settings.js';

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

  // На телефоне Play разворачивает игру на весь экран (нужен жест пользователя, нажатие кнопки им и является).
  play(difficulty) {
    setSetting('difficulty', difficulty);
    requestFullscreen();
    this.scene.start('Game', { difficulty });
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
      addButton(this, this.nav, { x: cx, y: 150, w: bw, h: bh, label: t('menu.play'), onSelect: () => this.show('difficulty') });
      addButton(this, this.nav, { x: cx, y: 190, w: bw, h: bh, label: t('menu.leaderboard'), onSelect: () => this.scene.start('Leaderboard') });
      addButton(this, this.nav, { x: cx, y: 230, w: bw, h: bh, label: t('menu.settings'), onSelect: () => this.show('settings') });
      this.add.text(cx, GAME_HEIGHT - 14, t('menu.hint'), textStyle(10, '#dddddd', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
    } else if (view === 'difficulty') {
      // Выбор сложности перед забегом; последний выбор запоминается и стоит в фокусе.
      this.add.text(cx, 100, t('difficulty.title'), textStyle(16)).setOrigin(0.5);
      const ids = Object.keys(DIFFICULTIES);
      const last = getSetting('difficulty');
      ids.forEach((id, i) => {
        const cursed = id !== DEFAULT_DIFFICULTY;
        const y = 136 + i * 54;
        addButton(this, this.nav, {
          x: cx, y, w: 200, h: 30, label: t(`difficulty.${id}.name`), color: cursed ? COLORS.cursed : '#ffffff',
          onSelect: () => this.play(id),
        });
        this.add.text(cx, y + 22, t(`difficulty.${id}.desc`), textStyle(10, '#dddddd', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
      });
      addButton(this, this.nav, { x: cx, y: 136 + ids.length * 54 + 6, w: 120, h: 28, label: t('settings.back'), onSelect: () => this.show('main') });
      this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
      this.nav.focus(Math.max(0, ids.indexOf(last)));
      return;
    } else {
      this.add.text(cx, 100, t('settings.title'), textStyle(16)).setOrigin(0.5);
      const gap = 28;
      const rows = addVolumeSliders(this, this.nav, { x: cx, y: 126, w: 300, gap });
      addButton(this, this.nav, { x: cx, y: 126 + rows * gap + 8, w: 120, h: 30, label: t('settings.back'), onSelect: () => this.show('main') });
    }
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(0);
  }
}
