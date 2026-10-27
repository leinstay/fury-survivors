import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { buildLoot, claimPendingLoot } from '../ui/loot.js';
import { playChestOpen } from '../ui/chest-open.js';
import { showAchievementToasts } from '../ui/toast.js';
import { textStyle } from '../ui/style.js';
import { createActions } from '../core/actions.js';
import { fadeOutAndStop, resetFade } from '../ui/fade.js';

// Лут босса сразу после убийства (sim.state 'loot'): свои 3 предмета, «Взять» или «Разобрать» по каждому
// (src/ui/loot.js), после анимации открытия сундука шмоток. Соло: Game на паузе, по готовности sim идёт
// дальше. Кооп: Game крутит lockstep, мир стоит у обоих (sim), каждый решает за себя и шлёт lootDone;
// экран закрывается, когда закончили оба.
export class LootScene extends Phaser.Scene {
  constructor() {
    super('Loot');
  }

  init(data) {
    this.sim = data.sim;
    this.act = data.act || createActions(data.sim);
    this.closed = false;
    this.finished = false;
    this.waiting = false;
  }

  create() {
    resetFade(this);
    this.nav = { update() {} };
    const title = this.add.text(GAME_WIDTH / 2, 34, t('loot.title'),
        textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    // сундук шмоток (свой цвет, CHEST_LOOK.loot) открывается, затем свои предметы
    playChestOpen(this, 'loot', () => {
      title.destroy();
      this.nav = buildLoot(this, this.sim, (ids) => this.done(ids));
    });
    // экран закрыли, не решив (дисконнект в коопе, конец забега): нерешённое — в стеш само
    this.events.once('shutdown', () => { if (!this.finished) claimPendingLoot(this.sim); });
  }

  // Свои решения приняты (стеш и кристаллы уже сохранены).
  done(ids) {
    this.finished = true;
    if (ids.length) showAchievementToasts(this, ids);
    this.act.lootDone();
    if (!this.act.coop) { this.close(); return; }
    this.waiting = true;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t('loot.waiting'), textStyle(14, '#9ad0ff')).setOrigin(0.5);
  }

  update(time) {
    if (this.closed) return;
    this.nav.update(time);
    // кооп: оба закончили (или сим ушёл из 'loot' иначе) — закрыть у обоих
    if (this.act.coop && this.sim.state !== 'loot') this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (!this.act.coop) {
      this.act.hold();
      this.scene.resume('Game');
    }
    fadeOutAndStop(this);
  }
}
