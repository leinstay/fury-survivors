import { buildResults } from '../ui/results.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.sim = data.sim;
  }

  create() {
    this.nav = buildResults(this, this.sim, { titleKey: 'gameover.title', titleColor: '#ff5a5a' });
  }

  update(time) {
    this.nav.update(time);
  }
}
