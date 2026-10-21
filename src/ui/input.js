// Ввод игры: WASD/стрелки (8 направлений), геймпад, экранный джойстик на тач-устройствах.
import { GAME_WIDTH } from '../data/constants.js';
import { readPad } from './focus.js';

const STICK_RADIUS = 36;
const DEADZONE = 0.2;

export class GameInput {
  // opts.isBlocked(x, y): true, если точка занята UI (джойстик там не стартует)
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.touch = !!scene.sys.game.device.input.touch;
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.isBlocked = opts.isBlocked || (() => false);
    this.stick = { x: 0, y: 0 };
    this.pointerId = null;
    this.origin = null;

    if (this.touch) {
      scene.input.addPointer(2);
      this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(1e6 + 1);
      scene.input.on('pointerdown', (p) => {
        if (this.pointerId !== null || p.x > GAME_WIDTH / 2 || this.isBlocked(p.x, p.y)) return;
        this.pointerId = p.id;
        this.origin = { x: p.x, y: p.y };
        this._draw(p.x, p.y);
      });
      scene.input.on('pointermove', (p) => {
        if (p.id !== this.pointerId) return;
        let dx = p.x - this.origin.x;
        let dy = p.y - this.origin.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
        this.stick.x = dx / STICK_RADIUS;
        this.stick.y = dy / STICK_RADIUS;
        this._draw(p.x, p.y);
      });
      const up = (p) => {
        if (p.id !== this.pointerId) return;
        this.pointerId = null;
        this.stick.x = this.stick.y = 0;
        this.gfx.clear();
      };
      scene.input.on('pointerup', up);
      scene.input.on('pointerupoutside', up);
    }
  }

  _draw(px, py) {
    const g = this.gfx;
    const o = this.origin;
    g.clear();
    g.lineStyle(2, 0xffffff, 0.4).strokeCircle(o.x, o.y, STICK_RADIUS);
    let dx = px - o.x;
    let dy = py - o.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
    g.fillStyle(0xffffff, 0.5).fillCircle(o.x + dx, o.y + dy, 14);
  }

  // Вектор движения длиной 0..1.
  read() {
    const k = this.keys;
    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (x !== 0 || y !== 0) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    const pad = readPad();
    if (pad) {
      const l = Math.hypot(pad.x, pad.y);
      if (l > DEADZONE) {
        const s = Math.min(1, (l - DEADZONE) / (1 - DEADZONE)) / l;
        return { x: pad.x * s, y: pad.y * s };
      }
    }
    const sl = Math.hypot(this.stick.x, this.stick.y);
    if (sl > DEADZONE) return { x: this.stick.x, y: this.stick.y };
    return { x: 0, y: 0 };
  }

  destroy() {
    if (this.gfx) this.gfx.destroy();
  }
}
