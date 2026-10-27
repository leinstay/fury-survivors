import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { bgTextStyle, textStyle } from '../ui/style.js';
import { playSfx } from '../audio/sfx.js';
import { createActions } from '../core/actions.js';
import { fadeOutAndStop, resetFade } from '../ui/fade.js';
import { statReport } from '../core/stats.js';
import { loadoutReport, loadoutUnique } from '../core/loadout.js';
import { BagView, ItemTooltip, addStatsPanel, addStatsLegend, RARITY_CSS } from '../ui/items.js';
import { PANEL } from '../ui/panel.js';
import { BAG } from '../data/items.js';
import {
  EDGE, LABEL_ROW, menuRow, backRect, screenTitle, overlayTitle, menuBackdrop, SUBMENU_Y,
  PAUSE_TITLE_Y,
  OPTIONS as OPT,
} from '../ui/menu-layout.js';

// Вкладка инвентаря (раскладка e7cfb76): m — отступ от края, top — строка «Bag» и «Stats», headH — от неё до
// верха сетки и панели, cell — клетка сумки, gap — между сеткой и панелью, bottom — низ панели статов
// (как у столбца настроек: 46 + 9 × 28 + 24).
const INV = { m: 8, top: 46, headH: LABEL_ROW, cell: 24, gap: 6, bottom: 322 };

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
    this.nav = new FocusNav(this, {
      onBack: () => (this.view === 'options' || this.view === 'inventory' ? this.show('main') : this.resume()),
    });
    this.tip = new ItemTooltip(this);
    this.cursor = null;
    this.input.on('pointermove', (p) => { this.cursor = { x: p.worldX, y: p.worldY }; });
    const pad = readPad();
    this.padStart = !!(pad && pad.start);
    this.inCodex = false; // открыт экран поверх паузы (кодекс или ачивки)
    this.wake = false;
    this.objs = [];
    this.show('main');
    this.input.keyboard.on('keydown-P', () => this.resume());
  }

  // Виды паузы: main (столбец кнопок), inventory и options (настройки столбцом по центру).
  show(view) {
    this.view = view;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    this.tip.hide();
    this.bagView = null;
    this.cursor = null;
    const before = new Set(this.children.list);
    if (view === 'options') this.showOptions();
    else if (view === 'inventory') this.showInventory();
    else this.showMain();
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(view === 'main' ? (this.focusMain || 0) : view === 'inventory' ? this.nav.items.length - 1 : 0);
  }

  // Инвентарь только для просмотра: сумка своего героя, статы с сумкой и пассивками, подсказки
  // (раскладка как в коммите e7cfb76; заголовок паузы «Paused» над ней, как было).
  // Инвентарь только для просмотра (раскладка e7cfb76): «Bag 7x4» и «Stats» на одной линии над сеткой и панелью,
  // верх панели статов на уровне верха сумки, низ как был; под сумкой уникалка, подсказка внизу слева в панели.
  showInventory() {
    menuBackdrop(this);
    screenTitle(this, t('inv.title'));
    const me = this.sim.players[this.sim.local];
    const C = INV.cell;
    const bx = INV.m;
    const by = INV.top + INV.headH;
    this.add.text(bx, INV.top, t('inv.bag', { c: me.bag.cols, r: me.bag.rows }), bgTextStyle(10, '#ffd84a'))
        .setOrigin(0, 0);
    this.bagView = new BagView(this, { x: bx, y: by, cell: C });
    this.bagView.draw(me.bag);
    for (let y = 0; y < BAG.h; y++) {
      for (let x = 0; x < BAG.w; x++) {
        const cx = bx + x * C + C / 2;
        const cy = by + y * C + C / 2;
        const g = this.add.graphics();
        this.nav.add({
          x: cx, y: cy, w: C, h: C, onPointer: () => {},
          setFocus: (f) => {
            g.clear();
            if (!f) {
              // клетка без фокуса не держит подсказку (иначе при входе всплывал первый предмет)
              if (this.cursor && this.cursor.x === cx && this.cursor.y === cy) this.cursor = null;
              return;
            }
            g.lineStyle(1, PANEL.borderFocus, 1)
                .strokeRect(cx - C / 2 + 0.5, cy - C / 2 + 0.5, C - 1, C - 1);
            this.cursor = { x: cx, y: cy };
          },
        });
      }
    }
    const u = loadoutUnique(me.bag);
    const y = by + BAG.h * C + 8;
    if (u) {
      this.add.text(bx, y, t(`unique.${u}.name`), bgTextStyle(11, RARITY_CSS.unique)).setOrigin(0, 0);
      this.add.text(bx, y + 14, t(`unique.${u}.desc`), bgTextStyle(9, '#ffd8a0',
          { wordWrap: { width: BAG.w * C } })).setOrigin(0, 0);
    }
    const rx = bx + BAG.w * C + INV.gap + 4;
    const rw = GAME_WIDTH - INV.m - rx;
    this.add.text(rx, INV.top, t('inv.stats'), bgTextStyle(10, '#ffd84a')).setOrigin(0, 0);
    const base = me.heroDef.stats;
    addStatsPanel(this, rx, by, rw, INV.bottom - by, loadoutReport(base, me.passives, me.bag),
        statReport(base, me.passives), '', { legend: false });
    // подсказка в нижнем левом углу панели статов, легенда цветов вкладов на её линии справа
    const legendW = addStatsLegend(this, rx + rw - 6, INV.bottom - 6, textStyle, 1);
    this.add.text(rx + 6, INV.bottom - 6, t('inv.readonly'),
        textStyle(9, '#aaaaaa', { wordWrap: { width: rw - 12 - legendW - 8 } })).setOrigin(0, 1);
    addButton(this, this.nav, {
      ...backRect(), size: 12, label: t('settings.back'),
      onSelect: () => { this.focusMain = 2; this.show('main'); },
    });
  }

  // Подсказка предмета под курсором или в фокусе (вкладка инвентаря).
  updateTip() {
    const v = this.bagView;
    const c = this.cursor;
    const cell = v && c ? v.cellAt(c.x, c.y) : null;
    const e = cell ? v.entryAt(cell.x, cell.y) : null;
    if (e) this.tip.show(e.item, c.x, c.y, { mul: v.mul });
    else this.tip.hide();
  }

  showOptions() {
    const cx = GAME_WIDTH / 2;
    menuBackdrop(this); // подэкраны паузы — на арте меню без героинь, как подменю вне забега
    screenTitle(this, t('pause.options'));
    // тот же столбец, что настройки главного меню (ui/menu-layout.js OPTIONS), Back — общий Back страниц
    addVolumeSliders(this, this.nav, { x: cx, y: SUBMENU_Y, w: OPT.w, gap: OPT.step });
    addButton(this, this.nav, {
      ...backRect(), size: 12, label: t('settings.back'),
      onSelect: () => { this.focusMain = 1; this.show('main'); },
    });
  }

  // Столбец кнопок в раскладке главного меню (ui/menu-layout.js): Resume, Options, Inventory, Codex,
  // Achievements, Quit (в овертайме ещё Finish). Статы — во вкладке инвентаря, билд в забеге под полосой HP.
  showMain() {
    // «Paused» только на корне паузы; подэкраны — заголовком экрана (screenTitle), как в меню
    overlayTitle(this, t('pause.title'), undefined, PAUSE_TITLE_Y);
    const rows = [
      [t('pause.resume'), () => this.resume()],
      [t('pause.options'), () => this.show('options')],
      [t('pause.inventory'), () => this.show('inventory')],
      [t('menu.codex'), () => this.openOverlay('Codex')],
      [t('menu.achievements'), () => this.openOverlay('Achievements')],
      [t('pause.quit'), () => this.quit()],
    ];
    // в овертайме забег можно закончить сразу: победа с текущими очками
    if (this.sim.overtime >= 0) rows.push([t('pause.finish'), () => this.finish(), '#ffd84a']);
    rows.forEach(([label, onSelect, color], i) => {
      addButton(this, this.nav, { ...menuRow(i), label, color, onSelect });
    });
  }

  // Кодекс или ачивки поверх паузы: пауза и забег остаются как есть, ввод паузы выключен, пока экран открыт.
  openOverlay(name) {
    if (this.inCodex || this.closed) return;
    this.inCodex = true;
    this.input.enabled = false;
    this.input.keyboard.enabled = false;
    this.scene.launch(name, { from: 'Pause' });
    this.scene.bringToTop(name);
  }

  openCodex() {
    this.openOverlay('Codex');
  }

  // Экран поверх закрылся: ввод вернётся в следующем кадре, чтобы Esc / B, закрывшие его, не сняли и паузу.
  codexClosed() {
    this.wake = true;
  }

  update(time) {
    // кооп: пауза общая, экран закрывается, когда команда resume применилась у обоих (и кодекс поверх тоже)
    if (this.act.coop && !this.act.paused) { this.close(); return; }
    if (this.inCodex) {
      if (!this.wake) return;
      this.inCodex = false; // открыт экран поверх паузы (кодекс или ачивки)
      this.wake = false;
      this.input.enabled = true;
      this.input.keyboard.enabled = true;
      const p = readPad();
      this.nav.padPrev = p || { x: 0, y: 0, a: false, b: false };
      this.padStart = !!(p && p.start);
      return;
    }
    this.nav.update(time);
    this.updateTip();
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
    for (const name of ['Codex', 'Achievements']) {
      if (this.scene.isActive(name) || this.scene.isPaused(name)) this.scene.stop(name);
    }
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
