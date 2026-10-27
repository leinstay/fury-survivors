import { buildResults } from '../ui/results.js';
import { claimPendingLoot } from '../ui/loot.js';
import { showAchievementToasts } from '../ui/toast.js';

// Итоги забега. Лут с боссов решается в забеге (сцена Loot); что осталось без решения, берётся в стеш само
// (claimPendingLoot). data.unlocked — ачивки забега (Game).
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
    const loot = this.sim ? claimPendingLoot(this.sim) : [];
    this.nav = buildResults(this, this.sim, { titleKey: 'victory.title', titleColor: '#ffd84a', confetti: true, victory: true });
    showAchievementToasts(this, [...(d.unlocked || []), ...loot]);
  }

  update(time) {
    this.nav.update(time);
  }
}
