import { buildResults } from '../ui/results.js';

export default class VictoryScene extends Phaser.Scene {
  constructor() {
    super('Victory');
  }

  init(data) {
    this.sim = data.sim;
  }

  create() {
    this.nav = buildResults(this, this.sim, { titleKey: 'victory.title', titleColor: '#ffd84a', confetti: true, victory: true });
  }

  update(time) {
    this.nav.update(time);
  }
}
