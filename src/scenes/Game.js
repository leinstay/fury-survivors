// Заглушка игровой сцены. На этапе 1 здесь появится this.sim (src/core/sim.js) и рендер.
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.sim = null;
  }

  create() {}
}
