// Лобби сетевого коопа. Хост: createRoom, показывает код, ждёт гостя, выбирает сложность, Start.
// Гость: joinRoom по коду, видит выбор хоста, ждёт старта. После соединения всё идёт по каналу:
//   { type: 'hello', name, hero }  ник и герой, оба сразу после соединения
//   { type: 'hero', id }           смена своего героя (каждый выбирает сам; герой напарника занят).
//                                  id '' — герой отпущен (повторный клик по своему), его может взять напарник.
//                                  Если оба оказались на одном (выбрали одновременно), уступает гость.
//   { type: 'diff', id }           хост при смене сложности
//   { type: 'start', seed, difficulty, names, heroes }   хост; оба стартуют Game с data.coop
//   { type: 'leave' }              выход из лобби
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { FocusNav, addButton } from '../ui/focus.js';
import { textStyle, COLORS } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import { getSetting, setSetting } from '../ui/settings.js';
import { createRoom, joinRoom } from '../services/net.js';
import { stopMusic } from '../audio/sfx.js';
import { validHero, freeHero, distinctHeroes } from '../core/heroes.js';
import { validateNick } from '../core/nick.js';
import { addHeroPicker } from '../ui/hero-picker.js';

// Колонки лобби: кнопки сложности, Start/Cancel и карточки героев одной ширины, центры на cx ± BTN_DX.
const BTN_W = 120;
const BTN_DX = 70;
const LOBBY_GRID_W = 400; // сетка героев, когда их много: на всю ширину панели

// Герой от напарника: '' — отпустил (никого не выбрал), иначе id из HEROES (неизвестный — по умолчанию)
function heroOf(raw) {
  return raw === '' ? '' : validHero(raw);
}

