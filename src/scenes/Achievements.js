// Ачивки (из меню и из паузы: from 'Pause' — поверх паузы, назад в паузу): список в две колонки по порядку
// src/data/achievements.js, карточки одной высоты в две строки: имя, постоянный бонус к статам (зелёный у полученных)
// и награда; описание и прогресс счётчика (achievementProgress) или Done. Полученные ярче, новые с плашкой.
// Скрытые до получения: «???».
// Открытие отмечает полученные показанными (markAchievementsSeen).
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addPanel } from '../ui/panel.js';
import { textStyle, bgTextStyle, COLORS } from '../ui/style.js';
import { achievementProgress, achievementParams, isDone, unseenIds, achievedIds } from '../core/achievements.js';
import { getAchievements, markAchievementsSeen, checkMetaAchievements } from '../services/achievements.js';
import { getInventory } from '../services/inventory.js';
import { getCodex } from '../services/codex.js';
import { bonusText } from '../ui/items.js';
import { backRect, screenTitle, menuBackdrop, PAGE_BOTTOM, CONTENT_TOP } from '../ui/menu-layout.js';

// Раскладка: два столбца по perCol карточек одной высоты от TOP до кнопки «Назад» (12 × 25 = 300 px из 360).
// Карточка в две строки: [имя, бонус … награда] и [описание … прогресс или Done]. Тексты стоят по центру
// полосы заглавных (originY 0.5, src/ui/text-align.js), центры строк LINE1 и LINE2 от верха карточки
// подобраны так, что от рамки до заглавных сверху и снизу ≈ 4 px.
const M = 8;
const TOP = CONTENT_TOP; // верх карточек не выше этого (под заголовком)
const CARD_H = 23;
const GAP = 1;
const PAD = 6;          // отступ текста от левого и правого края карточки
const SEP = 6;          // зазор между соседними текстами в строке
const LINE1 = 7;
const LINE2 = 16;
const SIZE = { name: 9, bonus: 8, reward: 8, desc: 7, status: 8 };
const ELLIPSIS = '...';

// Обрезать текст до ширины maxW (по символам, с многоточием). Пустая строка, если не влезает даже многоточие.
function fitText(text, maxW) {
  if (text.width <= maxW) return text;
  const full = text.text;
  let lo = 0;
  let hi = full.length;
  // бинарный поиск самой длинной обрезки, что влезает
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    text.setText(full.slice(0, mid).trimEnd() + ELLIPSIS);
    if (text.width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  text.setText(lo > 0 ? full.slice(0, lo).trimEnd() + ELLIPSIS : '');
  return text;
}

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

  init(data) {
    this.from = (data && data.from) || 'Menu';
  }

  create() {
    // фон — арт меню без героинь, как у всех подменю (поверх паузы закрывает забег целиком)
    menuBackdrop(this);
    checkMetaAchievements(); // стеш, сумка и кодекс могли дорасти до ачивки вне экрана
    const state = getAchievements();
    const fresh = new Set(unseenIds(state));
    const inv = getInventory();
    const ctx = { stash: inv.stash, bag: inv.bag, codex: getCodex() };
    const ids = Object.keys(ACHIEVEMENTS);
    const cx = GAME_WIDTH / 2;
    screenTitle(this, t('ach.title'));
    this.add.text(GAME_WIDTH - M, 10, `${achievedIds(state).length}/${ids.length}`, bgTextStyle(10, '#ffd84a'))
        .setOrigin(1, 0);
    const perCol = Math.ceil(ids.length / 2);
    const colW = (GAME_WIDTH - 3 * M) / 2;
    // низ столбцов — общая линия страниц над Back (PAGE_BOTTOM), верх — не выше TOP
    const top0 = Math.max(TOP, PAGE_BOTTOM - perCol * CARD_H - (perCol - 1) * GAP);
    ids.forEach((id, i) => {
      const def = ACHIEVEMENTS[id];
      const col = Math.floor(i / perCol);
      const L = M + col * (colW + M);
      const top = top0 + (i % perCol) * (CARD_H + GAP);
      const y1 = top + LINE1;
      const y2 = top + LINE2;
      const done = isDone(state, id);
      const masked = def.hidden && !done;
      const border = done ? { border: 0xb89a3a } : {};
      addPanel(this, L + colW / 2, top + CARD_H / 2, colW, CARD_H, border);
      const left = L + PAD;
      const right = L + colW - PAD;
      // строка 1: справа награда и плашка «новое», слева имя и бонус (бонус обрезается до награды)
      let edge1 = right;
      const reward = masked ? '' : rewardText(def.reward);
      if (reward) {
        const rw = this.add.text(right, y1, reward, textStyle(SIZE.reward, '#9ad0ff')).setOrigin(1, 0.5);
        edge1 = right - rw.width - SEP;
      }
      if (fresh.has(id)) {
        const nw = this.add.text(edge1, y1, t('ach.new'), textStyle(SIZE.reward, '#ff7a3d')).setOrigin(1, 0.5);
        edge1 -= nw.width + SEP;
      }
      const name = masked ? t('ach.hidden.name') : t(`ach.${id}.name`);
      const nm = fitText(this.add.text(left, y1, name, textStyle(SIZE.name, done ? '#ffd84a' : '#ffffff'))
          .setOrigin(0, 0.5), edge1 - left);
      if (!masked && def.bonus && nm.text) {
        const bx = left + nm.width + SEP;
        fitText(this.add.text(bx, y1, bonusText(def.bonus), textStyle(SIZE.bonus, done ? '#8cff6a' : '#6f8f6a'))
            .setOrigin(0, 0.5), edge1 - bx);
      }
      // строка 2: справа прогресс или Done, слева описание до него
      const pr = masked ? null : achievementProgress(state, id, ctx);
      const status = done ? t('ach.done') : pr ? t('ach.progress', pr) : '';
      let edge2 = right;
      if (status) {
        const st = this.add.text(right, y2, status, textStyle(SIZE.status, done ? '#8cff6a' : '#dddddd'))
            .setOrigin(1, 0.5);
        edge2 = right - st.width - SEP;
      }
      const desc = masked ? t('ach.hidden.desc') : t(`ach.${id}.desc`, achievementParams(id));
      fitText(this.add.text(left, y2, desc, textStyle(SIZE.desc, done ? '#dddddd' : COLORS.dim))
          .setOrigin(0, 0.5), edge2 - left);
    });
    markAchievementsSeen();
    this.nav = new FocusNav(this, { onBack: () => this.leave() });
    addButton(this, this.nav, { ...backRect(), size: 12, label: t('settings.back'),
      onSelect: () => this.leave() });
  }

  // Назад: в меню или в паузу (как кодекс из паузы, Codex.js leave).
  leave() {
    if (this.from === 'Pause') {
      const pause = this.scene.get('Pause');
      this.scene.stop();
      if (pause && pause.codexClosed) pause.codexClosed();
      return;
    }
    this.scene.start('Menu');
  }

  update(time) {
    this.nav.update(time);
  }
}
