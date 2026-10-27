import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { addPanel } from '../ui/panel.js';
import { BUTTON } from '../ui/menu-layout.js';
import { textStyle } from '../ui/style.js';
import { createActions } from '../core/actions.js';
import { fadeOutAndStop, resetFade } from '../ui/fade.js';
import { playChestOpen } from '../ui/chest-open.js';
import { PASSIVES } from '../data/passives.js';

const CARD_W = 220;
const CARD_H = 150;
const CARD_GAP = 16;

// Сундук скиллов (с элит) поверх Game, sim.state 'chest'. Выпавшее уже применено симом (UP.skillChest):
// +1 пассивке, +1 оружию или эволюция, иначе лечение. Анимация открытия, карточки своего игрока, Ok.
// Соло: Game на паузе, Ok — sim.chestOk. Кооп: каждый жмёт Ok за себя (команда), экран закрывается у обоих,
// когда закрыли оба (sim.state уходит из 'chest').
export class ChestScene extends Phaser.Scene {
  constructor() {
    super('Chest');
  }

  init(data) {
    this.sim = data.sim;
    this.act = data.act || createActions(data.sim);
    this.closed = false;
    this.okSent = false;
    this.okBtn = null; // сцена переиспользуется: кнопка прошлого показа уничтожена
    this.openedAt = 0;
  }

  create() {
    resetFade(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, 34, t('chest.title'),
        textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    this.nav = new FocusNav(this, {}); // до анимации: клавиша, открывшая сундук, не жмёт Ok
    const pad = readPad();
    this.padA = !!(pad && pad.a);
    this.opening = playChestOpen(this, 'skill', () => this.drawCards());
  }

  // Свои карточки из всех сундуков этого показа (два сундука за кадр — вместе).
  get cards() {
    const me = this.act.coop ? this.act.local : 0;
    return (this.sim.chest.rolls || []).filter((r) => r.player === me).flatMap((r) => r.cards);
  }

  update(time) {
    if (this.closed) return;
    const pad = readPad();
    const a = !!(pad && pad.a);
    if (a && !this.padA && !this.opening.opened) this.opening.open();
    this.padA = a;
    this.nav.update(time);
    if (this.act.coop && this.sim.state !== 'chest') this.close();
  }

  drawCards() {
    this.openedAt = this.time.now;
    const cards = this.cards;
    const total = cards.length * CARD_W + (cards.length - 1) * CARD_GAP;
    const x0 = (GAME_WIDTH - total) / 2 + CARD_W / 2;
    cards.forEach((c, i) => this.drawCard(x0 + i * (CARD_W + CARD_GAP), 160, c));
    this.okBtn = addButton(this, this.nav, { x: GAME_WIDTH / 2, y: 290, ...BUTTON.action, label: t('chest.ok'),
      onSelect: () => this.ok() });
    this.nav.focus(0);
  }

  // Ряд «A + B > C» по центру (px, py): иконки 28, 28, 44, знаки по 12.
  drawCombo(it, px, py) {
    const icon = (id, size, x) => addIcon(this, x, py, iconKeyFor('weapon', id), size, 'weapon', id);
    const from = it.from || [];
    const kind1 = (id) => (PASSIVES[id] ? 'passive' : 'weapon');
    addIcon(this, px - 76, py, iconKeyFor(kind1(from[0]), from[0]), 28, kind1(from[0]), from[0]);
    this.add.text(px - 42, py, '+', textStyle(16)).setOrigin(0.5);
    addIcon(this, px - 8, py, iconKeyFor(kind1(from[1]), from[1]), 28, kind1(from[1]), from[1]);
    this.add.text(px + 26, py, '>', textStyle(18, '#ffd84a')).setOrigin(0.5);
    icon(it.id, 44, px + 68);
  }

  drawCard(x, y, c) {
    const panel = addPanel(this, x, y, CARD_W, CARD_H);
    panel.setFocus(true);
    if (c.evolved) {
      this.add.text(x, y - CARD_H / 2 + 14, t('chest.evolution'),
          textStyle(16, '#ffd84a', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
      this.drawCombo(c, x, y - 22);
      const base = c.from && c.from[0];
      this.add.text(x, y + 10, t('chest.evolve', { from: displayName('weapon', base), lv: c.prev,
        to: displayName('weapon', c.id) }), textStyle(10, '#ffffff', { align: 'center',
        wordWrap: { width: CARD_W - 16 } })).setOrigin(0.5, 0);
      this.add.text(x, y + 38, t(`weapon.${c.id}.desc`), textStyle(9, '#d8d0f0',
          { align: 'center', wordWrap: { width: CARD_W - 24 } })).setOrigin(0.5, 0);
      return;
    }
    const kind = c.kind === 'heal' ? 'heal' : c.kind;
    addIcon(this, x, y - 40, iconKeyFor(kind, c.id), 40, kind, c.id);
    const name = c.kind === 'heal' ? t('card.heal.name') : displayName(kind, c.id);
    this.add.text(x, y - 12, name, textStyle(14, '#ffffff', { align: 'center',
      wordWrap: { width: CARD_W - 16 } })).setOrigin(0.5, 0);
    const tag = c.kind === 'heal' ? t('chest.heal') : t('chest.level_up', { a: c.prev, b: c.level });
    this.add.text(x, y + 16, tag, textStyle(16, c.kind === 'heal' ? '#8cff6a' : '#9ad0ff',
        { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0);
  }

  ok() {
    if (this.closed || this.okSent) return;
    this.okSent = true;
    this.act.chestOk();
    if (!this.act.coop) { this.close(); return; }
    this.okBtn.setDisabled(true);
    this.okBtn.setLabel(t('chest.waiting'));
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
