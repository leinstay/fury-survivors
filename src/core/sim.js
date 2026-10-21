// Симуляция игры. Чистая логика: без Phaser, без DOM, без Math.random.
// Контракт полей и методов описан в docs/ARCHITECTURE.md.
import { SIM, PLAYER, COMBAT, XP, DROPS, LEVEL_UP } from '../data/constants.js';
import { HEROES } from '../data/heroes.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { PICKUPS } from '../data/pickups.js';
import forest from '../data/stages/forest.js';
import { WEAPON_BEHAVIORS, ENEMY_BEHAVIORS } from '../behaviors/index.js';
import { createRng, hashSeed } from './rng.js';
import { Grid } from './grid.js';
import { computeStats } from './stats.js';
import { createDirector } from './director.js';
import * as UP from './upgrades.js';

const STAGES = { forest };
const EMPTY = {};
const HIT_MEM = 24;      // память о поражённых целях у пробивающих снарядов
const SLOT_COUNT = 16;   // слоты таймеров повторного попадания (по оружию)
const NEVER = -1e9;

// Кристаллы опыта от крупных к мелким.
const XP_TIERS = Object.keys(PICKUPS)
  .filter((id) => PICKUPS[id].kind === 'xp')
  .sort((a, b) => PICKUPS[b].value - PICKUPS[a].value);

function xpTierFor(value) {
  for (let i = 0; i < XP_TIERS.length; i++) if (PICKUPS[XP_TIERS[i]].value <= value) return XP_TIERS[i];
  return XP_TIERS[XP_TIERS.length - 1];
}

export function xpForLevel(level) {
  let need = XP.base + XP.perLevel * (level - 1);
  for (const t of XP.thresholds) if (t.level === level) need += t.extra;
  return need;
}

function maxEnemySize() {
  let m = 0;
  for (const id in ENEMIES) {
    const d = ENEMIES[id];
    m = Math.max(m, d.size * (d.elite ? d.elite.sizeMul || 1 : 1));
  }
  for (const id in BOSSES) m = Math.max(m, BOSSES[id].size);
  return m;
}

class Sim {
  constructor(opts) {
    const o = opts || {};
    this.heroDef = HEROES[o.hero || 'heroine'];
    this.stageDef = STAGES[o.stage || 'forest'];
    this.seed = o.seed === undefined ? 1 : o.seed;
    this.rng = createRng(this.seed);
    this.director = createDirector(this.stageDef, this.rng);

    this.state = 'running';
    this.time = 0;
    this.kills = 0;
    this.coins = 0;
    this.boss = null;
    this.damageByWeapon = {};
    this.events = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.props = [];
    this.uid = 0;
    this.stamp = 0;
    this.frame = 0;
    this.pendingLevels = 0;
    this.banished = new Set();
    this.levelUp = {
      cards: [],
      rerolls: LEVEL_UP.rerolls,
      skips: LEVEL_UP.skips,
      banishes: LEVEL_UP.banishes,
    };

    this.grid = new Grid(SIM.gridCellSize, 7, 1024);
    this.pgrid = new Grid(XP.mergeRadius * 2, 7, 2048);
    this.qbuf = new Int32Array(2048);
    this.qbuf2 = new Int32Array(2048);
    this.maxSize = maxEnemySize();
    this.enemyPool = [];
    this.projPool = [];
    this.mergeTimer = 0;
    this.xpCount = 0;
    this.deadN = 0;
    this.chunks = new Set();
    this.chunkX = NaN;
    this.chunkY = NaN;

    const base = this.heroDef.stats;
    const stats = computeStats(base, [], {});
    this.player = {
      x: 0, y: 0, hp: stats.maxHp, maxHp: stats.maxHp,
      level: 1, xp: 0, xpNext: xpForLevel(1),
      facing: 1, moving: false, iframes: 0, hurtFlash: 0,
      weapons: [{ id: this.heroDef.startWeapon, level: 1 }],
      passives: [],
      stats,
      dirX: 1, dirY: 0,
      radius: PLAYER.radius,
    };
    this._syncBuild();
    this._updateChunks();
  }

  // ---------- шаг ----------

