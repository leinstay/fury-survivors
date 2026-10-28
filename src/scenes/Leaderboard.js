// Топ-10 игроков. Состояния: загрузка, offline, пусто, таблица.
import { t } from '../i18n/index.js';
import { GAME_WIDTH } from '../data/constants.js';
import { BOARD } from '../data/leaderboard.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { textStyle, COLORS, difficultyColor } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import {
  BUTTON, EDGE, PAGE_GAP, PAGE_TAB_Y, PAGE_TOP, PAGE_BOTTOM, backRect, screenTitle, menuBackdrop,
} from '../ui/menu-layout.js';
import { formatTime } from '../ui/hud.js';
import { fetchTop10 } from '../services/leaderboard.js';
import { pairLabel } from '../core/nick.js';
import { HEROES, DEFAULT_HERO } from '../data/heroes.js';

// Раскладка как у кодекса: заголовок экрана, строка вкладок на всю ширину, панель таблицы от края до края
// (EDGE) от PAGE_TOP до общей линии PAGE_BOTTOM, Back внизу слева и Refresh зеркально справа.
const PANEL = { x: EDGE, w: GAME_WIDTH - 2 * EDGE, top: PAGE_TOP, bottom: PAGE_BOTTOM };
const PAD = 12;
// Колонки по ширине панели (x левого края текста; score..mode — правого). Колонка героя только в соло
// (в коопе имя — пара ников на всю ширину до очков).
const L = PANEL.x + PAD;
const R = PANEL.x + PANEL.w - PAD;
const COL = {
  place: L, name: L + 36, hero: L + 200, score: L + 350, time: L + 430, kills: L + 510, mode: R,
};
const HEAD_Y = PANEL.top + 8;
const ROW0 = HEAD_Y + 20;
const ROW_H = 22;
const TAB_W = (PANEL.w - PAGE_GAP) / 2;

export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
  }

  create() {
    menuBackdrop(this); // фон — арт меню без героинь, как у всех подменю
    this.alive = true;
    this.token = 0;
    const cx = GAME_WIDTH / 2;
    this.nav = new FocusNav(this, { onBack: () => this.back() });
    this.events.once('shutdown', () => { this.alive = false; });

    screenTitle(this, t('lb.title'));
    // Вкладки: соло и кооп (своя коллекция, имя — пара ников)
    this.mode = 'solo';
    this.tabs = {};
    for (const [i, m] of ['solo', 'coop'].entries()) {
      this.tabs[m] = addButton(this, this.nav, {
        x: PANEL.x + TAB_W / 2 + i * (TAB_W + PAGE_GAP), y: PAGE_TAB_Y, w: TAB_W, h: BUTTON.tab.h,
        size: 11, label: t(`lb.tab.${m}`),
        onSelect: () => this.setMode(m),
      });
    }
    // панель на всю ширину до общей линии низа страниц (над Back)
    const midY = (PANEL.top + PANEL.bottom) / 2;
    addPanel(this, PANEL.x + PANEL.w / 2, midY, PANEL.w, PANEL.bottom - PANEL.top);
    // рамка панели для тестов (ui-sizes.spec)
    this.panelBox = { left: PANEL.x, right: PANEL.x + PANEL.w, top: PANEL.top,
      bottom: PANEL.bottom };
    const head = textStyle(10, COLORS.dim);
    this.add.text(COL.place, HEAD_Y, '#', head);
    this.add.text(COL.name, HEAD_Y, t('lb.col.name'), head);
    this.heroHead = this.add.text(COL.hero, HEAD_Y, t('lb.col.hero'), head);
    this.add.text(COL.score, HEAD_Y, t('lb.col.score'), head).setOrigin(1, 0);
    this.add.text(COL.time, HEAD_Y, t('lb.col.time'), head).setOrigin(1, 0);
    this.add.text(COL.kills, HEAD_Y, t('lb.col.kills'), head).setOrigin(1, 0);
    this.add.text(COL.mode, HEAD_Y, t('lb.col.mode'), head).setOrigin(1, 0);

    this.rowObjs = [];
    this.status = this.add.text(cx, midY, '', textStyle(14, COLORS.dim)).setOrigin(0.5);

    // Back внизу слева (как на всех страницах), Refresh — тем же размером справа
    const back = backRect();
    addButton(this, this.nav, { ...back, x: GAME_WIDTH - back.x, size: 12, label: t('lb.refresh'),
      onSelect: () => this.refresh() });
    addButton(this, this.nav, { ...back, size: 12, label: t('lb.back'), onSelect: () => this.back() });
    this.nav.focus(3);
    this.setMode('solo');
  }

  setMode(mode) {
    this.mode = mode;
    // активная вкладка — зелёная рамка (panel.setState), как вкладки кодекса и инвентаря
    for (const m in this.tabs) this.tabs[m].setSelected(m === mode);
    this.heroHead.setVisible(mode === 'solo');
    this.refresh();
  }

  update(time) {
    this.nav.update(time);
  }

  back() {
    this.scene.start('Menu');
  }

  clearRows() {
    for (const o of this.rowObjs) o.destroy();
    this.rowObjs = [];
  }

  async refresh() {
    const token = ++this.token;
    this.clearRows();
    this.status.setText(t('lb.loading'));
    let rows = null;
    try {
      rows = await fetchTop10(this.mode);
    } catch {
      rows = null;
    }
    if (!this.alive || token !== this.token) return;
    if (!rows) { this.status.setText(t('lb.offline')); return; }
    if (rows.length === 0) { this.status.setText(t('lb.empty')); return; }
    this.status.setText('');
    rows.slice(0, BOARD.rows).forEach((r, i) => {
      const y = ROW0 + i * ROW_H;
      const color = i === 0 ? '#ffd84a' : '#ffffff';
      const st = textStyle(12, color);
      this.rowObjs.push(
        this.add.text(COL.place, y, String(i + 1), st),
        this.add.text(COL.name, y, pairLabel(r.name), st),
        // у старых записей героя нет: по умолчанию воин (HERO_FIELD.fallback)
        ...(this.mode === 'solo' ? [this.add.text(COL.hero, y, t(`hero.${HEROES[r.hero] ? r.hero : DEFAULT_HERO}.name`), textStyle(12, COLORS.dim))] : []),
        this.add.text(COL.score, y, String(r.score), st).setOrigin(1, 0),
        this.add.text(COL.time, y, formatTime(r.time), st).setOrigin(1, 0),
        this.add.text(COL.kills, y, String(r.kills), st).setOrigin(1, 0),
        this.add.text(COL.mode, y, t(`difficulty.${r.difficulty}.short`),
            textStyle(12, difficultyColor(r.difficulty, COLORS.dim)))
            .setOrigin(1, 0),
      );
    });
  }
}
