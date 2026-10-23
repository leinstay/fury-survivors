import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { textStyle } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import { playSfx } from '../audio/sfx.js';
import { createActions } from '../core/actions.js';
import { fadeOutAndStop, resetFade } from '../ui/fade.js';

// Билд в две колонки (оружие слева, пассивки справа): 6+6 строк не налезают на кнопки.
export function addBuildList(scene, x, y, w, h, player) {
  addPanel(scene, x + w / 2, y + h / 2, w, h);
  scene.add.text(x + PAD, y + PAD, t('pause.build'), textStyle(14, '#ffd84a')).setOrigin(0, 0);
  [
    ['weapon', t('pause.weapons'), player.weapons, x + PAD],
    ['passive', t('pause.passives'), player.passives, x + w / 2 + PAD / 2],
  ].forEach(([kind, title, list, cx]) => {
    let cy = y + PAD + 24;
    scene.add.text(cx, cy, title, textStyle(10, '#aaaaaa')).setOrigin(0, 0);
    cy += 14;
    if (!list.length) scene.add.text(cx + 4, cy, t('pause.none'), textStyle(10, '#777777')).setOrigin(0, 0);
    for (const it of list) {
      addIcon(scene, cx + 7, cy + 7, iconKeyFor(kind, it.id), 14, kind, it.id);
      scene.add.text(cx + 20, cy + 7, `${displayName(kind, it.id)} ${t('levelup.lv', { n: it.level })}`, textStyle(10)).setOrigin(0, 0.5);
      cy += 16;
    }
  });
}

// Сетка отступов как в кодексе: M от края экрана, GAP между панелями, PAD внутри панели, строки слева
// одной высоты ROW с шагом STEP.
const M = 8;
const GAP = 6;
const PAD = 8;
const ROW = 24;
const STEP = ROW + 4;
const TOP = 46;
const LEFT_W = 300;
const STAT_LINE = 18;

const fmtPct = (v) => `${Math.round(v * 100)}%`;
const STAT_ROWS = [
  ['stat.hp', (s, p) => `${Math.ceil(p.hp)}/${Math.ceil(s.maxHp ?? p.maxHp)}`],
  ['stat.atk', (s) => fmtPct(s.atk ?? 1)],
  ['stat.spd', (s) => String(Math.round(s.speed ?? 0))],
  ['stat.crt', (s) => fmtPct(Math.min(1, (s.crit ?? 0) * (s.luck ?? 1)))], // с учётом удачи, как в sim.critChance
  ['stat.pickup', (s) => fmtPct(s.pickup ?? 1)],
  ['stat.haste', (s) => fmtPct(s.haste ?? 1)],
  ['stat.luck', (s) => `x${Math.round((s.luck ?? 1) * 100) / 100}`], // множитель шансов крита и дропа
  ['stat.armor', (s) => String(Math.round((s.armor ?? 0) * 10) / 10)],
];

// Компактный блок статов: 2 колонки по 4 строки, между колонками зазор, чтобы значение первой не сливалось
// с названием второй.
// Высота блока статов: 4 строки и PAD сверху и снизу.
export const STATS_H = 4 * STAT_LINE + 2 * PAD - 4;

