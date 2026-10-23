import { createSim } from '../core/sim.js';
import { createLockstep, simFingerprint } from '../core/lockstep.js';
import { createActions } from '../core/actions.js';
import { GameInput } from '../ui/input.js';
import { Hud, formatTime } from '../ui/hud.js';
import { readPad } from '../ui/focus.js';
import { World } from '../render/world.js';
import { Fx } from '../render/fx.js';
import { FX, SIM, NET } from '../data/constants.js';
import { handleSimEvents, startMusic, fadeOutMusic } from '../audio/sfx.js';
import { netLog } from '../services/net.js';
import { createRunTracker, runStatus } from '../core/codex.js';
import { recordRun } from '../services/codex.js';
import { createTelemetry } from '../core/telemetry.js';
import { sendRun, flushRuns } from '../services/telemetry.js';
import { computeScore } from '../services/leaderboard.js';

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
    flushRuns();
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
        onDesync: (t, mine, theirs, parts) => this._onDesync(t, mine, theirs, parts),
      });
      // часы: game.loop.time, не scene.time.now (тот обновляется только в preUpdate, а в create() стоит
      // на прошлом кадре прошлого запуска: после долгого лобби тишина сразу превышала NET.dropAfter)
      this.net.onMessage((msg) => {
        if (msg.dbg === 'hash') { this._partnerParts(msg); return; }
        this.ls.receive(msg, this.now());
      });
      this.net.onClose(() => { this.lost = true; });
      this.ls.lastRemoteT = this.now();
    } else {
      this.sim = this.givenSim || createSim({
        hero: this.hero, stage: 'forest',
        seed: globalThis.navigator?.webdriver && Number.isInteger(globalThis.__furyTestSeed) ?
          globalThis.__furyTestSeed : Date.now(), difficulty: this.difficulty,
      });
      this.ls = null;
    }
    this.act = createActions(this.sim, this.ls);
    // Кодекс: свой забег (не готовый sim плейтеста). Итог пишется в конце забега или при выходе в меню.
    this.tracker = this.givenSim ? null : createRunTracker({
      local: this.sim.local || 0, coop: !!co,
      partner: co && co.names ? co.names[1 - co.local] || '' : '',
    });
    // Телеметрия для баланса: срезы раз в минуту, итог отправляется вместе с кодексом.
    this.telemetry = this.givenSim ? null :
      createTelemetry({ sim: this.sim, local: this.sim.local || 0, coop: !!co,
        sessionId: co?.sessionId || globalThis.crypto.randomUUID(),
        clock: () => performance.now(),
        fingerprint: simFingerprint().toString(16).padStart(8, '0') });
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
      this._finishRun('quit');
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

  // Рассинхрон: хеши состояния на тике t разошлись. В консоль — тик и хеши; свои поля уходят напарнику,
  // у обоих печатается, какие поля различаются (по ним видно причину: опыт, позиции, RNG, оружие...).
  _onDesync(t, mine, theirs, parts) {
    this.desynced = true;
    this.myParts = { t, parts };
    netLog('DESYNC at tick', t, 'my hash', mine, 'partner hash', theirs,
        '(different game versions? both reload the page)');
    if (parts) this.net.send({ dbg: 'hash', t, parts });
    if (this.theirParts) this._logDiff();
  }

  _partnerParts(msg) {
    if (!Array.isArray(msg.parts)) return;
    this.theirParts = { t: msg.t, parts: msg.parts };
    if (this.myParts) this._logDiff();
  }

  _logDiff() {
    const a = this.myParts;
    const b = this.theirParts;
    if (a.t !== b.t || !a.parts) { netLog('desync reports are for different ticks', a.t, b.t); return; }
    const theirs = new Map(b.parts.map((kv) => [kv[0], kv[1]]));
    const diff = a.parts.filter((kv) => theirs.get(kv[0]) !== kv[1])
        .map((kv) => `${kv[0]}: mine ${kv[1]} / partner ${theirs.get(kv[0])}`);
    netLog('DESYNC fields at tick', a.t, diff.length ? diff : '(all fields equal, hash differs)');
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

  // Итог забега в кодекс (один раз): статус victory | dead | disconnected | quit, очки как на экране итогов.
  _finishRun(status) {
    const tr = this.tracker;
    if (!tr) return;
    this.tracker = null;
    const sim = this.sim;
    const score = computeScore({ time: sim.time, kills: sim.kills, coins: sim.coins, victory: status === 'victory' });
    recordRun(tr.finish(sim, { status, at: Date.now(), score }));
    if (this.telemetry) sendRun(this.telemetry.finish(sim, { status, score }));
    this.telemetry = null;
  }

  // Единая точка обработки событий sim: эффекты, звук, хитстоп.
  handleEvents(events) {
    if (!events.length) return;
    if (this.tracker) this.tracker.onEvents(events);
    this.fx.onEvents(events);
    this.hud.onEvents(events);
    // два сундука за кадр: sim уже выдал оба, показываем всё вместе
    // choice: экран выбора откроется по sim.state === 'chest'; applied: выбор уже показан на этом экране
    for (const ev of events) {
      if (ev.type !== 'chest' || ev.choice || ev.applied) continue;
      if (this.ls) continue; // кооп: показ сундука обоим ведёт сим (state 'reveal')
      this.pendingChest = (this.pendingChest || []).concat(ev.items || []);
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

  /** Время по часам игры, с (одни и те же для create, приёма сообщений и update). */
  now() {
    return this.game.loop.time / 1000;
  }

  // Кооп: часы lockstep по настоящему времени кадра. Пока ждём ввод напарника, время копится (до NET.backlog),
  // потом догоняем до NET.maxCatchUp тиков за кадр: иначе отставший теряет время, напарник упирается в его
  // ввод, и оба по очереди дёргаются. Часы подстраиваются под напарника (ls.drift, в тиках): впереди —
  // медленнее, позади — быстрее, пропорционально расхождению (старт у гостя позже на загрузку сцены).
  _stepCoop(rawDt, input) {
    const ls = this.ls;
    const now = this.now();
    const d = ls.drift();
    const rate = Math.abs(d) <= NET.syncSlack ? 1 :
      1 - Math.max(-NET.syncMax, Math.min(NET.syncMax, d * NET.syncGain));
    this.acc = Math.min(this.acc + rawDt * rate, NET.backlog);
    let stalled = false;
    for (let n = 0; this.acc >= STEP && n < NET.maxCatchUp; n++) {
      if (!ls.advance(input, STEP, now)) {
        stalled = true;
        break;
      }
      this.acc -= STEP;
      this.handleEvents(this.sim.events);
    }
    this._netStats(now, rawDt, stalled, d);
    // ожидание по часам сцены, не по тикам: при низком fps тики за кадр не набегают
    if (!stalled) this.waitSince = -1;
    else if (this.waitSince < 0) this.waitSince = now;
    const waiting = this.waitSince >= 0 && now - this.waitSince > NET.waitWarn;
    this.hud.setNotice(this.desynced ? 'coop.desync' : waiting ? 'coop.waiting' : null);
    if (!this.lost && ls.silence(now) > NET.dropAfter) this.lost = true;
  }

  // Статистика сети раз в NET.statsEvery с в консоль: доля кадров в ожидании напарника, тиков в секунду
  // (норма 60), fps, самый долгий кадр, расхождение часов и опережение (≈ задержка сети в тиках).
  _netStats(now, rawDt, stalled, drift) {
    if (!this.stats) this.stats = { t0: now, tick0: this.ls.tick, frames: 0, stalls: 0, maxDt: 0 };
    const s = this.stats;
    s.frames++;
    if (stalled) s.stalls++;
    s.maxDt = Math.max(s.maxDt, rawDt);
    const span = now - s.t0;
    if (span < NET.statsEvery) return;
    netLog('stats', `stalled ${Math.round(100 * s.stalls / s.frames)}% of frames,`,
        `ticks/s ${((this.ls.tick - s.tick0) / span).toFixed(1)}, fps ${(s.frames / span).toFixed(0)},`,
        `longest frame ${Math.round(s.maxDt * 1000)}ms, drift ${drift.toFixed(1)},`,
        `lead ${this.ls.advantage()} ticks (partner ${this.ls.remoteAdv}), sim ${formatTime(this.sim.time)},`,
        `state ${this.sim.state}, paused ${this.ls.paused}, overlay ${this.overlay || 'none'}, picker ${this.sim.picker}`);
    this.stats = null;
  }

  // Рендер между тиками. world.alpha — доля следующего шага (сущности рисуются между прошлым и текущим
  // тиком). Свой герой рисуется по своему вводу: ввод, отправленный, но ещё не применённый симом (кооп,
  // NET.inputDelay), плюс текущий ввод на долю шага. Так он отзывается сразу и двигается ровно, как бы ни
  // ложились тики на кадры; шаг и разворот тоже по вводу.
  _predict(input) {
    const sim = this.sim;
    const p = sim.players[sim.local];
    const live = sim.state === 'running' && !(this.ls && this.ls.paused);
    const a = live && this.hitstop <= 0 ? Math.min(1, this.acc / STEP) : 1;
    this.world.alpha = a;
    if (!live || p.dead || this.hitstop > 0) { this.world.predict = null; return; }
    const pend = this.ls ? this.ls.predictOffset(p.stats.speed, STEP) : { x: 0, y: 0, face: 0 };
    let ix = input && input.x ? input.x : 0;
    let iy = input && input.y ? input.y : 0;
    const len = Math.sqrt(ix * ix + iy * iy);
    const moving = len > 0.05;
    if (len > 1) { ix /= len; iy /= len; }
    const k = moving ? p.stats.speed * STEP * a : 0;
    const face = ix > 0.05 ? 1 : ix < -0.05 ? -1 : pend.face;
    this.world.predict = {
      i: sim.local, x: pend.x + ix * k, y: pend.y + iy * k, face,
      moving: moving || pend.x !== 0 || pend.y !== 0,
    };
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
    if (this.ls) this._stepCoop(delta / 1000, input);
    else this._stepSolo(dt, input);
    if (this.tracker) this.tracker.observe(sim);
    this._predict(input);
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
    } else if (sim.state === 'reveal' && !busy) {
      // кооп: выпавшее из сундука видят оба, мир стоит (sim), экран закроется по смене sim.state
      this._open('Chest', { sim, act: this.act, items: sim.chest.shown });
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
      this._finishRun(runStatus(sim, this.lost && !over));
      this.scene.launch(sim.state === 'victory' ? 'Victory' : 'GameOver', {
        sim, coop: this.coop, lost: this.lost && !over,
      });
    }
  }
}