  step(dt, input) {
    this.events.length = 0;
    if (this.state !== 'running') return;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    this.frame++;
    const pl = this.player;

    // движение игрока
    let ix = input && input.x ? input.x : 0;
    let iy = input && input.y ? input.y : 0;
    const len = Math.sqrt(ix * ix + iy * iy);
    if (len > 1) { ix /= len; iy /= len; }
    pl.moving = len > 0.05;
    if (pl.moving) {
      const sp = pl.stats.speed;
      pl.x += ix * sp * dt;
      pl.y += iy * sp * dt;
      if (ix > 0.05) pl.facing = 1; else if (ix < -0.05) pl.facing = -1;
      pl.dirX = ix / len;
      pl.dirY = iy / len;
    }
    if (pl.iframes > 0) pl.iframes -= dt;
    if (pl.hurtFlash > 0) pl.hurtFlash -= dt;
    if (pl.stats.regen > 0 && pl.hp < pl.maxHp) pl.hp = Math.min(pl.maxHp, pl.hp + pl.stats.regen * dt);

    this._updateChunks();
    this.director.update(this, dt);
    this._updateEnemies(dt);
    this._buildGrid();
    this._separate();
    this._updateWeapons(dt);
    this._updateProjectiles(dt);
    this._contactDamage();
    this._updatePickups(dt);
    this._sweepProps();
    this._sweepEnemies();
    this._checkLevel();
  }

  // ---------- враги ----------

  canSpawn() {
    return this.enemies.length - this.deadN < SIM.maxEnemies;
  }

