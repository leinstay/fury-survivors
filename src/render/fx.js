// Эффекты «сочности»: числа урона, частицы, призраки умерших врагов, тряска, вспышка и кольцо levelup.
// Все пулы кольцевые и ограниченные (самые старые переиспользуются), поэтому без утечек и без просадок fps.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { GAME_WIDTH, GAME_HEIGHT, FX } from '../data/constants.js';
import { textStyle } from '../ui/style.js';
import { spriteScale } from './density.js';

const DEPTH_PARTICLE = 300000;
const DEPTH_TEXT = 400000;
const DEPTH_FLASH = 500000;

function makeTextures(scene) {
  const tx = scene.textures;
  if (!tx.exists('fx_px')) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
    g.generateTexture('fx_px', 2, 2);
    g.clear();
    g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
    g.generateTexture('fx_dot', 8, 8);
    g.clear();
    g.lineStyle(2, 0xffffff, 1).strokeCircle(32, 32, 30);
    g.generateTexture('fx_ring', 64, 64);
    g.clear();
    g.fillStyle(0xffffff, 1).fillEllipse(16, 8, 32, 16);
    g.generateTexture('fx_shadow', 32, 16);
    g.destroy();
  }
}

// Кольцевой пул: acquire() всегда возвращает объект, при переполнении перезаписывает самый старый.
class Ring {
  constructor(max, make) {
    this.max = max;
    this.make = make;
    this.items = [];
    this.head = 0;
  }

  acquire() {
    let it;
    if (this.items.length < this.max) {
      it = this.make();
      this.items.push(it);
    } else {
      it = this.items[this.head];
      this.head = (this.head + 1) % this.max;
    }
    return it;
  }
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    makeTextures(scene);
    this.shakeAmp = 0;
    this.shakeT = 0;
    this.shakeDur = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    const mkText = () => {
      const t = scene.add.text(0, 0, '', textStyle(FX.dmgText.size, FX.dmgText.color, {
        stroke: FX.dmgText.stroke, strokeThickness: 2,
      })).setOrigin(0.5, 1).setDepth(DEPTH_TEXT).setVisible(false);
      t.life = 0;
      return t;
    };
    this.texts = new Ring(FX.dmgText.max, mkText);

    this.particles = new Ring(FX.maxParticles, () => {
      const s = scene.add.image(0, 0, 'fx_px').setDepth(DEPTH_PARTICLE).setVisible(false);
      s.life = 0;
      return s;
    });

    this.ghosts = new Ring(FX.ghost.max, () => {
      const s = scene.add.sprite(0, 0, '__missing', 0).setVisible(false);
      s.life = 0;
      return s;
    });

    this.rings = new Ring(4, () => {
      const s = scene.add.image(0, 0, 'fx_ring').setDepth(DEPTH_PARTICLE).setVisible(false);
      s.life = 0;
      return s;
    });

