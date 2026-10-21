import { createSim } from '../core/sim.js';
import { GameInput } from '../ui/input.js';
import { Hud } from '../ui/hud.js';
import { readPad } from '../ui/focus.js';
import { World } from '../render/world.js';

const MAX_DT = 1 / 20;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.sim = null;
  }

  create() {
    this.sim = createSim({ hero: 'heroine', stage: 'forest', seed: Date.now() });
    this.world = new World(this, this.sim);
    this.gameInput = new GameInput(this, { isBlocked: (x, y) => this.hud && this.hud.isOnPauseButton(x, y) });
    this.hud = new Hud(this, this.sim, { touch: this.gameInput.touch, onPause: () => this.openPause() });
    this.ended = false;
    const pad = readPad();
    this.padStart = !!(pad && pad.start);

    this.input.keyboard.on('keydown-ESC', () => this.openPause());
    this.input.keyboard.on('keydown-P', () => this.openPause());
    this.world.update(0);
    this.hud.update();
  }

  openPause() {
    if (this.ended || this.sim.state !== 'running' || !this.scene.isActive('Game')) return;
    this.scene.pause('Game');
    this.scene.launch('Pause', { sim: this.sim });
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, MAX_DT);
    const sim = this.sim;

    const pad = readPad();
    const start = !!(pad && pad.start);
    if (start && !this.padStart) this.openPause();
    this.padStart = start;
    if (!this.scene.isActive('Game')) return;

    sim.step(dt, this.gameInput.read());
    this.world.update(dt);
    this.hud.update();

    if (sim.state === 'levelup') {
      this.scene.pause('Game');
      this.scene.launch('LevelUp', { sim });
    } else if ((sim.state === 'gameover' || sim.state === 'victory') && !this.ended) {
      this.ended = true;
      this.scene.pause('Game');
      this.scene.launch(sim.state === 'victory' ? 'Victory' : 'GameOver', { sim });
    }
  }
}
