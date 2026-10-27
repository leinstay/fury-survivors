// Эффекты «сочности»: числа урона, частицы, призраки умерших врагов, тряска, вспышка и кольцо levelup,
// след за снарядами, блеск кристаллов опыта и искры над огнём (FX.trail, FX.twinkle, FX.embers).
// Все пулы кольцевые и ограниченные (самые старые переиспользуются), поэтому без утечек и без просадок fps.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { GAME_WIDTH, GAME_HEIGHT, FX, LOW_QUALITY, RENDER_ZOOM } from '../data/constants.js';
import { STATUS, DOT_TEXT } from '../data/status.js';
import { digitFont } from './digits.js';
import { spriteScale } from './density.js';
import { getSetting, lowQuality } from '../ui/settings.js';

const DEPTH_PARTICLE = 300000;
const DEPTH_TEXT = 400000;

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

    // числа урона — BitmapText на шрифте цифр (render/digits.js): без перерисовки канваса на каждое попадание
    const D = FX.dmgText;
    this.fonts = {
      hit: digitFont(scene, D.size, D.stroke, 2),
      crit: digitFont(scene, D.critSize, D.stroke, 2),
      dot: digitFont(scene, DOT_TEXT.size, D.stroke, 2),
    };
    this.tints = new Map();
    const mkText = () => {
      const t = scene.add.bitmapText(0, 0, this.fonts.hit, '').setOrigin(0.5, 1).setDepth(DEPTH_TEXT)
          .setScale(1 / RENDER_ZOOM).setVisible(false);
      t.life = 0;
      return t;
    };
    this.texts = new Ring(FX.dmgText.max, mkText);

    this.low = lowQuality(); // низкое качество: меньше частиц, без следа, блеска и искр
    this.particles = new Ring(this.low ? LOW_QUALITY.maxParticles : FX.maxParticles, () => {
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

    this.trailT = 0;
    this.twinkleT = 0;
    this.emberT = 0;
  }

  onEvents(events) {
    const sim = this.scene.sim;
    for (const ev of events) {
      switch (ev.type) {
        case 'hit': this._hit(ev); break;
        case 'dot': this._dot(ev); break;
        case 'kill': this._kill(ev); break;
        case 'playerHurt': this.shake(...FX.shake.hurt); break;
        case 'bossSpawn': this.shake(...FX.shake.boss); break;
        case 'bossRage': this.shake(...FX.shake.boss); break;
        case 'pickup': {
          const pl = sim.players[ev.player] || sim.player;
          const sp = FX.pickupSpark;
          this._burst(pl.x, pl.y - 6, sp.count, sp.speed, sp.life, [sp.color], 1);
          break;
        }
        case 'playerDown': this.shake(...FX.shake.boss); break;
        case 'revive': {
          const sp = FX.pickupSpark;
          this._burst(ev.x, ev.y - 6, sp.count * 3, sp.speed, sp.life, [sp.color], 1);
          break;
        }
        case 'levelup': this.pendingLevelup = true; break; // играется после закрытия меню (resume)
        default: break;
      }
    }
  }

  shake(amp, dur) {
    if (!getSetting('shake')) return;   // тряска отключается в настройках
    if (amp >= this.shakeAmp * (this.shakeT / this.shakeDur)) {
      this.shakeAmp = amp;
      this.shakeT = dur;
      this.shakeDur = dur;
    }
  }

  _hit(ev) {
    const c = FX.dmgText;
    const t = this.texts.acquire();
    const font = ev.crit ? this.fonts.crit : this.fonts.hit;
    this._number(t, font, ev.crit ? c.critColor : c.color, ev.amount);
    t.life = c.life;
    t.baseX = Math.round(ev.x + (Math.random() - 0.5) * 10);
    t.baseY = Math.round(ev.y - 10);
    t.setPosition(t.baseX, t.baseY).setAlpha(1).setVisible(true);
    const s = FX.sparks;
    const n = s.min + Math.floor(Math.random() * (s.max - s.min + 1));
    this._burst(ev.x, ev.y - 4, n, s.speed, s.life, [ev.crit ? s.critColor : s.color], 1, 'fx_px');
  }

  // Число урона: шрифт (размер), цвет тинтом, текст — всё дёшево у BitmapText; меняется только то, что другое.
  _number(t, font, color, amount) {
    if (t.fxFont !== font) { t.setFont(font); t.fxFont = font; }
    let tint = this.tints.get(color);
    if (tint === undefined) {
      tint = Phaser.Display.Color.HexStringToColor(color).color;
      this.tints.set(color, tint);
    }
    if (t.fxTint !== tint) { t.setTint(tint); t.fxTint = tint; }
    t.setText(String(amount));
  }

  // Тик ДоТа: число мельче (DOT_TEXT) цветом статуса (STATUS[type].text), без искр.
  _dot(ev) {
    const def = STATUS[ev.status];
    const t = this.texts.acquire();
    this._number(t, this.fonts.dot, def ? def.text : FX.dmgText.color, ev.amount);
    t.life = FX.dmgText.life;
    t.baseX = Math.round(ev.x + (Math.random() - 0.5) * 12);
    t.baseY = Math.round(ev.y - 6);
    t.setPosition(t.baseX, t.baseY).setAlpha(1).setVisible(true);
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
    if (ev.x < g.scrollX - 40 || ev.x > g.scrollX + GAME_WIDTH + 40 ||
        ev.y < g.scrollY - 40 || ev.y > g.scrollY + GAME_HEIGHT + 40) {
      return;
    }
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
    const r = this.rings.acquire();
    r.life = r.maxLife = FX.levelup.ringTime;
    r.setTint(FX.levelup.ringColor).setVisible(true);
  }

  // Частица без разлёта: стоит на месте (или поднимается на rise px) и гаснет.
  _mote(x, y, color, life, rise = 0) {
    const s = this.particles.acquire();
    s.setTexture('fx_px').setTint(color);
    s.life = s.maxLife = life;
    s.vx = 0; s.vy = -rise / life;
    s.px = x; s.py = y;
    s.sz = 1;
    s.setScale(1).setAlpha(1).setPosition(Math.round(x), Math.round(y)).setVisible(true);
  }

  // След, блеск, искры: по таймерам, на ограниченное число объектов за раз.
  _ambient(dt) {
    if (this.low) return;
    const sim = this.scene.sim;
    if ((this.trailT -= dt) <= 0) {
      this.trailT = FX.trail.every;
      let n = 0;
      for (const p of sim.projectiles) {
        if (n >= FX.trail.max) break;
        if (p.owner !== 'player' || p.fx || (p.vx * p.vx + p.vy * p.vy) < 100 * 100) continue;
        this._mote(p.x, p.y, p.tint || 0xffffff, FX.trail.life);
        n++;
      }
    }
    if ((this.twinkleT -= dt) <= 0 && sim.pickups.length) {
      this.twinkleT = FX.twinkle.every;
      const g = sim.pickups[Math.floor(Math.random() * sim.pickups.length)];
      if (g.sprite && g.sprite.startsWith('xp_')) this._mote(g.x + (Math.random() - 0.5) * 6, g.y - 3 - Math.random() * 5, FX.twinkle.color, FX.twinkle.life, 3);
    }
    if ((this.emberT -= dt) <= 0) {
      this.emberT = FX.embers.every;
      for (const p of sim.projectiles) {
        if (p.fx !== 'fire') continue;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * p.radius;
        const c = FX.embers.colors;
        this._mote(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
            p.tint || c[Math.floor(Math.random() * c.length)], FX.embers.life, FX.embers.rise);
      }
    }
  }

  update(dt) {
    this._ambient(dt);
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
      s.setPosition(Math.round(s.px), Math.round(s.py))
          .setAlpha(k).setScale(s.sz * (0.5 + 0.5 * k));
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

    const pl = this.scene.sim.view;
    for (const r of this.rings.items) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.setVisible(false); continue; }
      const k = 1 - r.life / r.maxLife;
      r.setPosition(Math.round(pl.x), Math.round(pl.y - 6));
      r.setScale((0.1 + k * 0.9) * FX.levelup.ringRadius / 32).setAlpha(1 - k);
    }
  }
}
