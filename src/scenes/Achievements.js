// Ачивки (из меню): список в две колонки по порядку src/data/achievements.js — имя, описание, награда,
// прогресс счётчика (achievementProgress), постоянный бонус к статам (зелёный у полученных), полученные ярче,
// новые с плашкой. Скрытые до получения: «???».
// Открытие отмечает полученные показанными (markAchievementsSeen).
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addPanel } from '../ui/panel.js';
import { textStyle, COLORS } from '../ui/style.js';
import { achievementProgress, achievementParams, isDone, unseenIds, achievedIds } from '../core/achievements.js';
import { getAchievements, markAchievementsSeen, checkMetaAchievements } from '../services/achievements.js';
import { getInventory } from '../services/inventory.js';
import { getCodex } from '../services/codex.js';
import { bonusText } from '../ui/items.js';

const M = 8;
const TOP = 34;
const ROW = 22;

/** Текст награды ачивки. */
export function rewardText(reward) {
  if (!reward) return '';
  if (reward.bag) return t(reward.bag === 'row' ? 'ach.reward.row' : 'ach.reward.col');
  if (reward.crystals) return t('ach.reward.crystals', { n: reward.crystals });
  if (reward.scrolls) return t('ach.reward.scrolls', { n: reward.scrolls });
  if (reward.hearts) return t(reward.hearts > 1 ? 'ach.reward.hearts.many' : 'ach.reward.hearts', { n: reward.hearts });
  return '';
}

export class AchievementsScene extends Phaser.Scene {
  constructor() {
    super('Achievements');
  }

  create() {
    checkMetaAchievements(); // стеш, сумка и кодекс могли дорасти до ачивки вне экрана
    const state = getAchievements();
    const fresh = new Set(unseenIds(state));
    const inv = getInventory();
    const ctx = { stash: inv.stash, bag: inv.bag, codex: getCodex() };
    const ids = Object.keys(ACHIEVEMENTS);
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 14, t('ach.title'), textStyle(18, COLORS.accent, { stroke: '#000000', strokeThickness: 4 }))
        .setOrigin(0.5);
    this.add.text(GAME_WIDTH - M, 10, `${achievedIds(state).length}/${ids.length}`, textStyle(10, '#ffd84a'))
        .setOrigin(1, 0);
    const perCol = Math.ceil(ids.length / 2);
    const colW = (GAME_WIDTH - 3 * M) / 2;
    ids.forEach((id, i) => {
      const def = ACHIEVEMENTS[id];
      const col = Math.floor(i / perCol);
      const L = M + col * (colW + M);
      const y = TOP + (i % perCol) * ROW + ROW / 2;
      const done = isDone(state, id);
      const masked = def.hidden && !done;
      addPanel(this, L + colW / 2, y, colW, ROW - 2, done ? { border: 0xb89a3a } : {});
      const name = masked ? t('ach.hidden.name') : t(`ach.${id}.name`);
      const desc = masked ? t('ach.hidden.desc') : t(`ach.${id}.desc`, achievementParams(id));
      const nm = this.add.text(L + 6, y - 9, name, textStyle(9, done ? '#ffd84a' : '#ffffff')).setOrigin(0, 0);
      if (!masked && def.bonus) {
        this.add.text(nm.x + nm.width + 6, y - 8, bonusText(def.bonus),
            textStyle(7, done ? '#8cff6a' : '#6f8f6a')).setOrigin(0, 0);
      }
      this.add.text(L + 6, y + 1, desc, textStyle(7, done ? '#dddddd' : COLORS.dim)).setOrigin(0, 0);
      const right = L + colW - 6;
      this.add.text(right, y - 9, masked ? '' : rewardText(def.reward), textStyle(8, '#9ad0ff')).setOrigin(1, 0);
      const pr = achievementProgress(state, id, ctx);
      const status = done ? t('ach.done') : pr ? t('ach.progress', pr) : '';
      this.add.text(right, y + 1, status, textStyle(8, done ? '#8cff6a' : '#dddddd')).setOrigin(1, 0);
      if (fresh.has(id)) {
        this.add.text(L + colW - 70, y - 9, t('ach.new'), textStyle(8, '#ff7a3d')).setOrigin(1, 0);
      }
    });
    markAchievementsSeen();
    this.nav = new FocusNav(this, { onBack: () => this.scene.start('Menu') });
    addButton(this, this.nav, { x: cx, y: GAME_HEIGHT - 16, w: 120, h: 20, size: 11, label: t('settings.back'),
      onSelect: () => this.scene.start('Menu') });
  }

  update(time) {
    this.nav.update(time);
  }
}
