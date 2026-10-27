import { buildResults } from '../ui/results.js';
import { buildLoot, hasPendingLoot } from '../ui/loot.js';
import { showAchievementToasts } from '../ui/toast.js';

// Сначала лут с боссов (ui/loot.js), затем итоги. data.unlocked — ачивки забега (Game) и стеша (лут).
export class VictoryScene extends Phaser.Scene {
  constructor() {
    super('Victory');
  }

  init(data) {
    this.data0 = data || {};
    this.sim = data.sim;
  }

  create() {
    const d = this.data0;
    if (!d.lootDone && hasPendingLoot(this.sim)) {
      this.nav = buildLoot(this, this.sim, (ids) => {
        this.scene.restart({ ...d, lootDone: true, unlocked: [...(d.unlocked || []), ...ids] });
      });
      return;
    }
    this.nav = buildResults(this, this.sim, { titleKey: 'victory.title', titleColor: '#ffd84a', confetti: true, victory: true });
    showAchievementToasts(this, d.unlocked);
  }

  update(time) {
    this.nav.update(time);
  }
}
