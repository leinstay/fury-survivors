import { SPRITES } from '../../assets/sprites/manifest.js';
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';

// Грузит все спрайты из manifest.js как spritesheet и уходит в меню.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t('boot.loading'), {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5);

    for (const [key, s] of Object.entries(SPRITES)) {
      this.load.spritesheet(key, s.file, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    }
  }

  create() {
    this.scene.start('Menu');
  }
}
