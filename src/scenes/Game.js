import { createSim } from '../core/sim.js';
import { GameInput } from '../ui/input.js';
import { Hud } from '../ui/hud.js';
import { readPad } from '../ui/focus.js';
import { World } from '../render/world.js';
import { Fx } from '../render/fx.js';
import { FX, SIM } from '../data/constants.js';
import { handleSimEvents, startMusic, fadeOutMusic } from '../audio/sfx.js';

const MAX_DT = SIM.maxFrameDt;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.sim = null;
  }

  // data.difficulty: id из data/difficulty.js (Menu, Retry на экране итогов)
  init(data) {
    this.difficulty = data && data.difficulty;
  }

  create() {
    this.sim = createSim({ hero: 'heroine', stage: 'forest', seed: Date.now(), difficulty: this.difficulty });
    this.world = new World(this, this.sim);
    this.fx = new Fx(this);
    this.hitstop = 0;
    this.hitCool = 0;
    // события сцены переживают рестарт: снимаем слушатель при выходе, иначе он копится с каждым забегом
    const onResume = () => this.fx.playPending();
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));
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
    this.scene.pause('Game');
    this.scene.launch('Pause', { sim: this.sim });
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

  update(time, delta) {
    const dt = Math.min(delta / 1000, MAX_DT);
    const sim = this.sim;

    const pad = readPad();
    const start = !!(pad && pad.start);
    if (start && !this.padStart) this.openPause();
    this.padStart = start;
    if (!this.scene.isActive('Game')) return;

    const input = this.gameInput.read();
    if (this.hitstop > 0) {
      this.hitstop -= dt;
    } else {
      sim.step(dt, input);
      this.handleEvents(sim.events);
    }
    this.hitCool -= dt;
    this.fx.update(dt);
    this.world.shake = { x: this.fx.offsetX, y: this.fx.offsetY };
    this.world.update(dt);
    this.hud.update();

    const chest = this.pendingChest;
    this.pendingChest = null;
    if (chest) {
      // сундук первым; LevelUp (sim.state === 'levelup') откроется в следующем кадре после resume
      this.scene.pause('Game');
      this.scene.launch('Chest', { sim, items: chest });
    } else if (sim.state === 'chest') {
      this.scene.pause('Game');
      this.scene.launch('Chest', { sim, choices: sim.chest.cards });
    } else if (sim.state === 'levelup') {
      this.scene.pause('Game');
      this.scene.launch('LevelUp', { sim });
    } else if ((sim.state === 'gameover' || sim.state === 'victory') && !this.ended) {
      this.ended = true;
      fadeOutMusic();
      this.scene.pause('Game');
      this.scene.launch(sim.state === 'victory' ? 'Victory' : 'GameOver', { sim });
    }
  }
}
