// Зоны на земле, нарисованные слоями вместо растянутого спрайта (как чеснок в Vampire Survivors):
//   aura  — святая земля: полупрозрачный диск, светлый край и волны от центра к краю в такт удару (rehit);
//   boom  — взрыв бомбы: вспышка, расходящаяся к краю за время жизни;
//   fire  — огонь на земле: мерцающий диск с краем, гаснет к концу.
// Цвет — tint снаряда (супероружие) или цвет зоны по умолчанию из FX.zones.
import { FX } from '../data/constants.js';

export class Zones {
  constructor(scene, depth) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  draw(projectiles, time) {
    const g = this.g;
    const Z = FX.zones;
    g.clear();
    for (const p of projectiles) {
      if (!p.fx) continue;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (p.fx === 'aura') {
        const c = p.tint || Z.aura.color;
        const r = p.radius * (1 + Z.aura.breathe * Math.sin(time * Z.aura.breatheSpeed));
        g.fillStyle(c, Z.aura.fill).fillCircle(x, y, r);
        g.fillStyle(c, Z.aura.core).fillCircle(x, y, r * 0.55);
        // волны: две, со сдвигом в полпериода удара
        const period = p.rehit > 0 ? p.rehit * Z.aura.wavesPerHit : 1;
        for (let i = 0; i < 2; i++) {
          const k = ((time / period) + i * 0.5) % 1;
          g.lineStyle(Z.aura.waveWidth, c, Z.aura.wave * (1 - k))
              .strokeCircle(x, y, r * (0.2 + 0.8 * k));
        }
        g.lineStyle(Z.aura.rimWidth, c, Z.aura.rim).strokeCircle(x, y, r);
      } else if (p.fx === 'boom') {
        const k = 1 - p.life / (p.life0 || 1);
        const c = p.tint || Z.boom.color;
        g.fillStyle(Z.boom.core, Z.boom.alpha * (1 - k))
            .fillCircle(x, y, p.radius * (0.3 + 0.5 * k));
        g.fillStyle(c, Z.boom.alpha * 0.6 * (1 - k)).fillCircle(x, y, p.radius * (0.5 + 0.5 * k));
        g.lineStyle(2, c, 1 - k).strokeCircle(x, y, p.radius * (0.6 + 0.4 * k));
      } else if (p.fx === 'fire') {
        const c = p.tint || Z.fire.color;
        const fade = Math.min(1, p.life / Z.fire.fadeOut);
        const flicker = 1 + Z.fire.flicker * Math.sin(time * 17 + p.uid);
        g.fillStyle(c, Z.fire.fill * fade * flicker).fillCircle(x, y, p.radius);
        g.fillStyle(Z.fire.core, Z.fire.fill * 0.8 * fade)
            .fillCircle(x, y, p.radius * 0.45 * flicker);
        g.lineStyle(1, c, Z.fire.rim * fade).strokeCircle(x, y, p.radius);
      }
    }
  }
}
