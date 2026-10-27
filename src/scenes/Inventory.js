// Инвентарь (из меню): вкладки «Сумка» и «Крафт» (docs/META.md, раздел 2).
// Сумка: сетка BAG.w × BAG.h (закрытые клетки затемнены), стеш на STASH.size мест, панель статов героя с сумкой.
//   Мышь: клик берёт предмет, клик по клетке кладёт; можно и тащить (отпустить над клеткой).
//   R / правая кнопка / Y геймпада — поворот (взятого или предмета под курсором), L / X — замок.
//   Клавиатура и геймпад ходят по клеткам фокусом (ui/focus.js), Enter / A — взять и положить, Esc / B — отмена.
//   Пресеты: три общих раскладки сумки (сохранить / надеть).
// Крафт: выбор предмета, операции с ценой и шансом (core/items.js), свиток защиты, соединение со вторым
//   предметом того же типа, разборка. После разборки и крафта — проверка ачивок (checkMetaAchievements).
// Хранение — services/inventory.js; логика — core/items.js и core/inventory.js.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { BAG, STASH, CURRENCIES } from '../data/items.js';
import { HEROES } from '../data/heroes.js';
import { FocusNav, addButton, setTextFocusStyle } from '../ui/focus.js';
import { addPanel, PANEL } from '../ui/panel.js';
import { textStyle, bgTextStyle, COLORS } from '../ui/style.js';
import { playSfx } from '../audio/sfx.js';
import { getSetting, isMobile } from '../ui/settings.js';
import { validHero } from '../core/heroes.js';
import { createRng } from '../core/rng.js';
import { statReport } from '../core/stats.js';
import { loadoutReport, loadoutUnique } from '../core/loadout.js';
import {
  itemSize, canPlace, rotate as rotateInBag, disassembleValue, craftCost,
  craftChance, canAfford, rerollAll, rerollValue, upgradeRarity, enchant, merge, addCurrency,
  affixLines, bagBonus, stashFull,
} from '../core/items.js';
import {
  findItem, equip, unequip, replaceItem, dropItem, savePreset, loadPreset, sortStash,
} from '../core/inventory.js';
import { getInventory, setInventory, backupInventory } from '../services/inventory.js';
import { getAchievements, checkMetaAchievements, withAchievements } from '../services/achievements.js';
import {
  BagView, ItemTooltip, drawItemBox, addStatsPanel, itemTitle, affixText, RARITY_CSS,
} from '../ui/items.js';
import { showAchievementToasts } from '../ui/toast.js';
import { BUTTON, TITLE_Y, LABEL_ROW, backRect, screenTitle, menuBackdrop } from '../ui/menu-layout.js';

const BAGV = { x: 10, y: 52, cell: 22 };
const ST = { x: 218, y: 52, cell: 20, cols: 10 };
// Кнопки под сумкой (Wear, Save, действия): три ряда по три на ширину сумки между низом сетки сумки
// (с зазором BAG_BTN_TOP) и низом сетки стеша; зазор рядов — что остаётся (при сумке 9×6: 5 px).
const BTN_H = BUTTON.tab.h; // мелкие кнопки инструментов — высота вкладок (ui/menu-layout.js)
const BAG_BTN_H = 18;       // кнопки под сумкой ниже: три ряда влезают под сумку 9×6
const BAG_BTN_TOP = 4;
const BTN_COLS = 3;
const BAG_W = BAG.w * BAGV.cell;
const STASH_BOTTOM = ST.y + Math.ceil(STASH.size / ST.cols) * ST.cell;
const BTN_W = Math.floor((BAG_W - (BTN_COLS - 1) * 6) / BTN_COLS);
const BTN_TOP = BAGV.y + BAG.h * BAGV.cell + BAG_BTN_TOP;
const BTN_GAP = Math.floor((STASH_BOTTOM - BTN_TOP - 3 * BAG_BTN_H) / 2);
const BTN_ROW_Y = (r) => STASH_BOTTOM - BAG_BTN_H / 2 - (2 - r) * (BAG_BTN_H + BTN_GAP); // центр ряда r (0..2)
// Строка заголовков (Bag, Stash, валюты справа; на крафте — Select и валюты) на HEAD_Y, сетки и правая
// панель начинаются с одного y (BAGV.y = ST.y); три блока через одинаковый зазор BLOCK_GAP.
const HEAD_Y = BAGV.y - LABEL_ROW; // заголовок строки на GAP_LABEL выше сеток
const BLOCK_GAP = 10;
const RIGHT_EDGE = GAME_WIDTH - 8;
const STATS_X = ST.x + ST.cols * ST.cell + BLOCK_GAP;
// панель статов до низа экрана (низ — по низу кнопки Back)
const STATS_BOX = { x: STATS_X, y: BAGV.y, w: RIGHT_EDGE - STATS_X, h: GAME_HEIGHT - 8 - BAGV.y };
const CR = { x: 10, y: 52, cell: 16, cols: 12 };
// панель крафта до низа экрана, как панель статов; внизу подсказка операции и строка сообщений
const DET = { x: 214, y: BAGV.y, w: RIGHT_EDGE - 214, h: GAME_HEIGHT - 8 - BAGV.y };
const OP_STEP = BTN_H + 2;
const LINK = { size: 9, h: 16, color: '#dddddd', active: '#8cff6a' }; // фокус — setTextFocusStyle
const CONFIRM_MS = 2500;

