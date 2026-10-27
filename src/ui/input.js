// Ввод игры: WASD/стрелки (8 направлений), геймпад, экранный джойстик на тач-устройствах.
// Джойстик — только касание пальцем (pointerType 'touch'): на ПК с тачскрином мышь им не управляет, иначе после
// потерянного отпускания (ПКМ, контекстное меню) герой бежал за курсором. Клавиши сбрасываются, когда окно теряет
// фокус или открывается контекстное меню: keyup туда не приходит, и клавиша залипала нажатой.
import { GAME_WIDTH, RENDER_ZOOM } from '../data/constants.js';
import { readPad } from './focus.js';
import { isMobile } from './settings.js';

const STICK_RADIUS = 36;
const DEADZONE = 0.2;

// Указатель в координатах экрана 640×360 (pointer.x/y — в пикселях холста 1280×720).
const sx = (p) => p.x / RENDER_ZOOM;
const sy = (p) => p.y / RENDER_ZOOM;

export class GameInput {
  // opts.isBlocked(x, y): true, если точка занята UI (джойстик там не стартует)
  constructor(scene, opts = {}) {
    this.scene = scene;
    // тач-раскладка (джойстик, кнопка паузы) — только где палец основной ввод (pointer: coarse), не на ПК
    // с тачскрином: там device.input.touch тоже true
    this.touch = isMobile();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.isBlocked = opts.isBlocked || (() => false);
    this.stick = { x: 0, y: 0 };
    this.pointerId = null;
    this.origin = null;

    // ПКМ в забеге не открывает меню браузера; потеря фокуса — все клавиши отпущены
    scene.input.mouse?.disableContextMenu();
    this.release = () => {
      scene.input.keyboard.resetKeys();
      this.pointerId = null;
      this.stick.x = this.stick.y = 0;
      if (this.gfx) this.gfx.clear();
    };
    window.addEventListener('blur', this.release);
    window.addEventListener('contextmenu', this.release);
    document.addEventListener('visibilitychange', this.release);

    if (this.touch) {
      if (scene.input.manager.pointersTotal < 3) scene.input.addPointer(2);   // менеджер общий для забегов
      this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(1e6 + 1);
      const up = (p) => {
        if (p.id !== this.pointerId) return;
        this.pointerId = null;
        this.stick.x = this.stick.y = 0;
        this.gfx.clear();
      };
      const finger = (p) => p.wasTouch || (p.event && p.event.pointerType === 'touch');
      scene.input.on('pointerdown', (p) => {
        if (!finger(p) || this.pointerId !== null || sx(p) > GAME_WIDTH / 2 ||
            this.isBlocked(sx(p), sy(p))) {
          return;
        }
        this.pointerId = p.id;
        this.origin = { x: sx(p), y: sy(p) };
        this._draw(sx(p), sy(p));
      });
      scene.input.on('pointermove', (p) => {
        if (p.id !== this.pointerId) return;
        if (!p.isDown) { up(p); return; } // отпускание потерялось — джойстик отпущен
        let dx = sx(p) - this.origin.x;
        let dy = sy(p) - this.origin.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
        this.stick.x = dx / STICK_RADIUS;
        this.stick.y = dy / STICK_RADIUS;
        this._draw(sx(p), sy(p));
      });
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
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
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
    window.removeEventListener('blur', this.release);
    window.removeEventListener('contextmenu', this.release);
    document.removeEventListener('visibilitychange', this.release);
    if (this.gfx) this.gfx.destroy();
  }
}
