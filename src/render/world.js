// Синхронизация спрайтов с состоянием sim: пулы по uid, сортировка по y, вспышки, анимация.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { GAME_WIDTH, GAME_HEIGHT, FX, LOW_QUALITY } from '../data/constants.js';
import { ENEMIES } from '../data/enemies.js';
import { animateCharacter, applyHitSquash } from './anim.js';
import { Decor } from './decor.js';
import { Roads } from './roads.js';
import { spriteScale } from './density.js';
import { Zones } from './zones.js';
import { lowQuality } from '../ui/settings.js';

const PICKUP_DEPTH = -100000;
const PROJ_DEPTH = 200000;
const GROUND_DEPTH = -150000; // зоны на земле: над цветами и травой, под предметами и персонажами
const TELEGRAPH_DEPTH = GROUND_DEPTH + 1e4; // предупреждения об ударах босса

// Параметры свечения элит; цвет можно задать врагу в data (elite.glow).
const ELITE_GLOW = {
  color: 0xff3d6e, strength: 3, pulse: 0.35, pulseSpeed: 5,
  quality: 0.1, distance: 10, padding: 10,
};

function dropGlow(s) {
  s.preFX.remove(s.eliteGlow);
  s.eliteGlow = null;
}

// Мягкое круглое пятно (радиальный градиент) для свечения снарядов, белое: цвет задаёт tint.
const HALO_SIZE = 64;
function makeHalo(scene) {
  const tex = scene.textures.createCanvas('fx_halo', HALO_SIZE, HALO_SIZE);
  const ctx = tex.getContext();
  const r = HALO_SIZE / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, HALO_SIZE, HALO_SIZE);
  tex.refresh();
}

class Pool {
  constructor(scene, key) {
    this.scene = scene;
    this.active = new Map();
    this.free = [];
    this.stamp = 0;
  }

  acquire(key) {
    const s = this.free.pop() || this.scene.add.sprite(0, 0, key, 0);
    s.setVisible(true).setActive(true);
    return s;
  }

  // update(sprite, entity, isNew) вызывается для каждой живой сущности
  sync(list, key, update) {
    this.stamp++;
    for (const e of list) {
      let s = this.active.get(e.uid);
      const isNew = !s;
      if (!s) {
        s = this.acquire(key(e));
        s.uid = e.uid;
        this.active.set(e.uid, s);
      }
      s.stamp = this.stamp;
      update(s, e, isNew);
    }
    for (const [uid, s] of this.active) {
      if (s.stamp !== this.stamp) {
        this.active.delete(uid);
        s.setVisible(false).setActive(false);
        s.clearTint();
        s.tintState = 0;
        if (s.eliteGlow) dropGlow(s);
        this.free.push(s);
      }
    }
  }
}

export class World {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.time = 0;

    if (!scene.textures.exists('__missing')) {
      const g = scene.add.graphics();
      g.fillStyle(0xff00ff, 1).fillRect(0, 0, 8, 8);
      g.generateTexture('__missing', 8, 8);
      g.destroy();
    }

