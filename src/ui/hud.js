// HUD: HP, XP, уровень, таймер, убийства, счёт, DPS-метр, миникарта, иконки оружия и пассивок, кнопка паузы на таче.
import { GAME_WIDTH, GAME_HEIGHT, HUD } from '../data/constants.js';
import { t, hasKey } from '../i18n/index.js';
import { textStyle, COLORS } from './style.js';
import { addIcon, iconKeyFor, displayName } from './icons.js';
import { getSetting } from './settings.js';
import { computeScore } from '../services/leaderboard.js';

const D = 1e6; // HUD поверх мира

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
    this.map = add(scene.add.graphics()).setAlpha(this.mapMode === 'transparent' ? HUD.transparentAlpha : 1);
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
        this.bannerSub.setText(ot ? t('hud.overtime_hint') : '');
        if (ot) this.timeText.setColor('#ffd84a');
      }
    }
  }

  _updateBoss() {
    const b = this.sim.boss;
    const alive = !!b && b.hp > 0 && !b.dead;
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

  // Миникарта: круг, в нём точками предметы (сундук, еда, магнит, монеты), элиты и боссы в радиусе range.
  _drawMap() {
    const m = HUD.minimap;
    const g = this.map;
    const cx = GAME_WIDTH - m.margin - m.radius;
    const cy = m.top + m.radius;
    const k = m.radius / m.range;
    const p = this.sim.player;
    g.clear();
    g.fillStyle(m.bg, m.alpha).fillCircle(cx, cy, m.radius);
    g.lineStyle(1, m.rim, 0.8).strokeCircle(cx, cy, m.radius);
    const r2 = m.range * m.range;
    const dot = (x, y, color, size) => {
      const dx = x - p.x;
      const dy = y - p.y;
      if (dx * dx + dy * dy > r2) return;
      const h = size >> 1;
      g.fillStyle(color, 1)
          .fillRect(Math.round(cx + dx * k) - h, Math.round(cy + dy * k) - h, size, size);
    };
    for (const pk of this.sim.pickups) {
      if (pk.kind === 'xp') continue;
      const c = m.dots[pk.kind];
      if (c !== undefined) dot(pk.x, pk.y, c, pk.kind === 'chest' ? 3 : 2);
    }
    for (const e of this.sim.enemies) {
      if (e.dead) continue;
      if (e.boss) dot(e.x, e.y, m.dots.boss, 4);
      else if (e.elite) dot(e.x, e.y, m.dots.elite, 3);
    }
    g.fillStyle(m.dots.player, 1).fillRect(cx - 1, cy - 1, 2, 2);
  }

  // Панель DPS-метра: рамка как у миникарты, строка общего DPS сверху, затем до maxRows строк оружия,
  // лучшие по DPS (порядок и подписи обновляются раз в секунду вместе с числами).
  _rebuildDps() {
    for (const o of this.dpsObjs) o.destroy();
    this.dpsObjs = [];
    this.dpsRows = [];
    if (this.dpsMode === 'off') return;
    const m = HUD.dpsMeter;
    const n = Math.min(m.maxRows, this.sim.player.weapons.length);
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
    const sim = this.sim;
    if (sim.dpsByWeapon === this.dpsShown) return; // sim меняет объект раз в секунду
    this.dpsShown = sim.dpsByWeapon;
    const m = HUD.dpsMeter;
    const full = m.width - m.pad * 2;
    const total = sim.dps;
    const byW = sim.dpsByWeapon;
    const order = sim.player.weapons.map((w) => w.id).sort((a, b) => (byW[b] || 0) - (byW[a] || 0));
    this.dpsRows.forEach((r, i) => {
      const id = i ? order[i - 1] : null;
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

  _rebuildSlots() {
    for (const s of this.slots) s.destroy();
    this.slots = [];
    this._rebuildDps();
    const p = this.sim.player;
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

  update() {
    const sim = this.sim;
    const p = sim.player;
    this.xpFill.width = Math.round(GAME_WIDTH * Math.min(1, p.xp / Math.max(1, p.xpNext)));
    this.levelText.setText(t('hud.level', { n: p.level }));
    this.hpFill.width = Math.round(100 * Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp))));
    this.hpText.setText(`${Math.ceil(Math.max(0, p.hp))}/${Math.ceil(p.maxHp)}`);
    this.timeText.setText(formatTime(sim.time));
    const score = computeScore({
      time: sim.time, kills: sim.kills, coins: sim.coins, victory: sim.won,
    });
    this.scoreText.setText(t('hud.score', { n: score }));
    if (this.dpsMode !== 'off') this._updateDps();
    if (sim.time >= this.mapNext) {
      this.mapNext = sim.time + 1 / HUD.minimap.fps;
      this._drawMap();
    }
    this._updateBoss();
    const showBanner = sim.time < this.bannerUntil;
    this.banner.setVisible(showBanner && Math.floor((sim.time - this.bannerStart) * 3) % 2 === 0);
    this.bannerSub.setVisible(showBanner && this.bannerSub.text !== '');
    const sig = p.weapons.map((w) => `${w.id}${w.level}`).join() + '|' + p.passives.map((w) => `${w.id}${w.level}`).join();
    if (sig !== this.slotSig) {
      this.slotSig = sig;
      this._rebuildSlots();
    }
  }
}
