// Жница на земле (src/core/reaper.js): освящённые круги, песочные часы, метка телепорта. Заглушка графикой:
// круги со свечением, пока нет спрайтов. Только читает sim.holy, sim.hourglasses и sim.reaper.tp.

const HOLY = 0xffe27a;      // золотой свет круга
const HOLY_EDGE = 0xfff4c0;
const SAND = 0xd8b070;      // зона часов
const SAND_EDGE = 0xf0d8a0;
const GLASS = 0xbfe8ff;
const BLINK = 0xb050ff;     // метка телепорта
const ENDING = 2;           // с до конца круга: мигает

export class ReaperFx {
  constructor(scene, depth) {
    this.ground = scene.add.graphics().setDepth(depth);
    this.glow = scene.add.graphics().setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  update(sim, time) {
    const g = this.ground;
    const l = this.glow;
    g.clear();
    l.clear();
    for (const c of sim.holy) this._holy(g, l, c, time);
    for (const h of sim.hourglasses) this._hourglass(g, h, time);
    const tp = sim.reaper && sim.reaper.tp;
    if (tp) this._blink(g, tp);
  }

  // Проявление (t < warn) как предупреждение босса: заливка растёт от центра к краю. Потом свет пульсирует;
  // в последние секунды круг мигает.
  _holy(g, l, c, time) {
    const r = c.radius;
    if (c.t < c.warn) {
      const k = c.t / c.warn;
      g.fillStyle(HOLY, 0.08 + 0.1 * k).fillCircle(c.x, c.y, r);
      g.fillStyle(HOLY, 0.2 + 0.15 * k).fillCircle(c.x, c.y, r * k);
      g.lineStyle(1, HOLY_EDGE, 0.5 + 0.4 * k).strokeCircle(c.x, c.y, r);
      return;
    }
    const left = c.life - c.t;
    if (left < ENDING && Math.floor(time * 8) % 2 === 0) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + c.uid);
    g.fillStyle(HOLY, 0.14 + 0.06 * pulse).fillCircle(c.x, c.y, r);
    l.fillStyle(HOLY, 0.08 + 0.05 * pulse).fillCircle(c.x, c.y, r * 0.75);
    l.fillStyle(HOLY, 0.08).fillCircle(c.x, c.y, r * 0.45);
    l.lineStyle(3, HOLY, 0.25 + 0.15 * pulse).strokeCircle(c.x, c.y, r + 1);
    g.lineStyle(1, HOLY_EDGE, 0.95).strokeCircle(c.x, c.y, r);
  }

  // Зона замедления и часы в центре (наступить на них — разбить).
  _hourglass(g, h, time) {
    g.fillStyle(SAND, 0.12).fillCircle(h.x, h.y, h.radius);
    g.lineStyle(1, SAND_EDGE, 0.6).strokeCircle(h.x, h.y, h.radius);
    const bob = Math.round(Math.sin(time * 4 + h.uid) * 1);
    const x = h.x;
    const y = h.y - 9 + bob;
    g.fillStyle(0x000000, 0.3).fillEllipse(h.x, h.y + 1, 12, 4);
    g.fillStyle(GLASS, 0.85);
    g.fillTriangle(x - 4, y - 6, x + 4, y - 6, x, y);
    g.fillTriangle(x - 4, y + 6, x + 4, y + 6, x, y);
    g.fillStyle(SAND, 1);
    g.fillTriangle(x - 3, y + 6, x + 3, y + 6, x, y + 2);
    g.lineStyle(1, 0x5a3a1a, 1);
    g.lineBetween(x - 5, y - 7, x + 5, y - 7);
    g.lineBetween(x - 5, y + 7, x + 5, y + 7);
  }

  // Место, где появится Жница: заливка растёт за delay.
  _blink(g, tp) {
    const k = Math.min(1, tp.t / tp.delay);
    const r = 24;
    g.fillStyle(BLINK, 0.12 + 0.12 * k).fillCircle(tp.x, tp.y, r);
    g.fillStyle(BLINK, 0.3 + 0.2 * k).fillCircle(tp.x, tp.y, r * k);
    g.lineStyle(1, 0xd8a0ff, 0.9).strokeCircle(tp.x, tp.y, r);
    g.lineBetween(tp.x - 6, tp.y - 6, tp.x + 6, tp.y + 6);
    g.lineBetween(tp.x - 6, tp.y + 6, tp.x + 6, tp.y - 6);
  }
}