  // Освободить место для элиты или босса: убрать самого далёкого обычного врага (без дропа).
  _evictOne() {
    const pl = this.player;
    let worst = null;
    let wd = -1;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || e.elite || e.boss) continue;
      const dx = e.x - pl.x;
      const dy = e.y - pl.y;
      const d = dx * dx + dy * dy;
      if (d > wd) { wd = d; worst = e; }
    }
    if (worst) { worst.dead = true; this.deadN++; }
  }

  spawnEnemy(type, x, y, elite = false, isBoss = false) {
    const def = isBoss ? BOSSES[type] : ENEMIES[type];
    if (!def) return null;
    const ed = elite && def.elite ? def.elite : null;
    if (!this.canSpawn()) {
      if (!(isBoss || ed)) return null;
      this._evictOne();
    }
    let e = this.enemyPool.pop();
    if (!e) {
      e = {
        uid: 0, type: '', sprite: '', x: 0, y: 0, hp: 0, maxHp: 0, size: 0, facing: 1, elite: false, boss: false,
        hitFlash: 0, moving: false,
        vx: 0, vy: 0, kx: 0, ky: 0, speed: 0, damage: 0, xp: 0, st: 0, a: 0, b: 0, t: 0, mark: 0,
        dead: false, def: null, params: EMPTY, beh: null, resist: 0, hitAt: new Float64Array(SLOT_COUNT),
      };
    }
    const mins = this.time / 60;
    const sc = this.stageDef.scaling || EMPTY;
    const hpScale = 1 + (sc.hpPerMinute || 0) * mins;
    const dmgScale = 1 + (sc.damagePerMinute || 0) * mins;
    e.uid = ++this.uid;
    e.type = type;
    e.sprite = def.sprite;
    e.x = x; e.y = y;
    e.maxHp = def.hp * hpScale * (ed ? ed.hpMul : 1);
    e.hp = e.maxHp;
    e.size = def.size * (ed ? ed.sizeMul || 1 : 1);
    e.facing = 1;
    e.elite = !!ed;
    e.boss = isBoss;
    e.hitFlash = 0;
    e.moving = false;
    e.vx = 0; e.vy = 0; e.kx = 0; e.ky = 0;
    e.speed = def.speed;
    e.damage = def.damage * dmgScale * (ed ? ed.damageMul : 1);
    e.xp = (def.xp || 0) * (ed ? ed.xpMul || 1 : 1);
    e.st = 0; e.a = 0; e.b = 0; e.t = this.rng.next() * 6.2832; e.mark = 0;
    e.dead = false;
    e.def = def;
    e.params = def.params || EMPTY;
    e.resist = def.knockbackResist || 0;
    e.hitAt.fill(NEVER);
    e.beh = ENEMY_BEHAVIORS[def.behavior];
    if (e.beh.init) e.beh.init(e, this);
    this.enemies.push(e);
    return e;
  }

  spawnBoss(id) {
    const pl = this.player;
    const e = this.spawnEnemy(id, pl.x + pl.dirX * 300, pl.y + pl.dirY * 300, false, true);
    if (e) {
      this.boss = e;
      this.events.push({ type: 'bossSpawn', boss: id });
    }
    return e;
  }

  // Ближайший живой враг в радиусе maxDist; mark !== 0 исключает врагов с этой меткой.
  nearestEnemy(x, y, maxDist, mark = 0) {
    const en = this.enemies;
    let best = null;
    let bd = maxDist * maxDist;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead || (mark !== 0 && e.mark === mark)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  nextStamp() {
    return ++this.stamp;
  }

  _updateEnemies(dt) {
    const en = this.enemies;
    const pl = this.player;
    const n = en.length;
    const decay = Math.max(0, 1 - COMBAT.knockbackDecay * dt);
    const far2 = SIM.despawnDistance * SIM.despawnDistance;
    for (let i = 0; i < n; i++) {
      const e = en[i];
      if (e.dead) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.kx !== 0 || e.ky !== 0) {
        e.x += e.kx * dt;
        e.y += e.ky * dt;
        e.kx *= decay; e.ky *= decay;
        if (e.kx > -1 && e.kx < 1 && e.ky > -1 && e.ky < 1) { e.kx = 0; e.ky = 0; }
      }
      e.beh.update(e, this, dt);
      const dx = e.x - pl.x;
      const dy = e.y - pl.y;
      if (!e.boss && dx * dx + dy * dy > far2) this._teleportAhead(e);
    }
  }

  // Отставший враг переносится вперёд по ходу игрока.
  _teleportAhead(e) {
    const pl = this.player;
    const a = Math.atan2(pl.dirY, pl.dirX) + (this.rng.next() - 0.5) * 2.2;
    e.x = pl.x + Math.cos(a) * SIM.spawnDistance;
    e.y = pl.y + Math.sin(a) * SIM.spawnDistance;
    e.kx = 0; e.ky = 0;
  }

  _buildGrid() {
    const g = this.grid;
    g.clear();
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.dead) g.insert(i, e.x, e.y);
    }
  }

  // Мягкое расталкивание врагов. Половину врагов за кадр (по чётности).
  _separate() {
    const en = this.enemies;
    const g = this.grid;
    const buf = this.qbuf;
    const k = COMBAT.separation * 2;
    const par = this.frame & 1;
    for (let i = par; i < en.length; i += 2) {
      const a = en[i];
      if (a.dead || a.def.behavior === 'phase') continue;
      const cnt = g.query(a.x, a.y, a.size * 2, buf);
      for (let c = 0; c < cnt; c++) {
        const j = buf[c];
        if (j === i) continue;
        const b = en[j];
        if (b.dead) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const min = (a.size + b.size) * 0.7;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) * k * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        if (!a.boss) { a.x += nx * push; a.y += ny * push; }
        if (!b.boss && b.def.behavior !== 'phase' && j > i) { b.x -= nx * push; b.y -= ny * push; }
      }
    }
  }

  // Урон врагу. (sx, sy) — источник для направления отбрасывания.
  damageEnemy(e, dmg, wid, kb, sx, sy) {
    if (e.dead) return;
    const crit = this.rng.next() < this.player.stats.crit;
    const amount = crit ? dmg * COMBAT.critMul : dmg;
    const dealt = amount < e.hp ? amount : e.hp;
    e.hp -= amount;
    e.hitFlash = COMBAT.hitFlash;
    this.damageByWeapon[wid] = (this.damageByWeapon[wid] || 0) + dealt;
    this.events.push({ type: 'hit', x: e.x, y: e.y, amount: Math.max(1, Math.round(amount)), crit, weapon: wid });
    if (kb > 0 && e.resist < 1 && !e.boss) {
      const dx = e.x - sx;
      const dy = e.y - sy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = kb * (1 - e.resist);
      e.kx = (dx / d) * k;
      e.ky = (dy / d) * k;
    }
    if (e.hp <= 0) this._killEnemy(e);
  }

  _killEnemy(e) {
    e.dead = true;
    this.deadN++;
    this.kills++;
    const luck = this.player.stats.luck;
    this.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, elite: e.elite, boss: e.boss, sprite: e.sprite, size: e.size });
    if (e.xp > 0) this.dropPickup(xpTierFor(e.xp), e.x, e.y, e.xp);
    if (e.boss) {
      this.state = 'victory';
      this.events.push({ type: 'victory' });
      return;
    }
    if (e.elite) {
      this.dropPickup(e.def.elite.drop || 'chest', e.x, e.y);
    } else {
      const r = this.rng.next();
      if (r < DROPS.coinChance * luck) this.dropPickup('coin', e.x, e.y);
      else if (r < (DROPS.coinChance + DROPS.foodChance) * luck) this.dropPickup('food', e.x, e.y);
    }
  }

  _sweepEnemies() {
    const en = this.enemies;
    this.deadN = 0;
    for (let i = en.length - 1; i >= 0; i--) {
      const e = en[i];
      if (!e.dead) continue;
      en[i] = en[en.length - 1];
      en.pop();
      if (this.boss === e) this.boss = null;
      this.enemyPool.push(e);
    }
  }

  _contactDamage() {
    const pl = this.player;
    if (pl.iframes > 0) return;
    const en = this.enemies;
    const cnt = this.grid.query(pl.x, pl.y, pl.radius + this.maxSize, this.qbuf);
    for (let c = 0; c < cnt; c++) {
      const e = en[this.qbuf[c]];
      if (e.dead) continue;
      const dx = e.x - pl.x;
      const dy = e.y - pl.y;
      const r = e.size * 0.8 + pl.radius;
      if (dx * dx + dy * dy <= r * r) {
        this.hurtPlayer(e.damage);
        return;
      }
    }
  }

  hurtPlayer(raw) {
    const pl = this.player;
    if (pl.iframes > 0 || this.state !== 'running') return;
    const amount = Math.max(COMBAT.armorMinDamage, raw - pl.stats.armor);
    pl.hp -= amount;
    pl.iframes = PLAYER.iframes;
    pl.hurtFlash = PLAYER.hurtFlash;
    this.events.push({ type: 'playerHurt', amount });
    if (pl.hp <= 0) {
      pl.hp = 0;
      this.state = 'gameover';
      this.events.push({ type: 'gameover' });
    }
  }

  // ---------- оружие и снаряды ----------

  _updateWeapons(dt) {
    const ws = this.player.weapons;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      w.beh.update(w, this, dt);
    }
  }

  // Выдать снаряд из пула. Поля сбрасываются; behavior заполняет нужные.
  addProjectile(owner, sprite) {
    let p = this.projPool.pop();
    if (!p) {
      p = {
        uid: 0, sprite: '', x: 0, y: 0, angle: 0, scale: 1, alpha: 1, owner: 'player',
        vx: 0, vy: 0, life: 0, radius: 0, dmg: 0, kb: 0, pierce: 0, rehit: 0, once: false,
        a: 0, b: 0, c: 0, wid: '', ws: null, bk: null, slot: 0, hitN: 0, hitUid: new Int32Array(HIT_MEM),
      };
    }
    p.uid = ++this.uid;
    p.sprite = sprite;
    p.owner = owner;
    p.x = 0; p.y = 0; p.angle = 0; p.scale = 1; p.alpha = 1;
    p.vx = 0; p.vy = 0; p.life = 1; p.radius = 0; p.dmg = 0; p.kb = 0;
    p.pierce = 0; p.rehit = 0; p.once = false;
    p.a = 0; p.b = 0; p.c = 0; p.wid = ''; p.ws = null; p.bk = null; p.slot = 0; p.hitN = 0;
    this.projectiles.push(p);
    return p;
  }

  // Снаряд врага.
  spawnEnemyProjectile(x, y, angle, speed, dmg, life) {
    const p = this.addProjectile('enemy', 'proj_enemy');
    p.x = x; p.y = y; p.angle = angle;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = life;
    p.radius = 4;
    p.dmg = dmg;
    return p;
  }

  _updateProjectiles(dt) {
    const arr = this.projectiles;
    const pl = this.player;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      if (p.bk) {
        p.bk.moveProjectile(p, p.ws, this, dt);
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.life -= dt;
      if (p.life > 0 && p.dmg > 0) {
        if (p.owner === 'player') {
          this._projectileHits(p);
        } else {
          const dx = p.x - pl.x;
          const dy = p.y - pl.y;
          const r = p.radius + pl.radius;
          if (dx * dx + dy * dy <= r * r) {
            this.hurtPlayer(p.dmg);
            p.life = 0;
          }
        }
      }
      if (p.life <= 0) {
        if (p.bk && p.bk.expire) p.bk.expire(p, p.ws, this);
        arr[i] = arr[arr.length - 1];
        arr.pop();
        p.ws = null; p.bk = null;
        this.projPool.push(p);
      }
    }
  }

  _projectileHits(p) {
    const en = this.enemies;
    const buf = this.qbuf;
    const cnt = this.grid.query(p.x, p.y, p.radius + this.maxSize, buf);
    const t = this.time;
    for (let c = 0; c < cnt; c++) {
      const e = en[buf[c]];
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const r = p.radius + e.size;
      if (dx * dx + dy * dy > r * r) continue;
      if (p.rehit > 0) {
        if (t - e.hitAt[p.slot] < p.rehit) continue;
        e.hitAt[p.slot] = t;
      } else if (!p.once) {
        if (this._seen(p, e.uid)) continue;
        this._remember(p, e.uid);
      }
      this.damageEnemy(e, p.dmg, p.wid, p.kb, p.x, p.y);
      if (!p.once && --p.pierce < 0) { p.life = 0; break; }
    }
    // разрушаемые объекты
    const props = this.props;
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (o.dead) continue;
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      const r = p.radius + o.radius;
      if (dx * dx + dy * dy > r * r) continue;
      if (p.rehit > 0) {
        if (t - o.hitAt[p.slot] < p.rehit) continue;
        o.hitAt[p.slot] = t;
      } else if (!p.once) {
        if (this._seen(p, o.uid)) continue;
        this._remember(p, o.uid);
      }
      this._damageProp(o);
    }
    if (p.once) p.dmg = 0;
  }

  _seen(p, uid) {
    const n = p.hitN < HIT_MEM ? p.hitN : HIT_MEM;
    for (let i = 0; i < n; i++) if (p.hitUid[i] === uid) return true;
    return false;
  }

  _remember(p, uid) {
    p.hitUid[p.hitN % HIT_MEM] = uid;
    p.hitN++;
  }

  // ---------- объекты ----------

  _updateChunks() {
    const pl = this.player;
    const cs = SIM.chunkSize;
    const cx = Math.floor(pl.x / cs);
    const cy = Math.floor(pl.y / cs);
    if (cx === this.chunkX && cy === this.chunkY) return;
    this.chunkX = cx;
    this.chunkY = cy;
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        const key = (x + 32768) * 65536 + (y + 32768);
        if (this.chunks.has(key)) continue;
        this.chunks.add(key);
        this._genChunk(x, y);
      }
    }
    const keep2 = SIM.propKeepDistance * SIM.propKeepDistance;
    const props = this.props;
    for (let i = props.length - 1; i >= 0; i--) {
      const o = props[i];
      const dx = o.x - pl.x;
      const dy = o.y - pl.y;
      if (dx * dx + dy * dy > keep2) { props[i] = props[props.length - 1]; props.pop(); }
    }
  }

  _genChunk(cx, cy) {
    const r = createRng(hashSeed(this.seed, cx, cy));
    const cs = SIM.chunkSize;
    const defs = this.stageDef.props || [];
    for (let d = 0; d < defs.length; d++) {
      const def = defs[d];
      if (!def.breakable) continue;
      let n = Math.floor(def.density);
      if (r.next() < def.density - n) n++;
      for (let i = 0; i < n; i++) {
        this.props.push({
          uid: ++this.uid, sprite: def.sprite, x: (cx + r.next()) * cs, y: (cy + r.next()) * cs,
          breakable: true, hp: def.hp || 1, radius: 9, drop: def.drop || EMPTY, dead: false,
          hitAt: new Float64Array(SLOT_COUNT).fill(NEVER),
        });
      }
    }
  }

  _damageProp(o) {
    o.hp -= 1;
    if (o.hp > 0) return;
    o.dead = true;
    const luck = this.player.stats.luck;
    const roll = this.rng.next();
    let acc = 0;
    for (const id in o.drop) {
      acc += o.drop[id] * luck;
      if (roll < acc) { this.dropPickup(id, o.x, o.y); break; }
    }
  }

  _sweepProps() {
    const props = this.props;
    for (let i = props.length - 1; i >= 0; i--) {
      if (props[i].dead) { props[i] = props[props.length - 1]; props.pop(); }
    }
  }

  // ---------- предметы ----------

  dropPickup(id, x, y, value) {
    const def = PICKUPS[id];
    if (!def) return null;
    const pk = {
      uid: ++this.uid, type: id, sprite: def.sprite, x, y, kind: def.kind,
      value: value === undefined ? (def.value || 0) : value, pulled: false, gone: false,
    };
    this.pickups.push(pk);
    return pk;
  }

  _updatePickups(dt) {
    const pl = this.player;
    const arr = this.pickups;
    const pr = PLAYER.pickupRadius * pl.stats.pickup;
    const pr2 = pr * pr;
    const touch = PLAYER.touchRadius + 0;
    const touch2 = touch * touch;
    const spd = PLAYER.magnetSpeed;
    let xpCount = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const pk = arr[i];
      const dx = pl.x - pk.x;
      const dy = pl.y - pk.y;
      const d2 = dx * dx + dy * dy;
      let take = false;
      const pullable = pk.kind === 'xp' || pk.kind === 'coin';
      if (pullable && !pk.pulled && d2 <= pr2) pk.pulled = true;
      if (pk.pulled) {
        const d = Math.sqrt(d2);
        const step = spd * dt;
        if (d <= step + 3) take = true;
        else { pk.x += (dx / d) * step; pk.y += (dy / d) * step; }
      } else if (!pullable && d2 <= touch2) {
        take = true;
      }
      if (take) {
        this._collect(pk);
        arr[i] = arr[arr.length - 1];
        arr.pop();
      } else if (pk.kind === 'xp') {
        xpCount++;
      }
    }
    this.xpCount = xpCount;
    if (xpCount > XP.mergeAbove) {
      this.mergeTimer -= dt;
      if (this.mergeTimer <= 0) { this.mergeTimer = XP.mergeInterval; this._mergeXp(); }
    }
  }

  _collect(pk) {
    const pl = this.player;
    switch (pk.kind) {
      case 'xp':
        pl.xp += pk.value;
        break;
      case 'heal':
        pl.hp = Math.min(pl.maxHp, pl.hp + pk.value);
        break;
      case 'magnet':
        for (const o of this.pickups) if (o.kind === 'xp' || o.kind === 'coin') o.pulled = true;
        break;
      case 'coin':
        this.coins += pk.value;
        break;
      case 'chest':
        this._openChest();
        break;
      default:
        break;
    }
    this.events.push({ type: 'pickup', kind: pk.kind });
  }

  _openChest() {
    const items = UP.chestItems(this.player, this.rng);
    for (const it of items) this._applyCard(it);
    this._syncBuild();
    this.events.push({ type: 'chest', items });
  }

  // Слияние далёких кристаллов опыта, когда их слишком много.
  _mergeXp() {
    const pk = this.pickups;
    const pl = this.player;
    const g = this.pgrid;
    g.clear();
    const minD2 = XP.mergeMinPlayerDistance * XP.mergeMinPlayerDistance;
    const ids = this.qbuf2;
    let n = 0;
    const lim = Math.min(ids.length, 1900);
    for (let i = 0; i < pk.length && n < lim; i++) {
      const a = pk[i];
      if (a.kind !== 'xp' || a.pulled) continue;
      const dx = a.x - pl.x;
      const dy = a.y - pl.y;
      if (dx * dx + dy * dy < minD2) continue;
      g.insert(i, a.x, a.y);
      ids[n++] = i;
    }
    const buf = this.qbuf;
    const r2 = XP.mergeRadius * XP.mergeRadius;
    let merged = false;
    for (let k = 0; k < n; k++) {
      const a = pk[ids[k]];
      if (a.gone) continue;
      const cnt = g.query(a.x, a.y, XP.mergeRadius, buf);
      let changed = false;
      for (let c = 0; c < cnt; c++) {
        const b = pk[buf[c]];
        if (b === a || b.gone) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy > r2) continue;
        a.value += b.value;
        b.gone = true;
        changed = true;
      }
      if (changed) {
        merged = true;
        const id = xpTierFor(a.value);
        a.type = id;
        a.sprite = PICKUPS[id].sprite;
      }
    }
    if (merged) {
      for (let i = pk.length - 1; i >= 0; i--) {
        if (pk[i].gone) { pk[i] = pk[pk.length - 1]; pk.pop(); }
      }
    }
  }

  // ---------- уровни и карточки ----------

  _checkLevel() {
    const pl = this.player;
    while (pl.xp >= pl.xpNext) {
      pl.xp -= pl.xpNext;
      pl.level++;
      pl.xpNext = xpForLevel(pl.level);
      this.pendingLevels++;
      this.events.push({ type: 'levelup', level: pl.level });
    }
    if (this.pendingLevels > 0 && this.state === 'running') {
      this.state = 'levelup';
      this.levelUp.cards = UP.drawCards(pl, this.rng, this.banished);
    }
  }

  _afterChoice() {
    this.pendingLevels--;
    if (this.pendingLevels > 0) {
      this.levelUp.cards = UP.drawCards(this.player, this.rng, this.banished);
    } else {
      this.levelUp.cards = [];
      this.state = 'running';
    }
  }

  _applyCard(card) {
    if (card.kind === 'heal') {
      const pl = this.player;
      pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * LEVEL_UP.healFraction);
      return;
    }
    UP.applyCard(this.player, card);
  }

  chooseCard(i) {
    if (this.state !== 'levelup') return;
    const card = this.levelUp.cards[i];
    if (!card) return;
    this._applyCard(card);
    this._syncBuild();
    this._afterChoice();
  }

  reroll() {
    if (this.state !== 'levelup' || this.levelUp.rerolls <= 0) return false;
    this.levelUp.rerolls--;
    this.levelUp.cards = UP.drawCards(this.player, this.rng, this.banished);
    return true;
  }

  skip() {
    if (this.state !== 'levelup' || this.levelUp.skips <= 0) return false;
    this.levelUp.skips--;
    this._afterChoice();
    return true;
  }

  banish(i) {
    if (this.state !== 'levelup' || this.levelUp.banishes <= 0) return false;
    const cards = this.levelUp.cards;
    const card = cards[i];
    if (!card || card.kind === 'heal') return false;
    this.levelUp.banishes--;
    this.banished.add(UP.cardKey(card));
    const repl = UP.drawCards(this.player, this.rng, this.banished, 1, cards);
    if (repl.length) cards[i] = repl[0];
    else cards.splice(i, 1);
    if (cards.length === 0) cards.push(UP.healCard());
    return true;
  }

  // ---------- сборка игрока ----------

  // Создаёт состояние новых оружий, пересчитывает статы и параметры оружия.
  _syncBuild() {
    const pl = this.player;
    const ws = pl.weapons;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.def) continue;
      w.def = WEAPONS[w.id];
      w.beh = WEAPON_BEHAVIORS[w.def.behavior];
      w.params = {};
      w.cooldown = 0.3;
      w.removed = false;
      w.slot = this._freeSlot();
      w.shields = null;
      w.p = null;
      w.t = 0; w.n = 0; w.q = 0; w.active = false; w.timer = 0;
      this._refreshWeapon(w);
      if (w.beh.init) w.beh.init(w, this);
    }
    const old = pl.maxHp;
    computeStats(this.heroDef.stats, pl.passives, pl.stats);
    pl.maxHp = pl.stats.maxHp;
    if (pl.maxHp > old) pl.hp += pl.maxHp - old;
    if (pl.hp > pl.maxHp) pl.hp = pl.maxHp;
    for (let i = 0; i < ws.length; i++) this._refreshWeapon(ws[i]);
  }

  _freeSlot() {
    const ws = this.player.weapons;
    for (let s = 0; s < SLOT_COUNT; s++) {
      let used = false;
      for (let i = 0; i < ws.length; i++) if (ws[i].def && ws[i].slot === s) { used = true; break; }
      if (!used) return s;
    }
    return 0;
  }

  _refreshWeapon(w) {
    const lv = w.def.levels[Math.min(w.level, w.def.levels.length) - 1];
    const p = w.params;
    for (const k in lv) p[k] = lv[k];
    const st = this.player.stats;
    p.damage = lv.damage * st.atk;
    p.cooldown = lv.cooldown / st.haste;
  }
}

export function createSim(opts) {
  return new Sim(opts);
}

