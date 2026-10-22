// Точка входа. Phaser подключён глобально из vendor/phaser.min.js.
import { GAME_WIDTH, GAME_HEIGHT, RENDER_ZOOM } from './data/constants.js';
import { installDebug } from './debug.js';
import { installOrientationOverlay } from './ui/orientation.js';
import { installCrispScaling } from './ui/scaling.js';
import { installTouchFullscreen } from './ui/fullscreen.js';
import { installTextAlign } from './ui/text-align.js';
import { BootScene } from './scenes/Boot.js';
import { MenuScene } from './scenes/Menu.js';
import { GameScene } from './scenes/Game.js';
import { LevelUpScene } from './scenes/LevelUp.js';
import { PauseScene } from './scenes/Pause.js';
import { GameOverScene } from './scenes/GameOver.js';
import { VictoryScene } from './scenes/Victory.js';
import { ChestScene } from './scenes/Chest.js';
import { LeaderboardScene } from './scenes/Leaderboard.js';

// Каждая сцена при старте получает камеру с origin (0, 0) и зумом RENDER_ZOOM: код сцен и UI работает
// в координатах 640×360, а холст в RENDER_ZOOM раз крупнее. init вызывается при каждом старте сцены, когда камеры уже созданы.
function zoomed(SceneClass) {
  const scene = new SceneClass();
  const ownInit = scene.init;
  scene.init = function init(data) {
    this.cameras.main.setOrigin(0, 0).setZoom(RENDER_ZOOM);
    if (ownInit) ownInit.call(this, data);
  };
  return scene;
}

installTextAlign();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH * RENDER_ZOOM,
  height: GAME_HEIGHT * RENDER_ZOOM,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { gamepad: true },
  scene: [
    BootScene, MenuScene, GameScene, LevelUpScene, PauseScene,
    GameOverScene, VictoryScene, ChestScene, LeaderboardScene,
  ].map(zoomed),
});

installDebug(game);
installOrientationOverlay();
installCrispScaling(game);
installTouchFullscreen(game);
