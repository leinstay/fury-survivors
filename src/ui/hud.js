// HUD: HP, XP, уровень, таймер, убийства, счёт, DPS-метр, миникарта, иконки оружия и пассивок, кнопка паузы на таче.
import { GAME_WIDTH, GAME_HEIGHT, HUD } from '../data/constants.js';
import { COOP } from '../data/coop.js';
import { t, hasKey } from '../i18n/index.js';
import { textStyle, COLORS } from './style.js';
import { addIcon, iconKeyFor, displayName, sizedTexture } from './icons.js';
import { getSetting } from './settings.js';
import { computeScore } from '../services/leaderboard.js';

const D = 1e6; // HUD поверх мира
// Баннеры событий Жницы: ключ строки и цвет. Каждый показывается один раз за забег (круг раз в 20 с, телепорт по кулдауну).
const REAPER_BANNERS = {
  holyCircle: ['reaper.holy', '#ffe27a'],
  reaperSummon: ['reaper.summon', '#d8a0ff'],
  reaperTeleport: ['reaper.teleport', '#d8a0ff'],
};

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(scene, sim, { onPause, touch } = {}) {
    this.scene = scene;
    this.sim = sim;
    const add = (o) => o.setScrollFactor(0).setDepth(D);

    // XP-бар на всю ширину. Высота 13.5 (27 px холста): надпись уровня 19 px, по 4 px сверху и снизу.
    add(scene.add.rectangle(0, 0, GAME_WIDTH, 13.5, 0x000000, 0.7).setOrigin(0, 0));
    this.xpFill = add(scene.add.rectangle(0, 0, 0, 13.5, COLORS.xp).setOrigin(0, 0));
    this.levelText = add(scene.add.text(GAME_WIDTH / 2, 7, '', textStyle(10, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5));

    // HP
    add(scene.add.rectangle(6, 19, 104, 16, 0x000000, 0.7)
        .setOrigin(0, 0).setStrokeStyle(1, 0x000000));
    this.hpFill = add(scene.add.rectangle(8, 21, 100, 12, COLORS.hp).setOrigin(0, 0));
    this.hpText = add(scene.add.text(58, 27, '', textStyle(8, '#ffffff', { stroke: '#000000', strokeThickness: 2 })).setOrigin(0.5));
    // кооп: HUD как в соло, только свой игрок (HP напарника не показываем)

    // кооп: «ждём напарника», пока lockstep стоит без его ввода, или «рассинхрон» (Game → setNotice)
    this.waitText = add(scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '',
        textStyle(12, '#9ad0ff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5)).setVisible(false);
    this.timeText = add(scene.add.text(GAME_WIDTH / 2, 24, '', textStyle(16, '#ffffff', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5, 0.5));
    // Счёт по формуле таблицы рекордов, на лету: по центру под миникартой. Убийств в HUD нет, они на итогах.
    const mm = HUD.minimap;
    this.scoreText = add(scene.add.text(GAME_WIDTH - mm.margin - mm.radius, mm.top + mm.radius * 2 + 4, '',
        textStyle(12, '#ffd84a', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0));
    // DPS-метр: панель в правом нижнем углу, по оружию и общий, среднее за HUD.dpsWindow секунд.
    // Настройка dps: full / transparent / off. Строки пересобираются вместе со слотами оружия.
    this.dpsMode = getSetting('dps');
    this.dpsAlpha = this.dpsMode === 'transparent' ? HUD.transparentAlpha : 1;
    this.dpsRows = [];
    this.dpsObjs = [];
    // Миникарта в правом верхнем углу: настройка minimap: full / transparent.
    this.mapMode = getSetting('minimap');
    this.mapAlpha = this.mapMode === 'transparent' ? HUD.transparentAlpha : 1;
    this.map = add(scene.add.graphics()).setAlpha(this.mapAlpha);
    // поверх подложки и дорог: иконки предметов (пул картинок), затем стрелки и черепа
    this.mapIcons = [];
    this.mapTop = add(scene.add.graphics()).setAlpha(this.mapAlpha);
    this.mapAdd = add;
    this.mapNext = 0;

    // Полоса HP босса под таймером
    this.bossObjs = [];
    const bw = 200;
    const bx = GAME_WIDTH / 2 - bw / 2;
    this.bossBarW = bw - 2;
    this.bossObjs.push(add(scene.add.rectangle(bx - 1, 38, bw + 2, 10, 0x000000, 0.8)
        .setOrigin(0, 0).setStrokeStyle(1, 0xb0a0d0)));
    this.bossFill = add(scene.add.rectangle(bx + 1, 40, this.bossBarW, 6, 0xc02030)
        .setOrigin(0, 0));
    this.bossObjs.push(this.bossFill);
    this.bossName = add(scene.add.text(GAME_WIDTH / 2, 56, '', textStyle(10, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0.5));
    this.bossObjs.push(this.bossName);
    for (const o of this.bossObjs) o.setVisible(false);
    this.bossShown = '';

    // Баннер предупреждения о боссе
    this.banner = add(scene.add.text(GAME_WIDTH / 2, 110, t('boss.warning'), textStyle(24, '#ff3030', { stroke: '#000000', strokeThickness: 5 })).setOrigin(0.5)).setVisible(false);
    this.bannerSub = add(scene.add.text(GAME_WIDTH / 2, 134, '', textStyle(12, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5)).setVisible(false);
    this.bannerUntil = -1;
    this.reaperSeen = new Set(); // показанные баннеры Жницы
    this.bannerStart = 0;

    this.slots = [];
    this.slotSig = '';

    if (touch) {
      // левый нижний угол: справа внизу DPS-панель, справа вверху радар и счёт
      const x = 22;
      const y = GAME_HEIGHT - 22;
      const r = add(scene.add.rectangle(x, y, 28, 28, 0x000000, 0.5).setStrokeStyle(2, 0xffffff));
      add(scene.add.text(x, y, t('hud.pause'), textStyle(14)).setOrigin(0.5));
      r.setInteractive();
      r.on('pointerdown', (p, lx, ly, ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (onPause) onPause(); });
      this.pauseRect = r;
    }
  }

  // Область кнопки паузы (для ввода: тут джойстик не стартует).
  isOnPauseButton(x, y) {
    return !!this.pauseRect && x < 44 && y > GAME_HEIGHT - 44;
  }

  // События sim этого шага (баннер босса).
  onEvents(events) {
    for (const ev of events) {
      if (ev.type === 'bossWarning' || ev.type === 'overtime') {
        this.bannerStart = this.sim.time;
        this.bannerUntil = this.sim.time + HUD.bossBannerTime;
        const ot = ev.type === 'overtime';
        this.banner.setText(t(ot ? 'hud.overtime' : 'boss.warning')).setColor(ot ? '#ffd84a' : '#ff3030');
        const reaper = ev.boss === 'reaper';
        const sub = ot ? 'hud.overtime_hint' :
            reaper ? (this.sim.hasBible ? 'reaper.hint_bible' : 'reaper.hint') : '';
        this.bannerSub.setText(sub ? t(sub) : '');
        if (ot) this.timeText.setColor('#ffd84a');
      } else if (REAPER_BANNERS[ev.type] && !this.reaperSeen.has(ev.type)) {
        this.reaperSeen.add(ev.type);
        // Жница: круг, призыв, телепорт (src/core/reaper.js)
        const [key, color] = REAPER_BANNERS[ev.type];
        this.bannerStart = this.sim.time;
        this.bannerUntil = this.sim.time + HUD.bossBannerTime;
        this.banner.setText(t(key)).setColor(color);
        this.bannerSub.setText(ev.type === 'holyCircle' ? t('reaper.holy_hint') : '');
      }
    }
  }

  _updateBoss() {
    const b = this.sim.boss;
    // у неуязвимой жницы полосы нет; с Библией она смертна и полоса есть
    const mortal = !!b && (!b.def.invulnerable || (this.sim.hasBible && !!b.def.holy));
    const alive = mortal && b.hp > 0 && !b.dead;
    const key = alive ? b.type : '';
    if (key !== this.bossShown) {
      this.bossShown = key;
      for (const o of this.bossObjs) o.setVisible(alive);
      if (alive) {
        const k = `boss.${b.type}.name`;
        this.bossName.setText(hasKey(k) ? t(k) : b.type);
      }
    }
    if (alive) {
      const max = b.maxHp || b.hp || 1;
      this.bossFill.width =
          Math.max(1, Math.round(this.bossBarW * Math.max(0, Math.min(1, b.hp / max))));
    }
  }

  // Миникарта: круг, в нём дороги, предметы своими спрайтами (сундук, еда, магнит, монеты), элиты точкой,
  // боссы черепом и герои стрелкой по направлению движения, всё в радиусе range.
  _drawMap() {
    const m = HUD.minimap;
    const g = this.map;
    const top = this.mapTop;
    const cx = GAME_WIDTH - m.margin - m.radius;
    const cy = m.top + m.radius;
    const k = m.radius / m.range;
    const p = this.sim.view;
    g.clear();
    top.clear();
    g.fillStyle(m.bg, m.alpha).fillCircle(cx, cy, m.radius);
    // дороги: выборка через road.step px карты, точка там, где до дороги меньше полуширины и полшага
    const roads = this.sim.roads;
    if (roads) {
      const st = m.road.step;
      const near = roads.cfg.width / 2 + st / k / 2;
      g.fillStyle(m.road.color, m.road.alpha);
      for (let y = -m.radius; y <= m.radius; y += st) {
        for (let x = -m.radius; x <= m.radius; x += st) {
          if (x * x + y * y > (m.radius - 1) * (m.radius - 1)) continue;
          if (roads.distance(p.x + x / k, p.y + y / k) >= near) continue;
          g.fillRect(cx + x - st / 2, cy + y - st / 2, st, st);
        }
      }
    }
    g.lineStyle(1, m.rim, 0.8).strokeCircle(cx, cy, m.radius);
    const r2 = (m.radius - 2) * (m.radius - 2);
    // точка на карте или null, если вне круга
    const at = (x, y) => {
      const mx = (x - p.x) * k;
      const my = (y - p.y) * k;
      return mx * mx + my * my > r2 ? null : { x: Math.round(cx + mx), y: Math.round(cy + my) };
    };
    let used = 0;
    for (const pk of this.sim.pickups) {
      const size = m.icons[pk.type]; // по типу предмета (food, а не kind heal)
      const q = size && at(pk.x, pk.y);
      if (!q || !this.scene.textures.exists(pk.sprite)) continue;
      let img = this.mapIcons[used];
      if (!img) {
        img = this.mapAdd(this.scene.add.image(0, 0, '__DEFAULT')).setScale(0.5).setAlpha(this.mapAlpha);
        this.mapIcons.push(img);
      }
      // спрайт предмета, один раз уменьшенный под размер (как иконки оружия)
      img.setTexture(sizedTexture(this.scene, pk.sprite, size * 2));
      img.setPosition(q.x, q.y).setVisible(true);
      used++;
    }
    for (let i = used; i < this.mapIcons.length; i++) this.mapIcons[i].setVisible(false);
    for (const e of this.sim.enemies) {
      if (e.dead || !(e.boss || e.elite)) continue;
      const q = at(e.x, e.y);
      if (!q) continue;
      if (e.boss) this._skull(top, q.x, q.y, m.dots.skull);
      else this._skull(top, q.x, q.y, m.dots.elite); // элитка: тот же череп, красный
    }
    this.sim.players.forEach((pl, i) => {
      const q = at(pl.x, pl.y);
      if (!q) return;
      if (pl.dead) {
        top.fillStyle(m.dots.coffin, 1).fillRect(q.x - 1, q.y - 1, 2, 2);
        return;
      }
      const color = i === this.sim.local ? m.arrow.self : m.arrow.ally;
      this._arrow(top, q.x, q.y, pl.dirX, pl.dirY, color);
    });
  }

  // Стрелка-«галочка» по направлению (dx, dy): острие вперёд, вырез сзади, чёрная обводка.
  _arrow(g, x, y, dx, dy, color) {
    const a = HUD.minimap.arrow;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const pt = (f, s) => ({ x: x + ux * f - uy * s, y: y + uy * f + ux * s });
    const back = -a.len * 0.7;
    const shape = [pt(a.len, 0), pt(back, a.half), pt(-a.len * 0.25, 0), pt(back, -a.half)];
    g.fillStyle(color, 1).fillPoints(shape, true);
    g.lineStyle(1, 0x000000, 1).strokePoints(shape, true);
  }

  // Череп босса 7×7 с чёрной обводкой: глаза и зубы — пустые клетки.
  _skull(g, x, y, color) {
    const rows = ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#.#.#.'];
    const x0 = x - 3;
    const y0 = y - 3;
    g.fillStyle(0x000000, 1).fillRect(x0 - 1, y0 - 1, 9, rows.length + 2);
    g.fillStyle(color, 1);
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) if (r[i] === '#') g.fillRect(x0 + i, y0 + j, 1, 1);
    });
  }

  // Панель DPS-метра: рамка как у миникарты, строка общего DPS сверху, затем до maxRows строк оружия,
  // лучшие по DPS (порядок и подписи обновляются раз в секунду вместе с числами).
  _rebuildDps() {
    for (const o of this.dpsObjs) o.destroy();
    this.dpsObjs = [];
    this.dpsRows = [];
    if (this.dpsMode === 'off') return;
    const m = HUD.dpsMeter;
    const n = Math.min(m.maxRows, this._weaponIds().length);
    const h = (n + 1) * m.rowH + m.pad * 2;
    const left = GAME_WIDTH - m.margin - m.width;
    const top = GAME_HEIGHT - m.margin - h;
    const add = (o) => {
      o.setScrollFactor(0).setDepth(D).setAlpha(this.dpsAlpha);
      this.dpsObjs.push(o);
      return o;
    };
    const frame = add(this.scene.add.graphics());
    frame.fillStyle(m.bg, m.alpha).fillRect(left, top, m.width, h);
    frame.lineStyle(1, m.rim, 0.8).strokeRect(left + 0.5, top + 0.5, m.width - 1, h - 1);
    const style = (color) => textStyle(8, color, { stroke: '#000000', strokeThickness: 2 });
    for (let i = 0; i <= n; i++) {
      const y = top + m.pad + i * m.rowH;
      const cy = y + m.rowH / 2;
      const color = i ? m.colors[(i - 1) % m.colors.length] : m.total;
      const bar = add(this.scene.add
          .rectangle(left + m.pad, y + 1, 1, m.rowH - 2, color, m.barAlpha).setOrigin(0, 0));
      const label = add(this.scene.add.text(left + m.pad + (i ? m.icon + 5 : 2), cy,
          i ? '' : t('hud.dps_label'), style(i ? '#ffffff' : '#ffd84a')).setOrigin(0, 0.5));
      const num = add(this.scene.add.text(left + m.width - m.pad - 2, cy, '', style('#ffffff'))
          .setOrigin(1, 0.5));
      this.dpsRows.push({
        id: null, bar, label, num, icon: null, ix: left + m.pad + m.icon / 2 + 1, iy: cy,
      });
    }
    this.dpsShown = null;
  }

  _updateDps() {
    // свой игрок (в коопе урон напарника не показываем, как в соло)
    const me = this.sim.players[this.sim.local];
    if (me.dpsByWeapon === this.dpsShown) return; // sim меняет объект раз в секунду
    this.dpsShown = me.dpsByWeapon;
    const m = HUD.dpsMeter;
    const full = m.width - m.pad * 2;
    const total = me.dps;
    const byW = me.dpsByWeapon;
    const order = this._weaponIds().sort((a, b) => (byW[b] || 0) - (byW[a] || 0));
    if (this.dpsRows.length !== Math.min(m.maxRows, order.length) + 1) this._rebuildDps();
    this.dpsRows.forEach((r, i) => {
      const id = i ? order[i - 1] : null;
      if (i && !id) return;
      const v = i ? (byW[id] || 0) : total;
      r.bar.width = Math.max(1, Math.round(full * (total > 0 ? v / total : 0)));
      r.num.setText(String(Math.round(v)));
      if (i && r.id !== id) {
        r.id = id;
        r.label.setText(displayName('weapon', id));
        if (r.icon) r.icon.destroy();
        r.icon = addIcon(this.scene, r.ix, r.iy, iconKeyFor('weapon', id), m.icon, 'weapon', id)
            .setScrollFactor(0).setDepth(D).setAlpha(this.dpsAlpha);
        this.dpsObjs.push(r.icon);
      }
    });
  }

  // Оружия своего игрока.
  _weaponIds() {
    return this.sim.players[this.sim.local].weapons.map((w) => w.id);
  }

  _rebuildSlots() {
    for (const s of this.slots) s.destroy();
    this.slots = [];
    this._rebuildDps();
    const p = this.sim.players[this.sim.local];
    const row = (list, kind, y) => {
      list.forEach((it, i) => {
        const x = 14 + i * 28;
        const c = addIcon(this.scene, x, y, iconKeyFor(kind, it.id), 16, kind, it.id);
        const lv = this.scene.add.text(x + 10, y, String(it.level), textStyle(10, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0, 0.5);
        for (const o of [c, lv]) { o.setScrollFactor(0).setDepth(D); this.slots.push(o); }
      });
    };
    row(p.weapons, 'weapon', 48);
    row(p.passives, 'passive', 68);
  }

  /** @param {?string} key ключ i18n строки по центру экрана, null — скрыть */
  setNotice(key) {
    if (this.notice === key) return;
    this.notice = key;
    this.waitText.setVisible(!!key);
    if (key) this.waitText.setText(t(key));
  }

  update() {
    const sim = this.sim;
    const p = sim.players[sim.local];
    const shared = sim.player; // опыт и уровень общие
    const xpK = Math.min(1, shared.xp / Math.max(1, shared.xpNext));
    this.xpFill.width = Math.round(GAME_WIDTH * xpK);
    this.levelText.setText(t('hud.level', { n: shared.level }));
    if (p.dead) {
      // кооп: свой гроб — вместо HP таймер оживления, полоска заполняется к оживлению
      const k = 1 - p.coffinT / COOP.reviveTime;
      this.hpFill.width = Math.round(100 * Math.max(0, Math.min(1, k)));
      this.hpText.setText(t('hud.revive', { s: Math.ceil(p.coffinT) }));
    } else {
      this.hpFill.width = Math.round(100 * Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp))));
      this.hpText.setText(`${Math.ceil(Math.max(0, p.hp))}/${Math.ceil(p.maxHp)}`);
    }
    this.timeText.setText(formatTime(sim.time));
    const score = computeScore({
      time: sim.time, kills: sim.kills, coins: sim.coins, victory: sim.won,
    });
    this.scoreText.setText(t('hud.score', { n: score }));
    // слоты и строки DPS пересобираются раньше обновления DPS: после эволюции оружия стало меньше, чем строк
    const sig = p.weapons.map((w) => `${w.id}${w.level}`).join() + '|' + p.passives.map((w) => `${w.id}${w.level}`).join();
    if (sig !== this.slotSig) {
      this.slotSig = sig;
      this._rebuildSlots();
    }
    if (this.dpsMode !== 'off') this._updateDps();
    if (sim.time >= this.mapNext) {
      this.mapNext = sim.time + 1 / HUD.minimap.fps;
      this._drawMap();
    }
    this._updateBoss();
    const showBanner = sim.time < this.bannerUntil;
    this.banner.setVisible(showBanner && Math.floor((sim.time - this.bannerStart) * 3) % 2 === 0);
    this.bannerSub.setVisible(showBanner && this.bannerSub.text !== '');
  }
}
