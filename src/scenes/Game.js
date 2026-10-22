import { createSim } from '../core/sim.js';
import { createLockstep } from '../core/lockstep.js';
import { createActions } from '../core/actions.js';
import { GameInput } from '../ui/input.js';
import { Hud } from '../ui/hud.js';
import { readPad } from '../ui/focus.js';
import { World } from '../render/world.js';
import { Fx } from '../render/fx.js';
import { FX, SIM, NET } from '../data/constants.js';
import { handleSimEvents, startMusic, fadeOutMusic } from '../audio/sfx.js';

const MAX_DT = SIM.maxFrameDt;
const STEP = 1 / SIM.tickRate;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.sim = null;
  }

  // data.difficulty: id из data/difficulty.js (Menu, Retry на экране итогов); data.sim: готовый sim
  // (только для плейтестов и скриншотов: забег, прокрученный ботом headless);
  // data.coop: сетевой кооп из лобби { net, local, seed, difficulty, names, heroes } (net: services/net.js)
  init(data) {
    this.difficulty = data && data.difficulty;
    this.hero = data && data.hero; // id из data/heroes.js; sim заменит неизвестный на DEFAULT_HERO
    this.givenSim = data && data.sim;
    this.coop = (data && data.coop) || null;
  }

  create() {
    const co = this.coop;
    if (co) {
      this.sim = createSim({
        stage: 'forest', seed: co.seed, difficulty: co.difficulty, players: 2, heroes: co.heroes,
      });
      this.sim.local = co.local;
      this.sim.players.forEach((p, i) => { p.name = (co.names && co.names[i]) || ''; });
      this.net = co.net;
      this.ls = createLockstep({
        sim: this.sim, local: co.local,
        send: (msg) => this.net.send(msg),
        onDesync: () => { this.desynced = true; },
      });
      this.net.onMessage((msg) => this.ls.receive(msg, this.time.now / 1000));
      this.net.onClose(() => { this.lost = true; });
      this.ls.lastRemoteT = this.time.now / 1000;
    } else {
      this.sim = this.givenSim || createSim({
        hero: this.hero, stage: 'forest', seed: Date.now(), difficulty: this.difficulty,
      });
      this.ls = null;
    }
    this.act = createActions(this.sim, this.ls);
    this.acc = 0;
    this.waitSince = -1; // кооп: момент (с), с которого ждём ввод напарника; -1 — не ждём
    this.overlay = null; // открытый поверх экран (кооп: Game не ставится на паузу)
    this.lost = false;
    this.desynced = false;
    this.world = new World(this, this.sim);
    this.fx = new Fx(this);
    this.hitstop = 0;
    this.hitCool = 0;
    // события сцены переживают рестарт: снимаем слушатель при выходе, иначе он копится с каждым забегом
    const onResume = () => this.fx.playPending();
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => {
      this.events.off('resume', onResume);
      if (this.net) this.net.close();
    });
    this.gameInput = new GameInput(this, {
      isBlocked: (x, y) => this.hud && this.hud.isOnPauseButton(x, y),
    });
    this.hud = new Hud(this, this.sim, {
      touch: this.gameInput.touch, onPause: () => this.openPause(),
    });
    this.ended = false;
    this.pendingChest = null;
    const pad = readPad();
    this.padStart = !!(pad && pad.start);

    this.input.keyboard.on('keydown-ESC', () => this.openPause());
    this.input.keyboard.on('keydown-P', () => this.openPause());
    this.world.update(0);
    this.hud.update();
    startMusic(this);
  }

  openPause() {
    if (this.ended || this.sim.state !== 'running' || !this.scene.isActive('Game')) return;
    if (this.ls) {
      // кооп: пауза общая, команда применится у обоих, экран откроется по ls.paused
      if (!this.ls.paused && !this.overlay) this.act.pause();
      return;
    }
    this.scene.pause('Game');
    this.scene.launch('Pause', { sim: this.sim, act: this.act });
  }

  // Открыть экран поверх игры. Соло: Game на паузе до закрытия. Кооп: Game крутит lockstep дальше
  // (сим сам стоит в состоянии выбора), экран закрывается, когда sim.state меняется.
  _open(name, data) {
    if (this.ls) {
      this.overlay = name;
      this.scene.launch(name, data);
    } else {
      this.scene.pause('Game');
      this.scene.launch(name, data);
    }
  }

  // Единая точка обработки событий sim: эффекты, звук, хитстоп.
  handleEvents(events) {
    if (!events.length) return;
    this.fx.onEvents(events);
    this.hud.onEvents(events);
    // два сундука за кадр: sim уже выдал оба, показываем всё вместе
    // choice: экран выбора откроется по sim.state === 'chest'; applied: выбор уже показан на этом экране
    for (const ev of events) {
      if (ev.type === 'chest' && !ev.choice && !ev.applied) this.pendingChest = (this.pendingChest || []).concat(ev.items || []);
    }
    handleSimEvents(this, events);
    if (this.ls) return; // кооп: хитстоп остановил бы тики только у одного клиента
    const h = FX.hitstop;
    let stop = 0;
    for (const ev of events) {
      if (ev.type === 'hit' && ev.crit) stop = Math.max(stop, h.crit);
      else if (ev.type === 'playerHurt') stop = Math.max(stop, h.hurt);
      else if (ev.type === 'kill' && (ev.boss || ev.elite)) stop = Math.max(stop, ev.boss ? h.boss : h.elite);
    }
    if (stop > 0 && this.hitCool <= 0) {
      this.hitstop = Math.min(h.cap, Math.max(this.hitstop, 0) + stop);
      this.hitCool = h.cooldown;
    }
  }

  // Фиксированный шаг: тики по 1/SIM.tickRate из накопителя, не больше SIM.maxTicksPerFrame за кадр.
  _stepSolo(dt, input) {
    const sim = this.sim;
    if (this.hitstop > 0) { this.hitstop -= dt; this.acc = 0; return; }
    this.acc = Math.min(this.acc + dt, STEP * SIM.maxTicksPerFrame);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      sim.step(STEP, input);
      this.handleEvents(sim.events);
      if (this.hitstop > 0) { this.acc = 0; break; }
    }
  }

  _stepCoop(dt, input) {
    const ls = this.ls;
    const now = this.time.now / 1000;
    this.acc = Math.min(this.acc + dt, STEP * SIM.maxTicksPerFrame);
    let stalled = false;
    while (this.acc >= STEP) {
      if (!ls.advance(input, STEP, now)) {
        this.acc = Math.min(this.acc, STEP);
        stalled = true;
        break;
      }
      this.acc -= STEP;
      this.handleEvents(this.sim.events);
    }
    // ожидание по часам сцены, не по тикам: при низком fps тики за кадр не набегают
    if (!stalled) this.waitSince = -1;
    else if (this.waitSince < 0) this.waitSince = now;
    this.hud.setWaiting(this.waitSince >= 0 && now - this.waitSince > NET.waitWarn);
    if (!this.lost && ls.silence(now) > NET.dropAfter) this.lost = true;
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, MAX_DT);
    const sim = this.sim;

    const pad = readPad();
    const start = !!(pad && pad.start);
    if (start && !this.padStart) this.openPause();
    this.padStart = start;
    if (!this.scene.isActive('Game')) return;

    const input = this.gameInput.read();
    if (this.ls) this._stepCoop(dt, input);
    else this._stepSolo(dt, input);
    this.hitCool -= dt;
    this.fx.update(dt);
    this.world.shake = { x: this.fx.offsetX, y: this.fx.offsetY };
    this.world.update(dt);
    this.hud.update();

    if (this.overlay && !this.scene.isActive(this.overlay)) this.overlay = null;
    const chest = this.pendingChest;
    this.pendingChest = null;
    const busy = this.overlay !== null;
    if (chest && !busy) {
      // сундук первым; LevelUp (sim.state === 'levelup') откроется в следующем кадре после resume
      this._open('Chest', { sim, act: this.act, items: chest });
    } else if (sim.state === 'chest' && !busy) {
      this._open('Chest', { sim, act: this.act, choices: sim.chest.cards });
    } else if (sim.state === 'levelup' && !busy) {
      this._open('LevelUp', { sim, act: this.act });
    } else if (this.ls && this.ls.paused && !busy && sim.state === 'running') {
      this._open('Pause', { sim, act: this.act });
    } else if ((sim.state === 'gameover' || sim.state === 'victory' || this.lost) && !this.ended) {
      this.ended = true;
      fadeOutMusic();
      if (this.net) this.net.close();
      if (this.overlay) { this.scene.stop(this.overlay); this.overlay = null; }
      this.scene.pause('Game');
      const over = sim.state === 'gameover' || sim.state === 'victory';
      this.scene.launch(sim.state === 'victory' ? 'Victory' : 'GameOver', {
        sim, coop: this.coop, lost: this.lost && !over,
      });
    }
  }
}
