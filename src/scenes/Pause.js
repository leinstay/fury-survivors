import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton, readPad } from '../ui/focus.js';
import { addVolumeSliders } from '../ui/volume.js';
import { addIcon, displayName, iconKeyFor } from '../ui/icons.js';
import { textStyle } from '../ui/style.js';
import { addPanel } from '../ui/panel.js';
import { playSfx } from '../audio/sfx.js';

// Билд в две колонки (оружие слева, пассивки справа): 6+6 строк не налезают на кнопки.
export function addBuildList(scene, x, y, player) {
  addPanel(scene, x + 150, y + 82, 308, 172);
  scene.add.text(x + 8, y + 4, t('pause.build'), textStyle(14, '#ffd84a')).setOrigin(0, 0);
  [
    ['weapon', t('pause.weapons'), player.weapons, x + 8],
    ['passive', t('pause.passives'), player.passives, x + 164],
  ].forEach(([kind, title, list, cx]) => {
    let cy = y + 26;
    scene.add.text(cx, cy, title, textStyle(10, '#aaaaaa')).setOrigin(0, 0);
    cy += 14;
    if (!list.length) scene.add.text(cx + 4, cy, t('pause.none'), textStyle(10, '#777777')).setOrigin(0, 0);
    for (const it of list) {
      addIcon(scene, cx + 7, cy + 7, iconKeyFor(kind, it.id), 14, kind, it.id);
      scene.add.text(cx + 20, cy + 7, `${displayName(kind, it.id)} ${t('levelup.lv', { n: it.level })}`, textStyle(10)).setOrigin(0, 0.5);
      cy += 16;
    }
  });
}

const fmtPct = (v) => `${Math.round(v * 100)}%`;
const STAT_ROWS = [
  ['stat.hp', (s, p) => `${Math.ceil(p.hp)}/${Math.ceil(s.maxHp ?? p.maxHp)}`],
  ['stat.atk', (s) => fmtPct(s.atk ?? 1)],
  ['stat.spd', (s) => String(Math.round(s.speed ?? 0))],
  ['stat.crt', (s) => fmtPct(s.crit ?? 0)],
  ['stat.pickup', (s) => fmtPct(s.pickup ?? 1)],
  ['stat.haste', (s) => fmtPct(s.haste ?? 1)],
  ['stat.luck', (s) => fmtPct(s.luck ?? 1)],
  ['stat.armor', (s) => String(Math.round((s.armor ?? 0) * 10) / 10)],
];

// Компактный блок статов: 2 колонки по 4 строки.
export function addStatsBlock(scene, x, y, player) {
  const stats = player.stats || {};
  addPanel(scene, x + 150, y + 36, 300, 82);
  STAT_ROWS.forEach(([key, fn], i) => {
    const cx = x + 10 + Math.floor(i / 4) * 148;
    const cy = y + 4 + (i % 4) * 18;
    scene.add.text(cx, cy, t(key), textStyle(10, '#aaaaaa')).setOrigin(0, 0);
    scene.add.text(cx + 136, cy, fn(stats, player), textStyle(10)).setOrigin(1, 0);
  });
}

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  init(data) {
    this.sim = data.sim;
  }

  create() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0, 0);
    this.add.text(GAME_WIDTH / 2, 28, t('pause.title'), textStyle(24, '#ffd84a', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    this.nav = new FocusNav(this, { onBack: () => this.resume() });
    const pad = readPad();
    this.padStart = !!(pad && pad.start);

    const cx = 170;
    addButton(this, this.nav, { x: cx, y: 90, w: 180, h: 30, label: t('pause.resume'), onSelect: () => this.resume() });
    addVolumeSliders(this, this.nav, { x: cx, y: 140, w: 280 });
    addButton(this, this.nav, { x: cx, y: 240, w: 180, h: 30, label: t('pause.quit'), onSelect: () => this.quit() });
    // В овертайме забег можно закончить сразу: победа с текущими очками.
    if (this.sim.overtime >= 0) {
      addButton(this, this.nav, { x: cx, y: 276, w: 180, h: 30, label: t('pause.finish'), color: '#ffd84a', onSelect: () => this.finish() });
    }
    addStatsBlock(this, 20, 262, this.sim.player);
    addBuildList(this, 330, 56, this.sim.player);

    this.input.keyboard.on('keydown-P', () => this.resume());
  }

  update(time) {
    this.nav.update(time);
    const pad = readPad();
    const start = !!(pad && pad.start);
    if (start && !this.padStart) this.resume();
    this.padStart = start;
  }

  resume() {
    this.scene.resume('Game');
    this.scene.stop();
  }

  finish() {
    this.sim.finishOvertime();
    playSfx(this, 'victory');
    this.resume();
  }

  quit() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