// Ник от напарника: по тем же правилам, что своё поле, иначе '?' (в таблицу такая пара не уйдёт)
function nickOf(raw) {
  const v = validateNick(raw);
  return v.ok ? v.value : '?';
}

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  // data: { role: 'host' | 'guest', nick, code? (гость) }
  init(data) {
    this.role = data.role;
    this.nick = data.nick;
    this.code = data.code || '';
    this.conn = null;
    this.room = null;
    this.partner = '';
    this.difficulty = DIFFICULTIES[getSetting('difficulty')] ? getSetting('difficulty') : DEFAULT_DIFFICULTY;
    this.hero = validHero(getSetting('hero'));
    this.partnerHero = '';
    this.started = false;
    this.alive = true;
  }

  create() {
    stopMusic();
    const cx = GAME_WIDTH / 2;
    this.nav = new FocusNav(this, { onBack: () => this.leave() });
    this.add.text(cx, 20, t('lobby.title'), textStyle(20, COLORS.accent, { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    addPanel(this, cx, 190, 420, 298);
    this.codeLabel = this.add.text(cx, 56, '', textStyle(10, '#aaaaaa')).setOrigin(0.5);
    this.codeText = this.add.text(cx, 78, '', textStyle(26, '#ffd84a', { stroke: '#000000', strokeThickness: 5 })).setOrigin(0.5);
    this.status = this.add.text(cx, 102, '', textStyle(10, '#dddddd')).setOrigin(0.5);
    this.players = this.add.text(cx, 120, '', textStyle(11)).setOrigin(0.5);
    this.objs = [];
    this.events.once('shutdown', () => this.shutdown());
    this.renderButtons();
    if (this.role === 'host') this.host(); else this.guest();
  }

  update(time) {
    this.nav.update(time);
  }

  shutdown() {
    this.alive = false;
    if (this.started) return; // канал ушёл в Game
    if (this.room) this.room.cancel();
    if (this.conn) { this.conn.send({ type: 'leave' }); this.conn.close(); }
  }

  say(key, color = '#dddddd') {
    if (this.alive) this.status.setText(t(key)).setColor(color);
  }

  async host() {
    this.say('lobby.creating');
    let room = null;
    try {
      room = await createRoom({ onStatus: (s) => this.onStatus(s) });
    } catch (e) {
      this.say('lobby.failed', '#ff8080');
      return;
    }
    if (!this.alive) { room.cancel(); return; }
    this.room = room;
    this.code = room.code;
    this.codeLabel.setText(t('lobby.code'));
    this.codeText.setText(room.code);
    try {
      const conn = await room.conn;
      if (!this.alive) { conn.close(); return; }
      this.connected(conn);
    } catch (e) {
      if (this.alive) this.say('lobby.failed', '#ff8080');
    }
  }

  async guest() {
    this.codeLabel.setText(t('lobby.code'));
    this.codeText.setText(this.code);
    try {
      const conn = await joinRoom(this.code, { onStatus: (s) => this.onStatus(s) });
      if (!this.alive) { conn.close(); return; }
      this.connected(conn);
    } catch (e) {
      if (this.alive) this.say(e && e.message === 'notfound' ? 'lobby.notfound' : 'lobby.failed', '#ff8080');
    }
  }

  onStatus(s) {
    const map = { creating: 'lobby.creating', waiting: 'lobby.waiting', connecting: 'lobby.connecting', connected: 'lobby.connected', failed: 'lobby.failed' };
    if (map[s]) this.say(map[s], s === 'failed' ? '#ff8080' : '#dddddd');
  }

  connected(conn) {
    this.conn = conn;
    conn.onMessage((m) => this.onMessage(m));
    conn.onClose(() => {
      if (!this.alive || this.started) return;
      this.conn = null;
      this.partner = '';
      this.say('lobby.left', '#ff8080');
      this.renderButtons();
    });
    conn.send({ type: 'hello', name: this.nick, hero: this.hero });
    if (this.role === 'host') conn.send({ type: 'diff', id: this.difficulty });
    this.renderButtons();
  }

  onMessage(m) {
    if (!m || typeof m !== 'object' || this.started) return;
    switch (m.type) {
      case 'hello':
        this.partner = nickOf(m.name);
        this.partnerHero = heroOf(m.hero);
        this.resolveHeroes();
        this.renderButtons();
        break;
      case 'hero':
        this.partnerHero = heroOf(m.id);
        this.resolveHeroes();
        this.renderButtons();
        break;
      case 'diff':
        if (this.role === 'guest' && DIFFICULTIES[m.id]) { this.difficulty = m.id; this.renderButtons(); }
        break;
      case 'start':
        if (this.role === 'guest' && DIFFICULTIES[m.difficulty] && Number.isFinite(m.seed)) {
          const names = Array.isArray(m.names) ? m.names.slice(0, 2).map(nickOf)
            : [this.partner, this.nick];
          const heroes = distinctHeroes(2, Array.isArray(m.heroes) ? m.heroes : this.heroes());
          this.startGame(m.seed, m.difficulty, names, heroes);
        }
        break;
      case 'leave':
        this.conn.close();
        break;
      default:
        break;
    }
  }

  // Имена и герои по индексам игроков: хост 0, гость 1.
  names() {
    return this.role === 'host' ? [this.nick, this.partner] : [this.partner, this.nick];
  }

  heroes() {
    const mine = this.hero || freeHero([this.partnerHero]);
    const other = this.partnerHero || freeHero([mine]);
    return this.role === 'host' ? [mine, other] : [other, mine];
  }

  // Два игрока на одном герое: гость берёт свободного и сообщает хосту.
  resolveHeroes() {
    if (this.role !== 'guest' || !this.hero || this.hero !== this.partnerHero) return;
    this.hero = freeHero([this.partnerHero], this.hero);
    setSetting('hero', this.hero);
    if (this.conn) this.conn.send({ type: 'hero', id: this.hero });
  }

  // Клик по своему выбранному герою отпускает его (напарник может взять), по другому — выбирает.
  pickHero(id) {
    if (validHero(id) !== id || id === this.partnerHero) return; // занят напарником
    this.hero = id === this.hero ? '' : id;
    if (this.hero) setSetting('hero', this.hero);
    if (this.conn) this.conn.send({ type: 'hero', id: this.hero });
    this.renderButtons();
  }

  renderButtons() {
    if (!this.alive) return;
    const cx = GAME_WIDTH / 2;
    const keep = this.nav.index;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    const before = new Set(this.children.list);
    const heroName = (id) => (id ? t(`hero.${id}.name`) : '?');
    const me = `${this.nick} (${t('lobby.you')}) · ${heroName(this.hero)}`;
    const other = this.partner ? `${this.partner} · ${heroName(this.partnerHero)}` : '...';
    const [a, b] = this.role === 'host' ? [me, other] : [other, me];
    this.players.setText(`${t('lobby.host')}: ${a}    ${t('lobby.guest')}: ${b}`);

    // свой герой: карточки, выбор сразу уходит напарнику
    this.add.text(cx, 136, t('lobby.your_hero'), textStyle(9, '#aaaaaa')).setOrigin(0.5);
    addHeroPicker(this, this.nav, {
      // ширина и шаг как у кнопок ниже (BTN_W, BTN_DX): карточки стоят ровно над ними
      x: cx, y: 190, w: BTN_W, h: 92, gap: 2 * BTN_DX - BTN_W, compact: true, mark: true,
      selected: this.hero, taken: this.partnerHero ? [this.partnerHero] : [],
      maxWidth: 2 * BTN_DX + BTN_W, gridWidth: LOBBY_GRID_W,
      onPick: (id) => this.pickHero(id),
    });

    const ids = Object.keys(DIFFICULTIES);
    const y = 256;
    ids.forEach((id, i) => {
      const x = cx - BTN_DX + i * 2 * BTN_DX;
      const cursed = id !== DEFAULT_DIFFICULTY;
      const sel = id === this.difficulty;
      const b = addButton(this, this.nav, {
        x, y, w: BTN_W, h: 26, size: 12, label: t(`difficulty.${id}.name`), selected: sel,
        color: cursed ? COLORS.cursed : '#ffffff',
        onSelect: () => this.pickDifficulty(id),
      });
      if (this.role !== 'host') {
        b.setDisabled(true);
        if (sel) { b.rect.setAlpha(1); b.text.setAlpha(1); } // гость видит выбор хоста ярко
      }
    });
    if (this.role !== 'host') {
      this.add.text(cx, 278, t('lobby.host_picks'), textStyle(9, '#aaaaaa')).setOrigin(0.5);
    }
    const ready = !!(this.conn && this.partner && this.partnerHero && this.hero) &&
      this.partnerHero !== this.hero;
    if (this.role === 'host') {
      const start = addButton(this, this.nav, { x: cx - BTN_DX, y: 308, w: BTN_W, h: 28, label: t('lobby.start'), onSelect: () => this.start() });
      start.setDisabled(!ready);
    }
    addButton(this, this.nav, { x: this.role === 'host' ? cx + BTN_DX : cx, y: 308, w: BTN_W, h: 28, label: t('lobby.cancel'), onSelect: () => this.leave() });
    this.objs = this.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    this.nav.focus(Math.max(0, Math.min(keep, this.nav.items.length - 1)));
  }

  pickDifficulty(id) {
    if (this.role !== 'host') return;
    this.difficulty = id;
    setSetting('difficulty', id);
    if (this.conn) this.conn.send({ type: 'diff', id });
    this.renderButtons();
  }

  start() {
    if (this.role !== 'host' || !this.conn || !this.partner) return;
    if (!this.hero || !this.partnerHero || this.partnerHero === this.hero) return; // кто-то без героя или гость не уступил
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const names = this.names();
    const heroes = distinctHeroes(2, this.heroes());
    this.conn.send({ type: 'start', seed, difficulty: this.difficulty, names, heroes });
    this.startGame(seed, this.difficulty, names, heroes);
  }

  startGame(seed, difficulty, names, heroes) {
    if (this.started || !this.conn) return;
    this.started = true;
    const conn = this.conn;
    conn.onMessage(null); // Game поставит свой обработчик; до того сообщения копятся
    conn.onClose(null);
    const local = this.role === 'host' ? 0 : 1;
    this.scene.start('Game', { coop: { net: conn, local, seed, difficulty, names, heroes } });
  }

  leave() {
    this.scene.start('Menu');
  }
}
