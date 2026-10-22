// HUD: HP, XP, уровень, таймер, убийства, иконки оружия и пассивок, кнопка паузы на таче.
import { GAME_WIDTH, HUD } from '../data/constants.js';
import { t, hasKey } from '../i18n/index.js';
import { textStyle, COLORS } from './style.js';
import { addIcon, iconKeyFor } from './icons.js';

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
    this.killText = add(scene.add.text(GAME_WIDTH - 8, 20, '', textStyle(12, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(1, 0));

    this.coinText = add(scene.add.text(GAME_WIDTH - 8, 34, '', textStyle(12, '#ffd84a', { stroke: '#000000', strokeThickness: 3 })).setOrigin(1, 0));

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
      const x = GAME_WIDTH - 22;
      const r = add(scene.add.rectangle(x, 68, 28, 28, 0x000000, 0.5).setStrokeStyle(2, 0xffffff));
      add(scene.add.text(x, 68, t('hud.pause'), textStyle(14)).setOrigin(0.5));
      r.setInteractive();
      r.on('pointerdown', (p, lx, ly, ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (onPause) onPause(); });
      this.pauseRect = r;
    }
  }

  // Область кнопки паузы (для ввода: тут джойстик не стартует).
  isOnPauseButton(x, y) {
    return !!this.pauseRect && x > GAME_WIDTH - 40 && y > 50 && y < 86;
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

  _rebuildSlots() {
    for (const s of this.slots) s.destroy();
    this.slots = [];
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
    this.killText.setText(t('hud.kills', { n: sim.kills }));
    this.coinText.setText(t('hud.coins', { n: sim.coins || 0 }));
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
