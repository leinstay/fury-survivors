// Симуляция игры. Чистая логика: без Phaser, без DOM, без Math.random.
// Контракт полей и методов описан в docs/ARCHITECTURE.md.
import {
  SIM, PLAYER, COMBAT, XP, DROPS, LEVEL_UP, HUD, SLOTS, GAME_WIDTH, GAME_HEIGHT, CHEST,
} from '../data/constants.js';
import { COOP } from '../data/coop.js';
import { HEROES } from '../data/heroes.js';
import { validHero, distinctHeroes } from './heroes.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { PICKUPS } from '../data/pickups.js';
import { forest } from '../data/stages/forest.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { WEAPON_BEHAVIORS, ENEMY_BEHAVIORS } from '../behaviors/index.js';
import { applyStatus, updateDots } from '../behaviors/status.js';
import { createRng, hashSeed } from './rng.js';
import { Grid } from './grid.js';
import { computeStats, critChance } from './stats.js';
import { createDirector } from './director.js';
import { createRoads } from './roads.js';
import * as UP from './upgrades.js';
import { UNIQUES } from '../data/items.js';
import { rollChest, rollHearts, bossDrop } from './items.js';
import {
  normalizeLoadout, loadoutUnique, loadoutExtra, applyUniqueRules, DICE_STATS, loadoutBonus,
} from './loadout.js';
import { initReaper, updateReaper, playerSpeed } from './reaper.js';

const STAGES = { forest };
const EMPTY = {};
const HIT_MEM = 24;      // память о поражённых целях у пробивающих снарядов
const SLOT_COUNT = 32;   // слоты таймеров повторного попадания (по оружию; на двоих до 12 оружий)
const NEVER = -1e9;

// Кристаллы опыта от крупных к мелким.
const XP_TIERS = Object.keys(PICKUPS)
  .filter((id) => PICKUPS[id].kind === 'xp')
  .sort((a, b) => PICKUPS[b].value - PICKUPS[a].value);

function xpTierFor(value) {
  for (let i = 0; i < XP_TIERS.length; i++) {
    if (PICKUPS[XP_TIERS[i]].value <= value) return XP_TIERS[i];
  }
  return XP_TIERS[XP_TIERS.length - 1];
}

/**
 * @param {number} level текущий уровень
 * @return {number} опыт до следующего уровня
 */
