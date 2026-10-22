import { buildResults } from '../ui/results.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.sim = data.sim;
    this.lost = !!(data && data.lost);
  }

  create() {
    this.nav = buildResults(this, this.sim, { titleKey: 'gameover.title', titleColor: '#ff4040', lost: this.lost });
  }

  update(time) {
    this.nav.update(time);
  }
}
