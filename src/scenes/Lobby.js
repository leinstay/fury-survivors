// Лобби сетевого коопа. Хост: createRoom, показывает код, ждёт гостя, выбирает сложность, Start.
// Гость: joinRoom по коду, видит выбор хоста, ждёт старта. После соединения всё идёт по каналу:
//   { type: 'hello', name }        ник, оба сразу после соединения
//   { type: 'diff', id }           хост при смене сложности
//   { type: 'start', seed, difficulty, names }   хост; оба стартуют Game с data.coop
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
import { COOP } from '../data/coop.js';

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
    this.started = false;
    this.alive = true;
  }

  create() {
    stopMusic();
    const cx = GAME_WIDTH / 2;
    this.nav = new FocusNav(this, { onBack: () => this.leave() });
    this.add.text(cx, 40, t('lobby.title'), textStyle(22, COLORS.accent, { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    addPanel(this, cx, 190, 400, 230);
    this.codeLabel = this.add.text(cx, 92, '', textStyle(11, '#aaaaaa')).setOrigin(0.5);
    this.codeText = this.add.text(cx, 118, '', textStyle(30, '#ffd84a', { stroke: '#000000', strokeThickness: 5 })).setOrigin(0.5);
    this.status = this.add.text(cx, 150, '', textStyle(11, '#dddddd')).setOrigin(0.5);
    this.players = this.add.text(cx, 176, '', textStyle(12)).setOrigin(0.5);
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
    conn.send({ type: 'hello', name: this.nick });
    if (this.role === 'host') conn.send({ type: 'diff', id: this.difficulty });
    this.renderButtons();
  }

  onMessage(m) {
    if (!m || typeof m !== 'object' || this.started) return;
    switch (m.type) {
      case 'hello':
        this.partner = typeof m.name === 'string' ? m.name.slice(0, 6) : '?';
        this.renderButtons();
        break;
      case 'diff':
        if (this.role === 'guest' && DIFFICULTIES[m.id]) { this.difficulty = m.id; this.renderButtons(); }
        break;
      case 'start':
        if (this.role === 'guest' && DIFFICULTIES[m.difficulty] && Number.isFinite(m.seed)) {
          const names = Array.isArray(m.names) ? m.names : [this.partner, this.nick];
          this.startGame(m.seed, m.difficulty, names);
        }
        break;
      case 'leave':
        this.conn.close();
        break;
      default:
        break;
    }
  }

  // Имена по индексам игроков: хост 0, гость 1.
  names() {
    return this.role === 'host' ? [this.nick, this.partner] : [this.partner, this.nick];
  }

  renderButtons() {
    if (!this.alive) return;
    const cx = GAME_WIDTH / 2;
    const keep = this.nav.index;
    this.nav.clear();
    for (const o of this.objs) o.destroy();
    const before = new Set(this.children.list);
    const me = `${this.nick} (${t('lobby.you')})`;
    const other = this.partner || '...';
    const [a, b] = this.role === 'host' ? [me, other] : [other, me];
    const hero = (i) => t(`hero.${COOP.heroes[i]}.name`);
    this.players.setText(`${t('lobby.host')}: ${a} · ${hero(0)}    ${t('lobby.guest')}: ${b} · ${hero(1)}`);

    const ids = Object.keys(DIFFICULTIES);
    const y = 214;
    ids.forEach((id, i) => {
      const x = cx - 70 + i * 140;
      const cursed = id !== DEFAULT_DIFFICULTY;
      const sel = id === this.difficulty;
      const b = addButton(this, this.nav, {
        x, y, w: 120, h: 26, size: 12, label: (sel ? '> ' : '') + t(`difficulty.${id}.name`),
        color: cursed ? COLORS.cursed : '#ffffff',
        onSelect: () => this.pickDifficulty(id),
      });
      if (this.role !== 'host') b.setDisabled(true);
    });
    if (this.role !== 'host') {
      this.add.text(cx, 238, t('lobby.host_picks'), textStyle(9, '#aaaaaa')).setOrigin(0.5);
    }
    const ready = !!(this.conn && this.partner);
    if (this.role === 'host') {
      const start = addButton(this, this.nav, { x: cx - 70, y: 272, w: 120, h: 28, label: t('lobby.start'), onSelect: () => this.start() });
      start.setDisabled(!ready);
    }
    addButton(this, this.nav, { x: this.role === 'host' ? cx + 70 : cx, y: 272, w: 120, h: 28, label: t('lobby.cancel'), onSelect: () => this.leave() });
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
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const names = this.names();
    this.conn.send({ type: 'start', seed, difficulty: this.difficulty, names });
    this.startGame(seed, this.difficulty, names);
  }

  startGame(seed, difficulty, names) {
    if (this.started || !this.conn) return;
    this.started = true;
    const conn = this.conn;
    conn.onMessage(null); // Game поставит свой обработчик; до того сообщения копятся
    conn.onClose(null);
    this.scene.start('Game', { coop: { net: conn, local: this.role === 'host' ? 0 : 1, seed, difficulty, names } });
  }

  leave() {
    this.scene.start('Menu');
  }
}
