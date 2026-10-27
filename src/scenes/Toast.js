// Сцена плашек ачивок поверх всех экранов (src/ui/toast.js): по одной из очереди, выезжает сверху под
// полосу опыта, держится и уезжает. Ввода не принимает. Очередь пуста — сцена сама останавливается.
// Каждый кадр поднимается наверх: экраны, открытые после неё (LevelUp, сундук), плашку не закрывают.
import { TOAST, takeToast, drawAchievementToast } from '../ui/toast.js';
import { playSfx } from '../audio/sfx.js';

export class ToastScene extends Phaser.Scene {
  constructor() {
    super('Toast');
  }

  create() {
    this.cur = null;       // контейнер текущей плашки
    this.shownIds = [];    // показанные за жизнь сцены (window.__game.debug().toasts)
    this.wait = 0;         // мс до следующей плашки
    this.input.enabled = false;
  }

  _next() {
    const id = takeToast();
    if (!id) return false;
    this.shownIds.push(id);
    const c = drawAchievementToast(this, id);
    c.setY(-TOAST.h - 4);
    this.cur = c;
    playSfx(this, 'levelup');
    this.tweens.add({ targets: c, y: TOAST.y, duration: TOAST.slideMs, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c, y: -TOAST.h - 4, alpha: 0, delay: TOAST.slideMs + TOAST.showMs,
      duration: TOAST.slideMs, ease: 'Quad.easeIn',
      onComplete: () => {
        c.destroy();
        this.cur = null;
        this.wait = TOAST.gapMs;
      },
    });
    return true;
  }

  update(time, delta) {
    const mgr = this.sys.game.scene;
    if (mgr.getIndex('Toast') !== mgr.scenes.length - 1) this.scene.bringToTop();
    if (this.cur) return;
    this.wait -= delta;
    if (this.wait > 0) return;
    if (!this._next()) this.scene.stop();
  }
}
