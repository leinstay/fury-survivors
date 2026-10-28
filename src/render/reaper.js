// Жница на земле (src/core/reaper.js): освящённые круги, песочные часы, метка телепорта. Круги — анимация
// святой земли (render/zones.js drawAura), почти белая с лёгкой желтизной; часы — графикой. Только читает sim.holy, sim.hourglasses и sim.reaper.tp.
// Над часами таймер: секунды до пропуска числом и дуга вокруг; последние HOUR_ENDING с мигают красным.
// Пропуск (часы исчезли по таймеру) — красное кольцо расходится на месте часов. Оглушение (sim.reaper.stunT) —
// звёзды кружат над головой Жницы (заглушка иконки).
import { textStyle } from '../ui/style.js';
import { drawAura } from './zones.js';
import { spriteScale } from './density.js';

const HOLY = 0xfffbe6;      // свет круга: почти белый, чуть тёплый
const HOLY_WAVE = 1.4;      // с на волну круга
const HOLY_GLOW = 0.6;      // яркость ауры (1 — как у святой земли)
const SAND = 0xd8b070;      // кольцо таймера часов
const SAND_EDGE = 0xf0d8a0;
const MISS = 0xff4040;      // пропуск
const HOUR_ENDING = 3;      // с до пропуска: таймер мигает
const MISS_LIFE = 0.5;      // с кольца пропуска
const STUN = 0xfff070;      // звёзды оглушения
const TIMERS = 4;           // текстов таймера (кооп: часы перед каждым игроком)
const BLINK = 0xb050ff;     // метка телепорта

export class ReaperFx {
  constructor(scene, depth) {
    this.ground = scene.add.graphics().setDepth(depth);
    this.glow = scene.add.graphics().setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.timers = [];
    this.glasses = []; // спрайты часов по центру кольца таймера
    for (let i = 0; i < TIMERS; i++) {
      this.glasses.push(scene.add.image(0, 0, 'hourglass').setScale(spriteScale('hourglass'))
          .setDepth(depth + 1).setVisible(false));
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
      this._hourglass(g, h, time, this.timers[i], this.glasses[i]);
      now.add(h.uid);
      this.seen.set(h.uid, { x: h.x, y: h.y, left: h.life - h.t });
    });
    for (let i = sim.hourglasses.length; i < TIMERS; i++) {
      this.timers[i].setVisible(false);
      this.glasses[i].setVisible(false);
    }
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

  // Проявление (t < warn): аура бледная и разгорается. Отключённый круг плавно гаснет.
  _holy(g, l, c, time) {
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (c.t < c.warn) {
      // проявление: аура бледная и разгорается, край тонкий
      const k = c.t / c.warn;
      drawAura(g, x, y, c.radius, HOLY, time, HOLY_WAVE, 0.25 + 0.5 * k);
      return;
    }
    // отключён (с Жницы снята доля HP): гаснет до конца жизни
    const a = c.off ? Math.max(0, (c.life - c.t) / Math.max(1e-6, c.life - c.offAt)) : 1;
    drawAura(g, x, y, c.radius, HOLY, time, HOLY_WAVE, a);
    drawAura(l, x, y, c.radius, HOLY, time + HOLY_WAVE / 4, HOLY_WAVE, HOLY_GLOW * a);
  }

  // Часы (наступить — разбить), дуга таймера вокруг и число секунд над ними.
  _hourglass(g, h, time, label, glass) {
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
    // спрайт часов по центру кольца, чуть покачивается
    const bob = Math.round(Math.sin(time * 4 + h.uid) * 1);
    g.fillStyle(0x000000, 0.3).fillEllipse(h.x, h.y + 2, 12, 4);
    if (glass) glass.setPosition(Math.round(h.x), Math.round(h.y - 8 + bob)).setVisible(true);
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
