// Синхронизация спрайтов с состоянием sim: пулы по uid, сортировка по y, вспышки, анимация.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { GAME_WIDTH, GAME_HEIGHT, FX } from '../data/constants.js';
import { HEROES } from '../data/heroes.js';
import { animateCharacter, applyHitSquash } from './anim.js';
import { Decor } from './decor.js';
import { spriteScale } from './density.js';

const ELITE_TINT = 0xff9a9a;
const PICKUP_DEPTH = -100000;
const PROJ_DEPTH = 200000;

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

    this.decor = new Decor(scene, sim.stageDef || { props: [] });

    const heroId = sim.hero || 'heroine';
    this.playerKey = sim.player.sprite || (HEROES[heroId] && HEROES[heroId].sprite) || 'heroine';
    this.player = scene.add.sprite(sim.player.x, sim.player.y, this._tex(this.playerKey), 0);
    this._origin(this.player, this.playerKey);

    this.pools = {
      enemies: new Pool(scene),
      projectiles: new Pool(scene),
      pickups: new Pool(scene),
      props: new Pool(scene),
    };
    scene.cameras.main.setRoundPixels(true);

    if (!scene.textures.exists('fx_shadow')) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1).fillEllipse(16, 8, 32, 16);
      g.generateTexture('fx_shadow', 32, 16);
      g.destroy();
    }
    this.shadows = [];
    this.shadowN = 0;
    this.shake = { x: 0, y: 0 }; // смещение камеры от fx (тряска)
  }

  // Тень у ног: тёмный эллипс под спрайтом, пул по порядку обхода за кадр.
  _shadow(x, y, sprite, cam) {
    if (x < cam.scrollX - 40 || x > cam.scrollX + GAME_WIDTH + 40 || y < cam.scrollY - 40 || y > cam.scrollY + GAME_HEIGHT + 60) return;
    const c = FX.shadow;
    let s = this.shadows[this.shadowN];
    if (!s) {
      s = this.scene.add.image(0, 0, 'fx_shadow').setTint(0x000000).setAlpha(c.alpha).setDepth(c.depth);
      this.shadows.push(s);
    }
    this.shadowN++;
    const w = Math.max(8, sprite.width * Math.abs(sprite.baseScale || 1) * c.widthK);
    s.setVisible(true).setPosition(Math.round(x), Math.round(y + c.yOffset)).setScale(w / 32, w * c.height / 16);
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
    const state = flash ? 1 : elite ? 2 : 0;
    if (s.tintState === state) return;
    s.tintState = state;
    if (state === 1) s.setTintFill(0xffffff);
    else if (state === 2) s.setTint(ELITE_TINT);
    else s.clearTint();
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
    pl.setPosition(p.x, p.y + lift);
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
    this.decor.update(cam);

    this.pools.enemies.sync(sim.enemies, (e) => e.sprite || e.type, (s, e) => {
      const key = e.sprite || e.type;
      this._setKey(s, key);
      s.baseScale = (e.elite ? 1.25 : 1) * spriteScale(key);
      const lift2 = animateCharacter(s, key, e, time, e.uid);
      applyHitSquash(s, e.hitFlash);
      s.setPosition(e.x, e.y + lift2);
      this._shadow(e.x, e.y, s, cam);
      s.setFlipX(e.facing < 0);
      s.setDepth(e.y);
      this._tint(s, e.hitFlash > 0, e.elite);
    });
    for (let i = this.shadowN; i < this.shadows.length; i++) {
      if (!this.shadows[i].visible) break;
      this.shadows[i].setVisible(false);
    }

    this.pools.projectiles.sync(sim.projectiles, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setPosition(e.x, e.y);
      s.setRotation(e.angle || 0);
      s.setScale((e.scale == null ? 1 : e.scale) * spriteScale(e.sprite));
      s.setAlpha(e.alpha == null ? 1 : e.alpha);
      s.setDepth(PROJ_DEPTH + e.y);
    });

    this.pools.pickups.sync(sim.pickups, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setScale(spriteScale(e.sprite));
      s.setPosition(e.x, e.y);
      s.setDepth(PICKUP_DEPTH + e.y);
    });

    this.pools.props.sync(sim.props, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setScale(spriteScale(e.sprite));
      s.setPosition(e.x, e.y);
      s.setDepth(e.y);
    });
  }
}