export function addStatsBlock(scene, x, y, w, player) {
  const stats = player.stats || {};
  addPanel(scene, x + w / 2, y + STATS_H / 2, w, STATS_H);
  const colW = (w - 4 * PAD) / 2;
  STAT_ROWS.forEach(([key, fn], i) => {
    const col = Math.floor(i / 4);
    const cx = x + PAD + col * (colW + 2 * PAD);
    const cy = y + PAD + (i % 4) * STAT_LINE;
    scene.add.text(cx, cy, t(key), textStyle(10, '#aaaaaa')).setOrigin(0, 0);
    scene.add.text(cx + colW, cy, fn(stats, player), textStyle(10)).setOrigin(1, 0);
  });
}

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  init(data) {
    this.sim = data.sim;
    this.act = data.act || createActions(data.sim);
    this.closed = false;
  }

  create() {
    resetFade(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, TOP / 2, t('pause.title'), textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    this.nav = new FocusNav(this, { onBack: () => this.resume() });
    const pad = readPad();
    this.padStart = !!(pad && pad.start);

    // Слева столбец строк одной ширины: Resume, настройки, Codex, Quit (и Finish в овертайме).
    // Справа билд и статы, их верх и низ совпадают со столбцом.
    const cx = M + LEFT_W / 2;
    const rowY = (i) => TOP + i * STEP + ROW / 2;
    this.inCodex = false;
    this.wake = false;
    addButton(this, this.nav, { x: cx, y: rowY(0), w: LEFT_W, h: ROW, size: 12, label: t('pause.resume'), onSelect: () => this.resume() });
    const rows = addVolumeSliders(this, this.nav, { x: cx, y: rowY(1), w: LEFT_W, gap: STEP });
    addButton(this, this.nav, { x: cx, y: rowY(rows + 1), w: LEFT_W, h: ROW, size: 12, label: t('menu.codex'), onSelect: () => this.openCodex() });
    const qy = rowY(rows + 2);
    if (this.sim.overtime >= 0) {
      // В овертайме забег можно закончить сразу: победа с текущими очками.
      const half = (LEFT_W - GAP) / 2;
      addButton(this, this.nav, { x: M + half / 2, y: qy, w: half, h: ROW, size: 12, label: t('pause.quit'), onSelect: () => this.quit() });
      addButton(this, this.nav, { x: M + LEFT_W - half / 2, y: qy, w: half, h: ROW, size: 12, label: t('pause.finish'), color: '#ffd84a', onSelect: () => this.finish() });
    } else {
      addButton(this, this.nav, { x: cx, y: qy, w: LEFT_W, h: ROW, size: 12, label: t('pause.quit'), onSelect: () => this.quit() });
    }
    const bottom = qy + ROW / 2;
    const rx = M + LEFT_W + GAP;
    const rw = GAME_WIDTH - M - rx;
    const me = this.sim.players[this.sim.local];
    addStatsBlock(this, rx, bottom - STATS_H, rw, me);
    addBuildList(this, rx, TOP, rw, bottom - STATS_H - GAP - TOP, me);

    this.input.keyboard.on('keydown-P', () => this.resume());
  }

  // Кодекс поверх паузы: пауза и забег остаются как есть, ввод паузы выключен, пока кодекс открыт.
  openCodex() {
    if (this.inCodex || this.closed) return;
    this.inCodex = true;
    this.input.enabled = false;
    this.input.keyboard.enabled = false;
    this.scene.launch('Codex', { from: 'Pause' });
    this.scene.bringToTop('Codex');
  }

  // Codex закрылся: ввод вернётся в следующем кадре, чтобы Esc / B, закрывшие кодекс, не сняли и паузу.
  codexClosed() {
    this.wake = true;
  }

  update(time) {
    // кооп: пауза общая, экран закрывается, когда команда resume применилась у обоих (и кодекс поверх тоже)
    if (this.act.coop && !this.act.paused) { this.close(); return; }
    if (this.inCodex) {
      if (!this.wake) return;
      this.inCodex = false;
      this.wake = false;
      this.input.enabled = true;
      this.input.keyboard.enabled = true;
      const p = readPad();
      this.nav.padPrev = p || { x: 0, y: 0, a: false, b: false };
      this.padStart = !!(p && p.start);
      return;
    }
    this.nav.update(time);
    const pad = readPad();
    const start = !!(pad && pad.start);
    if (start && !this.padStart) this.resume();
    this.padStart = start;
  }

  resume() {
    if (this.act.coop) { this.act.resume(); return; }
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.scene.isActive('Codex') || this.scene.isPaused('Codex')) this.scene.stop('Codex');
    if (!this.act.coop) {
      this.act.hold();
      this.scene.resume('Game');
    }
    fadeOutAndStop(this);
  }

  finish() {
    this.act.finish();
    playSfx(this, 'victory');
    this.resume();
  }

  quit() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
