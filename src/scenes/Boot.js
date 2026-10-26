import { SPRITES } from '../../assets/sprites/manifest.js';
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_ZOOM } from '../data/constants.js';
import { initAudio, preloadAudio } from '../audio/sfx.js';
import { FONT_NAME } from '../ui/style.js';

function loadFont() {
  if (typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
  const face = new FontFace(FONT_NAME, 'url(assets/fonts/Jersey15-Regular.ttf)', { weight: '400 700' });
  return face.load().then((f) => { document.fonts.add(f); return document.fonts.load(`16px "${FONT_NAME}"`); })
    .catch((e) => { console.error('font load failed', e); });
}

// Грузит все спрайты из manifest.js как spritesheet и уходит в меню.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    initAudio(this.game);
    preloadAudio(this);
    // Шрифт грузим параллельно с ассетами; create ждёт его.
    this.fontReady = loadFont();
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t('boot.loading'), {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', resolution: RENDER_ZOOM,
    }).setOrigin(0.5);

    for (const [key, s] of Object.entries(SPRITES)) {
      this.load.spritesheet(key, s.file, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    }
  }

  create() {
    for (const [key, s] of Object.entries(SPRITES)) {
      const tex = this.textures.get(key);
      // Число кадров по ширине ленты: художник доклеивает квадраты вправо, manifest не трогает.
      const w = tex.source[0].width;
      if (w % s.frameWidth) console.error(`sprite ${key}: width ${w} is not a multiple of frame ${s.frameWidth}`);
      s.frames = Math.max(1, Math.floor(w / s.frameWidth));
      // smooth: спрайт, который оружие сильно масштабирует (взмах), хранится крупнее показа и уменьшается линейно.
      if (s.smooth) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.fontReady.then(() => this.scene.start('Menu'));
  }
}
