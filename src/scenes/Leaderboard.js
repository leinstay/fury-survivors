// Топ-10 игроков. Состояния: загрузка, offline, пусто, таблица.
import { t } from '../i18n/index.js';
import { GAME_WIDTH } from '../data/constants.js';
import { BOARD } from '../data/leaderboard.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { textStyle, COLORS } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import { formatTime } from '../ui/hud.js';
import { fetchTop10 } from '../services/leaderboard.js';
import { DEFAULT_DIFFICULTY } from '../data/difficulty.js';

const COL = { place: 110, name: 140, score: 318, time: 392, kills: 464, mode: 540 };
const ROW0 = 82;
const ROW_H = 19;

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

    this.add.text(cx, 24, t('lb.title'), textStyle(22, COLORS.accent, { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    addPanel(this, cx, 176, 460, 252);
    const head = textStyle(10, COLORS.dim);
    this.add.text(COL.place, 62, '#', head);
    this.add.text(COL.name, 62, t('lb.col.name'), head);
    this.add.text(COL.score, 62, t('lb.col.score'), head).setOrigin(1, 0);
    this.add.text(COL.time, 62, t('lb.col.time'), head).setOrigin(1, 0);
    this.add.text(COL.kills, 62, t('lb.col.kills'), head).setOrigin(1, 0);
    this.add.text(COL.mode, 62, t('lb.col.mode'), head).setOrigin(1, 0);

    this.rowObjs = [];
    this.status = this.add.text(cx, 176, '', textStyle(14, COLORS.dim)).setOrigin(0.5);

    addButton(this, this.nav, { x: cx - 70, y: 328, w: 120, h: 28, label: t('lb.refresh'), onSelect: () => this.refresh() });
    addButton(this, this.nav, { x: cx + 70, y: 328, w: 120, h: 28, label: t('lb.back'), onSelect: () => this.back() });
    this.nav.focus(1);
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
      rows = await fetchTop10();
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
        this.add.text(COL.name, y, r.name, st),
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
