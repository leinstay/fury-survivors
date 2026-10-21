// HUD: HP, XP, уровень, таймер, убийства, иконки оружия и пассивок, кнопка паузы на таче.
import { GAME_WIDTH } from '../data/constants.js';
import { t } from '../i18n/index.js';
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

    // XP-бар на всю ширину
    add(scene.add.rectangle(0, 0, GAME_WIDTH, 10, 0x000000, 0.7).setOrigin(0, 0));
    this.xpFill = add(scene.add.rectangle(0, 0, 0, 10, COLORS.xp).setOrigin(0, 0));
    this.levelText = add(scene.add.text(GAME_WIDTH / 2, 5, '', textStyle(10, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5));

    // HP
    add(scene.add.rectangle(6, 16, 104, 12, 0x000000, 0.7).setOrigin(0, 0).setStrokeStyle(1, 0x000000));
    this.hpFill = add(scene.add.rectangle(8, 18, 100, 8, COLORS.hp).setOrigin(0, 0));
    this.hpText = add(scene.add.text(58, 22, '', textStyle(10, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5));

    this.timeText = add(scene.add.text(GAME_WIDTH / 2, 20, '', textStyle(16, '#ffffff', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5, 0.5));
    this.killText = add(scene.add.text(GAME_WIDTH - 8, 16, '', textStyle(12, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(1, 0));

    this.slots = [];
    this.slotSig = '';

    if (touch) {
      const x = GAME_WIDTH - 22;
      const r = add(scene.add.rectangle(x, 48, 28, 28, 0x000000, 0.5).setStrokeStyle(2, 0xffffff));
      add(scene.add.text(x, 48, t('hud.pause'), textStyle(14)).setOrigin(0.5));
      r.setInteractive();
      r.on('pointerdown', (p, lx, ly, ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (onPause) onPause(); });
      this.pauseRect = r;
    }
  }

  // Область кнопки паузы (для ввода: тут джойстик не стартует).
  isOnPauseButton(x, y) {
    return !!this.pauseRect && x > GAME_WIDTH - 40 && y > 30 && y < 66;
  }

  _rebuildSlots() {
    for (const s of this.slots) s.destroy();
    this.slots = [];
    const p = this.sim.player;
    const row = (list, kind, y) => {
      list.forEach((it, i) => {
        const x = 14 + i * 28;
        const c = addIcon(this.scene, x, y, iconKeyFor(kind, it.id), 16, kind, it.id);
        const lv = this.scene.add.text(x + 10, y + 8, String(it.level), textStyle(10, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0, 1);
        for (const o of [c, lv]) { o.setScrollFactor(0).setDepth(D); this.slots.push(o); }
      });
    };
    row(p.weapons, 'weapon', 42);
    row(p.passives, 'passive', 62);
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
    const sig = p.weapons.map((w) => `${w.id}${w.level}`).join() + '|' + p.passives.map((w) => `${w.id}${w.level}`).join();
    if (sig !== this.slotSig) {
      this.slotSig = sig;
      this._rebuildSlots();
    }
  }
}
