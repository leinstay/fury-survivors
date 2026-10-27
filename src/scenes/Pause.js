import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { textStyle } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import { playSfx } from '../audio/sfx.js';
import { createActions } from '../core/actions.js';
import { critChance } from '../core/stats.js';
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
const TITLE_Y = 27; // заголовок по линии полосы HP в HUD (ui/hud.js: y 21, высота 12)
const LEFT_W = 300;
// Вкладка настроек как настройки главного меню (Menu.js): подзаголовок на y 100, столбец шириной 300 с y 126.
const OPT = { title: 100, y: 126, w: 300 };
// Кнопки паузы шириной как кнопки главного меню, столбец по центру левой колонки и по высоте панелей справа.
const BTN_W = 160;
// Низ панелей справа: как со столбцом настроек (9 строк), не по короткому столбцу кнопок.
const RIGHT_BOTTOM = TOP + 9 * STEP + ROW;
const STAT_LINE = 18;

const fmtPct = (v) => `${Math.round(v * 100)}%`;
const STAT_ROWS = [
  ['stat.hp', (s, p) => `${Math.ceil(p.hp)}/${Math.ceil(s.maxHp ?? p.maxHp)}`],
  ['stat.steel', (s) => fmtPct(s.steel ?? 1)],
  ['stat.magic', (s) => fmtPct(s.magic ?? 1)],
  ['stat.spd', (s) => String(Math.round(s.speed ?? 0))],
  ['stat.crt', (s) => fmtPct(critChance(s))], // с учётом удачи и капа, как в sim.critChance
  ['stat.pickup', (s) => fmtPct(s.pickup ?? 1)],
  ['stat.haste', (s) => fmtPct(s.haste ?? 1)],
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
    this.add.text(GAME_WIDTH / 2, TITLE_Y, t('pause.title'), textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    this.nav = new FocusNav(this, { onBack: () => (this.view === 'options' ? this.show('main') : this.resume()) });
    const pad = readPad();
    this.padStart = !!(pad && pad.start);
    this.inCodex = false;
    this.wake = false;
    this.objs = [];
    this.show('main');
    this.input.keyboard.on('keydown-P', () => this.resume());
  }

  // Виды паузы: main (столбец кнопок, справа билд и статы) и options (настройки столбцом по центру).
  show(view) {
    this.view = view;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    const before = new Set(this.children.list);
    if (view === 'options') this.showOptions();
    else this.showMain();
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(view === 'options' ? 0 : (this.focusMain || 0));
  }

  showOptions() {
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, OPT.title, t('pause.options'), textStyle(16)).setOrigin(0.5);
    const rows = addVolumeSliders(this, this.nav, { x: cx, y: OPT.y, w: OPT.w, gap: STEP });
    addButton(this, this.nav, {
      x: cx, y: OPT.y + rows * STEP, w: OPT.w, h: ROW, size: 12, label: t('settings.back'),
      onSelect: () => { this.focusMain = 1; this.show('main'); },
    });
  }

  // Слева столбец кнопок: Resume, Options, Codex, Quit (в овертайме ещё Finish). Справа билд и статы.
  showMain() {
    const rows = [
      [t('pause.resume'), () => this.resume()],
      [t('pause.options'), () => this.show('options')],
      [t('menu.codex'), () => this.openCodex()],
      [t('pause.quit'), () => this.quit()],
    ];
    // в овертайме забег можно закончить сразу: победа с текущими очками
    if (this.sim.overtime >= 0) rows.push([t('pause.finish'), () => this.finish(), '#ffd84a']);
    const cx = M + LEFT_W / 2;
    const y0 = (TOP + RIGHT_BOTTOM - rows.length * STEP + (STEP - ROW)) / 2 + ROW / 2;
    rows.forEach(([label, onSelect, color], i) => {
      addButton(this, this.nav, {
        x: cx, y: y0 + i * STEP, w: BTN_W, h: ROW, size: 12, label, color, onSelect,
      });
    });
    const bottom = RIGHT_BOTTOM;
    const rx = M + LEFT_W + GAP;
    const rw = GAME_WIDTH - M - rx;
    const me = this.sim.players[this.sim.local];
    addStatsBlock(this, rx, bottom - STATS_H, rw, me);
    addBuildList(this, rx, TOP, rw, bottom - STATS_H - GAP - TOP, me);
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
