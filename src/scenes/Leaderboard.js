// Топ-10 игроков. Состояния: загрузка, offline, пусто, таблица.
import { t } from '../i18n/index.js';
import { GAME_WIDTH } from '../data/constants.js';
import { BOARD } from '../data/leaderboard.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { textStyle, COLORS } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import { BUTTON, PAGE_BOTTOM, backRect, screenTitle } from '../ui/menu-layout.js';
import { formatTime } from '../ui/hud.js';
import { fetchTop10 } from '../services/leaderboard.js';
import { DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { pairLabel } from '../core/nick.js';
import { HEROES, DEFAULT_HERO } from '../data/heroes.js';

// Колонка героя только в соло (в коопе имя — пара ников на всю ширину до очков).
const COL = { place: 110, name: 140, hero: 206, score: 318, time: 392, kills: 464, mode: 540 };
const HEAD_Y = 76;
const ROW0 = 92;
const ROW_H = 18;
const PANEL_TOP = 70;

export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
  }

  create() {
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
        x: cx - 60 + i * 120, y: 46, w: 110, h: BUTTON.tab.h, size: 11, label: t(`lb.tab.${m}`),
        onSelect: () => this.setMode(m),
      });
    }
    // панель от строки заголовков до общей линии низа страниц (над Back)
    addPanel(this, cx, (PANEL_TOP + PAGE_BOTTOM) / 2, 460, PAGE_BOTTOM - PANEL_TOP);
    const head = textStyle(10, COLORS.dim);
    this.add.text(COL.place, HEAD_Y, '#', head);
    this.add.text(COL.name, HEAD_Y, t('lb.col.name'), head);
    this.heroHead = this.add.text(COL.hero, HEAD_Y, t('lb.col.hero'), head);
    this.add.text(COL.score, HEAD_Y, t('lb.col.score'), head).setOrigin(1, 0);
    this.add.text(COL.time, HEAD_Y, t('lb.col.time'), head).setOrigin(1, 0);
    this.add.text(COL.kills, HEAD_Y, t('lb.col.kills'), head).setOrigin(1, 0);
    this.add.text(COL.mode, HEAD_Y, t('lb.col.mode'), head).setOrigin(1, 0);

    this.rowObjs = [];
    this.status = this.add.text(cx, (PANEL_TOP + PAGE_BOTTOM) / 2, '', textStyle(14, COLORS.dim)).setOrigin(0.5);

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
            textStyle(12, r.difficulty === DEFAULT_DIFFICULTY ? COLORS.dim : COLORS.cursed))
            .setOrigin(1, 0),
      );
    });
  }
}
