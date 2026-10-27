// Синхронизация спрайтов с состоянием sim: пулы по uid, сортировка по y, вспышки, анимация.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { GAME_WIDTH, GAME_HEIGHT, FX, LOW_QUALITY, RENDER_ZOOM } from '../data/constants.js';
import { ENEMIES } from '../data/enemies.js';
import { animateCharacter, applyHitSquash } from './anim.js';
import { Decor } from './decor.js';
import { Roads } from './roads.js';
import { spriteScale } from './density.js';
import { Zones } from './zones.js';
import { ReaperFx } from './reaper.js';
import { lowQuality, getSetting } from '../ui/settings.js';

// Позиции и камера округляются в пиксели экрана (1 / RENDER_ZOOM пикселя мира) одним способом: тогда разница
// «спрайт минус камера» меняется только монотонно. Раньше камера (середина между игроками) и спрайты
// округлялись до пикселей мира каждый сам по себе, и при высоком fps герой дрожал на пиксель туда-обратно.
const snap = (v) => Math.round(v * RENDER_ZOOM) / RENDER_ZOOM;
const LERP_MAX = 40; // px за тик: дальше — перенос (спавн, телепорт), такое не сглаживаем

const PICKUP_DEPTH = -100000;
const PROJ_DEPTH = 200000;
const GROUND_DEPTH = -150000; // зоны на земле: над цветами и травой, под предметами и персонажами
const TELEGRAPH_DEPTH = GROUND_DEPTH + 1e4; // предупреждения об ударах босса
const REAPER_DEPTH = GROUND_DEPTH + 5e3;    // круги и часы Жницы: под предупреждениями
// враг под статусами не подкрашивается (решение владельца): ДоТ виден по числам тиков (fx.js)

// Параметры свечения элит; цвет можно задать врагу в data (elite.glow).
const ELITE_GLOW = {
  color: 0xff3d6e, strength: 3, pulse: 0.35, pulseSpeed: 5,
  quality: 0.1, distance: 10, padding: 10,
};

// Щит на орбите проходит за своим героем, когда он выше ног героя и ближе этого по x (полуширина героя +
// радиус шара); в остальное время рисуется поверх всего, как прочие снаряды.
const ORBIT_BEHIND_DX = 22;

// Свечение своего героя (настройка heroGlow): как у элит, только белое.
const HERO_GLOW = { ...ELITE_GLOW, color: 0xffffff, strength: 2 };

function dropGlow(s) {
  s.preFX.remove(s.eliteGlow);
  s.eliteGlow = null;
}

// Мягкое круглое пятно (радиальный градиент) для свечения снарядов, белое: цвет задаёт tint.
const HALO_SIZE = 64;
const COFFIN_Y = 4; // гроб стоит чуть ниже точки игрока (дно спрайта)

