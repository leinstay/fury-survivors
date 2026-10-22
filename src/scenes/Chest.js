import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { addPanel, PANEL } from '../ui/panel.js';
import { textStyle } from '../ui/style.js';
import { spriteScale } from '../render/density.js';
import { createActions } from '../core/actions.js';
import { fadeOutAndStop, resetFade } from '../ui/fade.js';

const SHAKE_MS = 600;
const INPUT_GUARD_MS = 250; // клавиши движения, зажатые в момент открытия, не должны закрывать экран
const CHOICE_W = 420;       // строка выбора супероружия: ряд «A + B > C» слева, название и описание справа
const CHOICE_H = 70;        // до CHEST.maxChoices (3) строк столбиком
const CHOICE_GAP = 6;

// Экран сундука поверх замороженной Game. data: { sim, items } — предметы уже применены, показ;
// { sim, choices } — несколько готовых супероружий (sim.state === 'chest'): выбор карточки и подтверждение.
export class ChestScene extends Phaser.Scene {
  constructor() {
    super('Chest');
  }

  init(data) {
    this.sim = data.sim;
    this.act = data.act || createActions(data.sim);
    this.items = (data.items && data.items.length ? data.items : []);
    this.choices = (data.choices && data.choices.length ? data.choices : []);
    this.picked = -1;
    this.revealed = false;
    this.closed = false;
  }

