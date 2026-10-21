// Процедурная анимация персонажей: ходьба кадрами 1/2, покачивание, наклон, парение летунов.
// Без частиц, чисел урона и тряски (это fx, этап 2).
import { SPRITES } from '../../assets/sprites/manifest.js';

const STEP_TIME = 0.16;

// Применяет позу к спрайту. e: сущность sim (moving), seed: стабильное число для фазы.
export function animateCharacter(sprite, key, e, time, seed) {
  const def = SPRITES[key];
  const frames = def ? def.frames : 1;
  const moving = !!e.moving;
  if (frames >= 3 && moving) {
    sprite.setFrame(1 + (Math.floor(time / STEP_TIME + seed) % 2));
  } else {
    sprite.setFrame(0);
  }
  const phase = time * (moving ? 14 : 3) + seed * 1.7;
  const flyer = def && def.shape === 'flyer';
  if (moving || flyer) {
    sprite.rotation = Math.sin(phase) * (flyer ? 0.05 : 0.07);
    const squash = Math.sin(phase * 2) * 0.04;
    sprite.scaleY = (sprite.baseScale || 1) * (1 + squash);
    sprite.scaleX = (sprite.baseScale || 1) * (1 - squash);
  } else {
    sprite.rotation = 0;
    sprite.scaleX = sprite.scaleY = sprite.baseScale || 1;
  }
  // flipX делает вызывающий; здесь только вертикальное парение
  return flyer ? Math.sin(time * 6 + seed) * 2 - 6 : 0;
}
