// Плавный уход экрана поверх игры (выбор уровня, сундук, пауза): ввод выключается, экран гаснет за
// SIM.resumeDelay — столько же мир стоит после выбора, — потом сцена останавливается.
import { SIM } from '../data/constants.js';

/** @param {!Phaser.Scene} scene */
export function fadeOutAndStop(scene) {
  if (scene.input) scene.input.enabled = false;
  if (scene.input && scene.input.keyboard) scene.input.keyboard.enabled = false;
  scene.tweens.add({
    targets: scene.cameras.main, alpha: 0, duration: SIM.resumeDelay * 1000, ease: 'Quad.easeIn',
    onComplete: () => scene.scene.stop(),
  });
}

/**
 * Вызывать в начале create() экрана: Phaser переиспользует сцену, а прошлый уход оставил камеру прозрачной
 * и ввод выключенным.
 * @param {!Phaser.Scene} scene
 */
export function resetFade(scene) {
  scene.cameras.main.setAlpha(1);
  if (scene.input) scene.input.enabled = true;
  if (scene.input && scene.input.keyboard) scene.input.keyboard.enabled = true;
}
