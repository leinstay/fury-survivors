// Жница на земле (src/core/reaper.js): освящённые круги, песочные часы, метка телепорта. Заглушка графикой:
// круги со свечением, пока нет спрайтов. Только читает sim.holy, sim.hourglasses и sim.reaper.tp.
// Над часами таймер: секунды до пропуска числом и дуга вокруг; последние HOUR_ENDING с мигают красным.
// Пропуск (часы исчезли по таймеру) — красное кольцо расходится на месте часов. Оглушение (sim.reaper.stunT) —
// звёзды кружат над головой Жницы (заглушка иконки).
import { textStyle } from '../ui/style.js';

const HOLY = 0xffe27a;      // золотой свет круга
const HOLY_EDGE = 0xfff4c0;
const SAND = 0xd8b070;      // песок часов
const SAND_EDGE = 0xf0d8a0;
const MISS = 0xff4040;      // пропуск
const HOUR_ENDING = 3;      // с до пропуска: таймер мигает
const MISS_LIFE = 0.5;      // с кольца пропуска
const STUN = 0xfff070;      // звёзды оглушения
const TIMERS = 4;           // текстов таймера (кооп: часы перед каждым игроком)
const GLASS = 0xbfe8ff;
const BLINK = 0xb050ff;     // метка телепорта
const ENDING = 2;           // с до конца круга: мигает

export class ReaperFx {
  constructor(scene, depth) {
    this.ground = scene.add.graphics().setDepth(depth);
    this.glow = scene.add.graphics().setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.timers = [];
    for (let i = 0; i < TIMERS; i++) {
      this.timers.push(scene.add.text(0, 0, '', textStyle(10, '#f0d8a0', { stroke: '#1a1426', strokeThickness: 2 }))
          .setOrigin(0.5, 1).setDepth(depth + 2).setVisible(false));
    }
    this.seen = new Map(); // uid часов -> { x, y, left } прошлого кадра: пропуск, если исчезли с left ≈ 0
    this.misses = [];      // { x, y, at }
  }

  update(sim, time) {
    const g = this.ground;
    const l = this.glow;
    g.clear();
    l.clear();
    for (const c of sim.holy) this._holy(g, l, c, time);
    const now = new Set();
    sim.hourglasses.forEach((h, i) => {
      this._hourglass(g, h, time, this.timers[i]);
      now.add(h.uid);
      this.seen.set(h.uid, { x: h.x, y: h.y, left: h.life - h.t });
    });
    for (let i = sim.hourglasses.length; i < TIMERS; i++) this.timers[i].setVisible(false);
    for (const [uid, h] of this.seen) {
      if (now.has(uid)) continue;
      this.seen.delete(uid);
      if (h.left < 0.25) this.misses.push({ x: h.x, y: h.y, at: time });
    }
    this._misses(g, time);
    const tp = sim.reaper && sim.reaper.tp;
    if (tp) this._blink(g, tp);
    const r = sim.reaper;
    if (r && r.stunT > 0) this._stun(l, r.e, time);
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

  // Часы (наступить — разбить), дуга таймера вокруг и число секунд над ними.
  _hourglass(g, h, time, label) {
    const left = Math.max(0, h.life - h.t);
    const ending = left < HOUR_ENDING;
    const blink = ending && Math.floor(time * 6) % 2 === 0;
    const col = ending ? MISS : SAND_EDGE;
    const k = h.life > 0 ? left / h.life : 0;
    g.lineStyle(1, SAND, 0.35).strokeCircle(h.x, h.y - 8, 12);
    if (!blink) {
      g.lineStyle(2, col, 0.9).beginPath();
      g.arc(h.x, h.y - 8, 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, false);
      g.strokePath();
    }
    if (label) {
      label.setPosition(h.x, h.y - 22).setText(String(Math.ceil(left)))
          .setColor(ending ? '#ff6060' : '#f0d8a0').setVisible(!blink);
    }
    const bob = Math.round(Math.sin(time * 4 + h.uid) * 1);
    const x = h.x;
    const y = h.y - 8 + bob; // по центру кольца таймера
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

  // Пропуск: кольцо расходится и гаснет за MISS_LIFE с.
  _misses(g, time) {
    for (let i = this.misses.length - 1; i >= 0; i--) {
      const m = this.misses[i];
      const k = (time - m.at) / MISS_LIFE;
      if (k >= 1 || k < 0) { this.misses.splice(i, 1); continue; }
      g.lineStyle(2, MISS, 1 - k).strokeCircle(m.x, m.y - 8, 8 + 24 * k);
    }
  }

  // Оглушение: три звезды кружат над головой (e.size — радиус тела, фигура выше него).
  _stun(l, e, time) {
    const cx = e.x;
    const cy = e.y - e.size * 2.4;
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + (i * Math.PI * 2) / 3;
      const x = cx + Math.cos(a) * 12;
      const y = cy + Math.sin(a) * 4;
      l.fillStyle(STUN, 0.95).fillRect(x - 2, y - 0.5, 4, 1).fillRect(x - 0.5, y - 2, 1, 4);
    }
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
