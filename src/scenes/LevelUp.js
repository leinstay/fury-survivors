import { t, hasKey } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addIcon } from '../ui/icons.js';
import { displayName } from '../ui/icons.js';
import { textStyle } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import { createActions } from '../core/actions.js';

const CARD_W = 140;
const CARD_H = 180;
const CARD_GAP = 10;

function cardDesc(c) {
  if (c.kind === 'heal') return t('card.heal.desc');
  const lvl = `${c.kind}.${c.id}.lvl${c.level}`;
  if (hasKey(lvl)) return t(lvl);
  const d = `${c.kind}.${c.id}.desc`;
  return hasKey(d) ? t(d) : '';
}

// Сцена поверх замороженной Game: 4 карточки + Reroll / Skip / Banish.
export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super('LevelUp');
  }

  init(data) {
    this.sim = data.sim;
    this.act = data.act || createActions(data.sim);
    this.banishMode = false;
    this.shown = null; // набор карточек, который нарисован (sim меняет массив при новом наборе)
    this.closed = false; // сцена переиспользуется Phaser'ом: флаг прошлого показа сбрасываем
  }

  create() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, 30, t('levelup.title'), textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    if (this.sim.coop) {
      // кооп: карточки выбирает игрок, чей ход (sim.levelUp.player); второй видит, чей сейчас выбор
      const who = this.sim.levelUp.player;
      const key = who === this.sim.local ? 'coop.your_pick' : 'coop.partner_pick';
      this.add.text(GAME_WIDTH / 2, 52, t(key, { n: who + 1 }), textStyle(10, '#9ad0ff')).setOrigin(0.5);
    }
    this.nav = new FocusNav(this, {
      onBack: () => {
        if (this.banishMode) {
          this.banishMode = false;
          this.render();
        }
      },
    });
    this.objs = [];
    this.render();
  }

  // Чей ход: в коопе карточки выбирает sim.levelUp.player, второй только смотрит.
  get mine() {
    return !this.act.coop || this.sim.levelUp.player === this.act.local;
  }

  update(time) {
    this.nav.update(time);
    // соло: sim меняется сразу в pick(); кооп: команда применяется через lockstep позже
    if (this.sim.state !== 'levelup') { this.close(); return; }
    if (this.sim.levelUp.cards !== this.shown) this.render();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (!this.act.coop) this.scene.resume('Game');
    this.scene.stop();
  }

  render() {
    const keepIndex = this.nav.index;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    const before = new Set(this.children.list);
    const lu = this.sim.levelUp;
    const cards = lu.cards;
    this.shown = cards;
    const mine = this.mine;
    const total = cards.length * CARD_W + (cards.length - 1) * CARD_GAP;
    const x0 = (GAME_WIDTH - total) / 2 + CARD_W / 2;
    const cy = 150;

    cards.forEach((c, i) => {
      const x = x0 + i * (CARD_W + CARD_GAP);
      const rect = addPanel(this, x, cy, CARD_W, CARD_H);
      addIcon(this, x, cy - 62, c.icon, 32, c.kind, c.id);
      this.add.text(x, cy - 30, c.kind === 'heal' ? t('card.heal.name') : displayName(c.kind, c.id),
        textStyle(12, '#ffffff', { align: 'center', wordWrap: { width: CARD_W - 12 } })).setOrigin(0.5, 0);
      const tag = c.kind === 'heal' ? '' : c.isNew ? t('levelup.new') : t('levelup.lv', { n: c.level });
      this.add.text(x, cy - 10, tag, textStyle(12, c.isNew ? '#ffd84a' : '#9ad0ff')).setOrigin(0.5, 0);
      this.add.text(x, cy + 10, cardDesc(c), textStyle(10, '#cccccc', { align: 'center', wordWrap: { width: CARD_W - 14 } })).setOrigin(0.5, 0);
      if (this.banishMode) this.add.rectangle(x, cy, CARD_W, CARD_H, 0xaa2020, 0.18);
      if (!mine) return;
      this.nav.add({
        x, y: cy, w: CARD_W, h: CARD_H,
        setFocus: (f) => rect.setFocus(f),
        onSelect: () => this.pick(i),
      });
    });

    const by = 290;
    const bw = 112;
    const bh = 28;
    const mk = (x, label, count, fn) => {
      const b = addButton(this, this.nav, { x, y: by, w: bw, h: bh, label: `${label} (${count})`, size: 12, onSelect: fn });
      b.setDisabled(count <= 0);
    };
    if (mine) {
      mk(GAME_WIDTH / 2 - 124, t('levelup.reroll'), lu.rerolls, () => { this.act.reroll(); this.after(); });
      mk(GAME_WIDTH / 2, t('levelup.skip'), lu.skips, () => { this.act.skip(); this.after(); });
      mk(GAME_WIDTH / 2 + 124, t('levelup.banish'), lu.banishes, () => { this.banishMode = !this.banishMode; this.render(); });
    }
    if (this.banishMode) {
      this.add.text(GAME_WIDTH / 2, by + 28, t('levelup.banish_hint'), textStyle(10, '#ff8080')).setOrigin(0.5);
    }

    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(Math.max(0, Math.min(keepIndex, this.nav.items.length - 1)));
    this.nav.refocus();
  }

  pick(i) {
    if (this.banishMode) {
      this.banishMode = false;
      this.act.banish(i);
    } else {
      this.act.card(i);
    }
    this.after();
  }

  // Соло: sim уже изменился, закрываемся или рисуем новый набор. Кооп: ждём применения команды в update().
  after() {
    if (this.act.coop) return;
    if (this.sim.state === 'running') this.close();
    else this.render();
  }
}
