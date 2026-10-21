// Процедурная анимация персонажей. Однокадровые спрайты (общий лист roster) ходят вразвалку, как в
// Vampire Survivors: плавное покачивание из стороны в сторону вокруг ног и мягкое сжатие в такт, без подскока.
// В покое лёгкое дыхание.
// Многокадровые (frames >= 3) по-прежнему чередуют кадры 1/2. Летуны парят.
// Частицы, числа урона и тряска живут в fx.js.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { FX } from '../data/constants.js';

const STEP_TIME = 0.16;

// Применяет позу к спрайту и возвращает вертикальное смещение (px мира, вверх отрицательное).
// e: сущность sim (moving, boss, pose), seed: стабильное число для фазы.
export function animateCharacter(sprite, key, e, time, seed) {
  const def = SPRITES[key];
  const frames = def ? def.frames : 1;
  const moving = !!e.moving;
  const base = sprite.baseScale || 1;
  const flyer = def && def.shape === 'flyer';
  const W = FX.walk;

  if (frames >= 3 && moving) sprite.setFrame(1 + (Math.floor(time / STEP_TIME + seed) % 2));
  else sprite.setFrame(0);

  let rot = 0, sx = 1, sy = 1, lift = 0;
  if (flyer) {
    const ph = time * 6 + seed;
    rot = Math.sin(ph * 0.5) * 0.05;
    lift = Math.sin(ph) * 2 - 6;
    if (moving) rot += Math.sin(time * W.steps * Math.PI + seed) * W.tilt * 0.5;
  } else if (moving) {
    // один период синуса = два шага: качнулась влево, качнулась вправо; на каждом шаге чуть осела
    const ph = time * W.steps * Math.PI + seed * 1.3;
    rot = Math.sin(ph) * W.tilt;
    const settle = Math.abs(Math.cos(ph)); // 1 в момент смены ноги
    sy = 1 - settle * W.squash;
    sx = 1 + settle * W.squash * 0.5;
    lift = -(1 - settle) * W.hop;
  } else {
    const b = Math.sin(time * 3 + seed * 1.7) * W.idleBreath;
    sy = 1 + b;
    sx = 1 - b * 0.5;
  }
  if (e.boss && frames < 3) {
    if (e.pose === 'windup') rot += FX.bossPose.windupTilt * (sprite.flipX ? -1 : 1);
    else if (e.pose === 'cast') { sy *= 1 + FX.bossPose.castStretch; sx *= 1 - FX.bossPose.castStretch * 0.5; }
  } else if (e.boss && frames >= 3 && (e.pose === 'cast' || e.pose === 'windup')) {
    sprite.setFrame(2);
  }
  sprite.rotation = rot;
  sprite.scaleX = base * sx;
  sprite.scaleY = base * sy;
  return lift;
}

// Сжатие при ударе: пока горит hitFlash, спрайт чуть приплюснут по вертикали.
export function applyHitSquash(sprite, flash) {
  if (!(flash > 0)) return;
  sprite.scaleX *= FX.hitSquash.x;
  sprite.scaleY *= FX.hitSquash.y;
}
