import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { PASSIVES } from '../data/passives.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { addPanel } from '../ui/panel.js';
import { BUTTON, rowXs, overlayTitle } from '../ui/menu-layout.js';
import { textStyle } from '../ui/style.js';
import { createActions } from '../core/actions.js';
import { fadeOutAndStop, resetFade } from '../ui/fade.js';
import { playChestOpen } from '../ui/chest-open.js';

const CARD_W = 220;
const CARD_H = 150;
const CARD_GAP = 16;
const CHOICE_W = 420;       // строка выбора эволюции: ряд «A + B > C» слева, название и описание справа
const CHOICE_H = 70;        // до CHEST.maxChoices строк столбиком
const CHOICE_GAP = 6;

// Сундук скиллов поверх Game (docs/META.md 1.4), три режима:
// { sim, choices } — готовые эволюции (sim.state 'chest', chest.cards): выбор строки и Continue или Skip
//   (пропуск — обычные апгрейды, соло показываются здесь же). Кооп: выбирает тот, кому достался сундук,
//   затем показ обоим (state 'reveal'), закрывает хозяин или таймер сима.
// { sim, items } — кооп: показ выбранного (state 'reveal').
// { sim } — апгрейды без выбора (state 'chest', chest.rolls, уже применены): свои карточки и Ok; кооп —
//   экран закрывается у обоих, когда Ok нажали оба.
export class ChestScene extends Phaser.Scene {
  constructor() {
    super('Chest');
  }

  init(data) {
    this.sim = data.sim;
    this.act = data.act || createActions(data.sim);
    this.items = (data.items && data.items.length ? data.items : []);
    this.choices = (data.choices && data.choices.length ? data.choices : []);
    this.rollsMode = !this.items.length && !this.choices.length;
    this.picked = -1;
    this.closed = false;
    this.okSent = false;
    this.okBtn = null; // сцена переиспользуется: кнопка прошлого показа уничтожена
    this.openedAt = 0;
    this.confirmBtn = null;
    this.choiceObjs = [];
  }

  create() {
    resetFade(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);
    overlayTitle(this, t('chest.title'));
    if (this.sim.coop && this.choices.length) {
      const who = this.sim.chest.player;
      const key = who === this.sim.local ? 'coop.your_pick' : 'coop.partner_pick';
      this.add.text(GAME_WIDTH / 2, 50, t(key, { n: who + 1 }), textStyle(10, '#9ad0ff')).setOrigin(0.5);
    }
    this.nav = new FocusNav(this, {}); // до анимации: клавиша, открывшая сундук, не жмёт кнопку
    const pad = readPad();
    this.padA = !!(pad && pad.a);
    this.opening = playChestOpen(this, 'skill', () => this.reveal());
  }

  // Чей сундук: в коопе выбирает тот, кто подобрал (sim.chest.player), второй смотрит.
  get mine() {
    return !this.act.coop || this.sim.chest.player === this.act.local;
  }

