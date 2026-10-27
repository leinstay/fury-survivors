import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { addVolumeSliders, optionRows } from '../ui/volume.js';
import { textStyle, COLORS } from '../ui/style.js';
import { stopMusic } from '../audio/sfx.js';
import { spriteScale } from '../render/density.js';
import { requestFullscreen } from '../ui/fullscreen.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { getSetting, setSetting, isMobile } from '../ui/settings.js';
import { createTextInput } from '../ui/dom-input.js';
import { addPanel } from '../ui/panel.js';
import { NICK } from '../data/leaderboard.js';
import { ROOMS } from '../data/net.js';
import { validateNick } from '../core/nick.js';
import { cleanCode } from '../services/net.js';
import { readNick, writeNick } from '../services/nick-store.js';
import { HEROES } from '../data/heroes.js';
import { validHero } from '../core/heroes.js';
import { addHeroPicker } from '../ui/hero-picker.js';
import { versionTag } from '../core/lockstep.js';
import { OPTIONS, CONTENT_MID, menuRow, subRow, columnTop, backRect, screenTitle } from '../ui/menu-layout.js';

// Картинки героев по бокам меню (HEROES[id].menu): справа как есть, слева отражённые; внутренний край первой
// на каждой стороне на MENU_ART_GAP от центра, следующие на той же стороне дальше через MENU_ART_STEP,
// ноги на одной линии (MENU_ART_Y).
const MENU_ART_GAP = 135;
const MENU_ART_STEP = 6;
const MENU_ART_Y = 318;
// Высота карточек выбора героя (по центру катка под заголовком).
const HERO_PICK_H = 150;
// Название игры (логотип) только на главном и на Play; на остальных подэкранах — заголовок экрана.
const LOGO_VIEWS = new Set(['main', 'play']);
// Заголовок каждого подэкрана меню (ui/menu-layout.js screenTitle).
const TITLES = { difficulty: 'difficulty.title', hero: 'hero.title',
  coop: 'coop.title', settings: 'settings.title' };

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.nav = new FocusNav(this, { onBack: () => this.back() });
    this.view = '';
    this.objs = [];
    // Фон шире экрана на несколько пикселей; позиция целая, чтобы клетки фона легли ровно на пиксели холста.
    if (this.textures.exists('menu_bg')) {
      const k = spriteScale('menu_bg');
      const img = this.textures.get('menu_bg').getSourceImage();
      this.add.image(Math.floor((GAME_WIDTH - img.width * k) / 2), Math.floor((GAME_HEIGHT - img.height * k) / 2), 'menu_bg').setOrigin(0, 0).setScale(k);
    }
    // версия игры (отпечаток данных и логики): в коопе у обоих должна совпадать
    this.add.text(4, 3, t('menu.version', { v: versionTag() }),
        textStyle(8, '#bbbbbb', { stroke: '#000000', strokeThickness: 2 })).setOrigin(0, 0).setAlpha(0.8);
    this.show('main');
    // В меню тишина: музыка играет только в забеге (выход из паузы в меню её обрывает).
    stopMusic();
  }

  update(time) {
    this.nav.update(time);
    if (this.inputs) for (const i of this.inputs) i.place();
  }

  // DOM-поля (ник, код) живут только в виде coop: убираем при смене вида и при выходе из сцены.
  _dropInputs() {
    if (!this.inputs) return;
    for (const i of this.inputs) i.destroy();
    this.inputs = null;
  }

  // На телефоне Play разворачивает игру на весь экран (нужен жест пользователя, нажатие кнопки им и является).
  play(difficulty) {
    setSetting('difficulty', difficulty);
    requestFullscreen();
    this.scene.start('Game', { difficulty, hero: this.hero() });
  }

  // Выбранный герой (последний выбор, по умолчанию DEFAULT_HERO).
  hero() {
    return validHero(getSetting('hero'));
  }

  // Выбранная сложность (последний выбор, по умолчанию DEFAULT_DIFFICULTY).
  difficulty() {
    const d = getSetting('difficulty');
    return DIFFICULTIES[d] ? d : DEFAULT_DIFFICULTY;
  }

  // Картинки героев у кнопок меню по HEROES[id].menu.
  menuArt() {
    const cx = GAME_WIDTH / 2;
    const edge = { right: MENU_ART_GAP, left: MENU_ART_GAP }; // расстояние от центра до следующей картинки
    for (const def of Object.values(HEROES)) {
      const m = def.menu;
      if (!m || !this.textures.exists(m.art)) continue;
      const right = m.side !== 'left';
      const side = right ? 'right' : 'left';
      const img = this.add.image(0, MENU_ART_Y, m.art).setOrigin(0.5, 1)
          .setScale(spriteScale(m.art));
      const half = img.displayWidth / 2;
      img.x = right ? cx + edge[side] + half : cx - edge[side] - half;
      img.setFlipX(!right);
      edge[side] += img.displayWidth + MENU_ART_STEP;
    }
  }

  show(view) {
    this.from = this.view; // откуда пришли: фокус встаёт на кнопку, что вела туда
    this.view = view;
    this.nav.clear();
    this._dropInputs();
    for (const o of this.objs) o.destroy();
    const before = new Set(this.children.list);
    const cx = GAME_WIDTH / 2;

    if (LOGO_VIEWS.has(view)) {
      this.add.text(cx, 62, t('game.title'), textStyle(32, COLORS.accent, { stroke: '#000000', strokeThickness: 6 })).setOrigin(0.5);
    }

    let focus = 0;
    const row = (i, label, onSelect, color) =>
      addButton(this, this.nav, { ...menuRow(i), label, onSelect, color });
    // Подэкраны: заголовок экрана на TITLE_Y, столбик (160×24, шаг меню) по центру катка (subRow), Back — общий
    // Back страниц (внизу слева), героини по бокам те же, что в главном (кроме настроек: строки шире промежутка).
    const sub = (i, n, label, onSelect, color) =>
      addButton(this, this.nav, { ...subRow(i, n), label, onSelect, color });
    const back = (to) => addButton(this, this.nav, { ...backRect(), size: 12, label: t('settings.back'),
      onSelect: () => this.show(to) });
    // экран Play как корневой: логотип и столбик главного меню, без заголовка экрана
    if (!LOGO_VIEWS.has(view)) screenTitle(this, t(TITLES[view]));
    if (view === 'main') {
      // шесть кнопок одного размера столбцом (ui/menu-layout.js, та же раскладка у паузы)
      this.menuArt();
      const rows = [
        ['play', t('menu.play'), () => this.show('play')],
        ['inventory', t('menu.inventory'), () => this.scene.start('Inventory')],
        ['codex', t('menu.codex'), () => this.scene.start('Codex', { from: 'Menu' })],
        ['achievements', t('menu.achievements'), () => this.scene.start('Achievements')],
        ['leaderboard', t('menu.leaderboard'), () => this.scene.start('Leaderboard')],
        ['settings', t('menu.settings'), () => this.show('settings')],
      ];
      rows.forEach(([, label, fn], i) => row(i, label, fn));
      focus = Math.max(0, rows.findIndex((r) => r[0] === this.from));
      // подсказка про клавиши: на телефоне клавиатуры нет
      if (!isMobile()) this.add.text(cx, GAME_HEIGHT - 14, t('menu.hint'), textStyle(10, '#dddddd', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
    } else if (view === 'play') {
      // Play: соло (сложность, затем герой) или кооп (ник и лобби)
      this.menuArt();
      row(0, t('menu.solo'), () => this.show('difficulty'));
      row(1, t('menu.coop'), () => this.show('coop'));
      back('main');
      focus = this.from === 'coop' ? 1 : 0;
    } else if (view === 'difficulty') {
      // Сложность соло; последний выбор запоминается и стоит в фокусе.
      this.menuArt();
      const ids = Object.keys(DIFFICULTIES);
      ids.forEach((id, i) => {
        const cursed = id !== DEFAULT_DIFFICULTY;
        sub(i, ids.length, t(`difficulty.${id}.name`), () => { setSetting('difficulty', id); this.show('hero'); },
            cursed ? COLORS.cursed : '#ffffff');
      });
      back('play');
      focus = Math.max(0, ids.indexOf(this.difficulty()));
    } else if (view === 'hero') {
      // Выбор героя последним шагом: выбор сразу запускает забег. Последний выбор стоит в фокусе.
      // Карточки по центру катка, ряд не шире промежутка между героинями фона.
      this.menuArt();
      const ids = Object.keys(HEROES);
      addHeroPicker(this, this.nav, {
        x: cx, y: CONTENT_MID, h: HERO_PICK_H,
        maxWidth: 2 * MENU_ART_GAP - 10, selected: this.hero(),
        onPick: (id) => { setSetting('hero', id); this.play(this.difficulty()); },
      });
      back('difficulty');
      focus = Math.max(0, ids.indexOf(this.hero()));
    } else if (view === 'coop') {
      this.menuArt();
      this.showCoop(cx, before);
      return;
    } else {
      // столбец настроек как Options паузы (ui/menu-layout.js OPTIONS), по центру катка
      const O = OPTIONS;
      const y = columnTop(optionRows(), O.step);
      addVolumeSliders(this, this.nav, { x: cx, y, w: O.w, gap: O.step });
      back('main');
    }
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(focus);
  }

  // Шаг назад (Esc / B): герой → сложность → Play → главное; кооп → Play; настройки → главное.
  back() {
    const prev = { play: 'main', difficulty: 'play', hero: 'difficulty', coop: 'play', settings: 'main' };
    if (prev[this.view]) this.show(prev[this.view]);
  }

  // Сетевой кооп: ник, «Создать лобби» (хост) или код и «Подключиться» (гость). Оба уходят в сцену Lobby.
  showCoop(cx, before) {
    // Строки столбика меню (subRow, 160×24, по центру катка): хост — ник и Create lobby, между группами
    // подсказка, гость — код и Connect; под ними строка ошибок. Стрелки ходят сверху вниз, Back — внизу слева.
    const rows = { name: 0, create: 1, note: 2, code: 3, connect: 4, status: 5 };
    const r = (k) => subRow(rows[k], 5);
    this.add.text(cx, r('note').y, t('coop.note'), textStyle(9, '#dddddd', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
    const status = this.add.text(cx, r('status').y, '', textStyle(10, '#ff8080', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
    const say = (key) => status.setText(key ? t(key) : '');

    const nameRect = r('name');
    const namePanel = addPanel(this, nameRect.x, nameRect.y, nameRect.w, nameRect.h);
    const name = createTextInput(this, nameRect, { maxLength: NICK.max, placeholder: t('result.nick_hint') });
    name.el.value = readNick();
    this.nav.add({
      x: nameRect.x, y: nameRect.y, w: nameRect.w, h: nameRect.h,
      setFocus: (f) => namePanel.setFocus(f), onSelect: () => name.el.focus(),
    });
    const nick = () => {
      const v = validateNick(name.el.value);
      if (!v.ok) { say('coop.need_name'); name.el.focus(); return ''; }
      writeNick(v.value);
      return v.value;
    };

    addButton(this, this.nav, {
      ...r('create'), label: t('coop.create'),
      onSelect: () => { const n = nick(); if (n) this.lobby({ role: 'host', nick: n }); },
    });

    const codeRect = r('code');
    const codePanel = addPanel(this, codeRect.x, codeRect.y, codeRect.w, codeRect.h);
    const code = createTextInput(this, codeRect, { maxLength: ROOMS.codeLength, placeholder: t('coop.code_hint') });
    this.nav.add({
      x: codeRect.x, y: codeRect.y, w: codeRect.w, h: codeRect.h,
      setFocus: (f) => codePanel.setFocus(f), onSelect: () => code.el.focus(),
    });
    const connect = () => {
      const n = nick();
      if (!n) return;
      const c = cleanCode(code.el.value);
      if (!c) { say('coop.need_code'); code.el.focus(); return; }
      this.lobby({ role: 'guest', nick: n, code: c });
    };
    addButton(this, this.nav, { ...r('connect'), label: t('coop.connect'), onSelect: connect });
    code.el.addEventListener('nick-enter', connect);
    name.el.addEventListener('nick-enter', () => code.el.focus());

    addButton(this, this.nav, { ...backRect(), size: 12, label: t('settings.back'), onSelect: () => this.show('play') });
    this.inputs = [name, code];
    this.events.once('shutdown', () => this._dropInputs());
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(name.el.value ? 1 : 0);
  }

  lobby(data) {
    this._dropInputs();
    requestFullscreen();
    this.scene.start('Lobby', data);
  }
}
