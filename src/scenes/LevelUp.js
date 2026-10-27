import { t, hasKey } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addIcon } from '../ui/icons.js';
import { displayName } from '../ui/icons.js';
import { textStyle, COLORS } from '../ui/style.js';
import { WEAPONS } from '../data/weapons.js';
import { addPanel } from '../ui/panel.js';
import { createActions } from '../core/actions.js';
import { fadeOutAndStop, resetFade } from '../ui/fade.js';
import { addCardPreview } from '../ui/card-preview.js';
import { BUTTON, rowXs, overlayTitle } from '../ui/menu-layout.js';

const CARD_W = 140;
const CARD_H = 210;
const CARD_GAP = 10;
const CARD_Y = 160;
// Описание: верх от центра карточки и предел строк (влезает до зоны предпросмотра, PREVIEW_H).
// Зоны карточки сверху вниз (от центра карточки), одинаковые у всех карточек: иконка, название, теги оружия
// мелким шрифтом вплотную к названию (тип урона · цели, как в кодексе; у пассивок строка пустая), NEW / Lv,
// описание (не больше DESC_LINES строк: тексты в en.js держим короче), внизу — линия иконок оружий и строки
// статов (ui/card-preview.js, PREVIEW_H).
const ICON_Y = -80;
const NAME_Y = -48;
const TAGS_Y = -34;
const TAG_Y = -24;
const DESC_Y = -8;
const DESC_LINES = 5;

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
    resetFade(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setOrigin(0, 0);
    overlayTitle(this, t('levelup.title'));
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

  // Чей ход: в коопе карточки выбирает sim.picker, второй только смотрит.
  get mine() {
    return !this.act.coop || this.sim.picker === this.act.local;
  }

  // Набор карточек того, кто выбирает (его пул, его reroll/skip/banish).
  get lu() {
    return this.sim.players[this.sim.picker].levelUp;
  }

  update(time) {
    this.nav.update(time);
    // соло: sim меняется сразу в pick(); кооп: команда применяется через lockstep позже
    if (this.sim.state !== 'levelup') { this.close(); return; }
    if (this.lu.cards !== this.shown) this.render();
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

  render() {
    // новый набор карточек (взял карточку, пропустил уровень, следующий уровень в очереди) — фокус на первую
    // карточку: иначе пробел, оставшийся на Skip/Reroll, жал их снова и снова на каждом следующем уровне.
    // После Reroll и в режиме баниша фокус остаётся, где был.
    const changed = this.shown !== this.lu.cards;
    const fresh = changed && this.lastAction !== 'reroll';
    if (changed) this.lastAction = ''; // кооп: команда реролла применится позже, флаг ждёт нового набора
    const keepIndex = fresh ? 0 : this.nav.index;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    const before = new Set(this.children.list);
    if (this.sim.coop) {
      // кооп: карточки выбирает игрок, чей ход (sim.picker), из своего пула; второй видит, чей сейчас выбор.
      // Здесь, а не в create: при нескольких уровнях подряд ход переходит, пока экран открыт
      const who = this.sim.picker;
      const key = who === this.sim.local ? 'coop.your_pick' : 'coop.partner_pick';
      this.add.text(GAME_WIDTH / 2, 46, t(key, { n: who + 1 }), textStyle(10, '#9ad0ff')).setOrigin(0.5);
    }
    const lu = this.lu;
    const cards = lu.cards;
    this.shown = cards;
    const mine = this.mine;
    const total = cards.length * CARD_W + (cards.length - 1) * CARD_GAP;
    const x0 = (GAME_WIDTH - total) / 2 + CARD_W / 2;
    const cy = CARD_Y;
    const pl = this.sim.players[this.sim.picker];

    cards.forEach((c, i) => {
      const x = x0 + i * (CARD_W + CARD_GAP);
      const rect = addPanel(this, x, cy, CARD_W, CARD_H);
      addIcon(this, x, cy + ICON_Y, c.icon, 32, c.kind, c.id);
      this.add.text(x, cy + NAME_Y, c.kind === 'heal' ? t('card.heal.name') : displayName(c.kind, c.id),
        textStyle(12, '#ffffff', { align: 'center', wordWrap: { width: CARD_W - 12 } })).setOrigin(0.5, 0);
      const w = c.kind === 'weapon' ? WEAPONS[c.id] : null;
      if (w) {
        const tags = [w.dmgType && t(`codex.dmg.${w.dmgType}`), w.targets && t(`codex.targets.${w.targets}`)];
        this.add.text(x, cy + TAGS_Y, tags.filter(Boolean).join(' · '), textStyle(8, COLORS.dim))
            .setOrigin(0.5, 0);
      }
      const tag = c.kind === 'heal' ? '' : c.isNew ? t('levelup.new') : t('levelup.lv', { n: c.level });
      this.add.text(x, cy + TAG_Y, tag, textStyle(12, c.isNew ? '#ffd84a' : '#9ad0ff')).setOrigin(0.5, 0);
      // описание в своей зоне: с одного y, не больше DESC_LINES строк (до линии иконок)
      this.add.text(x, cy + DESC_Y, cardDesc(c), textStyle(10, '#cccccc',
          { align: 'center', wordWrap: { width: CARD_W - 14 }, maxLines: DESC_LINES })).setOrigin(0.5, 0);
      // внизу карточки зона фиксированной высоты: изменение стата или параметров оружия и оружия, на которые
      // влияет пассивка (ui/card-preview.js), строки и иконки на одном y у всех карточек
      addCardPreview(this, x, cy + CARD_H / 2 - 6, CARD_W - 10, pl, c);
      if (this.banishMode) this.add.rectangle(x, cy, CARD_W, CARD_H, 0xaa2020, 0.18);
      if (!mine) return;
      this.nav.add({
        x, y: cy, w: CARD_W, h: CARD_H,
        setFocus: (f) => rect.setFocus(f),
        onSelect: () => this.pick(i),
      });
    });

    const by = 290;
    const bw = BUTTON.action.w;
    const bh = BUTTON.action.h;
    const xs = rowXs(3, GAME_WIDTH / 2);
    // selected: включённый режим (баниш) — зелёная рамка, как у активных вкладок
    const mk = (x, label, count, fn, selected = false) => {
      const b = addButton(this, this.nav, { x, y: by, w: bw, h: bh, label: `${label} (${count})`, size: 12,
        onSelect: fn, selected });
      b.setDisabled(count <= 0);
    };
    if (mine) {
      mk(xs[0], t('levelup.reroll'), lu.rerolls, () => {
        this.lastAction = 'reroll';
        this.act.reroll();
        this.after();
      });
      mk(xs[1], t('levelup.skip'), lu.skips, () => { this.act.skip(); this.after(); });
      mk(xs[2], t('levelup.banish'), lu.banishes, () => { this.banishMode = !this.banishMode; this.render(); },
          this.banishMode);
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
    // кооп: только снять подсветку баниша; новый набор карточек нарисует update(), когда команда применится
    if (this.act.coop) { this.render(); return; }
    if (this.sim.state !== 'levelup') this.close();
    else this.render();
  }
}
