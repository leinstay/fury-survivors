// Анимация открытия сундука (экран сундука скиллов и экран лута босса): сундук трясётся и подпрыгивает,
// по истечении SHAKE_MS, клику или клавише исчезает, затем onOpen(). Вид сундука — CHEST_LOOK
// (src/data/pickups.js).
import { GAME_WIDTH } from '../data/constants.js';
import { CHEST_LOOK } from '../data/pickups.js';
import { spriteScale } from '../render/density.js';

const SHAKE_MS = 600;
const INPUT_GUARD_MS = 250; // клавиши, зажатые в момент открытия, не должны пропускать анимацию

/**
 * @param {!Phaser.Scene} scene
 * @param {string} look ключ CHEST_LOOK ('skill' | 'loot')
 * @param {function()} onOpen
 * @return {{opened: boolean, open: function()}} open() — открыть сразу (пропуск анимации)
 */
export function playChestOpen(scene, look, onOpen) {
  const cx = GAME_WIDTH / 2;
  const cy = 190;
  const tint = (CHEST_LOOK[look] || CHEST_LOOK.skill).tint;
  let chest;
  if (scene.textures.exists('chest')) {
    chest = scene.add.sprite(cx, cy + 20, 'chest', 0).setOrigin(0.5, 1).setScale(4 * spriteScale('chest'));
    if (tint !== null) chest.setTint(tint);
  } else {
    chest = scene.add.rectangle(cx, cy, 70, 56, tint !== null ? tint : 0xa0602a)
        .setStrokeStyle(2, 0x000000);
  }
  scene.tweens.add({
    targets: chest, angle: { from: -9, to: 9 }, duration: 70, yoyo: true,
    repeat: Math.floor(SHAKE_MS / 140) - 1,
  });
  scene.tweens.add({ targets: chest, y: chest.y - 8, duration: SHAKE_MS / 4, yoyo: true, repeat: 1,
    ease: 'Sine.easeOut' });
  const startAt = scene.time.now;
  const state = { opened: false, open: () => {} };
  const timer = scene.time.delayedCall(SHAKE_MS, () => state.open());
  const early = () => { if (scene.time.now - startAt > INPUT_GUARD_MS) state.open(); };
  state.open = () => {
    if (state.opened) return;
    state.opened = true;
    timer.remove(false);
    scene.input.keyboard.off('keydown', early);
    scene.input.off('pointerdown', early);
    scene.tweens.killTweensOf(chest);
    chest.destroy();
    onOpen();
  };
  scene.input.keyboard.on('keydown', early);
  scene.input.on('pointerdown', early);
  return state;
}
