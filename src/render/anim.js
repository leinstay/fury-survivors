// Анимация персонажей без поворота и дробного масштаба: пиксель-арт не пересэмплируется, не дрожит и не мылится.
// Спрайт с кадрами ходьбы (frames >= 2: кадр 0 стойка, 1..N-1 цикл шага) листает кадры.
// Однокадровый спрайт при ходьбе подпрыгивает на целые пиксели в такт шагам. Летуны парят, тоже по целым пикселям.
// Частицы, числа урона и тряска живут в fx.js.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { FX } from '../data/constants.js';

// Применяет позу к спрайту и возвращает вертикальное смещение (целые px мира, вверх отрицательное).
// e: сущность sim (moving, boss, pose), seed: стабильное число для фазы.
export function animateCharacter(sprite, key, e, time, seed) {
  const def = SPRITES[key];
  const frames = def ? def.frames : 1;
  const moving = !!e.moving;
  const base = sprite.baseScale || 1;
  const flyer = def && def.shape === 'flyer';
  const W = FX.walk;

  let lift = 0;
  if (frames >= 2 && moving) {
    const i = Math.floor(time * W.fps + seed);
    sprite.setFrame(def.walk ? def.walk[i % def.walk.length] : 1 + (i % (frames - 1)));
  } else {
    sprite.setFrame(0);
    if (flyer) lift = Math.round(Math.sin(time * W.hoverSpeed + seed) * W.hover) - W.hoverHeight;
    else if (moving) {
      // два шага на период: на каждом шаге приподнимается на hop px и опускается
      const step = Math.abs(Math.sin(time * W.steps * Math.PI + seed * 1.3));
      lift = -Math.round(step * W.hop);
    }
  }
  if (flyer && frames >= 2) {
    lift = Math.round(Math.sin(time * W.hoverSpeed + seed) * W.hover) - W.hoverHeight;
  }
  // Замах и каст босса: на пиксель приседает и подпрыгивает, без поворота.
  if (e.boss) {
    if (e.pose === 'windup') lift += FX.bossPose.windupDrop;
    else if (e.pose === 'cast') lift -= FX.bossPose.castLift;
  }
  sprite.rotation = 0;
  sprite.scaleX = base;
  sprite.scaleY = base;
  return lift;
}

// Сжатие при ударе: пока горит hitFlash, спрайт чуть приплюснут по вертикали.
export function applyHitSquash(sprite, flash) {
  if (!(flash > 0)) return;
  sprite.scaleX *= FX.hitSquash.x;
  sprite.scaleY *= FX.hitSquash.y;
}