    this.flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH_FLASH).setVisible(false);
    this.flashT = 0;
  }

  onEvents(events) {
    const pl = this.scene.sim.player;
    for (const ev of events) {
      switch (ev.type) {
        case 'hit': this._hit(ev); break;
        case 'kill': this._kill(ev); break;
        case 'playerHurt': this.shake(...FX.shake.hurt); break;
        case 'bossSpawn': this.shake(...FX.shake.boss); break;
        case 'pickup': this._burst(pl.x, pl.y - 6, FX.pickupSpark.count, FX.pickupSpark.speed, FX.pickupSpark.life, [FX.pickupSpark.color], 1); break;
        case 'levelup': this.pendingLevelup = true; break; // играется после закрытия меню (resume)
        default: break;
      }
    }
  }

  shake(amp, dur) {
    if (amp >= this.shakeAmp * (this.shakeT / this.shakeDur)) {
      this.shakeAmp = amp;
      this.shakeT = dur;
      this.shakeDur = dur;
    }
  }

  _hit(ev) {
    const c = FX.dmgText;
    const t = this.texts.acquire();
    const size = ev.crit ? c.critSize : c.size;
    if (t.fxSize !== size) { t.setFontSize(size); t.fxSize = size; }
    if (t.fxCrit !== !!ev.crit) { t.setColor(ev.crit ? c.critColor : c.color); t.fxCrit = !!ev.crit; }
    t.setText(String(ev.amount));
    t.life = c.life;
    t.baseX = Math.round(ev.x + (Math.random() - 0.5) * 10);
    t.baseY = Math.round(ev.y - 10);
    t.setPosition(t.baseX, t.baseY).setAlpha(1).setVisible(true);
    const s = FX.sparks;
    const n = s.min + Math.floor(Math.random() * (s.max - s.min + 1));
    this._burst(ev.x, ev.y - 4, n, s.speed, s.life, [ev.crit ? s.critColor : s.color], 1, 'fx_px');
  }

  _kill(ev) {
    const big = ev.boss ? 2 : ev.elite ? 1 : 0;
    const p = FX.puff;
    const count = big === 2 ? p.bossCount : big === 1 ? p.eliteCount : p.count;
    this._burst(ev.x, ev.y - 4, count, p.speed * (big ? 1.5 : 1), p.life, p.colors, big ? p.eliteSize : 1, 'fx_dot', p.size);
    if (big) this.shake(...(big === 2 ? FX.shake.boss : FX.shake.elite));
    this._ghost(ev);
  }

  _burst(x, y, n, speed, life, colors, sizeMul, tex = 'fx_px', size = 1) {
    for (let i = 0; i < n; i++) {
      const s = this.particles.acquire();
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      s.setTexture(tex);
      s.setTint(colors[Math.floor(Math.random() * colors.length)]);
      s.life = s.maxLife = life * (0.7 + Math.random() * 0.3);
      s.vx = Math.cos(a) * v;
      s.vy = Math.sin(a) * v;
      s.px = x;
      s.py = y;
      s.sz = (tex === 'fx_dot' ? size / 8 * (0.7 + Math.random() * 0.6) : 1) * sizeMul;
      s.setScale(s.sz).setAlpha(1).setPosition(Math.round(x), Math.round(y)).setVisible(true);
    }
  }

  _ghost(ev) {
    const key = ev.sprite;
    if (!key || !this.scene.textures.exists(key)) return;
    const g = this.scene.cameras.main;
    // вне экрана не рисуем
    if (ev.x < g.scrollX - 40 || ev.x > g.scrollX + GAME_WIDTH + 40 || ev.y < g.scrollY - 40 || ev.y > g.scrollY + GAME_HEIGHT + 40) return;
    const s = this.ghosts.acquire();
    const def = SPRITES[key];
    const o = def ? def.origin : [0.5, 0.5];
    if (s.texture.key !== key) s.setTexture(key, 0); else s.setFrame(0);
    s.setOrigin(o[0], o[1]);
    s.base = spriteScale(key) * (ev.elite ? FX.ghost.eliteScale : 1);
    s.life = s.maxLife = FX.ghost.life;
    s.setPosition(ev.x, ev.y).setDepth(ev.y + 0.5).setScale(s.base).setAlpha(1);
    s.setTintFill(0xffffff).setVisible(true);
  }

  // Вызывается Game при возврате из сцены LevelUp, пока она открыта, Game на паузе.
  playPending() {
    if (!this.pendingLevelup) return;
    this.pendingLevelup = false;
    this._levelup();
  }

  _levelup() {
    this.flashT = FX.levelup.flashTime;
    this.flash.setVisible(true).setAlpha(FX.levelup.flashAlpha);
    const r = this.rings.acquire();
    r.life = r.maxLife = FX.levelup.ringTime;
    r.setTint(FX.levelup.ringColor).setVisible(true);
  }

  update(dt) {
    // тряска: смещение камеры, которое world.js добавляет к scroll
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeAmp * (this.shakeT / this.shakeDur);
      this.offsetX = Math.round((Math.random() * 2 - 1) * k);
      this.offsetY = Math.round((Math.random() * 2 - 1) * k);
    } else {
      this.offsetX = this.offsetY = 0;
    }

    for (const t of this.texts.items) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.setVisible(false); continue; }
      const k = 1 - t.life / FX.dmgText.life;
      t.setPosition(t.baseX, Math.round(t.baseY - FX.dmgText.rise * Math.sqrt(k)));
      t.setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }

    for (const s of this.particles.items) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.setVisible(false); continue; }
      const d = Math.max(0, 1 - 6 * dt);
      s.vx *= d; s.vy *= d;
      s.px += s.vx * dt; s.py += s.vy * dt;
      const k = s.life / s.maxLife;
      s.setPosition(Math.round(s.px), Math.round(s.py)).setAlpha(k).setScale(s.sz * (0.5 + 0.5 * k));
    }

    const gc = FX.ghost;
    for (const s of this.ghosts.items) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.setVisible(false); s.clearTint(); continue; }
      const k = 1 - s.life / s.maxLife;
      if (k > 0.35) s.clearTint();
      s.setScale(s.base * (1 + (gc.stretchX - 1) * k), s.base * (1 - (1 - gc.squashY) * k));
      s.setAlpha(1 - k);
    }

    const pl = this.scene.sim.player;
    for (const r of this.rings.items) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.setVisible(false); continue; }
      const k = 1 - r.life / r.maxLife;
      r.setPosition(Math.round(pl.x), Math.round(pl.y - 6));
      r.setScale((0.1 + k * 0.9) * FX.levelup.ringRadius / 32).setAlpha(1 - k);
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.setVisible(false);
      else this.flash.setAlpha(FX.levelup.flashAlpha * this.flashT / FX.levelup.flashTime);
    }
  }
}
