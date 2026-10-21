import { buildResults } from '../ui/results.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.sim = data.sim;
  }

  create() {
    this.nav = buildResults(this, this.sim, { titleKey: 'gameover.title', titleColor: '#ff4040' });
  }

  update(time) {
    this.nav.update(time);
  }
}
