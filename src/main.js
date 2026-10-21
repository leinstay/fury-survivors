// Точка входа. Phaser подключён глобально из vendor/phaser.min.js.
import { GAME_WIDTH, GAME_HEIGHT } from './data/constants.js';
import { installDebug } from './debug.js';
import BootScene from './scenes/Boot.js';
import MenuScene from './scenes/Menu.js';
import GameScene from './scenes/Game.js';
import LevelUpScene from './scenes/LevelUp.js';
import PauseScene from './scenes/Pause.js';
import GameOverScene from './scenes/GameOver.js';
import VictoryScene from './scenes/Victory.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { gamepad: true },
  scene: [BootScene, MenuScene, GameScene, LevelUpScene, PauseScene, GameOverScene, VictoryScene],
});

installDebug(game);