// Гроб игрока в коопе: деревянный ящик с крестом, 16×20 (генерируется, спрайта нет).
function makeCoffin(scene) {
  const g = scene.add.graphics();
  g.fillStyle(0x3a2416, 1).fillRect(0, 0, 16, 20);
  g.fillStyle(0x6b4423, 1).fillRect(1, 1, 14, 18);
  g.fillStyle(0x8a5a2e, 1).fillRect(2, 2, 12, 2);
  g.fillStyle(0xd9c7a0, 1).fillRect(7, 5, 2, 11).fillRect(4, 8, 8, 2);
  g.generateTexture('fx_coffin', 16, 20);
  g.destroy();
}

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
        s.tintBase = 0;
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

    this.playerKey = sim.player.sprite;
    if (!scene.textures.exists('fx_coffin')) makeCoffin(scene);
    // спрайт на игрока (кооп: у каждого свой герой, p.sprite); мёртвый игрок рисуется гробом
    this.playerSprites = sim.players.map((p) => {
      const key = p.sprite || this.playerKey;
      const sp = scene.add.sprite(p.x, p.y, this._tex(key), 0);
      sp.heroKey = key;
      this._origin(sp, key);
      sp.coffin = false;
      return sp;
    });
    this.player = this.playerSprites[0];

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
    this.launched = new Map(); // uid снаряда -> { t, a }: вылет из героя (_launchStart)
    this.zones = new Zones(scene, GROUND_DEPTH, PROJ_DEPTH + 9e4); // слэш клинка над персонажами и снарядами
    this.reaperFx = new ReaperFx(scene, REAPER_DEPTH);
    if (!scene.textures.exists('fx_halo')) makeHalo(scene);
    this.shake = { x: 0, y: 0 }; // смещение камеры от fx (тряска)
    this.predict = null;         // { i, x, y, face, moving } — свой герой по своему вводу (Game._predict)
    this.drawnX = [];            // где нарисован герой i в этом кадре (NaN для гроба)
    this.drawnY = [];
    this.alpha = 1;              // доля шага между прошлым и текущим тиком: сущности рисуются между ними
    this.ix = 0;                 // результат _lerp
    this.iy = 0;
    this.localView = {};         // свой герой для анимации: moving по вводу, а не по симу
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
    const scale = Math.abs(sprite.baseScale || 1);
    // своя ширина задана для обычного размера: элита крупнее (sizeMul), тень растёт вместе с ней
    const w = o ? o.width * scale * ((def && def.density) || 1) :
        Math.max(8, sprite.width * scale * c.widthK);
    const sx = o ? x + o.dx * (sprite.flipX ? -1 : 1) : x;
    s.setVisible(true).setPosition(snap(sx), snap(y + c.yOffset))
        .setScale(w / 32, w * c.height / 16);
  }

  // Свечение элиты: glow-эффект WebGL вокруг силуэта, сам спрайт не перекрашивается. Сила пульсирует.
  // На низком качестве вместо шейдера простой аддитивный ореол под элитой (пул halos).
  _glow(s, e, time) {
    if (!s.preFX || this.low) return; // Canvas-рендер без эффектов
    const ed = ENEMIES[e.type] && ENEMIES[e.type].elite;
    const color = ed && ed.glow !== undefined ? ed.glow : ELITE_GLOW.color;
    this._addGlow(s, ELITE_GLOW, color, time, e.uid);
  }

  // Glow-шейдер вокруг силуэта s с пульсом силы (элиты и свой герой).
  _addGlow(s, g, color, time, seed) {
    if (!s.eliteGlow) {
      s.preFX.setPadding(g.padding);
      s.eliteGlow = s.preFX.addGlow(color, g.strength, 0, false, g.quality, g.distance);
    }
    s.eliteGlow.outerStrength = g.strength * (1 + g.pulse * Math.sin(time * g.pulseSpeed + seed));
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

  // Горит ли белая вспышка врага: попадание зажигает её на show с, затем gap с перерыва (FX.hitBlink).
  _blink(s, e, time) {
    if (s.blinkUid !== e.uid) { s.blinkUid = e.uid; s.blinkEnd = 0; s.blinkNext = 0; }
    if (e.hitFlash > 0 && time >= s.blinkNext) {
      const b = e.boss ? FX.hitBlink.boss : FX.hitBlink.mob;
      s.blinkEnd = time + b.show;
      s.blinkNext = time + b.show + b.gap;
    }
    return time < s.blinkEnd;
  }

  // base: постоянная подкраска (цвет игрока в коопе), 0 — без неё
  _tint(s, flash, elite, base = 0) {
    const state = flash ? 1 : 0;
    if (s.tintState === state && s.tintBase === base) return;
    s.tintState = state;
    s.tintBase = base;
    if (state === 1) s.setTintFill(0xffffff);
    else if (base && base !== 0xffffff) s.setTint(base);
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

  // Позиция e между прошлым тиком и текущим (this.ix, this.iy). Созданные в последнем шаге и перенесённые
  // далеко (спавн за краем, телепорт) рисуются на месте.
  // Снаряд вылетел из героя (FX.weaponOrigin): запомнить время и направление вылета, чтобы рисовать его с окружности
  // вокруг тела, а не из ног. Только картинка.
  _launchStart(e, sim) {
    const WO = FX.weaponOrigin;
    const w = e.ws;
    if (e.owner !== 'player' || e.fx || !w || !w.owner || !WO.behaviors.includes(w.def.behavior)) return;
    const dx = e.x - w.owner.x;
    const dy = e.y - w.owner.y;
    const v = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    let t = sim.time;
    if (v > 0) {
      // за тик до показа снаряд уже пролетел немного: вылет из героя, если линия полёта идёт через него
      const along = (dx * e.vx + dy * e.vy) / v;
      const side = Math.abs(dx * e.vy - dy * e.vx) / v;
      if (side > WO.near || along < -WO.near || along > WO.near + v * WO.fade * 0.5) return;
      t -= Math.max(0, along) / v;
    } else if (dx * dx + dy * dy > WO.near * WO.near) {
      return;
    }
    const a = v > 0 ? Math.atan2(e.vy, e.vx) : e.angle || (w.owner.facing < 0 ? Math.PI : 0);
    this.launched.set(e.uid, { t, a });
  }

  // Сдвиг вылетевшего снаряда к this.ix / this.iy: с окружности вокруг центра тела в сторону полёта, гаснет за
  // WO.fade с.
  _launchOffset(e, sim) {
    const L = this.launched.get(e.uid);
    if (!L) return;
    const WO = FX.weaponOrigin;
    const k = 1 - (sim.time - L.t) / WO.fade;
    if (k <= 0) return;
    this.ix += Math.cos(L.a) * WO.radius * k;
    this.iy += (Math.sin(L.a) * WO.radius - WO.lift) * k;
  }

  _launchGc(sim) {
    const fade = FX.weaponOrigin.fade;
    for (const [uid, L] of this.launched) if (sim.time - L.t > fade) this.launched.delete(uid);
  }

  _lerp(e) {
    const a = this.alpha;
    this.ix = e.x;
    this.iy = e.y;
    if (a >= 1 || e.pf !== this.sim.frame) return;
    const dx = e.x - e.px;
    const dy = e.y - e.py;
    if (dx * dx + dy * dy > LERP_MAX * LERP_MAX) return;
    this.ix = e.px + dx * a;
    this.iy = e.py + dy * a;
  }

  // Где рисовать игрока i: свой — позиция сима плюс ввод, который сим ещё не применил (Game._predict),
  // остальные — между тиками.
  _playerPos(p, i) {
    const pr = this.predict;
    if (pr && pr.i === i) {
      this.ix = p.x + pr.x;
      this.iy = p.y + pr.y;
    } else {
      this._lerp(p);
    }
  }

  update(dt) {
    this.time += dt;
    const sim = this.sim;
    const time = this.time;
    const pr = this.predict;
    // центр экрана — среднее нарисованных игроков (как sim.view, но с их видимыми позициями)
    let vx = 0;
    let vy = 0;
    sim.players.forEach((p, i) => { this._playerPos(p, i); vx += this.ix; vy += this.iy; });
    vx /= sim.players.length;
    vy /= sim.players.length;

    // камера и фон: центр экрана — sim.view (игрок, в коопе середина между игроками)
    const cam = this.scene.cameras.main;
    cam.scrollX = snap(vx - GAME_WIDTH / 2) + this.shake.x;
    cam.scrollY = snap(vy - GAME_HEIGHT / 2) + this.shake.y;
    this.shadowN = 0;

    // игроки
    for (let i = 0; i < sim.players.length; i++) {
      const p = sim.players[i];
      const pl = this.playerSprites[i];
      if (p.dead) {
        if (pl.eliteGlow) dropGlow(pl);
        if (!pl.coffin) {
          pl.coffin = true;
          pl.setTexture('fx_coffin', 0).setOrigin(0.5, 1).setScale(1).setFlipX(false).setAlpha(1);
          pl.spriteKey = 'fx_coffin';
          pl.tintState = -1;
          pl.clearTint();
        }
        this._lerp(p);
        pl.setPosition(snap(this.ix), snap(this.iy) + COFFIN_Y);
        pl.setDepth(this.iy);
        this.drawnX[i] = NaN;
        this._shadow(this.ix, this.iy, pl, cam);
        continue;
      }
      const key = pl.heroKey;
      if (pl.coffin) {
        pl.coffin = false;
        pl.setTexture(this._tex(key), 0);
        pl.spriteKey = key;
        this._origin(pl, key);
      }
      pl.baseScale = spriteScale(key);
      const mine = pr && pr.i === i;
      const view = mine ? Object.assign(this.localView, p, { moving: pr.moving }) : p;
      const lift = animateCharacter(pl, key, view, time, i);
      this._playerPos(p, i);
      const px = this.ix;
      const py = this.iy;
      pl.setPosition(snap(px), snap(py) + lift);
      const face = pr && pr.i === i && pr.face ? pr.face : p.facing;
      pl.setFlipX(face < 0);
      pl.setDepth(py);
      this.drawnX[i] = px;
      this.drawnY[i] = py;
      pl.setAlpha(p.iframes > 0 && Math.floor(time * 16) % 2 === 0 ? 0.35 : 1);
      // свой герой со свечением (настройка читается каждый кадр: переключение в паузе видно сразу)
      if (i === sim.local && pl.preFX && getSetting('heroGlow')) this._addGlow(pl, HERO_GLOW, HERO_GLOW.color, time, 0);
      else if (pl.eliteGlow) dropGlow(pl);
      this._tint(pl, p.hurtFlash > 0, false);
      this._shadow(px, py, pl, cam);
    }
    this.bg.tilePositionX = cam.scrollX;
    this.bg.tilePositionY = cam.scrollY;
    if (this.roads) this.roads.update(cam);
    this.decor.update(cam);

    this.pools.enemies.sync(sim.enemies, (e) => e.sprite || e.type, (s, e) => {
      const key = e.sprite || e.type;
      this._setKey(s, key);
      s.baseScale = (e.elite ? (e.def?.elite?.sizeMul ?? 1) : 1) * spriteScale(key);
      const lift2 = animateCharacter(s, key, e, time, e.uid);
      const blink = this._blink(s, e, time);
      applyHitSquash(s, blink ? 1 : 0);
      this._lerp(e);
      const ex = this.ix;
      const ey = this.iy;
      s.setPosition(snap(ex), snap(ey) + lift2);
      this._shadow(ex, ey, s, cam);
      s.setFlipX(e.facing < 0);
      s.setDepth(ey);
      s.setAlpha(e.alpha == null ? 1 : e.alpha);
      this._tint(s, blink, e.elite, 0);
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
      this._lerp(e);
      s.setPosition(snap(this.ix), snap(this.iy) - Math.round(e.size * 0.5));
      s.setScale((e.size * halo.size) / HALO_SIZE);
      s.setTint(ed && ed.glow !== undefined ? ed.glow : ELITE_GLOW.color).setAlpha(halo.alpha);
      s.setDepth(e.y - 1);
    });

    this.reaperFx.update(sim, time);
    // предупреждения об ударах босса: заливка растёт от центра до края за delay
    const g = this.telegraphGfx;
    g.clear();
    for (const tg of sim.telegraphs) {
      const k = Math.min(1, tg.t / tg.delay);
      g.fillStyle(0xff2020, 0.12 + 0.12 * k).fillCircle(tg.x, tg.y, tg.radius);
      g.fillStyle(0xff2020, 0.3 + 0.2 * k).fillCircle(tg.x, tg.y, tg.radius * k);
      g.lineStyle(1, 0xff6060, 0.9).strokeCircle(tg.x, tg.y, tg.radius);
    }

    this._launchGc(sim);
    this.pools.projectiles.sync(sim.projectiles, (e) => e.sprite, (s, e, isNew) => {
      this._setKey(s, e.sprite);
      if (isNew) this._launchStart(e, sim);
      // лента кадров (огонёк виспа, метеор): цикл по времени сима, фаза от uid, чтобы соседи не мигали в такт
      const nf = SPRITES[e.sprite]?.frames || 1;
      if (nf > 1) s.setFrame((Math.floor(sim.time * FX.projAnim.fps) + e.uid) % nf);
      const ang = e.angle || 0;
      const off = e.drawOff || 0;
      const lift = e.drawLift || 0;
      this._lerp(e);
      this._launchOffset(e, sim);
      // оружие своего героя рисуется вместе с ним (он показан по вводу, впереди сима)
      const own = pr && e.ws && e.ws.owner && e.ws.owner.id === pr.i;
      const px = this.ix + (own ? pr.x : 0) + Math.cos(ang) * off;
      const py = this.iy + (own ? pr.y : 0) + Math.sin(ang) * off - lift;
      s.setPosition(snap(px), snap(py));
      s.setRotation(ang);
      s.setScale((e.scale == null ? 1 : e.scale) * spriteScale(e.sprite));
      s.setAlpha(e.fx ? 0 : e.alpha == null ? 1 : e.alpha);
      if (s.projTint !== e.tint) {
        s.projTint = e.tint;
        if (e.tint) s.setTint(e.tint);
        else s.clearTint();
      }
      const oi = e.ySort && e.ws.owner ? e.ws.owner.id : -1;
      const hy = this.drawnY[oi];
      const behind = oi >= 0 && py < hy && Math.abs(px - this.drawnX[oi]) < ORBIT_BEHIND_DX;
      if (behind) s.setDepth(hy - 0.5);
      else s.setDepth((SPRITES[e.sprite]?.layer === 'ground' ? GROUND_DEPTH : PROJ_DEPTH) + e.y);
    });
    const glow = FX.projGlow;
    this.pools.glows.sync(this._glowing(sim.projectiles), () => 'fx_halo', (s, e, isNew) => {
      const g = glow[e.sprite];
      if (isNew) s.setBlendMode(Phaser.BlendModes.ADD);
      this._lerp(e);
      this._launchOffset(e, sim);
      const own = pr && e.ws && e.ws.owner && e.ws.owner.id === pr.i;
      s.setPosition(snap(this.ix + (own ? pr.x : 0)), snap(this.iy + (own ? pr.y : 0)));
      s.setScale((g.size * (e.scale == null ? 1 : e.scale)) / HALO_SIZE);
      s.setTint(e.tint || g.color).setAlpha(g.alpha * (e.alpha == null ? 1 : e.alpha));
      s.setDepth(PROJ_DEPTH + e.y - 0.5);
    });
    this.zones.draw(sim.projectiles, time);

    this.pools.pickups.sync(sim.pickups, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setScale(spriteScale(e.sprite));
      if (e.tint) s.setTint(e.tint);
      else s.clearTint();
      this._lerp(e);
      s.setPosition(snap(this.ix), snap(this.iy));
      s.setDepth(PICKUP_DEPTH + this.iy);
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
