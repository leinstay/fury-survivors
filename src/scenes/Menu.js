import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, GAME_HEIGHT / 2 - 24, t('game.title'), {
      fontFamily: 'monospace', fontSize: '32px', color: '#ff7a3d',
    }).setOrigin(0.5);
    this.add.text(cx, GAME_HEIGHT / 2 + 16, t('menu.wip'), {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5);
    // Проверка, что заглушки грузятся: героиня под заголовком.
    if (this.textures.exists('heroine')) this.add.sprite(cx, GAME_HEIGHT - 40, 'heroine', 0).setOrigin(0.5, 1);
  }
}