  create() {
    resetFade(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, 34, t('chest.title'), textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    if (this.sim.coop && this.choices.length) {
      const who = this.sim.chest.player;
      const key = who === this.sim.local ? 'coop.your_pick' : 'coop.partner_pick';
      this.add.text(GAME_WIDTH / 2, 50, t(key, { n: who + 1 }), textStyle(10, '#9ad0ff')).setOrigin(0.5);
    }
    this.nav = new FocusNav(this, {});
    this.startAt = this.time.now;
    const pad = readPad();
    this.padA = !!(pad && pad.a);

    const cx = GAME_WIDTH / 2;
    const cy = 190;
    const k = 4 * (this.textures.exists('chest') ? spriteScale('chest') : 1);
    if (this.textures.exists('chest')) {
      this.chest = this.add.sprite(cx, cy + 20, 'chest', 0).setOrigin(0.5, 1).setScale(k);
    } else {
      this.chest = this.add.rectangle(cx, cy, 70, 56, 0xa0602a).setStrokeStyle(2, 0x000000);
    }
    this.tweens.add({
      targets: this.chest, angle: { from: -9, to: 9 }, duration: 70, yoyo: true,
      repeat: Math.floor(SHAKE_MS / 140) - 1,
    });
    this.tweens.add({ targets: this.chest, y: this.chest.y - 8, duration: SHAKE_MS / 4, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
    this.revealTimer = this.time.delayedCall(SHAKE_MS, () => this.reveal());

    this.keyHandler = (ev) => {
      if (ev.repeat) return;
      if (!this.revealed) {
        if (this.time.now - this.startAt > INPUT_GUARD_MS) this.reveal();
        return;
      }
      // при выборе клавиши идут в навигацию (FocusNav), экран закрывает только подтверждение
      if (!this.choices.length && this.time.now - this.revealAt > INPUT_GUARD_MS) this.dismiss();
    };
    this.input.keyboard.on('keydown', this.keyHandler);
    this.input.on('pointerdown', () => this.advance());
  }

  advance() {
    if (this.closed) return;
    if (!this.revealed) this.reveal();
    else if (!this.choices.length && this.time.now - this.revealAt > 120) this.dismiss();
  }

  // Чей сундук: в коопе выбирает тот, кто подобрал (sim.chest.player), второй смотрит.
  get mine() {
    return !this.act.coop || this.sim.chest.player === this.act.local;
  }

  update(time) {
    const pad = readPad();
    const a = !!(pad && pad.a);
    if (a && !this.padA && !(this.revealed && this.choices.length)) this.advance();
    this.padA = a;
    this.nav.update(time);
    if (this.choices.length && this.sim.state !== 'chest') {
      // кооп: выбор применился у обоих — показываем выпавшее (state 'reveal', мир стоит у обоих)
      this.choices = [];
      this.nav.clear();
      for (const o of this.choiceObjs) o.destroy();
      this.choiceObjs = [];
      if (this.sim.state !== 'reveal') { this.close(); return; }
      this.items = this.sim.chest.shown;
      this.revealAt = this.time.now;
      this.drawItems();
    }
    // кооп: показ кончился (таймер сима или хозяин сундука закрыл)
    if (this.act.coop && !this.choices.length && this.sim.state !== 'reveal') this.close();
  }

  reveal() {
    if (this.revealed || this.closed) return;
    this.revealed = true;
    this.revealAt = this.time.now;
    if (this.revealTimer) this.revealTimer.remove(false);
    this.tweens.killTweensOf(this.chest);
    this.chest.destroy();

    if (this.choices.length) { this.drawChoices(); return; }
    this.drawItems();
  }

  drawItems() {
    const items = this.items;
    const gap = 16;
    const w = items.some((it) => this.isEvolution(it)) ? 290 : 190;
    const total = items.length * w + (items.length - 1) * gap;
    const x0 = (GAME_WIDTH - total) / 2 + w / 2;
    const cy = 150;
    items.forEach((it, i) => this.drawItem(x0 + i * (w + gap), cy, w, 150, it));

    addButton(this, this.nav, { x: GAME_WIDTH / 2, y: 290, w: 140, h: 30, label: t('chest.continue'), onSelect: () => this.advance() });
    this.nav.focus(0);
  }

  isEvolution(it) {
    return it.kind === 'evolution' || !!it.evolved || (Array.isArray(it.from) && it.from.length > 0);
  }

  // Ряд «A + B > C» шириной 180 × k px по центру (px, py): иконки 28, 28, 44, знаки по 12, промежутки 14.
  drawCombo(it, px, py, kind, k = 1) {
    const icon = (id, size, x, y) =>
      addIcon(this, x, y, iconKeyFor(kind, id), Math.round(size * k), kind, id);
    const from = it.from || [];
    if (from.length >= 2) {
      icon(from[0], 28, px - 76 * k, py);
      this.add.text(px - 42 * k, py, '+', textStyle(Math.round(16 * k))).setOrigin(0.5);
      icon(from[1], 28, px - 8 * k, py);
      this.add.text(px + 26 * k, py, '>', textStyle(Math.round(18 * k), '#ffd84a')).setOrigin(0.5);
      icon(it.id, 44, px + 68 * k, py);
    } else {
      icon(it.id, 44, px, py);
    }
  }

  // Выбор: строки-карточки столбиком (как показ одной эволюции), первая выбрана сразу; клик или Enter
  // выбирает строку, Continue применяет (Enter на уже выбранной строке тоже).
  drawChoices() {
    const before = new Set(this.children.list);
    const cards = this.choices;
    const w = CHOICE_W;
    const h = CHOICE_H;
    const y0 = 58 + h / 2;
    const x = GAME_WIDTH / 2;
    this.panels = [];
    cards.forEach((it, i) => {
      const y = y0 + i * (h + CHOICE_GAP);
      const panel = addPanel(this, x, y, w, h);
      this.panels.push(panel);
      this.drawCombo(it, x - 100, y, 'weapon', 0.8);
      this.add.text(x + 4, y - h / 2 + 10, t('chest.evolution'),
          textStyle(11, '#ffd84a', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0, 0);
      this.add.text(x + 4, y - 7, displayName('weapon', it.id), textStyle(13, '#ffffff')).setOrigin(0, 0);
      this.add.text(x + 4, y + 11, t(`weapon.${it.id}.desc`),
          textStyle(9, '#d8d0f0', { wordWrap: { width: w / 2 - 20 } })).setOrigin(0, 0);
      this.nav.add({
        x, y, w, h,
        setFocus: (f) => this.paintRow(i, f),
        onSelect: () => { if (this.picked === i) this.confirm(); else this.pick(i); },
      });
    });
    const by = y0 + cards.length * (h + CHOICE_GAP) - h / 2 + 18;
    if (this.mine) {
      this.confirmBtn = addButton(this, this.nav, { x: x - 78, y: by, w: 140, h: 28, label: t('chest.continue'), onSelect: () => this.confirm() });
      addButton(this, this.nav, { x: x + 78, y: by, w: 140, h: 28, size: 12, label: t('chest.skip'), onSelect: () => this.skip() });
    } else {
      this.nav.clear();
    }
    this.picked = 0;
    this.paintRow(0, false);
    if (this.mine) this.nav.focus(0);
    this.choiceObjs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
  }

  // Пропуск супероружия: sim выдаёт обычный предмет, показываем его как обычный сундук.
  skip() {
    if (this.closed) return;
    if (this.act.coop) { this.act.skipChest(); return; } // результат придёт через sim.state в update()
    const items = this.sim.skipChest();
    this.choices = [];
    this.items = items;
    this.nav.clear();
    for (const o of this.choiceObjs) o.destroy();
    this.choiceObjs = [];
    this.revealAt = this.time.now;
    this.drawItems();
  }

  // Выбранная строка жёлтая и при потере фокуса, фокус на остальных обычный.
  paintRow(i, focused) {
    const p = this.panels[i];
    if (i === this.picked) p.draw(PANEL.fillFocus, PANEL.borderFocus);
    else p.setFocus(focused);
  }

  pick(i) {
    const prev = this.picked;
    this.picked = i;
    if (prev >= 0) this.paintRow(prev, false);
    this.paintRow(i, true);
  }

  confirm() {
    if (this.picked < 0 || this.closed) return;
    this.act.chest(this.picked);
    if (!this.act.coop) this.close();
  }

  drawItem(x, y, w, h, it) {
    const evo = this.isEvolution(it);
    const kind = it.kind === 'evolution' ? 'weapon' : it.kind;
    const panel = addPanel(this, x, y, w, h);
    panel.setFocus(true);

    if (evo) {
      this.add.text(x, y - h / 2 + 14, t('chest.evolution'), textStyle(16, '#ffd84a', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
      this.drawCombo(it, x, y - 22, kind);
      this.add.text(x, y + 12, displayName(kind, it.id), textStyle(14, '#ffffff', { align: 'center' })).setOrigin(0.5);
      const desc = t(`weapon.${it.id}.desc`);
      this.add.text(x, y + 26, desc, textStyle(10, '#d8d0f0', { align: 'center', wordWrap: { width: w - 28 } }))
        .setOrigin(0.5, 0);
      return;
    }

    addIcon(this, x, y - 42, iconKeyFor(kind, it.id), 40, kind, it.id);
    const name = it.kind === 'heal' ? t('card.heal.name') : displayName(kind, it.id);
    this.add.text(x, y - 12, name, textStyle(14, '#ffffff', { align: 'center', wordWrap: { width: w - 16 } })).setOrigin(0.5, 0);
    if (it.kind !== 'heal') {
      const tag = it.isNew ? t('chest.new') : t('levelup.lv', { n: it.level });
      this.add.text(x, y + 14, tag, textStyle(16, it.isNew ? '#ffd84a' : '#9ad0ff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0);
    }
  }

  // Закрыть показ выпавшего: соло сразу; кооп — только хозяин сундука, командой (закроется у обоих).
  dismiss() {
    if (!this.act.coop) { this.close(); return; }
    if (this.mine) this.act.revealDone();
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
