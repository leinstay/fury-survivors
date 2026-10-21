// Синхронизация спрайтов с состоянием sim: пулы по uid, сортировка по y, вспышки, анимация.
import { SPRITES } from '../../assets/sprites/manifest.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { HEROES } from '../data/heroes.js';
import { animateCharacter } from './anim.js';
import { Decor } from './decor.js';

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
    pl.baseScale = 1;
    const lift = animateCharacter(pl, this.playerKey, p, time, 0);
    pl.setPosition(p.x, p.y + lift);
    pl.setFlipX(p.facing < 0);
    pl.setDepth(p.y);
    pl.setAlpha(p.iframes > 0 && Math.floor(time * 16) % 2 === 0 ? 0.35 : 1);
    this._tint(pl, p.hurtFlash > 0, false);

    // камера и фон
    const cam = this.scene.cameras.main;
    cam.scrollX = Math.round(p.x - GAME_WIDTH / 2);
    cam.scrollY = Math.round(p.y - GAME_HEIGHT / 2);
    this.bg.tilePositionX = cam.scrollX;
    this.bg.tilePositionY = cam.scrollY;
    this.decor.update(cam);

    this.pools.enemies.sync(sim.enemies, (e) => e.sprite || e.type, (s, e) => {
      const key = e.sprite || e.type;
      this._setKey(s, key);
      s.baseScale = e.elite ? 1.25 : 1;
      const lift2 = animateCharacter(s, key, e, time, e.uid);
      s.setPosition(e.x, e.y + lift2);
      s.setFlipX(e.facing < 0);
      s.setDepth(e.y);
      this._tint(s, e.hitFlash > 0, e.elite);
    });

    this.pools.projectiles.sync(sim.projectiles, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setPosition(e.x, e.y);
      s.setRotation(e.angle || 0);
      s.setScale(e.scale == null ? 1 : e.scale);
      s.setAlpha(e.alpha == null ? 1 : e.alpha);
      s.setDepth(PROJ_DEPTH + e.y);
    });

    this.pools.pickups.sync(sim.pickups, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setPosition(e.x, e.y);
      s.setDepth(PICKUP_DEPTH + e.y);
    });

    this.pools.props.sync(sim.props, (e) => e.sprite, (s, e) => {
      this._setKey(s, e.sprite);
      s.setPosition(e.x, e.y);
      s.setDepth(e.y);
    });
  }
}