export function xpForLevel(level, scale = 1) {
  level = 1 + Math.floor((level - 1) / scale);
  let need = XP.base;
  let from = 1;
  for (const s of XP.steps) {
    const to = Math.min(level, s.below);
    if (to > from) need += s.per * (to - from);
    from = Math.max(from, to);
  }
  for (const t of XP.thresholds) if (t.level === level) need += t.extra;
  return need * (XP.costMul || 1);
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
    // герои по игрокам: соло o.hero, кооп o.heroes (лобби); у каждого свой, неизвестный или занятый
    // id заменяется первым свободным (core/heroes.js)
    this.heroes = o.players > 1 ?
      distinctHeroes(Math.min(o.players, COOP.players), o.heroes || []) : [validHero(o.hero)];
    this.heroDef = HEROES[this.heroes[0]];
    this.stage = STAGES[o.stage] ? o.stage : 'forest'; // id зоны: кодекс и таблица рекордов
    this.stageDef = STAGES[this.stage];
    this.difficulty = DIFFICULTIES[o.difficulty] ? o.difficulty : DEFAULT_DIFFICULTY;
    this.diff = DIFFICULTIES[this.difficulty];
    this.seed = o.seed === undefined ? 1 : o.seed;
    this.rng = createRng(this.seed);
    this.director = createDirector(this.stageDef, this.rng);
    const rc = this.stageDef.roads;
    this.roads = rc ? createRoads(rc, hashSeed(this.seed, 7, 7)) : null;

    this.state = 'running';
    this.time = 0;
    this.kills = 0;
    this.coins = 0;
    this.won = false;       // финальный босс убит (забег закончится победой)
    this.overtime = -1;     // время начала овертайма (stage.overtime) или -1
    this.boss = null;
    this.damageByWeapon = {};
    this.dps = 0;           // средний урон в секунду за последние HUD.dpsWindow секунд (обновляется раз в секунду)
    this.dpsByWeapon = {};  // то же по оружию { weaponId: dps }
    this.dpsAcc = {};       // урон по оружию с начала текущей секунды
    this.dpsBuckets = [];   // урон по секундам (объекты по оружию), не больше HUD.dpsWindow
    this.dpsNext = 1;       // время закрытия текущей секунды
    this.projTint = 0;
    this.events = [];
    // Совместимый журнал для старых инструментов. С подключёнными наблюдателями
    // решения доставляются сразу каждому из них, в том числе между шагами сима.
    this.pickLog = [];
    this.telemetryObservers = new Set();
    this.enemies = [];
    this.projectiles = [];
    this.telegraphs = [];   // предупреждения об ударах по земле { uid, x, y, radius, delay, t, dmg }
    // Жница (src/core/reaper.js): таймеры, освящённые круги, песочные часы
    this.reaper = null;
    this.holy = [];
    this.hourglasses = [];
    this.pickups = [];
    this.props = [];
    this.uid = 0;
    this.stamp = 0;
    this.frame = 0;
    this.pendingLevels = 0;
    // сундук скиллов (state 'chest'), player — кто подобрал. Два режима: выбор эволюции (cards — варианты,
    // chooseChest / skipChest; кооп: потом показ выбранного обоим, state 'reveal', shown — что выпало,
    // revealT — сколько ещё показывать) и показ апгрейдов без выбора (cards пуст, rolls — [{player, cards}]
    // уже применено, done[i] — игрок i нажал Ok, chestOk)
    this.chest = { cards: [], shown: [], revealT: 0, rolls: [], done: [], player: 0 };
    // Лоадауты (сумки) по игрокам: o.loadouts[i] (соло — [0]). Лут с боссов (pl.loot) катится своим RNG от
    // seed: ход забега от него не зависит, а у обоих клиентов коопа он одинаковый.
    this.loadouts = Array.isArray(o.loadouts) ? o.loadouts : [];
    this.lootRng = createRng(hashSeed(this.seed, 11, 13));
    this.bossKills = 0;     // убито боссов (номер следующего сундука с лутом, BOSS_DROPS)
    // Экран лута по подбору сундука босса (o.lootScreen, игра ставит у обоих клиентов): state 'loot', мир стоит,
    // пока каждый игрок не решит по своим предметам (lootDone). Решения (стеш, кристаллы) вне сима, в сим
    // приходит только «закончил». Без опции (боты, инструменты) лут лишь копится в pl.loot.
    this.lootScreen = !!o.lootScreen;
    // без эволюций из сундука по игрокам (лаборатория баланса tools/simulation): o.noEvolution[i]
    this.noEvolution = Array.isArray(o.noEvolution) ? o.noEvolution : [];
    this.lootPending = 0;   // сундуков лута, ждущих экрана (открывается, когда state снова 'running')
    this.lootDone = [];     // state 'loot': закончил ли игрок i
    this.winAfterLoot = false; // финал или Жница убиты: победа после экрана лута

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

    // Игроки: соло один, кооп COOP.players. Опыт и уровень общие и лежат у players[0] (this.player);
    // оружие, пассивки, HP, гроб, урон по оружию и выбор карточек (свой набор, reroll/skip/banish, изгнанные)
    // у каждого свои. this.view — центр экрана (середина между живыми).
    this.coop = o.players > 1;
    this.players = [];
    const n = this.coop ? Math.min(o.players, COOP.players) : 1;
    for (let i = 0; i < n; i++) this.players.push(this._makePlayer(i, n));
    this.player = this.players[0];
    // Библия у любого игрока: Жница уязвима в освящённом круге (docs/META.md, 4)
    this.hasBible = this.players.some((p) => !!(p.uq && p.uq.reaperVulnerable));
    this.view = { x: 0, y: 0, dirX: 1, dirY: 0 };
    this.local = 0;         // индекс игрока за этим экраном (HUD, экраны выбора); сеть ставит 1 у гостя
    this.levelTurn = 0;     // чей ход выбирать карточку (по очереди, индекс растёт с каждым уровнем)
    this.picker = 0;        // индекс игрока, который выбирает сейчас (state 'levelup')
    this.resumeT = 0;       // сколько ещё стоит мир после выбора (state 'resume')
    this._syncBuild();
    this._updateChunks();
  }

  _makePlayer(i, n) {
    const hero = this.heroes[i];
    const heroDef = HEROES[hero];
    const stats = computeStats(heroDef.stats, [], {});
    const slots = n > 1 ? COOP.slots : SLOTS;
    const bag = normalizeLoadout(this.loadouts[i]);
    const unique = loadoutUnique(bag);
    const uq = unique ? UNIQUES[unique] : null;
    const pl = {
      id: i, hero, heroDef, sprite: heroDef.sprite,
      x: i * 24, y: 0, hp: stats.maxHp, maxHp: stats.maxHp,
      level: 1, xp: 0, xpNext: xpForLevel(1),
      facing: 1, moving: false, iframes: 0, hurtFlash: 0,
      weapons: [{ id: heroDef.startWeapon, level: 1 }],
      passives: [],
      stats,
      dirX: 1, dirY: 0,
      radius: PLAYER.radius,
      slots: { weapons: slots.weapons, passives: slots.passives },
      dead: false, coffinT: 0, revives: 0, dist: 0,
      overtimeSlow: 0, // минус скорости от пропущенных часов Жницы (src/core/reaper.js), поверх stats.speed
      name: '',
      thornsAt: NEVER, // время последнего срабатывания шипов (стат thorns, COMBAT.thornsCooldown)
      // свои карточки и пул: набор текущего уровня (done — не его ход или уже выбрал), изгнанные, лимиты;
      // picks — сколько своих уровней уже разобрал (чётный — карточки оружия, нечётный — пассивки),
      // kind — тип текущего набора (реролл и замена при банише его сохраняют)
      levelUp: {
        cards: [], done: true, banished: new Set(), picks: 0, kind: 'weapon',
        rerolls: LEVEL_UP.rerolls, skips: LEVEL_UP.skips, banishes: LEVEL_UP.banishes,
      },
      // урон своим оружием: за забег и окно DPS (HUD и итоги показывают своего игрока)
      damageByWeapon: {}, dps: 0, dpsByWeapon: {}, dpsAcc: {}, dpsBuckets: [],
      // телеметрия: полный урон ударов с перебором и число ударов по оружию (src/core/telemetry.js)
      rawByWeapon: {}, hitsByWeapon: {},
      // сумка и уникалка (действует только на владельца): bonus — loadoutBonus (+ ачивки), uq — UNIQUES или null;
      // uqDmg — у уникалки есть множитель урона по обстановке (damageEnemy)
      bag, bonus: loadoutBonus(bag), unique, uq,
      uqDmg: !!(uq && (uq.dmgPerSpeed || uq.dmgPerMissingHp || uq.nearRange)),
      dynMore: null,     // множители, что меняются в забеге: кости, last_chance
      dice: null, diceNext: 0, // кости: {up, down} текущей минуты, время следующего броска
      cheatUsed: false, cheatT: 0, // last_chance: сработал ли, сколько ещё неуязвимости до штрафа HP
      // сундуки с боссов: [{tier, boss, entries (rollChest), hearts}]; решения по ним — экран лута (state
      // 'loot', src/ui/loot.js), что не решено — после забега
      loot: [],
    };
    if (uq && uq.passiveSlotsAdd) pl.slots.passives += uq.passiveSlotsAdd;
    if (uq && uq.noNewWeapons) pl.slots.weapons = pl.weapons.length;
    return pl;
  }

  /** Выбор карточек первого игрока (соло). */
  get levelUp() {
    return this.players[0].levelUp;
  }

  get banished() {
    return this.players[0].levelUp.banished;
  }

  /** Множитель спавна: сложность × кооп. */
  get spawnMul() {
    return this.diff.spawnMul * (this.coop ? COOP.spawnMul : 1);
  }

  // Живые игроки (в соло всегда один).
  get alive() {
    return this.players.filter((p) => !p.dead);
  }

  // Цель для врагов и снарядов: ближайший живой игрок к точке (x, y); когда живых нет, первый игрок.
  target(x, y) {
    const ps = this.players;
    if (ps.length === 1) return ps[0];
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.dead) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = p; }
    }
    return best || ps[0];
  }

  // Центр экрана: середина между игроками, гробы тоже (их надо видеть, чтобы оживить); направление — среднее.
  _updateView() {
    const v = this.view;
    const list = this.players;
    let x = 0;
    let y = 0;
    let dx = 0;
    let dy = 0;
    for (const p of list) { x += p.x; y += p.y; dx += p.dirX; dy += p.dirY; }
    v.x = x / list.length;
    v.y = y / list.length;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.01) { v.dirX = dx / d; v.dirY = dy / d; }
  }

  // ---------- шаг ----------

  step(dt, input) {
    this.events.length = 0;
    if (this.state === 'resume') {
      // короткая пауза после выбора или паузы, мир ещё стоит
      if (dt > 0) this.resumeT -= dt;
      if (this.resumeT <= 0) {
        this.state = 'running';
        this._checkLevel(); // уровень, набранный до паузы, открывается сразу
      }
      return;
    }
    if (this.state === 'reveal') {
      // кооп: показ выбранного из сундука, мир стоит у обоих; время показа идёт по тикам, поэтому одинаково
      if (dt > 0) this.chest.revealT -= dt;
      if (this.chest.revealT <= 0) this.endReveal();
      return;
    }
    if (this.state !== 'running') return;
    // лут, отложенный сундуком или карточками, открывается, как только они закрылись
    if (this.lootPending > 0) { this._openLoot(); return; }
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    this._telemetry('input', input);
    this.time += dt;
    this.frame++;
    this._markPrev();
    const pl = this.player;
    for (const p of this.players) {
      if (p.uq && p.uq.dice && this.time >= p.diceNext) this._rollDice(p);
    }
    while (this.time >= this.dpsNext) {
      this.dpsNext++;
      this._closeDpsSecond(this);
      for (const p of this.players) this._closeDpsSecond(p);
    }

    // движение игроков: input — вектор первого, inputs[i] — по игрокам (кооп)
    const inputs = input && input.players ? input.players : [input];
    for (let i = 0; i < this.players.length; i++) {
      this._movePlayer(this.players[i], inputs[i] || inputs[0], dt);
    }
    this._updateView();

    this._updateChunks();
    this.director.update(this, dt);
    this._updateEnemies(dt);
    updateReaper(this, dt);
    this._buildGrid();
    this._separate();
    if (this.coop) this._updateCoffins(dt); // после сетки: индексы врагов прошлого шага устарели
    this._updateWeapons(dt);
    this._updateProjectiles(dt);
    updateDots(this);
    this._updateTelegraphs(dt);
    this._contactDamage();
    this._updatePickups(dt);
    this._sweepProps();
    this._sweepEnemies();
    this._checkLevel();
    if (this.lootPending > 0 && this.state === 'running') this._openLoot();
    this._telemetry('afterStep');
  }

  // Наблюдатели не меняют RNG или игровой state; подписываются только реальные сборщики данных.
  _telemetry(method, ...args) {
    for (const observer of this.telemetryObservers) observer[method]?.(this, ...args);
  }

  _logPick(pick) {
    if (!this.telemetryObservers.size) this.pickLog.push(pick);
    this._telemetry('decision', pick);
  }

  _movePlayer(pl, input, dt) {
    if (pl.dead) { pl.moving = false; return; }
    let ix = input && input.x ? input.x : 0;
    let iy = input && input.y ? input.y : 0;
    const len = Math.sqrt(ix * ix + iy * iy);
    if (len > 1) { ix /= len; iy /= len; }
    pl.moving = len > 0.05;
    if (pl.moving) {
      const sp = playerSpeed(this, pl);
      pl.x += ix * sp * dt;
      pl.y += iy * sp * dt;
      pl.dist += Math.min(1, len) * sp * dt; // пройдено, px (кодекс)
      if (ix > 0.05) pl.facing = 1; else if (ix < -0.05) pl.facing = -1;
      pl.dirX = ix / len;
      pl.dirY = iy / len;
      if (this.coop) this._clampToPartners(pl);
    }
    if (pl.iframes > 0) pl.iframes -= dt;
    if (pl.hurtFlash > 0) pl.hurtFlash -= dt;
    if (pl.cheatT > 0) {
      pl.cheatT -= dt;
      if (pl.cheatT <= 0) this._cheatPenalty(pl);
    }
    const still = pl.uq && pl.uq.regenOnlyStill;
    if (pl.stats.regen > 0 && pl.hp < pl.maxHp && !(still && pl.moving)) {
      pl.hp = Math.min(pl.maxHp, pl.hp + pl.stats.regen * dt);
    }
  }

  // Общий экран: игрок не может уйти от напарника дальше, чем позволяет экран минус отступ (как в VS).
  _clampToPartners(pl) {
    const maxDx = GAME_WIDTH - 2 * COOP.edge;
    const maxDy = GAME_HEIGHT - 2 * COOP.edge;
    for (const o of this.players) {
      if (o === pl) continue;
      if (pl.x > o.x + maxDx) pl.x = o.x + maxDx;
      else if (pl.x < o.x - maxDx) pl.x = o.x - maxDx;
      if (pl.y > o.y + maxDy) pl.y = o.y + maxDy;
      else if (pl.y < o.y - maxDy) pl.y = o.y - maxDy;
    }
  }

  // Гроб: таймер идёт быстрее рядом с напарником и медленнее, пока на гробу стоит враг; по истечении оживление.
  _updateCoffins(dt) {
    for (const pl of this.players) {
      if (!pl.dead) continue;
      let k = 1;
      for (const o of this.players) {
        if (o === pl || o.dead) continue;
        const dx = o.x - pl.x;
        const dy = o.y - pl.y;
        if (dx * dx + dy * dy <= COOP.allyRadius * COOP.allyRadius) k *= COOP.allyBoost;
      }
      const cnt = this.grid.query(pl.x, pl.y, COOP.coffinRadius + this.maxSize, this.qbuf);
      for (let c = 0; c < cnt; c++) {
        const e = this.enemies[this.qbuf[c]];
        if (e.dead) continue;
        const dx = e.x - pl.x;
        const dy = e.y - pl.y;
        const r = COOP.coffinRadius + e.size;
        if (dx * dx + dy * dy <= r * r) { k *= COOP.enemySlow; break; }
      }
      pl.coffinT -= dt * k;
      if (pl.coffinT <= 0) this._revive(pl);
    }
  }

  _revive(pl) {
    pl.dead = false;
    pl.coffinT = 0;
    pl.hp = Math.max(1, Math.round(pl.maxHp * COOP.reviveHp));
    pl.iframes = COOP.reviveIframes;
    pl.revives++;
    this.events.push({ type: 'revive', player: pl.id, x: pl.x, y: pl.y });
  }

  // ---------- враги ----------

  canSpawn() {
    return this.enemies.length - this.deadN < SIM.maxEnemies;
  }

  // Освободить место для элиты или босса: убрать самого далёкого обычного врага (без дропа).
  _evictOne() {
    const pl = this.view;
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
        hitFlash: 0, moving: false, pose: 'idle', rage: false, alpha: 1,
        vx: 0, vy: 0, kx: 0, ky: 0, speed: 0, damage: 0, xp: 0, st: 0, a: 0, b: 0, t: 0, mark: 0,
        dead: false, def: null, params: EMPTY, beh: null, resist: 0, transient: false, vuln: false,
        hitAt: new Float64Array(SLOT_COUNT),
        // замедление и ДоТы (behaviors/status.js), действуют, пока *Uid совпадает с uid
        slowUid: 0, slowMul: 1, slowEnd: 0, rootUid: 0, rootEnd: 0,
        dotUid: 0, dotNext: 0, pz: null, pzN: 0, burn: null, bleed: null,
      };
    }
    const mins = this.time / 60;
    const sc = this.stageDef.scaling || EMPTY;
    let hpScale = (1 + (sc.hpPerMinute || 0) * mins) *
        (isBoss ? 1 : (this.coop ? COOP.enemyHpMul : 1) * this.diff.hpMul);
    let dmgScale = 1 + (sc.damagePerMinute || 0) * mins;
    if (this.overtime >= 0) {
      const ot = this.stageDef.overtime;
      const s = this.time - this.overtime;
      hpScale *= 1 + (ot.hpRamp || 0) * s;
      dmgScale *= 1 + (ot.damageRamp || 0) * s;
    }
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
    const coopXp = this.coop ? COOP.xpMul : 1;
    e.xp = (def.xp || 0) * (ed ? ed.xpMul || 1 : 1) * this.diff.xpMul * coopXp;
    e.pose = 'idle'; e.alpha = 1; e.rage = false; e.st = 0; e.a = 0; e.b = 0; e.t = this.rng.next() * 6.2832; e.mark = 0;
    e.dead = false;
    e.transient = false;
    e.vuln = false;         // Жница в освящённом круге (src/core/reaper.js)
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
    const v = this.view;
    const e = this.spawnEnemy(id, v.x + v.dirX * 300, v.y + v.dirY * 300, false, true);
    // Правило VS: HP босса = hpPerLevel × уровень игрока при появлении (без роста со временем).
    // Без hpPerLevel работает прежний путь: hp × рост этапа.
    if (e && e.def.hpPerLevel) {
      e.maxHp = e.def.hpPerLevel * pl.level * (this.coop ? COOP.bossHpMul : 1);
      e.hp = e.maxHp;
    }
    if (e) {
      initReaper(this, e);
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

  // Ближайший целый разрушаемый объект (бочка, фонарь, вагонетка) в радиусе maxDist или null. Оружие с
  // наведением бьёт по нему, когда врагов рядом нет: окружение ломает любое оружие, а не только то, что
  // само попадает в объект по пути.
  nearestProp(x, y, maxDist) {
    const props = this.props;
    let best = null;
    let bd = maxDist * maxDist;
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (o.dead) continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = o; }
    }
    return best;
  }

  // Ближайшая цель для самонаводящегося оружия: живой враг или целый разрушаемый объект (o.breakable) — из
  // одного списка, объект выбирается наравне с врагом, если он ближе. mark !== 0 исключает отмеченных этим штампом.
  nearestTarget(x, y, maxDist, mark = 0) {
    const e = this.nearestEnemy(x, y, maxDist, mark);
    const props = this.props;
    let best = e;
    let bd = e ? (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) : maxDist * maxDist;
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (o.dead || (mark !== 0 && o.mark === mark)) continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = o; }
    }
    return best;
  }

  // Мгновенный удар по отрезку (молния): ломает объекты, которых касается отрезок шириной width.
  // mark — штамп залпа (nextStamp): один залп бьёт объект один раз, сколько бы звеньев через него ни прошло.
  hitPropsOnSegment(x0, y0, x1, y1, width, mark) {
    const props = this.props;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (o.dead || o.mark === mark) continue;
      let k = len2 > 0 ? ((o.x - x0) * dx + (o.y - y0) * dy) / len2 : 0;
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      const ex = o.x - (x0 + dx * k);
      const ey = o.y - (y0 + dy * k);
      const r = o.radius + width;
      if (ex * ex + ey * ey > r * r) continue;
      o.mark = mark;
      this._damageProp(o);
    }
  }

  _updateEnemies(dt) {
    const en = this.enemies;
    const pl = this.view;
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
      if (!e.boss && dx * dx + dy * dy > far2) {
        // стена и пролёт (transient) уходят за край и исчезают без дропа, остальные догоняют игрока
        if (e.transient) { e.dead = true; this.deadN++; } else this._teleportAhead(e);
      }
    }
  }

  // Отставший враг переносится вперёд по ходу игрока.
  _teleportAhead(e) {
    const pl = this.view;
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

  // Итоговый шанс крита: стат crit × удача (пассивка Luck обещает «больше критов», как и лучший дроп).
  critChance(pl = this.player) {
    return critChance(pl.stats);
  }

  // Позиции до шага: рендер рисует между ними и текущими (сглаживание между тиками). Только для показа:
  // в хеш и в логику не входят. pf — номер тика, на котором записаны (у созданных в этом шаге его нет).
  _markPrev() {
    const f = this.frame;
    for (const list of [this.players, this.enemies, this.projectiles, this.pickups]) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        e.px = e.x; e.py = e.y; e.pf = f;
      }
    }
  }

  // Окно DPS (HUD.dpsWindow секунд) для o: всего забега (sim) или одного игрока — у обоих те же поля.
  _closeDpsSecond(o) {
    const b = o.dpsBuckets;
    b.push(o.dpsAcc);
    o.dpsAcc = {};
    if (b.length > HUD.dpsWindow) b.shift();
    const byW = {};
    let sum = 0;
    for (let i = 0; i < b.length; i++) {
      for (const wid in b[i]) { byW[wid] = (byW[wid] || 0) + b[i][wid]; sum += b[i][wid]; }
    }
    for (const wid in byW) byW[wid] /= b.length;
    o.dpsByWeapon = byW;
    o.dps = sum / b.length;
  }

  // Урон врагу. (sx, sy) — источник для направления отбрасывания; by — игрок-владелец оружия (крит по его статам).
  // status — поле status оружия ({type, chance}, src/data/status.js): после удара по живому врагу ДоТ от урона
  // до крита.
  damageEnemy(e, dmg, wid, kb, sx, sy, by = this.player, component = '', status = null) {
    // жница: урон не проходит (чисел урона нет), кроме как в освящённом круге при Библии (e.vuln)
    if (e.dead || (e.def.invulnerable && !e.vuln)) return;
    if (by.uqDmg) dmg *= this._uniqueDmg(by, e);
    const crit = this.rng.next() < this.critChance(by);
    e.lastBy = by.id;
    e.lastWid = wid;
    const amount = crit ? dmg * (COMBAT.critMul + (by.stats.critDmg || 0)) : dmg;
    const dealt = amount < e.hp ? amount : e.hp;
    e.hp -= amount;
    e.hitFlash = COMBAT.hitFlash;
    this._credit(by, wid, amount, dealt);
    by.hitsByWeapon[wid] = (by.hitsByWeapon[wid] || 0) + 1;
    this.events.push({ type: 'hit', x: e.x, y: e.y, amount: Math.max(1, Math.round(amount)), crit, weapon: wid });
    if (kb > 0 && e.resist < 1 && !e.boss) {
      const dx = e.x - sx;
      const dy = e.y - sy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = kb * (1 - e.resist);
      e.kx = (dx / d) * k;
      e.ky = (dy / d) * k;
    }
    this._telemetry('hit', e, by, wid, amount, dealt,
        kb > 0 && e.resist < 1 && !e.boss ? kb * (1 - e.resist) : 0, component);
    if (e.hp <= 0) this._killEnemy(e);
    else if (status) applyStatus(e, this, status, dmg, wid, by);
  }

  // Урон тика ДоТа (behaviors/status.js): без крита, отбрасывания и вспышки; в статистику оружия wid игрока by
  // (DPS, итоги, телеметрия), но не в число ударов. type — статус (событие 'dot' для чисел урона).
  dotDamage(e, amount, wid, by, type) {
    if (e.dead || (e.def.invulnerable && !e.vuln) || !(amount > 0)) return;
    e.lastBy = by.id;
    e.lastWid = wid;
    const dealt = amount < e.hp ? amount : e.hp;
    e.hp -= amount;
    this._credit(by, wid, amount, dealt);
    this.events.push({ type: 'dot', x: e.x, y: e.y, amount: Math.max(1, Math.round(amount)), status: type,
      weapon: wid });
    this._telemetry('dot', e, by, wid, amount, dealt, type);
    if (e.hp <= 0) this._killEnemy(e);
  }

  // Урон оружия wid игрока by в счётчики забега и игрока (итоги, окно DPS, телеметрия).
  _credit(by, wid, amount, dealt) {
    this.damageByWeapon[wid] = (this.damageByWeapon[wid] || 0) + dealt;
    this.dpsAcc[wid] = (this.dpsAcc[wid] || 0) + dealt;
    by.damageByWeapon[wid] = (by.damageByWeapon[wid] || 0) + dealt;
    by.dpsAcc[wid] = (by.dpsAcc[wid] || 0) + dealt;
    by.rawByWeapon[wid] = (by.rawByWeapon[wid] || 0) + amount;
  }

  // Удача для дропа: лучшая среди живых игроков.
  luck() {
    let best = 0;
    for (const p of this.players) if (!p.dead && p.stats.luck > best) best = p.stats.luck;
    return best || this.player.stats.luck;
  }

  _killEnemy(e) {
    e.dead = true;
    this.deadN++;
    this.kills++;
    const luck = this.luck();
    this.events.push({
      type: 'kill', x: e.x, y: e.y, enemy: e.type, elite: e.elite, boss: e.boss, final: !!(e.boss && e.def.final),
      sprite: e.sprite, size: e.size, by: e.lastBy || 0, // by — игрок, чей удар добил (кодекс)
      weapon: e.lastWid || '', // чем добил (телеметрия)
    });
    if (e.xp > 0) this.dropPickup(xpTierFor(e.xp), e.x, e.y, e.xp);
    if (e.boss) {
      this._bossLoot(e, !!(e.def.victory || (e.def.final && !this.stageDef.overtime)));
      if (e.def.drop) this.dropPickup(e.def.drop, e.x, e.y);
      if (e.def.final) {
        this.won = true;
        if (this.stageDef.overtime) {
          // Овертайм: забег идёт дальше ради очков, смерть засчитывается как победа.
          this.overtime = this.time;
          this.events.push({ type: 'overtime' });
        } else {
          this._winAfterLoot();
        }
      } else {
        this.events.push({ type: 'bossDown', boss: e.type });
        // Жница: победа, овертайм кончается
        if (e.def.victory) { this.won = true; this._winAfterLoot(); }
      }
      return;
    }
    if (e.elite) {
      this.dropPickup(e.def.elite.drop || 'chest', e.x, e.y);
      this._chestHorde(e);
    } else {
      const r = this.rng.next();
      if (r < DROPS.coinChance * luck) this.dropPickup('coin', e.x, e.y);
      else if (r < (DROPS.coinChance + DROPS.foodChance) * luck) this.dropPickup('food', e.x, e.y);
    }
  }

  // Мини-орда вокруг сундука элиты (stage.chestHorde): кольцо врагов её типа, за сундуком надо пробиться.
  _chestHorde(e) {
    const h = this.stageDef.chestHorde;
    if (!h) return;
    const off = this.rng.next() * Math.PI * 2;
    const n = Math.round(h.count * this.spawnMul);
    for (let i = 0; i < n; i++) {
      if (!this.canSpawn()) break;
      const a = off + (i / n) * Math.PI * 2;
      this.spawnEnemy(e.type, e.x + Math.cos(a) * h.radius, e.y + Math.sin(a) * h.radius, false);
    }
    this.events.push({ type: 'horde', x: e.x, y: e.y, enemy: e.type });
  }

  _sweepEnemies() {
    const en = this.enemies;
    this.deadN = 0;
    for (let i = en.length - 1; i >= 0; i--) {
      const e = en[i];
      if (!e.dead) continue;
      en[i] = en[en.length - 1];
      en.pop();
      // полоса HP переходит к другому живому боссу (прошлый босс мог пережить появление следующего)
      if (this.boss === e) this.boss = en.find((o) => o.boss && !o.dead) || null;
      this.enemyPool.push(e);
    }
  }

  // Касание: первый задевший враг бьёт (если нет i-frames). Жница (oneShot) убивает всегда, поэтому, пока
  // она на поле, обход идёт дальше первого касания.
  _contactDamage() {
    const en = this.enemies;
    const reaper = !!this.reaper;
    for (const pl of this.players) {
      if (pl.dead || (pl.iframes > 0 && !reaper)) continue;
      const cnt = this.grid.query(pl.x, pl.y, pl.radius + this.maxSize, this.qbuf);
      let hit = false;
      for (let c = 0; c < cnt; c++) {
        const e = en[this.qbuf[c]];
        if (e.dead) continue;
        const dx = e.x - pl.x;
        const dy = e.y - pl.y;
        const r = e.size * 0.8 + pl.radius;
        if (dx * dx + dy * dy > r * r) continue;
        if (e.def.oneShot) { this._oneShot(pl, e.type); break; }
        if (!hit && pl.iframes <= 0) {
          hit = true;
          this.hurtPlayer(e.damage, pl, e.type);
          if (pl.dead || this.state !== 'running') break;
        }
        if (hit && !reaper) break;
      }
    }
  }

  // Смерть от касания Жницы: мимо сопротивления, уклонения, i-frames и last_chance.
  _oneShot(pl, src) {
    if (pl.dead || this.state !== 'running') return;
    const amount = Math.max(1, Math.ceil(pl.hp));
    pl.hp = 0;
    pl.hurtFlash = PLAYER.hurtFlash;
    this.events.push({ type: 'playerHurt', amount, player: pl.id, src, oneShot: true });
    this._down(pl);
  }

  // Урон игроку (по умолчанию первому). В коопе смерть превращает игрока в гроб (оживёт по таймеру),
  // забег кончается, когда мертвы все.
  // src — кто ударил (id врага или босса; для кодекса). dodgeable — удар можно избежать статом dodge
  // (контакт и снаряды; удары по площади с предупреждением, slam, — нет).
  hurtPlayer(raw, pl = this.player, src = '', dodgeable = true) {
    if (pl.dead || pl.iframes > 0 || this.state !== 'running') return;
    // шанс увернуться: rng тянется только при dodge > 0 (без стата ход сима тот же)
    if (dodgeable && pl.stats.dodge > 0 && this.rng.next() < pl.stats.dodge) {
      pl.iframes = PLAYER.iframes; // одна увёртка гасит и остальных врагов в касании этого кадра
      this.events.push({ type: 'dodge', player: pl.id, x: pl.x, y: pl.y, src });
      return;
    }
    // сопротивление: доля снижения удара (сумма источников, кап в STAT_CAPS), но не меньше COMBAT.minDamage
    const amount = Math.max(COMBAT.minDamage, raw * (1 - (pl.stats.resistance || 0)));
    pl.hp -= amount;
    pl.iframes = PLAYER.iframes;
    pl.hurtFlash = PLAYER.hurtFlash;
    this.events.push({ type: 'playerHurt', amount, player: pl.id, src });
    if (pl.stats.thorns > 0) this._thorns(pl);
    if (pl.hp <= 0 && this._cheatDeath(pl)) return;
    if (pl.hp > 0) return;
    this._down(pl);
  }

  // HP кончилось: в коопе гроб (забег кончается, когда мертвы все), в соло конец забега (после финала — победа).
  _down(pl) {
    pl.hp = 0;
    if (this.coop) {
      pl.dead = true;
      pl.coffinT = COOP.reviveTime;
      pl.moving = false;
      this.events.push({ type: 'playerDown', player: pl.id, x: pl.x, y: pl.y });
      if (this.alive.length > 0) return;
    }
    if (this.won) { this._win(); return; }
    this.state = 'gameover';
    this.events.push({ type: 'gameover' });
  }

  // Шипы: удар по герою бьёт всех врагов (не боссов) на экране вокруг него на долю thorns от их максимума HP
  // (не чаще COMBAT.thornsCooldown): плоский урон отставал от роста HP врагов. Без крита, отбрасывания и множителей
  // урона. Урон пишется на 'thorns' (как оружие: DPS, итоги, телеметрия).
  _thorns(pl) {
    if (this.time - pl.thornsAt < COMBAT.thornsCooldown) return;
    pl.thornsAt = this.time;
    const share = pl.stats.thorns;
    const hw = GAME_WIDTH / 2;
    const hh = GAME_HEIGHT / 2;
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (e.dead || e.boss || Math.abs(e.x - pl.x) > hw || Math.abs(e.y - pl.y) > hh) continue;
      if (e.def.invulnerable && !e.vuln) continue;
      const amount = share * e.maxHp;
      const dealt = amount < e.hp ? amount : e.hp;
      e.hp -= amount;
      e.hitFlash = COMBAT.hitFlash;
      e.lastBy = pl.id;
      e.lastWid = 'thorns';
      this._credit(pl, 'thorns', amount, dealt);
      pl.hitsByWeapon.thorns = (pl.hitsByWeapon.thorns || 0) + 1;
      this.events.push({ type: 'hit', x: e.x, y: e.y, amount: Math.max(1, Math.round(amount)), crit: false,
        weapon: 'thorns' });
      this._telemetry('hit', e, pl, 'thorns', amount, dealt, 0, '');
      if (e.hp <= 0) this._killEnemy(e);
    }
    this.events.push({ type: 'thorns', player: pl.id, x: pl.x, y: pl.y });
  }

  // Победа от убийства босса: с экраном лута — после него (lootFinish), иначе сразу.
  _winAfterLoot() {
    if (this.lootScreen && this.lootPending > 0) this.winAfterLoot = true;
    else this._win();
  }

  _win() {
    this.winAfterLoot = false;
    this.state = 'victory';
    this.events.push({ type: 'victory' });
  }

  // Досрочно закончить овертайм (кнопка в паузе): победа с текущими очками.
  finishOvertime() {
    if (this.overtime < 0 || this.state !== 'running') return;
    this._win();
  }

  // ---------- оружие и снаряды ----------

  _updateWeapons(dt) {
    for (const pl of this.players) {
      if (pl.dead) continue;
      const ws = pl.weapons;
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        // цвет снарядов супероружия (weapons.js tint)
        this.projTint = w.def.tint || 0;
        w.beh.update(w, this, dt);
      }
    }
    this.projTint = 0;
  }

  // Выдать снаряд из пула. Поля сбрасываются; behavior заполняет нужные.
  addProjectile(owner, sprite) {
    let p = this.projPool.pop();
    if (!p) {
      p = {
        uid: 0, sprite: '', x: 0, y: 0, angle: 0, scale: 1, alpha: 1, owner: 'player',
        vx: 0, vy: 0, life: 0, radius: 0, dmg: 0, kb: 0, pierce: 0, rehit: 0, rehitOwn: false,
        once: false, hitTime: new Float64Array(HIT_MEM),
        a: 0, b: 0, c: 0, wid: '', ws: null, bk: null, slot: 0, hitN: 0, hitUid: new Int32Array(HIT_MEM), tint: 0, fx: '', life0: 0,
        drawOff: 0, drawLift: 0, cone: 0, src: '', blocks: false, ySort: false, tgt: null,
      };
    }
    p.uid = ++this.uid;
    p.sprite = sprite;
    p.owner = owner;
    p.x = 0; p.y = 0; p.angle = 0; p.scale = 1; p.alpha = 1;
    p.vx = 0; p.vy = 0; p.life = 1; p.radius = 0; p.dmg = 0; p.kb = 0;
    p.pierce = 0; p.rehit = 0; p.rehitOwn = false; p.once = false;
    p.a = 0; p.b = 0; p.c = 0; p.wid = ''; p.ws = null; p.bk = null; p.slot = 0; p.hitN = 0; p.tgt = null;
    p.tint = owner === 'player' ? this.projTint || 0 : 0;
    p.fx = ''; p.life0 = 0; // fx: зона рисуется слоями (render/zones.js), а не спрайтом
    // drawOff, drawLift: спрайт рисуется сдвинутым на drawOff px вдоль angle и на drawLift px вверх (взмах клинка);
    // cone > 0: удар конусом — x, y это вершина, radius длина, cone косинус половины угла вокруг angle
    p.drawOff = 0; p.drawLift = 0; p.cone = 0; p.src = ''; p.blocks = false; p.ySort = false;
    p.boss = false;
    this.projectiles.push(p);
    return p;
  }

  // Сколько снарядов обычных врагов летит сейчас (снаряды боссов не считаются). Для COMBAT.maxEnemyShots.
  enemyShots() {
    let n = 0;
    for (const p of this.projectiles) {
      if (p.owner === 'enemy' && p.life > 0 && !p.boss) n++;
    }
    return n;
  }

  // Снаряд врага. src — id стрелявшего (кодекс: кто попал).
  spawnEnemyProjectile(x, y, angle, speed, dmg, life, src = '') {
    const p = this.addProjectile('enemy', 'proj_enemy');
    p.src = src;
    p.x = x; p.y = y; p.angle = angle;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = life;
    p.radius = COMBAT.enemyProjectileRadius;
    p.dmg = dmg;
    return p;
  }

  // Удар по земле: через delay секунд урон игроку, если он в радиусе. Рендер только рисует sim.telegraphs.
  addTelegraph(x, y, radius, delay, dmg, src = '') {
    const tg = { uid: ++this.uid, x, y, radius, delay, t: 0, dmg, src };
    this.telegraphs.push(tg);
    return tg;
  }

  _updateTelegraphs(dt) {
    const arr = this.telegraphs;
    for (let i = arr.length - 1; i >= 0; i--) {
      const tg = arr[i];
      tg.t += dt;
      if (tg.t < tg.delay) continue;
      for (const pl of this.players) {
        if (pl.dead) continue;
        const dx = pl.x - tg.x;
        const dy = pl.y - tg.y;
        if (dx * dx + dy * dy <= tg.radius * tg.radius) this.hurtPlayer(tg.dmg, pl, tg.src, false);
      }
      this.events.push({ type: 'slam', x: tg.x, y: tg.y, radius: tg.radius });
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }

  _updateProjectiles(dt) {
    const arr = this.projectiles;
    // щиты (orbit, p.blocks): вражеский снаряд, задевший щит, гаснет
    const blockers = this.blockers || (this.blockers = []);
    blockers.length = 0;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (b.blocks && b.life > 0 && b.owner === 'player' && !(b.ws && b.ws.owner.dead)) blockers.push(b);
    }
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
          // снаряды лежащего в гробу не бьют: аура и щиты вокруг гроба не делают его турелью
          if (!(p.ws && p.ws.owner.dead)) this._projectileHits(p);
        } else if (this._blocked(p, blockers)) {
          p.life = 0;
          this.events.push({ type: 'block', x: p.x, y: p.y });
        } else {
          for (const t of this.players) {
            if (t.dead) continue;
            const dx = p.x - t.x;
            const dy = p.y - t.y;
            const r = p.radius + t.radius;
            if (dx * dx + dy * dy <= r * r) {
              this.hurtPlayer(p.dmg, t, p.src);
              p.life = 0;
              break;
            }
          }
        }
      }
      if (p.life <= 0) {
        if (p.bk && p.bk.expire) p.bk.expire(p, p.ws, this);
        arr[i] = arr[arr.length - 1];
        arr.pop();
        p.ws = null; p.bk = null; p.tgt = null;
        this.projPool.push(p);
      }
    }
  }

  _blocked(p, blockers) {
    for (let i = 0; i < blockers.length; i++) {
      const b = blockers[i];
      // Список составлен до обхода: щит мог уже истечь и вернуться в пул.
      if (!b.blocks || b.life <= 0 || !b.ws || b.ws.owner.dead) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const r = p.radius + b.radius;
      if (dx * dx + dy * dy <= r * r) {
        this._telemetry('block', p, b);
        return true;
      }
    }
    return false;
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
      if (p.cone > 0 && !this._inCone(p, dx, dy, e.size)) continue;
      if (p.rehit > 0) {
        if (p.rehitOwn) {
          if (!this._ownRehit(p, e.uid, t)) continue;
        } else {
          if (t - e.hitAt[p.slot] < p.rehit) continue;
          e.hitAt[p.slot] = t;
        }
      } else if (!p.once) {
        if (this._seen(p, e.uid)) continue;
        this._remember(p, e.uid);
      }
      this.damageEnemy(e, p.dmg, p.wid, p.kb, p.x, p.y, p.ws ? p.ws.owner : this.player,
          p.ws ? `${p.ws.def.behavior}:${p.ws.slot}` : '', p.ws ? p.ws.params.status : null);
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
      if (p.cone > 0 && !this._inCone(p, dx, dy, o.radius)) continue;
      if (p.rehit > 0) {
        if (p.rehitOwn) {
          if (!this._ownRehit(p, o.uid, t)) continue;
        } else {
          if (t - o.hitAt[p.slot] < p.rehit) continue;
          o.hitAt[p.slot] = t;
        }
      } else if (!p.once) {
        if (this._seen(p, o.uid)) continue;
        this._remember(p, o.uid);
      }
      this._damageProp(o);
    }
    if (p.once) p.dmg = 0;
  }

  // Цель (смещение dx, dy от вершины, радиус size) внутри конуса снаряда: угол до направления удара не больше
  // половины угла конуса; size расширяет конус на краях, чтобы задевать крупных врагов краем тела.
  _inCone(p, dx, dy, size) {
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= size) return true;
    return dx * Math.cos(p.angle) + dy * Math.sin(p.angle) >= p.cone * d - size;
  }

  // Повторный удар этого снаряда по цели не раньше чем через p.rehit (rehitOwn: у каждого щита свой таймер,
  // а не общий на оружие через e.hitAt[slot]). Память на HIT_MEM последних целей.
  _ownRehit(p, uid, t) {
    const n = p.hitN < HIT_MEM ? p.hitN : HIT_MEM;
    for (let i = 0; i < n; i++) {
      if (p.hitUid[i] !== uid) continue;
      if (t - p.hitTime[i] < p.rehit) return false;
      p.hitTime[i] = t;
      return true;
    }
    const i = p.hitN % HIT_MEM;
    p.hitUid[i] = uid;
    p.hitTime[i] = t;
    p.hitN++;
    return true;
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
    const pl = this.view;
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

  // Место для объекта по правилу place (см. stages/forest.js) или null, если за несколько попыток не нашлось.
  placeProp(def, cx, cy, rnd) {
    const cs = SIM.chunkSize;
    const roads = this.roads;
    const place = def.place || 'ground';
    if (!roads || place === 'any') return { x: (cx + rnd()) * cs, y: (cy + rnd()) * cs, angle: 0 };
    const half = roads.cfg.width / 2;
    if (place === 'road') {
      const p = roads.pointInChunk(cx * cs, cy * cs, cs, rnd);
      return p ? { x: p.x, y: p.y, angle: p.angle } : null;
    }
    for (let t = 0; t < 8; t++) {
      const x = (cx + rnd()) * cs;
      const y = (cy + rnd()) * cs;
      const d = roads.distance(x, y);
      if (place === 'roadside' ? (d > half + 4 && d < half + 24) : d > half + (def.big ? 28 : 4)) return { x, y, angle: 0 };
    }
    // обочины в чанке нет: объект с fallback (фонарь) встаёт как обычный, остальные (вагонетка) пропускаются
    if (place === 'roadside' && def.fallback) return this.placeProp({ ...def, place: def.fallback }, cx, cy, rnd);
    return null;
  }

  _genChunk(cx, cy) {
    const r = createRng(hashSeed(this.seed, cx, cy));
    const defs = this.stageDef.props || [];
    for (let d = 0; d < defs.length; d++) {
      const def = defs[d];
      if (!def.breakable) continue;
      let n = Math.floor(def.density);
      if (r.next() < def.density - n) n++;
      for (let i = 0; i < n; i++) {
        const at = this.placeProp(def, cx, cy, () => r.next());
        if (!at) continue;
        this.props.push({
          uid: ++this.uid, sprite: def.sprite, x: at.x, y: at.y, angle: at.angle,
          breakable: true, hp: def.hp || 1, radius: SIM.propRadius,
          drop: def.drop || EMPTY, dead: false, mark: 0,
          hitAt: new Float64Array(SLOT_COUNT).fill(NEVER),
        });
      }
    }
  }

  _damageProp(o) {
    o.hp -= 1;
    if (o.hp > 0) return;
    o.dead = true;
    this.events.push({ type: 'propBreak', x: o.x, y: o.y, sprite: o.sprite });
    const luck = this.luck();
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
      value: value === undefined ? (def.value || 0) : value, pulled: false, gone: false, to: -1,
      tint: def.tint || 0, boss: '',
    };
    this.pickups.push(pk);
    return pk;
  }

  // Предметы: кристаллы и монеты тянутся к игроку, в чей радиус подбора попали (pk.to), остальное по касанию.
  _updatePickups(dt) {
    const arr = this.pickups;
    const ps = this.players;
    const touch2 = PLAYER.touchRadius * PLAYER.touchRadius;
    const spd = PLAYER.magnetSpeed;
    let xpCount = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const pk = arr[i];
      const pullable = pk.kind === 'xp' || pk.kind === 'coin';
      let take = null;
      if (pk.pulled) {
        // цель притяжения: назначенный игрок, если он жив, иначе ближайший живой
        let pl = pk.to >= 0 ? ps[pk.to] : null;
        if (!pl || pl.dead) pl = this.target(pk.x, pk.y);
        const dx = pl.x - pk.x;
        const dy = pl.y - pk.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const step = spd * dt;
        if (d <= step + 3) take = pl;
        else { pk.x += (dx / d) * step; pk.y += (dy / d) * step; }
      } else {
        for (let j = 0; j < ps.length; j++) {
          const pl = ps[j];
          if (pl.dead) continue;
          const dx = pl.x - pk.x;
          const dy = pl.y - pk.y;
          const d2 = dx * dx + dy * dy;
          if (pullable) {
            const pr = PLAYER.pickupRadius * pl.stats.pickup;
            if (d2 <= pr * pr) { pk.pulled = true; pk.to = j; break; }
          } else if (d2 <= touch2) {
            take = pl;
            break;
          }
        }
      }
      if (take) {
        this._collect(pk, take);
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

  _collect(pk, by = this.player) {
    this._telemetry('pickup', pk, by);
    const pl = by;
    switch (pk.kind) {
      case 'xp':
        this.player.xp += pk.value * (pl.stats.xpGain ?? 1); // опыт общий (у первого игрока), множитель подобравшего
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
        this._openChest(pl);
        break;
      case 'loot':
        this._rollLoot(pk.value, pk.boss);
        break;
      default:
        break;
    }
    this.events.push({ type: 'pickup', kind: pk.kind, player: pl.id });
  }

  // Сундук скиллов (с элит), docs/META.md 1.4. Готовые эволюции у подобравшего (pl) — выбор (state 'chest',
  // chest.cards), как раньше. Иначе UP.skillChest без выбора: соло — тому, кто подобрал, кооп — каждому свой
  // бросок; карточки применяются сразу, показ (state 'chest', chest.rolls) стоит, пока каждый не нажмёт Ok
  // (chestOk). Если у всех выпало только лечение — без экрана.
  _openChest(pl = this.player) {
    const choices = this.noEvolution[pl.id] ? [] : UP.chestChoices(pl, this.rng, CHEST.maxChoices);
    if (choices.length && this.state === 'running') {
      this.state = 'chest';
      this.chest.cards = choices;
      this.chest.player = pl.id;
      this._telemetry('offer', pl.id, 'chest', choices);
      this.events.push({ type: 'chest', items: [], choice: true, player: pl.id });
      return;
    }
    const who = this.coop ? this.players : [pl];
    const rolls = [];
    let show = false;
    for (const p of who) {
      const cards = UP.skillChest(p, this.rng);
      for (const c of cards) this._applyCard(c, p);
      rolls.push({ player: p.id, cards });
      this._logPick({ act: 'chest', player: p.id, card: null, offered: cards });
      if (cards.some((c) => c.kind !== 'heal')) show = true;
    }
    this._syncBuild();
    this.events.push({ type: 'chest', player: pl.id, rolls });
    if (!show) { this.events.push({ type: 'autoHeal', player: pl.id }); return; }
    // второй сундук в тот же кадр, пока открыт выбор, применяется без показа
    if (this.state === 'chest' && this.chest.cards.length) return;
    if (this.state !== 'chest') this.chest.rolls = [];
    this.chest.rolls.push(...rolls);
    this.chest.done = this.players.map(() => false);
    this.chest.player = pl.id;
    this.state = 'chest';
  }

  // Кооп: выбранное из сундука видят оба, мир стоит CHEST.revealTime (или пока хозяин не закроет, endReveal).
  _reveal(items, pl) {
    if (this.state === 'reveal') this.chest.shown = this.chest.shown.concat(items);
    else this.chest.shown = items.slice();
    this.chest.player = pl.id;
    this.chest.revealT = CHEST.revealTime;
    this.state = 'reveal';
  }

  /** Конец показа выбранного (таймер или хозяин сундука): игра идёт дальше, затем отложенные уровни. */
  endReveal() {
    if (this.state !== 'reveal') return;
    this.state = 'running';
    this.chest.shown = [];
    this._checkLevel();
    this.resumeDelay();
  }

  /**
   * Игрок who закрыл показ апгрейдов (сундук без выбора). Когда закрыли все, игра идёт дальше
   * (SIM.resumeDelay), затем отложенные уровни и лут.
   * @param {number=} who
   * @return {boolean} принято ли
   */
  chestOk(who = 0) {
    if (this.state !== 'chest' || this.chest.cards.length || !this.players[who] || this.chest.done[who]) {
      return false;
    }
    this.chest.done[who] = true;
    if (this.chest.done.every(Boolean)) {
      this.chest.rolls = [];
      this.chest.done = [];
      this.state = 'running';
      this._checkLevel();
      this.resumeDelay();
    }
    return true;
  }

  // Показ апгрейдов закрыть за всех (боты): применённые карточки.
  _closeRolls() {
    const cards = this.chest.rolls.flatMap((r) => r.cards);
    for (let i = 0; i < this.players.length; i++) this.chestOk(i);
    return cards;
  }

  /**
   * Выбор эволюции i из сундука (state 'chest'); потом отложенные уровни. На показе апгрейдов (боты) —
   * закрыть его за всех.
   * @return {!Array<!Object>} применённые карточки
   */
  chooseChest(i = 0) {
    if (this.state !== 'chest') return [];
    if (!this.chest.cards.length) return this._closeRolls();
    const card = this.chest.cards[i];
    if (!card) return [];
    this._logPick({ act: 'evo', player: this.chest.player, card, offered: this.chest.cards });
    this._closeChest([card]);
    return [card];
  }

  /**
   * Пропустить эволюцию: обычные апгрейды сундука (UP.skillChest: до двух +1 или лечение).
   * @return {!Array<!Object>} применённые карточки (рендер показывает их)
   */
  skipChest() {
    if (this.state !== 'chest') return [];
    if (!this.chest.cards.length) return this._closeRolls();
    const items = UP.skillChest(this.players[this.chest.player], this.rng);
    this._logPick({ act: 'evoSkip', player: this.chest.player, card: null, offered: this.chest.cards });
    this._closeChest(items);
    return items;
  }

  _closeChest(items) {
    const pl = this.players[this.chest.player];
    for (const it of items) this._applyCard(it, pl);
    this._syncBuild();
    this.chest.cards = [];
    this.state = 'running';
    this.events.push({ type: 'chest', items, applied: true, player: pl.id });
    this._logPick({ act: 'chest', player: pl.id, card: null, offered: items });
    if (this.coop) { this._reveal(items, pl); return; } // уровни — после показа
    this._checkLevel();
  }

  // Игра после выбора и паузы идёт не сразу, а через SIM.resumeDelay (state 'resume'): экран выбора успевает
  // погаснуть, а в коопе напарник не знает, когда другой нажмёт карточку, и не попадает под врагов в тот же миг.
  resumeDelay() {
    if (this.state !== 'running') return;
    this.state = 'resume';
    this.resumeT = SIM.resumeDelay;
  }

  // Слияние далёких кристаллов опыта, когда их слишком много.
  _mergeXp() {
    const pk = this.pickups;
    const pl = this.view;
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
      pl.xpNext = xpForLevel(pl.level, this.coop ? COOP.xpLevelScale : 1);
      this.pendingLevels++;
      this.events.push({ type: 'levelup', level: pl.level });
    }
    if (this.pendingLevels > 0 && this.state === 'running') this._offerCards();
  }

  // Набор карточек на очередной уровень. Опыт общий, карточки выбирают по очереди (как в VS, для баланса:
  // на двоих столько же улучшений, сколько у одного), но у каждого свой пул: свои изгнанные и свои
  // reroll/skip/banish (pl.levelUp). Мёртвые тоже выбирают (гроб оживёт с новым оружием). Если выбирать
  // нечего (всё на максимуме), drawCards даёт одну карточку лечения: она применяется сама, без экрана.
  // Тип набора чередуется по своим выборам игрока (lu.picks): оружие, пассивки, оружие... (UP.pickKind);
  // в коопе с общей очередью выходит А-оружие, Б-оружие, А-пассивки, Б-пассивки.
  _chooser() {
    return this.players[this.levelTurn % this.players.length];
  }

  // Добор карточек игроку pl: тип текущего набора (lu.kind) и гейтинг пассивок по уровню команды.
  _draw(pl, count, exclude) {
    const lu = pl.levelUp;
    return UP.drawCards(pl, this.rng, lu.banished, count, exclude,
        { kind: lu.kind, level: this.player.level });
  }

  _offerCards() {
    while (this.pendingLevels > 0) {
      const pl = this._chooser();
      const lu = pl.levelUp;
      lu.kind = UP.pickKind(lu.picks);
      const cards = this._draw(pl);
      if (!(cards.length === 1 && cards[0].kind === 'heal')) {
        this.state = 'levelup';
        this.picker = pl.id;
        lu.cards = cards;
        lu.done = false;
        this._telemetry('offer', pl.id, 'levelup', cards);
        return;
      }
      this._logPick({ act: 'heal', player: pl.id, card: cards[0], offered: [] });
      this._applyCard(cards[0], pl);
      this.pendingLevels--;
      this.levelTurn++;
      lu.picks++;
      this.events.push({ type: 'autoHeal', player: pl.id });
    }
    this.state = 'running';
  }

  _afterChoice(pl) {
    pl.levelUp.cards = [];
    pl.levelUp.done = true;
    pl.levelUp.picks++;
    this.pendingLevels--;
    this.levelTurn++;
    this._offerCards();
    this.resumeDelay();
  }

  _applyCard(card, pl = this.player) {
    this._telemetry('application', pl.id, card);
    if (card.kind === 'heal') {
      // лечение гробу пропало бы (оживание ставит свой HP): достаётся живому напарнику
      const to = pl.dead ? this.players.find((p) => !p.dead) || pl : pl;
      to.hp = Math.min(to.maxHp, to.hp + to.maxHp * LEVEL_UP.healFraction);
      return;
    }
    UP.applyCard(pl, card);
  }

  // Выбирает ли сейчас игрок who (state 'levelup' и его ход).
  choosing(who = 0) {
    return this.state === 'levelup' && this.picker === who && !!this.players[who];
  }

  chooseCard(i, who = 0) {
    if (!this.choosing(who)) return;
    const pl = this.players[who];
    const card = pl.levelUp.cards[i];
    if (!card) return;
    this._logPick({ act: 'take', player: who, card, offered: pl.levelUp.cards });
    this._applyCard(card, pl);
    this._syncBuild();
    this._afterChoice(pl);
  }

  reroll(who = 0) {
    if (!this.choosing(who)) return false;
    const pl = this.players[who];
    const lu = pl.levelUp;
    if (lu.rerolls <= 0) return false;
    this._logPick({ act: 'reroll', player: who, card: null, offered: lu.cards });
    lu.rerolls--;
    lu.cards = this._draw(pl);
    this._telemetry('offer', who, 'levelup', lu.cards);
    return true;
  }

  skip(who = 0) {
    if (!this.choosing(who)) return false;
    const pl = this.players[who];
    if (pl.levelUp.skips <= 0) return false;
    this._logPick({ act: 'skip', player: who, card: null, offered: pl.levelUp.cards });
    pl.levelUp.skips--;
    this._afterChoice(pl);
    return true;
  }

  banish(i, who = 0) {
    if (!this.choosing(who)) return false;
    const pl = this.players[who];
    const lu = pl.levelUp;
    if (lu.banishes <= 0) return false;
    const card = lu.cards[i];
    if (!card || card.kind === 'heal') return false;
    this._logPick({ act: 'banish', player: who, card, offered: lu.cards.slice() });
    lu.banishes--;
    lu.banished.add(UP.cardKey(card));
    // Новый массив, а не правка старого: экран LevelUp перерисовывается по смене lu.cards (в коопе команда
    // применяется позже нажатия, и правка на месте оставляла бы на экране изгнанную карточку).
    const cards = lu.cards.slice();
    const repl = this._draw(pl, 1, cards);
    if (repl.length) cards[i] = repl[0];
    else cards.splice(i, 1);
    if (cards.length === 0) cards.push(UP.healCard());
    lu.cards = cards;
    this._telemetry('offer', who, 'levelup', cards);
    return true;
  }

  // ---------- сборка игрока ----------

  // Создаёт состояние новых оружий, пересчитывает статы и параметры оружия.
  _syncBuild() {
    for (const pl of this.players) this._syncPlayer(pl);
  }

  _syncPlayer(pl) {
    const ws = pl.weapons;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.def) continue;
      w.def = WEAPONS[w.id];
      w.beh = WEAPON_BEHAVIORS[w.def.behavior];
      w.owner = pl;
      w.params = {};
      w.cooldown = COMBAT.weaponStartCooldown;
      w.removed = false;
      w.slot = this._freeSlot();
      w.shields = null;
      w.p = null;
      w.t = 0; w.n = 0; w.q = 0; w.active = false; w.timer = 0;
      this._refreshWeapon(w);
      if (w.beh.init) w.beh.init(w, this);
    }
    const old = pl.maxHp;
    computeStats(pl.heroDef.stats, pl.passives, pl.stats,
        loadoutExtra(pl.bonus, pl.passives, pl.uq, pl.dynMore));
    applyUniqueRules(pl.stats, pl.uq);
    pl.maxHp = pl.stats.maxHp;
    if (pl.maxHp > old) pl.hp += pl.maxHp - old;
    if (pl.hp > pl.maxHp) pl.hp = pl.maxHp;
    for (let i = 0; i < ws.length; i++) this._refreshWeapon(ws[i]);
  }

  // ---------- уникалки (docs/META.md 2.8, поля в UNIQUES) ----------

  // Множитель урона владельца уникалки по врагу e: скорость (sprinter), недостающее HP (berserk),
  // расстояние до врага (myopia).
  _uniqueDmg(pl, e) {
    const u = pl.uq;
    let m = 1;
    if (u.dmgPerSpeed) {
      const base = pl.heroDef.stats.speed || 1;
      m *= Math.max(0, 1 + u.dmgPerSpeed * (pl.stats.speed / base - 1));
      if (!pl.moving && u.stillDmgMore) m *= 1 + u.stillDmgMore;
    }
    if (u.dmgPerMissingHp && pl.maxHp > 0) {
      m *= 1 + u.dmgPerMissingHp * Math.max(0, 1 - pl.hp / pl.maxHp);
    }
    if (u.nearRange) {
      const dx = e.x - pl.x;
      const dy = e.y - pl.y;
      m *= 1 + (dx * dx + dy * dy <= u.nearRange * u.nearRange ? u.nearDmgMore : u.farDmgMore);
    }
    return m;
  }

  // Кости: раз в dice.interval с случайный стат more +up, другой more down (вместо прошлой пары).
  _rollDice(pl) {
    const d = pl.uq.dice;
    const n = DICE_STATS.length;
    const ui = this.rng.int(n);
    let di = this.rng.int(n - 1);
    if (di >= ui) di++;
    const up = DICE_STATS[ui];
    const down = DICE_STATS[di];
    pl.dice = { up, down };
    pl.diceNext += d.interval;
    pl.dynMore = { [up]: 1 + d.up, [down]: 1 + d.down };
    this._syncPlayer(pl);
    this.events.push({ type: 'dice', player: pl.id, up, down });
  }

  // last_chance: смертельный удар раз за забег даёт неуязвимость и полное HP; штраф HP — когда она кончится.
  _cheatDeath(pl) {
    const c = pl.uq && pl.uq.cheatDeath;
    if (!c || pl.cheatUsed) return false;
    pl.cheatUsed = true;
    pl.hp = pl.maxHp * c.heal;
    pl.iframes = c.invuln;
    pl.cheatT = c.invuln;
    this.events.push({ type: 'lastChance', player: pl.id, x: pl.x, y: pl.y });
    return true;
  }

  _cheatPenalty(pl) {
    pl.cheatT = 0;
    const more = { ...(pl.dynMore || {}) };
    more.maxHp = (more.maxHp ?? 1) * (1 + pl.uq.cheatDeath.maxHpMore);
    pl.dynMore = more;
    this._syncPlayer(pl);
  }

  // Сундук с босса номер bossKills (BOSS_DROPS). У Жницы номер задан (lootIndex): её сундук всегда T4,
  // сколько бы боссов ни пало до неё. С экраном лута босс роняет сундук (loot_chest), лут катится и экран
  // открывается при подборе; если убийство кончает забег (now: финал без овертайма, Жница) — сразу.
  _bossLoot(e, now = false) {
    const fixed = e.def && e.def.lootIndex;
    const index = fixed !== undefined ? fixed : this.bossKills;
    this.bossKills++;
    if (this.lootScreen && !now) {
      const pk = this.dropPickup('loot_chest', e.x, e.y, index);
      pk.boss = e.type;
      return;
    }
    this._rollLoot(index, e.type);
  }

  // Лут сундука босса номер index: каждому игроку свой (rollChest + сердца хаоса); с экраном лута — экран.
  _rollLoot(index, boss) {
    const tier = bossDrop(index).tier;
    for (const pl of this.players) {
      const entries = rollChest(this.lootRng, tier);
      const hearts = rollHearts(this.lootRng, index);
      pl.loot.push({ tier, boss, entries, hearts });
    }
    if (this.lootScreen) this.lootPending++;
    this.events.push({ type: 'loot', boss, tier, index });
  }

  // Экран лута (state 'loot'): мир стоит у всех, пока каждый не закончит (lootDone). Убитый в коопе тоже решает.
  _openLoot() {
    this.lootPending = 0;
    this.lootDone = this.players.map(() => false);
    this.state = 'loot';
    this.events.push({ type: 'lootOpen' });
  }

  /**
   * Игрок who закончил с лутом (взял или разобрал все предметы; сами решения — вне сима). Когда закончили все,
   * игра идёт дальше (через SIM.resumeDelay), затем отложенные уровни.
   * @param {number=} who
   * @return {boolean} принято ли
   */
  lootFinish(who = 0) {
    if (this.state !== 'loot' || !this.players[who] || this.lootDone[who]) return false;
    this.lootDone[who] = true;
    if (this.lootDone.every(Boolean)) {
      this.lootDone = [];
      if (this.winAfterLoot) { this._win(); return true; }
      this.state = 'running';
      this._checkLevel();
      this.resumeDelay();
    }
    return true;
  }

  // Свободный слот таймеров повторного попадания среди оружия всех игроков.
  _freeSlot() {
    for (let s = 0; s < SLOT_COUNT; s++) {
      let used = false;
      for (const pl of this.players) {
        const ws = pl.weapons;
        for (let i = 0; i < ws.length; i++) {
          if (ws[i].def && ws[i].slot === s) { used = true; break; }
        }
        if (used) break;
      }
      if (!used) return s;
    }
    return 0;
  }

  _refreshWeapon(w) {
    const lv = w.def.levels[Math.min(w.level, w.def.levels.length) - 1];
    const p = w.params;
    for (const k in lv) p[k] = lv[k];
    const st = w.owner.stats;
    p.damage = lv.damage * (st[w.def.dmgType] ?? 1);
    p.cooldown = lv.cooldown / st.haste;
    const uq = w.owner.uq;
    if (uq && uq.cooldownMore) p.cooldown *= 1 + uq.cooldownMore;
    if (lv.area !== undefined) p.area = lv.area * st.area;
    if (lv.duration !== undefined) p.duration = lv.duration * st.duration;
    // статус-ДоТ (src/data/status.js): из уровня, иначе с оружия целиком
    p.status = lv.status || w.def.status || null;
  }
}

/**
 * @param {{hero: (string|undefined), stage: (string|undefined), seed: (number|undefined),
 *     difficulty: (string|undefined), players: (number|undefined),
 *     loadouts: (!Array<?Object>|undefined)}=} opts players: 2 — кооп; loadouts — сумки по игрокам
 *     (формат сохранения, проверяются normalizeLoadout), соло — loadouts[0]
 * @return {!Sim} новая симуляция забега
 */
export function createSim(opts) {
  return new Sim(opts);
}

