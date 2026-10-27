// Инвентарь (из меню): вкладки «Сумка» и «Крафт» (docs/META.md, раздел 2).
// Сумка: сетка 9×5 (закрытые клетки затемнены), стеш на STASH.size мест, панель статов героя с сумкой.
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
import { FocusNav, addButton } from '../ui/focus.js';
import { addPanel, PANEL } from '../ui/panel.js';
import { textStyle, COLORS } from '../ui/style.js';
import { playSfx } from '../audio/sfx.js';
import { getSetting } from '../ui/settings.js';
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
import { getAchievements, checkMetaAchievements } from '../services/achievements.js';
import {
  BagView, ItemTooltip, drawItemBox, addStatsPanel, itemTitle, affixText, RARITY_CSS,
} from '../ui/items.js';
import { showAchievementToasts } from '../ui/toast.js';

const BAGV = { x: 10, y: 52, cell: 22 };
const ST = { x: 218, y: 52, cell: 20, cols: 10 };
const STATS_BOX = { x: 426, y: 40, w: 206, h: 290 };
const CR = { x: 10, y: 52, cell: 16, cols: 12 };
const DET = { x: 214, y: 40, w: 418 };
const BTN_H = 18;
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
  }

  create() {
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
    this.add.text(10, 6, t('inv.title'), textStyle(16, COLORS.accent, { stroke: '#000000', strokeThickness: 4 }))
        .setOrigin(0, 0);
    this.add.text(GAME_WIDTH - 10, 8, this.walletText(), textStyle(10, '#ffd84a')).setOrigin(1, 0);
    ['bag', 'craft'].forEach((tab, i) => {
      this.button({ key: `tab:${tab}`, x: 270 + i * 100, y: 18, w: 92, h: 18,
        label: t(`inv.tab.${tab}`), selected: this.tab === tab,
        onSelect: () => this.switchTab(tab) });
    });
    if (this.tab === 'craft') this.renderCraft();
    else this.renderBag();
    this.button({ key: 'back', x: 60, y: GAME_HEIGHT - 18, w: 100, h: 20, label: t('settings.back'),
      onSelect: () => this.back() });
    this.statusText = this.add.text(this.tab === 'craft' ? DET.x + DET.w / 2 : ST.x + 100,
        this.tab === 'craft' ? 330 : 262, this.msg, textStyle(10, this.msgColor)).setOrigin(0.5, 0);
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    const i = keep ? this.nav.items.findIndex((it) => it.key === keep) : -1;
    this.nav.focus(i >= 0 ? i : 0);
    this.ghostKey = '';
  }

  walletText() {
    const w = this.inv.wallet;
    return CURRENCIES.map((c) => `${t(`currency.${c}`)}: ${w[c] || 0}`).join('   ');
  }

  button(o) {
    const it = addButton(this, this.nav, { size: 10, ...o });
    it.key = o.key;
    const set = it.setFocus;
    it.setFocus = (f) => { set(f); if (f) this.focusKey = o.key; };
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
    return HEROES[validHero(getSetting('hero'))];
  }

  // ---------- сумка ----------

  renderBag() {
    const inv = this.inv;
    this.add.text(BAGV.x, 40, t('inv.bag', { c: inv.bag.cols, r: inv.bag.rows }), textStyle(10, '#ffd84a'))
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
    this.add.text(ST.x, 40, t('inv.stash', { n: inv.stash.length, m: STASH.size }), textStyle(10, '#ffd84a'))
        .setOrigin(0, 0);
    this.button({ key: 'sort:rarity', x: ST.x + 132, y: 45, w: 50, h: 14, size: 8,
      label: t('inv.sort.rarity'), onSelect: () => this.sort('rarity') });
    this.button({ key: 'sort:type', x: ST.x + 182, y: 45, w: 40, h: 14, size: 8,
      label: t('inv.sort.type'), onSelect: () => this.sort('type') });
    const g = this.add.graphics();
    const rows = Math.ceil(STASH.size / ST.cols);
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
    const bw = 62;
    for (let i = 0; i < BAG.presets; i++) {
      const x = BAGV.x + bw / 2 + i * (bw + 6);
      const has = !!(inv.presets && inv.presets[i]);
      this.button({ key: `load:${i}`, x, y: 174, w: bw, h: BTN_H, label: t('inv.preset.load', { n: i + 1 }),
        disabled: !has, onSelect: () => this.loadPreset(i) });
      this.button({ key: `save:${i}`, x, y: 196, w: bw, h: BTN_H, label: t('inv.preset.save', { n: i + 1 }),
        onSelect: () => this.savePreset(i) });
    }
    const sel = this.sel && findItem(inv, this.sel);
    const acts = [
      ['rotate', t('inv.rotate'), () => this.rotate(), !this.held && !(sel && sel.where === 'bag')],
      ['lock', sel && sel.item.locked ? t('inv.unlock') : t('inv.lock'), () => this.toggleLock(), !sel],
      ['dis', this.confirm && sel && this.confirm.uid === sel.item.uid ? t('inv.confirm') :
        t('craft.disassemble'), () => this.disassemble(), !sel || sel.item.locked],
    ];
    acts.forEach(([k, label, fn, dis], i) => {
      this.button({ key: `act:${k}`, x: BAGV.x + bw / 2 + i * (bw + 6), y: 218, w: bw, h: BTN_H, label,
        disabled: dis, onSelect: fn });
    });
    if (sel) {
      this.add.text(BAGV.x, 232, itemTitle(sel.item), textStyle(9, RARITY_CSS[sel.item.rarity],
          { wordWrap: { width: 200 } })).setOrigin(0, 0);
    }
    this.add.text(BAGV.x, 292, t('inv.hint'), textStyle(8, COLORS.dim, { wordWrap: { width: 405 } }))
        .setOrigin(0, 0);
    this.renderStats();
  }

  renderStats() {
    const hero = this.hero();
    const bag = this.inv.bag;
    const rep = loadoutReport(hero.stats, [], bag);
    const base = statReport(hero.stats, []);
    const B = STATS_BOX;
    addStatsPanel(this, B.x, B.y, B.w, B.h, rep, base,
        `${t('inv.stats')} · ${t(`hero.${validHero(getSetting('hero'))}.name`)}`);
    let y = B.y + 220;
    const div = bagBonus(bag);
    this.add.text(B.x + 6, y, t('item.diversity', { n: Math.round((div.diversity - 1) * 100) }),
        textStyle(9, '#8cff6a')).setOrigin(0, 0);
    y += 14;
    const u = loadoutUnique(bag);
    if (u) {
      this.add.text(B.x + 6, y, t(`unique.${u}.name`), textStyle(10, RARITY_CSS.unique)).setOrigin(0, 0);
      this.add.text(B.x + 6, y + 13, t(`unique.${u}.desc`), textStyle(8, '#ffd8a0',
          { wordWrap: { width: B.w - 12 } })).setOrigin(0, 0);
    }
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
    this.add.text(CR.x, 40, t('craft.select'), textStyle(10, '#ffd84a')).setOrigin(0, 0);
    const g = this.add.graphics();
    const bagN = this.inv.bag.items.length;
    const total = BAG.w * BAG.h + STASH.size;
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
    addPanel(this, DET.x + DET.w / 2, 40 + 140, DET.w, 280);
    const L = DET.x + 8;
    if (!f) {
      this.add.text(L, 48, t('craft.none'), textStyle(10, COLORS.dim)).setOrigin(0, 0);
      return;
    }
    const it = f.item;
    let y = 46;
    this.add.text(L, y, itemTitle(it), textStyle(12, RARITY_CSS[it.rarity])).setOrigin(0, 0);
    y += 16;
    const meta = [t(`item.rarity.${it.rarity}`), t('item.tier', { n: it.tier })];
    if (it.enchant) meta.push(t('item.enchant', { n: it.enchant }));
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
        this.button({ key: `affix:${i}`, x: L + 6, y: yy + 6, w: 10, h: 12, size: 8,
          label: i === this.affix ? '>' : '', selected: i === this.affix,
          onSelect: () => { this.affix = i; this.render(); } });
        this.add.text(L + 16, yy, a.text, textStyle(9, a.color)).setOrigin(0, 0);
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
    let oy = 160;
    for (const [op, label, fn] of ops) {
      const cost = op === 'merge' ? this.mergeCostAny(it) : craftCost(op, it);
      const ok = !!cost && canAfford(w, cost) && !(op === 'merge' && it.locked);
      this.button({ key: `op:${op}`, x: L + 75, y: oy, w: 150, h: BTN_H, label, disabled: !cost || !ok,
        selected: op === 'merge' && this.mergeMode, onSelect: fn });
      this.add.text(L + 158, oy, this.costText(op, it, cost), textStyle(9, cost && !ok ? '#ff8080' : '#dddddd'))
          .setOrigin(0, 0.5);
      oy += BTN_H + 4;
    }
    const dis = this.confirm && this.confirm.uid === it.uid;
    this.button({ key: 'op:dis', x: L + 75, y: oy, w: 150, h: BTN_H,
      label: dis ? t('inv.confirm') : t('craft.disassemble'), disabled: it.locked,
      onSelect: () => this.disassemble() });
    this.add.text(L + 158, oy, `+${disassembleValue(it)} ${t('currency.crystals')}`, textStyle(9))
        .setOrigin(0, 0.5);
    oy += BTN_H + 6;
    this.button({ key: 'op:scroll', x: L + 75, y: oy, w: 150, h: BTN_H,
      label: `${this.scroll ? '[x]' : '[ ]'} ${t('craft.useScroll')}`, selected: this.scroll,
      disabled: !(w.scrolls > 0) && !this.scroll,
      onSelect: () => { this.scroll = !this.scroll; this.render(); } });
    this.add.text(L + 158, oy, t('craft.scroll_note', { n: w.scrolls || 0 }), textStyle(8, COLORS.dim))
        .setOrigin(0, 0.5);
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
    const hv = this.held ? null : this.hovered();
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