const uiRng = () => createRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);

export class InventoryScene extends Phaser.Scene {
  constructor() {
    super('Inventory');
  }

  init(data) {
    this.tab = (data && data.tab) || 'bag';
    this.held = null;      // взятый предмет: {uid, rot, from, gx, gy}
    this.sel = null;       // выбранный предмет (замок, разборка, крафт)
    this.affix = 0;        // аффикс для «перекатить значение»
    this.scroll = false;   // использовать свиток защиты
    this.mergeMode = false;
    this.confirm = null;   // {uid, at}: повтор разборки в течение CONFIRM_MS
    this.msg = '';
    this.msgColor = '#dddddd';
    this.focusKey = null;
    this.cursor = null;    // {x, y} точка курсора (мышь) или центр клетки в фокусе
    this.drag = null;      // {x, y, picked}: нажатие мыши, взят ли предмет этим нажатием
    this.viewHero = validHero(getSetting('hero')); // герой панели статов (переключатель в её заголовке)
  }

  create() {
    menuBackdrop(this); // фон — арт меню без героинь, как у всех подменю
    getAchievements(); // сумка подгоняется под полученные ачивки
    this.inv = getInventory();
    this.rng = uiRng();
    this.objs = [];
    this.ghost = null;
    this.ghostKey = '';
    this.tip = new ItemTooltip(this);
    this.nav = new FocusNav(this, { onBack: () => this.back() });
    this.nav.silent = true;
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p) => this.onDown(p));
    this.input.on('pointerup', (p) => this.onUp(p));
    this.input.on('pointermove', (p) => { this.cursor = { x: p.worldX, y: p.worldY }; });
    // одно событие один раз: Phaser повторяет очередь клавиш до конца кадра (как в ui/focus.js)
    const once = new WeakSet();
    const key = (fn) => (ev) => { if (!once.has(ev)) { once.add(ev); fn(); } };
    this.input.keyboard.on('keydown-R', key(() => this.rotate()));
    this.input.keyboard.on('keydown-L', key(() => this.toggleLock()));
    this.padPrev = {};
    this.events.once('shutdown', () => {
      this.tip.hide();
      backupInventory();
    });
    this.render();
  }

  // ---------- общий вид ----------

  render() {
    const keep = this.focusKey;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    this.tip.hide();
    const before = new Set(this.children.list);
    screenTitle(this, t('inv.title'));
    // валюты в строке заголовков, по правому краю правой панели (статы или крафт)
    this.add.text(RIGHT_EDGE, HEAD_Y, this.walletText(), bgTextStyle(9, '#ffd84a')).setOrigin(1, 0);
    ['bag', 'craft'].forEach((tab, i) => {
      // вкладки слева в строке заголовка экрана (по центру — заголовок)
      this.button({ key: `tab:${tab}`, x: BAGV.x + 46 + i * 100, y: TITLE_Y, w: 92, h: BUTTON.tab.h,
        label: t(`inv.tab.${tab}`), selected: this.tab === tab,
        onSelect: () => this.switchTab(tab) });
    });
    if (this.tab === 'craft') this.renderCraft();
    else this.renderBag();
    this.button({ key: 'back', ...backRect(), size: 12, label: t('settings.back'),
      onSelect: () => this.back() });
    this.statusText = this.add.text(this.tab === 'craft' ? DET.x + DET.w / 2 : ST.x + 100,
        this.tab === 'craft' ? DET.y + DET.h - 16 : STASH_BOTTOM + 4, this.msg, bgTextStyle(10, this.msgColor)).setOrigin(0.5, 0);
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    const i = keep ? this.nav.items.findIndex((it) => it.key === keep) : -1;
    this.nav.focus(i >= 0 ? i : 0);
    this.ghostKey = '';
  }

  walletText() {
    const w = this.inv.wallet;
    return CURRENCIES.map((c) => `${t(`currency.${c}`)}: ${w[c] || 0}`).join('  ');
  }

  button(o) {
    const it = addButton(this, this.nav, { size: 10, ...o });
    it.key = o.key;
    const set = it.setFocus;
    it.setFocus = (f) => {
      set(f);
      if (!f) return;
      this.focusKey = o.key;
      if (o.onFocus) o.onFocus();
    };
    if (o.disabled) it.setDisabled(true);
    return it;
  }

  say(key, params, color = '#dddddd') {
    this.msg = key ? t(key, params) : '';
    this.msgColor = color;
    if (this.statusText) this.statusText.setText(this.msg).setColor(color);
  }

  switchTab(tab) {
    if (this.tab === tab) return;
    this.cancelHeld();
    this.tab = tab;
    this.mergeMode = false;
    this.focusKey = `tab:${tab}`;
    this.say(null);
    this.render();
  }

  back() {
    if (this.held) { this.cancelHeld(); this.render(); return; }
    if (this.mergeMode) { this.mergeMode = false; this.say(null); this.render(); return; }
    this.scene.start('Menu');
  }

  // Новый инвентарь: сохранить, проверить ачивки сумки и стеша, перерисовать.
  commit(inv, delta = null) {
    this.inv = setInventory(inv);
    const res = checkMetaAchievements(delta);
    if (res.unlocked.length) {
      this.inv = getInventory();
      showAchievementToasts(this, res.unlocked);
    }
    this.render();
  }

  hero() {
    return HEROES[this.viewHero];
  }

  // Следующий (dir 1) или предыдущий (-1) герой панели статов; в настройки не пишется: только просмотр.
  cycleHero(dir) {
    const ids = Object.keys(HEROES);
    const i = ids.indexOf(this.viewHero);
    this.viewHero = ids[(i + dir + ids.length) % ids.length];
    this.focusKey = 'hero';
    this.render();
  }

  // ---------- сумка ----------

  renderBag() {
    const inv = this.inv;
    this.add.text(BAGV.x, HEAD_Y, t('inv.bag', { c: inv.bag.cols, r: inv.bag.rows }), bgTextStyle(10, '#ffd84a'))
        .setOrigin(0, 0);
    this.bagView = new BagView(this, BAGV);
    this.bagView.draw(inv.bag, { hideUid: this.held ? this.held.uid : null });
    this.objs.push(...this.bagView.objs);
    const C = BAGV.cell;
    for (let y = 0; y < BAG.h; y++) {
      for (let x = 0; x < BAG.w; x++) {
        this.cellItem(`bag:${x},${y}`, BAGV.x + x * C + C / 2, BAGV.y + y * C + C / 2, C,
            () => this.clickBag(x, y));
      }
    }
    // стеш
    const stashHead = this.add.text(ST.x, HEAD_Y, t('inv.stash', { n: inv.stash.length, m: STASH.size }),
        bgTextStyle(10, '#ffd84a')).setOrigin(0, 0);
    // сортировка текстом в строке заголовка стеша (как переключатель героя): текущая — зелёная
    let lx = stashHead.x + stashHead.width + 8;
    for (const by of ['rarity', 'type']) {
      const link = this.textLink(`sort:${by}`, lx, HEAD_Y + 1, t(`inv.sort.${by}`),
          { active: this.sortBy === by, onSelect: () => this.sort(by) });
      lx += link.w + 2;
    }
    const g = this.add.graphics();
    const rows = Math.ceil(STASH.size / ST.cols);
    g.__box = { x: ST.x, y: ST.y, w: ST.cols * ST.cell, h: rows * ST.cell }; // для spacing.spec
    for (let i = 0; i < ST.cols * rows; i++) {
      const x = ST.x + (i % ST.cols) * ST.cell;
      const y = ST.y + Math.floor(i / ST.cols) * ST.cell;
      g.fillStyle(0x1c1628, 1).fillRect(x, y, ST.cell, ST.cell);
      g.lineStyle(1, 0x32293f, 1).strokeRect(x + 0.5, y + 0.5, ST.cell - 1, ST.cell - 1);
    }
    inv.stash.forEach((it, i) => {
      if (this.held && this.held.uid === it.uid) return;
      const x = ST.x + (i % ST.cols) * ST.cell;
      const y = ST.y + Math.floor(i / ST.cols) * ST.cell;
      drawItemBox(this, x + 1, y + 1, ST.cell - 2, ST.cell - 2, it, { small: true });
    });
    for (let i = 0; i < STASH.size; i++) {
      const x = ST.x + (i % ST.cols) * ST.cell + ST.cell / 2;
      const y = ST.y + Math.floor(i / ST.cols) * ST.cell + ST.cell / 2;
      this.cellItem(`stash:${i}`, x, y, ST.cell, () => this.clickStash(i));
    }
    // пресеты и действия
    const bw = BTN_W;
    const bx = (i) => BAGV.x + bw / 2 + i * (BAG_W - bw) / (BTN_COLS - 1);
    for (let i = 0; i < BAG.presets; i++) {
      const has = !!(inv.presets && inv.presets[i]);
      this.button({ key: `load:${i}`, x: bx(i), y: BTN_ROW_Y(0), w: bw, h: BAG_BTN_H,
        label: t('inv.preset.load', { n: i + 1 }), disabled: !has, onSelect: () => this.loadPreset(i) });
      this.button({ key: `save:${i}`, x: bx(i), y: BTN_ROW_Y(1), w: bw, h: BAG_BTN_H,
        label: t('inv.preset.save', { n: i + 1 }), onSelect: () => this.savePreset(i) });
    }
    const sel = this.sel && findItem(inv, this.sel);
    const acts = [
      ['rotate', t('inv.rotate'), () => this.rotate(), !this.held && !(sel && sel.where === 'bag')],
      ['lock', sel && sel.item.locked ? t('inv.unlock') : t('inv.lock'), () => this.toggleLock(), !sel],
      ['dis', this.confirm && sel && this.confirm.uid === sel.item.uid ? t('inv.confirm') :
        t('craft.disassemble'), () => this.disassemble(), !sel || sel.item.locked],
    ];
    acts.forEach(([k, label, fn, dis], i) => {
      this.button({ key: `act:${k}`, x: bx(i), y: BTN_ROW_Y(2), w: bw, h: BAG_BTN_H, label,
        disabled: dis, onSelect: fn });
    });
    // подсказка сразу под кнопками и стешем, имя выбранного предмета под ней
    const hint = this.add.text(BAGV.x, STASH_BOTTOM + 4, t(isMobile() ? 'inv.hint_touch' : 'inv.hint'),
        bgTextStyle(8, COLORS.dim, { wordWrap: { width: 405 } })).setOrigin(0, 0);
    if (sel) {
      const css = RARITY_CSS[sel.item.rarity];
      this.add.text(BAGV.x, hint.y + hint.height + 4, itemTitle(sel.item),
          bgTextStyle(9, css, { wordWrap: { width: BAG_W } })).setOrigin(0, 0);
    }
    this.renderStats();
  }

  renderStats() {
    const hero = this.hero();
    const bag = this.inv.bag;
    const rep = loadoutReport(hero.stats, [], withAchievements(bag));
    const base = statReport(hero.stats, []);
    const B = STATS_BOX;
    // без заголовка «Stats»: первой строкой панели — герой текстом (переключатель) и легенда вкладов
    addStatsPanel(this, B.x, B.y, B.w, B.h, rep, base, '');
    this.heroSwitch(B.x + 6, B.y + 4);
    const y = B.y + 220;
    const div = bagBonus(bag);
    // разнообразие — в нижнем левом углу панели
    this.add.text(B.x + 6, B.y + B.h - 6, t('item.diversity', { n: Math.round((div.diversity - 1) * 100) }),
        textStyle(9, '#8cff6a')).setOrigin(0, 1);
    const u = loadoutUnique(bag);
    if (u) {
      this.add.text(B.x + 6, y, t(`unique.${u}.name`), textStyle(10, RARITY_CSS.unique)).setOrigin(0, 0);
      this.add.text(B.x + 6, y + 13, t(`unique.${u}.desc`), textStyle(8, '#ffd8a0',
          { wordWrap: { width: B.w - 12 } })).setOrigin(0, 0);
    }
  }

  // Переключатель героя первой строкой панели статов: имя героя текстом. Тап / Enter — следующий герой,
  // стрелки влево / вправо (клавиатура, геймпад) — через onAdjust фокус-навигации.
  heroSwitch(x, y) {
    return this.textLink('hero', x, y, t(`hero.${this.viewHero}.name`), {
      size: 10, color: '#ffffff', plain: true, onSelect: () => this.cycleHero(1),
      onAdjust: (dir) => this.cycleHero(dir),
    });
  }

  // Текстовая кнопка без рамки: фокус — жёлтый текст, активная (текущая сортировка) — зелёный.
  // Зона нажатия не ниже LINK.h (палец попадает). x, y — левый верх текста. plain — внутри панели: без обводки
  // (как строки статов, левый край совпадает с ними).
  textLink(key, x, y, label, o) {
    const color = o.active ? LINK.active : (o.color || LINK.color);
    const style = (o.plain ? textStyle : bgTextStyle)(o.size || LINK.size, color);
    const txt = this.add.text(x, y, label, style).setOrigin(0, 0);
    const w = Math.max(LINK.h, txt.width + 4);
    const h = Math.max(LINK.h, txt.height);
    const item = {
      key, x: x + txt.width / 2, y: y + txt.height / 2, w, h,
      onSelect: o.onSelect,
      onAdjust: o.onAdjust,
      setFocus: (f) => {
        setTextFocusStyle(txt, f, color);
        if (f) this.focusKey = key;
      },
    };
    item.setFocus(false);
    this.nav.add(item);
    return item;
  }

  // Пункт фокуса на всю строку (аффикс в крафте): зона нажатия на всю строку, фокус — только цвет текста
  // (setTextFocusStyle, без рамки), тап или Enter — onSelect.
  lineItem(key, x, y, w, h, onSelect, text, color) {
    const item = {
      key, x: x + w / 2, y: y + h / 2, w, h, onSelect,
      setFocus: (f) => {
        setTextFocusStyle(text, f, color);
        if (f) this.focusKey = key;
      },
    };
    item.setFocus(false);
    this.nav.add(item);
  }

  // Невидимый пункт фокуса поверх клетки: подсветка рамкой, клик мыши обрабатывает onDown сцены.
  cellItem(key, x, y, size, onSelect) {
    const g = this.add.graphics();
    const item = {
      key, x, y, w: size, h: size, onSelect,
      onPointer: () => {},
      setFocus: (f) => {
        g.clear();
        if (!f) return;
        this.focusKey = key;
        g.lineStyle(1, PANEL.borderFocus, 1)
            .strokeRect(x - size / 2 + 0.5, y - size / 2 + 0.5, size - 1, size - 1);
        this.cursor = { x, y };
      },
    };
    this.nav.add(item);
    return item;
  }

  stashIndexAt(px, py) {
    const cx = Math.floor((px - ST.x) / ST.cell);
    const cy = Math.floor((py - ST.y) / ST.cell);
    if (cx < 0 || cy < 0 || cx >= ST.cols || cy >= Math.ceil(STASH.size / ST.cols)) return -1;
    const i = cy * ST.cols + cx;
    return i < STASH.size ? i : -1;
  }

  craftIndexAt(px, py) {
    const cx = Math.floor((px - CR.x) / CR.cell);
    const cy = Math.floor((py - CR.y) / CR.cell);
    if (cx < 0 || cy < 0 || cx >= CR.cols) return -1;
    const i = cy * CR.cols + cx;
    return i < this.craftList().length ? i : -1;
  }

  // Мышь: нажатие берёт / кладёт; если предмет взят этим нажатием и мышь утащили — кладётся при отпускании.
  onDown(p) {
    this.cursor = { x: p.worldX, y: p.worldY };
    if (this.tab === 'craft') {
      const i = this.craftIndexAt(p.worldX, p.worldY);
      if (i >= 0) this.clickCraftItem(i);
      return;
    }
    const right = p.rightButtonDown();
    const cell = this.bagView && this.bagView.cellAt(p.worldX, p.worldY);
    if (right) {
      if (!this.held && cell) {
        const e = this.bagView.entryAt(cell.x, cell.y);
        if (e) this.sel = e.item.uid;
      }
      this.rotate();
      return;
    }
    const before = this.held;
    if (cell) this.clickBag(cell.x, cell.y);
    else {
      const i = this.stashIndexAt(p.worldX, p.worldY);
      if (i >= 0) this.clickStash(i);
      else return;
    }
    this.drag = { x: p.worldX, y: p.worldY, picked: !before && !!this.held };
  }

  onUp(p) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.picked || !this.held || this.tab !== 'bag') return;
    if (Math.abs(p.worldX - d.x) + Math.abs(p.worldY - d.y) < 6) return; // клик: предмет остаётся в руке
    const cell = this.bagView.cellAt(p.worldX, p.worldY);
    if (cell) { this.clickBag(cell.x, cell.y); return; }
    const i = this.stashIndexAt(p.worldX, p.worldY);
    if (i >= 0) { this.clickStash(i); return; }
    this.cancelHeld();
    this.render();
  }

  clickBag(x, y) {
    if (this.held) {
      const h = this.held;
      const ax = x - h.gx;
      const ay = y - h.gy;
      const next = equip(this.inv, h.uid, ax, ay, h.rot);
      if (!next) {
        const f = findItem(this.inv, h.uid);
        const uniq = f && f.item.unique &&
          this.inv.bag.items.some((e) => e.item.unique && e.item.uid !== h.uid);
        this.say(uniq ? 'inv.one_unique' : 'inv.cant_place', null, '#ff8080');
        return;
      }
      this.held = null;
      this.sel = h.uid;
      this.say(null);
      playSfx(this, 'ui_select');
      this.commit(next);
      return;
    }
    const e = this.bagView.entryAt(x, y);
    if (!e) return;
    this.held = { uid: e.item.uid, rot: !!e.rot, from: 'bag', gx: x - e.x, gy: y - e.y };
    this.sel = e.item.uid;
    this.confirm = null;
    playSfx(this, 'ui_move');
    this.render();
  }

  clickStash(i) {
    if (this.held) {
      const h = this.held;
      this.held = null;
      if (h.from === 'bag') {
        const next = unequip(this.inv, h.uid);
        if (!next) { this.say('inv.stash_full', null, '#ff8080'); this.render(); return; }
        this.say(null);
        this.commit(next);
        return;
      }
      this.render();
      return;
    }
    const it = this.inv.stash[i];
    if (!it) return;
    this.held = { uid: it.uid, rot: false, from: 'stash', gx: 0, gy: 0 };
    this.sel = it.uid;
    this.confirm = null;
    playSfx(this, 'ui_move');
    this.render();
  }

  cancelHeld() {
    this.held = null;
    this.clearGhost();
  }

  rotate() {
    if (this.tab !== 'bag') return;
    if (this.held) {
      const f = findItem(this.inv, this.held.uid);
      if (!f) return;
      this.held.rot = !this.held.rot;
      const [w, h] = itemSize(f.item, this.held.rot);
      const gx = this.held.gx;
      this.held.gx = Math.min(this.held.gy, w - 1);
      this.held.gy = Math.min(gx, h - 1);
      this.ghostKey = '';
      return;
    }
    const f = this.sel && findItem(this.inv, this.sel);
    if (!f || f.where !== 'bag') return;
    const bag = rotateInBag(this.inv.bag, this.sel);
    if (!bag) { this.say('inv.cant_rotate', null, '#ff8080'); return; }
    this.say(null);
    this.commit({ ...this.inv, bag });
  }

  toggleLock() {
    const f = this.sel && findItem(this.inv, this.sel);
    if (!f) return;
    this.commit(replaceItem(this.inv, f.item.uid, { ...f.item, locked: !f.item.locked }));
  }

  // Разборка выбранного (из сумки или стеша): второе нажатие подтверждает.
  disassemble() {
    const f = this.sel && findItem(this.inv, this.sel);
    if (!f || f.item.locked) return;
    const now = this.time.now;
    if (!this.confirm || this.confirm.uid !== f.item.uid || now - this.confirm.at > CONFIRM_MS) {
      this.confirm = { uid: f.item.uid, at: now };
      this.say('inv.confirm_dis', { n: disassembleValue(f.item) }, '#ffd84a');
      this.render();
      return;
    }
    this.confirm = null;
    const crystals = disassembleValue(f.item);
    const inv = dropItem(this.inv, f.item.uid);
    this.sel = null;
    if (this.held && this.held.uid === f.item.uid) this.held = null;
    this.say('inv.disassembled', { n: crystals }, '#8cff6a');
    this.commit({ ...inv, wallet: addCurrency(inv.wallet, { crystals }) }, { disassembled: 1 });
  }

  sort(by) {
    this.sortBy = by; // подсветка текущей сортировки (до выхода из инвентаря)
    this.commit({ ...this.inv, stash: sortStash(this.inv.stash, by) });
  }

  savePreset(i) {
    this.say('inv.preset.saved', { n: i + 1 }, '#8cff6a');
    this.commit(savePreset(this.inv, i));
  }

  loadPreset(i) {
    this.cancelHeld();
    const r = loadPreset(this.inv, i);
    if (!r.ok) { this.say(r.reason === 'full' ? 'inv.stash_full' : 'inv.preset.empty', null, '#ff8080'); return; }
    this.say(r.missing ? 'inv.preset.missing' : 'inv.preset.loaded', { n: r.missing || i + 1 },
        r.missing ? '#ffb060' : '#8cff6a');
    this.commit(r.inv);
  }

  // ---------- крафт ----------

  // Все предметы: сначала надетые, затем стеш.
  craftList() {
    return [...this.inv.bag.items.map((e) => e.item), ...this.inv.stash];
  }

  renderCraft() {
    const list = this.craftList();
    this.add.text(CR.x, HEAD_Y, t('craft.select'), bgTextStyle(10, '#ffd84a')).setOrigin(0, 0);
    const g = this.add.graphics();
    const bagN = this.inv.bag.items.length;
    const total = BAG.w * BAG.h + STASH.size;
    const cells = Math.min(Math.max(list.length, CR.cols * 8), total);
    g.__box = { x: CR.x, y: CR.y, w: CR.cols * CR.cell, h: Math.ceil(cells / CR.cols) * CR.cell }; // spacing.spec
    for (let i = 0; i < Math.max(list.length, CR.cols * 8) && i < total; i++) {
      const x = CR.x + (i % CR.cols) * CR.cell;
      const y = CR.y + Math.floor(i / CR.cols) * CR.cell;
      g.fillStyle(0x1c1628, 1).fillRect(x, y, CR.cell, CR.cell);
      g.lineStyle(1, 0x32293f, 1).strokeRect(x + 0.5, y + 0.5, CR.cell - 1, CR.cell - 1);
    }
    list.forEach((it, i) => {
      const x = CR.x + (i % CR.cols) * CR.cell;
      const y = CR.y + Math.floor(i / CR.cols) * CR.cell;
      drawItemBox(this, x + 1, y + 1, CR.cell - 2, CR.cell - 2, it, { small: true });
      if (i < bagN) g.fillStyle(0x8cff6a, 1).fillRect(x + CR.cell - 4, y + 2, 2, 2); // надет
      if (it.uid === this.sel) {
        g.lineStyle(1, 0xffffff, 1).strokeRect(x + 0.5, y + 0.5, CR.cell - 1, CR.cell - 1);
      }
      this.cellItem(`craft:${it.uid}`, x + CR.cell / 2, y + CR.cell / 2, CR.cell, () => this.clickCraftItem(i));
    });
    this.renderCraftDetail();
  }

  clickCraftItem(i) {
    const it = this.craftList()[i];
    if (!it) return;
    if (this.mergeMode && this.sel && it.uid !== this.sel) { this.doMerge(it); return; }
    this.sel = it.uid;
    this.affix = 0;
    this.mergeMode = false;
    this.confirm = null;
    this.say(null);
    this.render();
  }

  renderCraftDetail() {
    const f = this.sel && findItem(this.inv, this.sel);
    addPanel(this, DET.x + DET.w / 2, DET.y + DET.h / 2, DET.w, DET.h);
    const L = DET.x + 8;
    if (!f) {
      this.add.text(L, DET.y + 8, t('craft.none'), textStyle(10, COLORS.dim)).setOrigin(0, 0);
      return;
    }
    const it = f.item;
    let y = DET.y + 6;
    this.add.text(L, y, itemTitle(it), textStyle(12, RARITY_CSS[it.rarity])).setOrigin(0, 0);
    y += 16;
    const meta = [t(`item.rarity.${it.rarity}`), t('item.tier', { n: it.tier })];
    if (it.locked) meta.push(t('item.locked'));
    this.add.text(L, y, meta.join(' · '), textStyle(9, COLORS.dim)).setOrigin(0, 0);
    y += 14;
    if (it.unique) {
      this.add.text(L, y, t(`unique.${it.unique}.desc`), textStyle(9, '#ffd8a0', { wordWrap: { width: DET.w - 16 } }))
          .setOrigin(0, 0);
    } else {
      affixLines(it).forEach((l, i) => {
        const a = affixText(l);
        const yy = y + i * 15;
        // вся строка — пункт выбора (палец попадает), «>» отмечает выбранный аффикс
        this.add.text(L + 2, yy, i === this.affix ? '>' : '', textStyle(9, '#ffd84a')).setOrigin(0, 0);
        const txt = this.add.text(L + 16, yy, a.text, textStyle(9, a.color)).setOrigin(0, 0);
        this.lineItem(`affix:${i}`, L - 4, yy - 1, DET.w - 8, 15, () => { this.affix = i; this.render(); },
            txt, a.color);
      });
    }
    // операции
    const w = this.inv.wallet;
    const ops = [
      ['rerollAll', t('craft.rerollAll'), () => this.craft('rerollAll')],
      ['rerollValue', t('craft.rerollValue'), () => this.craft('rerollValue')],
      ['upgradeRarity', t('craft.upgradeRarity'), () => this.craft('upgradeRarity')],
      ['enchant', t('craft.enchant'), () => this.craft('enchant')],
      ['merge', this.mergeMode ? t('craft.pick_second') : t('craft.merge'), () => this.startMerge()],
    ];
    // подсказка операции в фокусе (craft.hint.<op>) под кнопками
    const HINT_OP = { dis: 'disassemble' };
    let hint = null;
    const showHint = (op) => {
      this.lastOp = op; // фокус ушёл с операций — подсказка последней остаётся
      if (hint) hint.setText(t(`craft.hint.${HINT_OP[op] || op}`));
    };
    const onFocus = (op) => () => showHint(op);
    let oy = DET.y + 112;
    for (const [op, label, fn] of ops) {
      const cost = op === 'merge' ? this.mergeCostAny(it) : craftCost(op, it);
      const ok = !!cost && canAfford(w, cost) && !(op === 'merge' && it.locked);
      this.button({ key: `op:${op}`, x: L + 75, y: oy, w: 150, h: BTN_H, label, disabled: !cost || !ok,
        selected: op === 'merge' && this.mergeMode, onSelect: fn, onFocus: onFocus(op) });
      this.add.text(L + 158, oy, this.costText(op, it, cost), textStyle(9, cost && !ok ? '#ff8080' : '#dddddd'))
          .setOrigin(0, 0.5);
      oy += OP_STEP;
    }
    const dis = this.confirm && this.confirm.uid === it.uid;
    this.button({ key: 'op:dis', x: L + 75, y: oy, w: 150, h: BTN_H,
      label: dis ? t('inv.confirm') : t('craft.disassemble'), disabled: it.locked,
      onSelect: () => this.disassemble(), onFocus: onFocus('dis') });
    this.add.text(L + 158, oy, `+${disassembleValue(it)} ${t('currency.crystals')}`, textStyle(9))
        .setOrigin(0, 0.5);
    oy += BTN_H + 6;
    this.button({ key: 'op:scroll', x: L + 75, y: oy, w: 150, h: BTN_H,
      label: `${this.scroll ? '[x]' : '[ ]'} ${t('craft.useScroll')}`, selected: this.scroll,
      disabled: !(w.scrolls > 0) && !this.scroll,
      onSelect: () => { this.scroll = !this.scroll; this.render(); }, onFocus: onFocus('scroll') });
    this.add.text(L + 158, oy, t('craft.scroll_note', { n: w.scrolls || 0 }), textStyle(8, COLORS.dim))
        .setOrigin(0, 0.5);
    hint = this.add.text(L, oy + BTN_H / 2 + 6, '', textStyle(8, '#bbbbbb', { wordWrap: { width: DET.w - 16 } }))
        .setOrigin(0, 0);
    showHint(this.lastOp || 'rerollAll');
  }

  // Цена соединения без второго предмета: по самому дорогому варианту среди подходящих.
  mergeCostAny(it) {
    let best = null;
    for (const o of this.craftList()) {
      const c = craftCost('merge', it, o);
      if (c && (!best || c.crystals + c.hearts * 100 < best.crystals + best.hearts * 100)) best = c;
    }
    return best;
  }

  costText(op, it, cost) {
    if (!cost) return it.unique ? t('craft.no_unique') : t('craft.na');
    const parts = [`${cost.crystals} ${t('currency.crystals')}`];
    if (cost.hearts) parts.push(`${cost.hearts} ${t('currency.hearts')}`);
    if (op === 'upgradeRarity' || op === 'enchant') {
      parts.push(t('craft.chance', { n: Math.round(craftChance(op, it) * 100) }));
    }
    return parts.join(' · ');
  }

  craft(op) {
    const f = this.sel && findItem(this.inv, this.sel);
    if (!f) return;
    const it = f.item;
    const w = this.inv.wallet;
    const risky = op === 'upgradeRarity' || op === 'enchant';
    const scroll = risky && this.scroll && w.scrolls > 0 && craftChance(op, it) < 1;
    let res;
    if (op === 'rerollAll') res = rerollAll(this.rng, it, w);
    else if (op === 'rerollValue') res = rerollValue(this.rng, it, this.affix, w);
    else if (op === 'upgradeRarity') res = upgradeRarity(this.rng, it, w, { scroll });
    else res = enchant(this.rng, it, w, { scroll });
    if (!res.ok) { this.say(res.reason === 'funds' ? 'craft.funds' : 'craft.na', null, '#ff8080'); return; }
    let inv = { ...this.inv, wallet: res.wallet };
    const delta = {};
    if (op === 'rerollAll' || op === 'rerollValue') delta.rerolls = 1;
    if (res.broken) {
      inv = dropItem(inv, it.uid);
      this.sel = null;
      if (op === 'enchant') delta.broke = 1;
      this.say(res.refund ? 'craft.broken_refund' : 'craft.broken', { n: res.refund }, '#ff8080');
    } else if (res.saved) {
      this.say('craft.saved', null, '#ffb060');
    } else {
      inv = replaceItem(inv, it.uid, res.item);
      if (op === 'enchant') delta.enchantMax = res.item.enchant;
      this.say('craft.success', null, '#8cff6a');
    }
    playSfx(this, res.broken ? 'player_hurt' : 'ui_select');
    this.commit(inv, delta);
  }

  startMerge() {
    const f = this.sel && findItem(this.inv, this.sel);
    if (!f) return;
    this.mergeMode = !this.mergeMode;
    this.say(this.mergeMode ? 'craft.pick_second_hint' : null, null, '#ffd84a');
    this.render();
  }

  doMerge(other) {
    const fa = findItem(this.inv, this.sel);
    const fb = findItem(this.inv, other.uid);
    this.mergeMode = false;
    if (!fa || !fb) return;
    if (!craftCost('merge', fa.item, fb.item)) { this.say('craft.merge_type', null, '#ff8080'); this.render(); return; }
    // итог уходит в стеш: если оба надеты, а стеш полон, класть некуда
    if (fa.where === 'bag' && fb.where === 'bag' && stashFull(this.inv.stash)) {
      this.say('inv.stash_full', null, '#ff8080');
      this.render();
      return;
    }
    const res = merge(this.rng, fa.item, fb.item, this.inv.wallet);
    if (!res.ok) {
      this.say(res.reason === 'funds' ? 'craft.funds' : res.reason === 'locked' ? 'craft.locked' : 'craft.na',
          null, '#ff8080');
      this.render();
      return;
    }
    let inv = dropItem(dropItem(this.inv, fa.item.uid), fb.item.uid);
    inv = { ...inv, wallet: res.wallet, stash: [...inv.stash, res.item] };
    this.sel = res.item.uid;
    this.say('craft.merged', null, '#8cff6a');
    this.commit(inv);
  }

  // ---------- кадр ----------

  // Предмет под курсором (мышь) или в фокусе (клавиатура) для подсказки.
  hovered() {
    const c = this.cursor;
    if (!c) return null;
    if (this.tab === 'craft') {
      const i = this.craftIndexAt(c.x, c.y);
      return i >= 0 ? { item: this.craftList()[i], mul: 1 } : null;
    }
    const cell = this.bagView && this.bagView.cellAt(c.x, c.y);
    if (cell) {
      const e = this.bagView.entryAt(cell.x, cell.y);
      return e ? { item: e.item, mul: this.bagView.mul } : null;
    }
    const i = this.stashIndexAt(c.x, c.y);
    const it = i >= 0 ? this.inv.stash[i] : null;
    return it ? { item: it, mul: 1 } : null;
  }

  clearGhost() {
    if (this.ghost) this.ghost.destroy();
    this.ghost = null;
    this.ghostKey = '';
  }

  // Взятый предмет: над сумкой — на клетках (зелёная или красная рамка), иначе следом за курсором.
  drawGhost() {
    const h = this.held;
    if (!h || this.tab !== 'bag' || !this.cursor) { this.clearGhost(); return; }
    const f = findItem(this.inv, h.uid);
    if (!f) { this.held = null; this.clearGhost(); return; }
    const [w, hh] = itemSize(f.item, h.rot);
    const cell = this.bagView.cellAt(this.cursor.x, this.cursor.y);
    const C = BAGV.cell;
    let key;
    let x;
    let y;
    let ok = null;
    if (cell) {
      const ax = cell.x - h.gx;
      const ay = cell.y - h.gy;
      ok = canPlace(this.inv.bag, f.item, ax, ay, h.rot);
      x = BAGV.x + ax * C;
      y = BAGV.y + ay * C;
      key = `${h.uid}:${h.rot}:${ax},${ay}:${ok}`;
    } else {
      x = Math.round(this.cursor.x - C / 2);
      y = Math.round(this.cursor.y - C / 2);
      key = `${h.uid}:${h.rot}:${x},${y}`;
    }
    if (key === this.ghostKey) return;
    this.clearGhost();
    this.ghostKey = key;
    const c = this.add.container(0, 0).setDepth(900);
    const box = drawItemBox(this, x + 1, y + 1, w * C - 2, hh * C - 2, f.item, { alpha: 0.8 });
    c.add(box);
    if (ok !== null) {
      const g = this.add.graphics();
      g.lineStyle(2, ok ? 0x8cff6a : 0xff5050, 1).strokeRect(x + 1, y + 1, w * C - 2, hh * C - 2);
      c.add(g);
    }
    this.ghost = c;
  }

  // Геймпад: Y — поворот, X — замок (A / B и стрелки — в FocusNav).
  pollPad() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const p = [...pads].find((x) => x && x.connected);
    if (!p) return;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const y = b(3);
    const x = b(2);
    if (y && !this.padPrev.y) this.rotate();
    if (x && !this.padPrev.x) this.toggleLock();
    this.padPrev = { x, y };
  }

  update(time) {
    this.nav.update(time);
    this.pollPad();
    this.drawGhost();
    let hv = this.held ? null : this.hovered();
    // в крафте выбранный предмет и так расписан справа: подсказка закрыла бы операции (на телефоне
    // курсор остаётся на месте тапа)
    if (hv && this.tab === 'craft' && hv.item && hv.item.uid === this.sel) hv = null;
    if (hv && hv.item && this.cursor) {
      const extra = hv.item.unique && this.inv.bag.items.some((e) => e.item.unique &&
        e.item.uid !== hv.item.uid) && !this.inv.bag.items.some((e) => e.item.uid === hv.item.uid) ?
        t('inv.one_unique') : null;
      this.tip.show(hv.item, this.cursor.x, this.cursor.y, { mul: hv.mul, extra });
    } else {
      this.tip.hide();
    }
  }
}
