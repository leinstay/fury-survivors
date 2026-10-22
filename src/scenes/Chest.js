import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { addPanel } from '../ui/panel.js';
import { textStyle } from '../ui/style.js';
import { spriteScale } from '../render/density.js';

const SHAKE_MS = 600;
const INPUT_GUARD_MS = 250; // клавиши движения, зажатые в момент открытия, не должны закрывать экран
const CHOICE_W = 148;       // карточка выбора супероружия (до 4 в ряд)
const CHOICE_H = 96;
const CHOICE_GAP = 8;

// Экран сундука поверх замороженной Game. data: { sim, items } — предметы уже применены, показ;
// { sim, choices } — несколько готовых супероружий (sim.state === 'chest'): выбор карточки и подтверждение.
export class ChestScene extends Phaser.Scene {
  constructor() {
    super('Chest');
  }

  init(data) {
    this.sim = data.sim;
    this.items = (data.items && data.items.length ? data.items : []);
    this.choices = (data.choices && data.choices.length ? data.choices : []);
    this.picked = -1;
    this.revealed = false;
    this.closed = false;
  }

  create() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, 34, t('chest.title'), textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
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
      if (!this.choices.length && this.time.now - this.revealAt > INPUT_GUARD_MS) this.close();
    };
    this.input.keyboard.on('keydown', this.keyHandler);
    this.input.on('pointerdown', () => this.advance());
  }

  advance() {
    if (this.closed) return;
    if (!this.revealed) this.reveal();
    else if (!this.choices.length && this.time.now - this.revealAt > 120) this.close();
  }

  update(time) {
    const pad = readPad();
    const a = !!(pad && pad.a);
    if (a && !this.padA && !(this.revealed && this.choices.length)) this.advance();
    this.padA = a;
    this.nav.update(time);
  }

  reveal() {
    if (this.revealed || this.closed) return;
    this.revealed = true;
    this.revealAt = this.time.now;
    if (this.revealTimer) this.revealTimer.remove(false);
    this.tweens.killTweensOf(this.chest);
    this.chest.destroy();

    if (this.choices.length) { this.drawChoices(); return; }

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

  // Выбор: карточки в ряд, клик или Enter выбирает (описание ниже), Confirm применяет.
  // Enter на уже выбранной карточке тоже подтверждает.
  drawChoices() {
    const cards = this.choices;
    this.add.text(GAME_WIDTH / 2, 62, t('chest.choose'), textStyle(14, '#d8d0f0')).setOrigin(0.5);
    const total = cards.length * CHOICE_W + (cards.length - 1) * CHOICE_GAP;
    const x0 = (GAME_WIDTH - total) / 2 + CHOICE_W / 2;
    const cy = 134;
    this.marks = [];
    cards.forEach((it, i) => {
      const x = x0 + i * (CHOICE_W + CHOICE_GAP);
      const panel = addPanel(this, x, cy, CHOICE_W, CHOICE_H);
      this.add.text(x, cy - CHOICE_H / 2 + 12, t('chest.evolution'),
          textStyle(12, '#ffd84a', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
      this.drawCombo(it, x, cy - 6, 'weapon', 0.72);
      this.add.text(x, cy + 24, displayName('weapon', it.id),
          textStyle(11, '#ffffff', { align: 'center', wordWrap: { width: CHOICE_W - 10 } })).setOrigin(0.5, 0);
      const mark = this.add.rectangle(x, cy, CHOICE_W + 4, CHOICE_H + 4)
          .setStrokeStyle(2, 0xffd84a).setVisible(false);
      this.marks.push(mark);
      this.nav.add({
        x, y: cy, w: CHOICE_W, h: CHOICE_H,
        setFocus: (f) => panel.setFocus(f),
        onSelect: () => { if (this.picked === i) this.confirm(); else this.pick(i); },
      });
    });
    this.desc = this.add.text(GAME_WIDTH / 2, 206, '', textStyle(11, '#d8d0f0', { align: 'center', wordWrap: { width: 420 } })).setOrigin(0.5, 0);
    this.confirmBtn = addButton(this, this.nav, { x: GAME_WIDTH / 2, y: 290, w: 150, h: 30, label: t('chest.confirm'), onSelect: () => this.confirm() });
    this.confirmBtn.setDisabled(true);
    this.nav.focus(0);
  }

  pick(i) {
    this.picked = i;
    this.marks.forEach((m, j) => m.setVisible(j === i));
    const it = this.choices[i];
    this.desc.setText(`${displayName('weapon', it.id)}: ${t(`weapon.${it.id}.desc`)}`);
    this.confirmBtn.setDisabled(false);
  }

  confirm() {
    if (this.picked < 0 || this.closed) return;
    this.sim.chooseChest(this.picked);
    this.close();
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

  close() {
    if (this.closed) return;
    this.closed = true;
    this.scene.resume('Game');
    this.scene.stop();
  }
}
