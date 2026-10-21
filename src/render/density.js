// Масштаб спрайта в мире: 1 / density из manifest.js (спрайт density 2 рисуется в 0.5 и показывает все пиксели на холсте ×2).
import { SPRITES } from '../../assets/sprites/manifest.js';

export function spriteScale(key) {
  const s = SPRITES[key];
  return 1 / ((s && s.density) || 1);
}
