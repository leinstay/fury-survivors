import { buildResults } from '../ui/results.js';
import { claimPendingLoot } from '../ui/loot.js';
import { showAchievementToasts } from '../ui/toast.js';

// Итоги забега. Лут с боссов решается в забеге (сцена Loot); что осталось без решения, берётся в стеш само
// (claimPendingLoot). data.unlocked — ачивки забега (Game).
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.data0 = data || {};
    this.sim = data.sim;
    this.lost = !!(data && data.lost);
  }

  create() {
    const d = this.data0;
    const loot = this.sim ? claimPendingLoot(this.sim) : [];
    this.nav = buildResults(this, this.sim, { titleKey: 'gameover.title', titleColor: '#ff4040', lost: this.lost });
    showAchievementToasts(this, [...(d.unlocked || []), ...loot]);
  }

  update(time) {
    this.nav.update(time);
  }
}