    this.bg = scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, this._tex('grass'), 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-1e7);

    this.roads = sim.roads ? new Roads(scene, sim.roads) : null;
    this.decor = new Decor(scene, sim.stageDef || { props: [] }, sim.roads);

    this.playerKey = sim.player.sprite || (sim.heroDef && sim.heroDef.sprite) || 'heroine';
    this.player = scene.add.sprite(sim.player.x, sim.player.y, this._tex(this.playerKey), 0);
    this._origin(this.player, this.playerKey);

    this.pools = {
      enemies: new Pool(scene),
      projectiles: new Pool(scene),
      glows: new Pool(scene),
      halos: new Pool(scene),
      pickups: new Pool(scene),
      props: new Pool(scene),
    };
    this.low = lowQuality(); // читается при старте забега: смена настройки в паузе применится со следующего
    scene.cameras.main.setRoundPixels(true);

    if (!scene.textures.exists('fx_shadow')) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1).fillEllipse(16, 8, 32, 16);
      g.generateTexture('fx_shadow', 32, 16);
      g.destroy();
    }
    this.shadows = [];
    this.shadowN = 0;
    this.telegraphGfx = scene.add.graphics().setDepth(TELEGRAPH_DEPTH);
    this.zones = new Zones(scene, GROUND_DEPTH);
    if (!scene.textures.exists('fx_halo')) makeHalo(scene);
    this.shake = { x: 0, y: 0 }; // смещение камеры от fx (тряска)
  }

  // Тень у ног: тёмный эллипс под спрайтом, пул по порядку обхода за кадр.
  _shadow(x, y, sprite, cam) {
    if (x < cam.scrollX - 40 || x > cam.scrollX + GAME_WIDTH + 40 ||
        y < cam.scrollY - 40 || y > cam.scrollY + GAME_HEIGHT + 60) {
      return;
    }
    const c = FX.shadow;
    let s = this.shadows[this.shadowN];
    if (!s) {
      s = this.scene.add.image(0, 0, 'fx_shadow').setTint(0x000000).setAlpha(c.alpha).setDepth(c.depth);
      this.shadows.push(s);
    }
    this.shadowN++;
    const def = SPRITES[sprite.spriteKey];
    const o = def && def.shadow; // своя тень: смещение по X (зеркалится с спрайтом) и ширина, px мира
    const w = o ? o.width : Math.max(8, sprite.width * Math.abs(sprite.baseScale || 1) * c.widthK);
    const sx = o ? x + o.dx * (sprite.flipX ? -1 : 1) : x;
    s.setVisible(true).setPosition(Math.round(sx), Math.round(y + c.yOffset))
        .setScale(w / 32, w * c.height / 16);
  }

  // Свечение элиты: glow-эффект WebGL вокруг силуэта, сам спрайт не перекрашивается. Сила пульсирует.
  // На низком качестве вместо шейдера простой аддитивный ореол под элитой (пул halos).
  _glow(s, e, time) {
    if (!s.preFX || this.low) return; // Canvas-рендер без эффектов
    const g = ELITE_GLOW;
    if (!s.eliteGlow) {
      const ed = ENEMIES[e.type] && ENEMIES[e.type].elite;
      s.preFX.setPadding(g.padding);
      s.eliteGlow = s.preFX.addGlow(ed && ed.glow !== undefined ? ed.glow : g.color,
          g.strength, 0, false, g.quality, g.distance);
    }
    s.eliteGlow.outerStrength = g.strength * (1 + g.pulse * Math.sin(time * g.pulseSpeed + e.uid));
  }

  _tex(key) {
    return key && this.scene.textures.exists(key) ? key : '__missing';
  }

  _origin(sprite, key) {
    const def = SPRITES[key];
    const o = def ? def.origin : [0.5, 0.5];
    sprite.setOrigin(o[0], o[1]);
  }

  // Приводит спрайт пула к нужному ключу (при переиспользовании мог быть другой тип).
  _setKey(s, key) {
    const k = this._tex(key);
    if (s.texture.key !== k) s.setTexture(k, 0);
    if (s.spriteKey !== key) { s.spriteKey = key; this._origin(s, key); }
  }

  _tint(s, flash, elite) {
    const state = flash ? 1 : 0;
    if (s.tintState === state) return;
    s.tintState = state;
    if (state === 1) s.setTintFill(0xffffff);
    else s.clearTint();
  }

  // Снаряды со свечением (FX.projGlow); список переиспользуется между кадрами. На низком качестве пусто.
  _glowing(list) {
    const out = this.glowList || (this.glowList = []);
    out.length = 0;
    if (this.low) return out;
    for (const p of list) if (!p.fx && FX.projGlow[p.sprite]) out.push(p);
    return out;
  }

  // Элиты для ореола на низком качестве.
  _elites(list) {
    const out = this.eliteList || (this.eliteList = []);
    out.length = 0;
    if (!this.low) return out;
    for (const e of list) if (e.elite && !e.dead) out.push(e);
    return out;
  }

  update(dt) {
    this.time += dt;
    const sim = this.sim;
    const time = this.time;
    const p = sim.player;

    // игрок
    const pl = this.player;
    pl.baseScale = spriteScale(this.playerKey);
    const lift = animateCharacter(pl, this.playerKey, p, time, 0);
    pl.setPosition(Math.round(p.x), Math.round(p.y) + lift);
    pl.setFlipX(p.facing < 0);
    pl.setDepth(p.y);
    pl.setAlpha(p.iframes > 0 && Math.floor(time * 16) % 2 === 0 ? 0.35 : 1);
    this._tint(pl, p.hurtFlash > 0, false);

    // камера и фон
    const cam = this.scene.cameras.main;
    cam.scrollX = Math.round(p.x - GAME_WIDTH / 2) + this.shake.x;
    cam.scrollY = Math.round(p.y - GAME_HEIGHT / 2) + this.shake.y;
    this.shadowN = 0;
    this._shadow(p.x, p.y, pl, cam);
    this.bg.tilePositionX = cam.scrollX;
    this.bg.tilePositionY = cam.scrollY;
    if (this.roads) this.roads.update(cam);
    this.decor.update(cam);

    this.pools.enemies.sync(sim.enemies, (e) => e.sprite || e.type, (s, e) => {
      const key = e.sprite || e.type;
      this._setKey(s, key);
      s.baseScale = (e.elite ? (e.def?.elite?.sizeMul ?? 1) : 1) * spriteScale(key);
      const lift2 = animateCharacter(s, key, e, time, e.uid);
      applyHitSquash(s, e.hitFlash);
      s.setPosition(Math.round(e.x), Math.round(e.y) + lift2);
      this._shadow(e.x, e.y, s, cam);
      s.setFlipX(e.facing < 0);
      s.setDepth(e.y);
      s.setAlpha(e.alpha == null ? 1 : e.alpha);
      this._tint(s, e.hitFlash > 0, e.elite);
      if (e.elite) this._glow(s, e, time);
      else if (s.eliteGlow) dropGlow(s);
    });
    for (let i = this.shadowN; i < this.shadows.length; i++) {
      if (!this.shadows[i].visible) break;
      this.shadows[i].setVisible(false);
    }
    const halo = LOW_QUALITY.eliteHalo;
    this.pools.halos.sync(this._elites(sim.enemies), () => 'fx_halo', (s, e, isNew) => {
      if (isNew) s.setBlendMode(Phaser.BlendModes.ADD);
      const ed = ENEMIES[e.type] && ENEMIES[e.type].elite;
      s.setPosition(Math.round(e.x), Math.round(e.y) - Math.round(e.size * 0.5));
      s.setScale((e.size * halo.size) / HALO_SIZE);
      s.setTint(ed && ed.glow !== undefined ? ed.glow : ELITE_GLOW.color).setAlpha(halo.alpha);
      s.setDepth(e.y - 1);
    });

    // предупреждения об ударах босса: заливка растёт от центра до края за delay
    const g = this.telegraphGfx;
    g.clear();
    for (const tg of sim.telegraphs) {
      const k = Math.min(1, tg.t / tg.delay);
      g.fillStyle(0xff2020, 0.12 + 0.12 * k).fillCircle(tg.x, tg.y, tg.radius);
      g.fillStyle(0xff2020, 0.3 + 0.2 * k).fillCircle(tg.x, tg.y, tg.radius * k);
      g.lineStyle(1, 0xff6060, 0.9).strokeCircle(tg.x, tg.y, tg.radius);
    }

    this.pools.projectiles.sync(sim.projectiles, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      const ang = e.angle || 0;
      const off = e.drawOff || 0;
      const lift = e.drawLift || 0;
      const px = e.x + Math.cos(ang) * off;
      const py = e.y + Math.sin(ang) * off - lift;
      s.setPosition(Math.round(px), Math.round(py));
      s.setRotation(ang);
      s.setScale((e.scale == null ? 1 : e.scale) * spriteScale(e.sprite));
      s.setAlpha(e.fx ? 0 : e.alpha == null ? 1 : e.alpha);
      if (s.projTint !== e.tint) {
        s.projTint = e.tint;
        if (e.tint) s.setTint(e.tint);
        else s.clearTint();
      }
      s.setDepth((SPRITES[e.sprite]?.layer === 'ground' ? GROUND_DEPTH : PROJ_DEPTH) + e.y);
    });
    const glow = FX.projGlow;
    this.pools.glows.sync(this._glowing(sim.projectiles), () => 'fx_halo', (s, e, isNew) => {
      const g = glow[e.sprite];
      if (isNew) s.setBlendMode(Phaser.BlendModes.ADD);
      s.setPosition(Math.round(e.x), Math.round(e.y));
      s.setScale((g.size * (e.scale == null ? 1 : e.scale)) / HALO_SIZE);
      s.setTint(e.tint || g.color).setAlpha(g.alpha * (e.alpha == null ? 1 : e.alpha));
      s.setDepth(PROJ_DEPTH + e.y - 0.5);
    });
    this.zones.draw(sim.projectiles, time);

    this.pools.pickups.sync(sim.pickups, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setScale(spriteScale(e.sprite));
      s.setPosition(Math.round(e.x), Math.round(e.y));
      s.setDepth(PICKUP_DEPTH + e.y);
    });

    this.pools.props.sync(sim.props, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setScale(spriteScale(e.sprite));
      s.setFlipX(!!e.angle && Math.cos(e.angle) < 0); // объект на дороге смотрит по её направлению
      s.setPosition(Math.round(e.x), Math.round(e.y));
      s.setDepth(e.y);
    });
  }
}