  // Свои апгрейды из всех сундуков этого показа (два сундука за кадр — вместе).
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
    if (!this.act.coop) return;
    if (this.rollsMode) {
      if (this.sim.state !== 'chest') this.close();
      return;
    }
    if (this.choices.length && this.sim.state !== 'chest') {
      // кооп: выбор применился у обоих — показываем выбранное (state 'reveal', мир стоит у обоих)
      this.choices = [];
      this.clearChoices();
      if (this.sim.state !== 'reveal') { this.close(); return; }
      this.items = this.sim.chest.shown;
      if (this.opening.opened) this.drawCards(this.items);
      return;
    }
    // кооп: показ кончился (таймер сима или хозяин сундука закрыл)
    if (!this.choices.length && this.sim.state !== 'reveal') this.close();
  }

  reveal() {
    if (this.closed) return;
    this.openedAt = this.time.now;
    if (this.choices.length) this.drawChoices();
    else this.drawCards(this.rollsMode ? this.cards : this.items);
  }

  clearChoices() {
    this.nav.clear();
    for (const o of this.choiceObjs) o.destroy();
    this.choiceObjs = [];
  }

  // Карточки выпавшего в ряд и кнопка Ok (показ апгрейдов: chestOk; показ выбранного: закрыть).
  drawCards(cards) {
    this.openedAt = this.time.now;
    const total = cards.length * CARD_W + (cards.length - 1) * CARD_GAP;
    const x0 = (GAME_WIDTH - total) / 2 + CARD_W / 2;
    cards.forEach((c, i) => this.drawCard(x0 + i * (CARD_W + CARD_GAP), 160, c));
    this.okBtn = addButton(this, this.nav, { x: GAME_WIDTH / 2, y: 290, ...BUTTON.action, label: t('chest.ok'),
      onSelect: () => this.ok() });
    if (this.act.coop && !this.rollsMode && !this.mine) this.okBtn.setDisabled(true); // закрывает хозяин
    this.nav.focus(0);
  }

  // Ряд «A + B > C» шириной 180 × k px по центру (px, py): иконки 28, 28, 44, знаки по 12.
  drawCombo(it, px, py, k = 1) {
    const from = it.from || [];
    const kind = (id) => (PASSIVES[id] ? 'passive' : 'weapon');
    const icon = (id, size, x) =>
      addIcon(this, x, py, iconKeyFor(kind(id), id), Math.round(size * k), kind(id), id);
    if (from.length >= 2) {
      icon(from[0], 28, px - 76 * k);
      this.add.text(px - 42 * k, py, '+', textStyle(Math.round(16 * k))).setOrigin(0.5);
      icon(from[1], 28, px - 8 * k);
      this.add.text(px + 26 * k, py, '>', textStyle(Math.round(18 * k), '#ffd84a')).setOrigin(0.5);
      icon(it.id, 44, px + 68 * k);
    } else {
      icon(it.id, 44, px);
    }
  }

  // Выбор: строки-карточки столбиком, первая выбрана сразу; клик или Enter выбирает строку, Continue
  // применяет (Enter на уже выбранной строке тоже), Skip — обычные апгрейды вместо эволюции.
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
      this.drawCombo(it, x - 100, y, 0.8);
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
      const xs = rowXs(2, x);
      this.confirmBtn = addButton(this, this.nav, { x: xs[0], y: by, ...BUTTON.action, label: t('chest.continue'),
        onSelect: () => this.confirm() });
      addButton(this, this.nav, { x: xs[1], y: by, ...BUTTON.action, label: t('chest.skip'),
        onSelect: () => this.skip() });
    } else {
      this.nav.clear();
    }
    this.picked = 0;
    this.paintRow(0, false);
    if (this.mine) this.nav.focus(0);
    this.choiceObjs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
  }

  // Фокус — жёлтая рамка, выбранная строка без фокуса — зелёная (panel.setState).
  paintRow(i, focused) {
    this.panels[i].setState(focused, i === this.picked);
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
    if (!this.act.coop) this.close(); // кооп: результат придёт через sim.state в update() (показ обоим)
  }

  // Пропуск эволюции: sim выдаёт обычные апгрейды, показываем их.
  skip() {
    if (this.closed) return;
    if (this.act.coop) { this.act.skipChest(); return; }
    this.showApplied(this.sim.skipChest());
  }

  // Соло: апгрейды после пропуска эволюции показать на этом же экране.
  showApplied(items) {
    this.choices = [];
    this.clearChoices();
    this.items = items;
    this.drawCards(items);
  }

  drawCard(x, y, c) {
    const panel = addPanel(this, x, y, CARD_W, CARD_H);
    panel.setFocus(true);
    if (c.evolved) {
      this.add.text(x, y - CARD_H / 2 + 14, t('chest.evolution'),
          textStyle(16, '#ffd84a', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
      this.drawCombo(c, x, y - 22);
      const base = c.from && c.from[0];
      const line = c.prev ? t('chest.evolve', { from: displayName('weapon', base), lv: c.prev,
        to: displayName('weapon', c.id) }) : displayName('weapon', c.id);
      this.add.text(x, y + 10, line, textStyle(10, '#ffffff', { align: 'center',
        wordWrap: { width: CARD_W - 16 } })).setOrigin(0.5, 0);
      this.add.text(x, y + 38, t(`weapon.${c.id}.desc`), textStyle(9, '#d8d0f0',
          { align: 'center', wordWrap: { width: CARD_W - 24 } })).setOrigin(0.5, 0);
      return;
    }
    addIcon(this, x, y - 40, iconKeyFor(c.kind, c.id), 40, c.kind, c.id);
    const name = c.kind === 'heal' ? t('card.heal.name') : displayName(c.kind, c.id);
    this.add.text(x, y - 12, name, textStyle(14, '#ffffff', { align: 'center',
      wordWrap: { width: CARD_W - 16 } })).setOrigin(0.5, 0);
    const tag = c.kind === 'heal' ? t('chest.heal') : c.prev ? t('chest.level_up', { a: c.prev, b: c.level }) :
      t('levelup.lv', { n: c.level });
    this.add.text(x, y + 16, tag, textStyle(16, c.kind === 'heal' ? '#8cff6a' : '#9ad0ff',
        { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0);
  }

  // Ok: показ апгрейдов — chestOk (кооп: ждём напарника); показ выбранного — закрыть (кооп: хозяин, командой).
  ok() {
    if (this.closed || this.okSent) return;
    if (this.rollsMode) {
      this.okSent = true;
      this.act.chestOk();
      if (!this.act.coop) { this.close(); return; }
      this.okBtn.setDisabled(true);
      this.okBtn.setLabel(t('chest.waiting'));
      return;
    }
    if (!this.act.coop) { this.close(); return; }
    if (this.mine) { this.okSent = true; this.act.revealDone(); }
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
