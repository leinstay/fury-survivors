// Общая фокус-навигация меню: клавиатура (стрелки/WASD, Enter/Space, Esc), мышь, геймпад.
import { textStyle, COLORS } from './style.js';
import { playSfx } from '../audio/sfx.js';
import { addPanel, PANEL } from './panel.js';

// Состояние геймпада (первый подключённый) или null. Без Phaser-плагина: читаем Gamepad API напрямую.
export function readPad() {
  const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    let x = p.axes[0] || 0;
    let y = p.axes[1] || 0;
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    if (b(12)) y = -1;
    if (b(13)) y = 1;
    return { x, y, a: b(0), b: b(1), start: b(9) };
  }
  return null;
}

const KEY_DIRS = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

export class FocusNav {
  // opts.onBack: вызывается по Esc / B. opts.backKeys: false чтобы отключить Esc.
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.onBack = opts.onBack || null;
    this.items = [];
    this.index = -1;
    this.padPrev = readPad() || { x: 0, y: 0, a: false, b: false };
    this.padDir = '';
    this.padNext = 0;
    this.padActive = false;

    this._onKey = (ev) => this._key(ev);
    scene.input.keyboard.on('keydown', this._onKey);
    scene.events.once('shutdown', () => this.destroy());
  }

  // item: { x, y, w, h, onSelect?, onAdjust?(dir), onPointer?(pointer), setFocus(bool), disabled? }
  add(item) {
    const zone = this.scene.add.zone(item.x, item.y, item.w, item.h)
        .setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { if (!item.disabled) this.focus(this.items.indexOf(item)); });
    zone.on('pointerdown', (p) => {
      if (item.disabled) return;
      this.focus(this.items.indexOf(item));
      if (item.onPointer) item.onPointer(p);
      else if (item.onSelect) { playSfx(this.scene, 'ui_select'); item.onSelect(); }
    });
    zone.on('pointermove', (p) => { if (p.isDown && item.onPointer && !item.disabled) item.onPointer(p); });
    item.zone = zone;
    this.items.push(item);
    if (this.index < 0 && !item.disabled) this.focus(this.items.length - 1);
    return item;
  }

  clear() {
    for (const it of this.items) it.zone.destroy();
    this.items = [];
    this.index = -1;
  }

  focus(i) {
    if (i < 0 || i >= this.items.length) return;
    if (this.index >= 0 && this.items[this.index]) this.items[this.index].setFocus(false);
    const changed = this.index >= 0 && this.index !== i;
    this.index = i;
    this.items[i].setFocus(true);
    if (changed && this.items.length > 1 && !this.silent) playSfx(this.scene, 'ui_move');
  }

  // Если фокус стоит на отключённом пункте, переносит на ближайший живой.
  refocus() {
    const cur = this.items[this.index];
    if (cur && !cur.disabled) { cur.setFocus(true); return; }
    const i = this.items.findIndex((it) => !it.disabled);
    if (i >= 0) this.focus(i);
  }

  move(dx, dy) {
    const cur = this.items[this.index];
    if (!cur) return;
    let best = -1;
    let bestScore = Infinity;
    this.items.forEach((it, i) => {
      if (it === cur || it.disabled) return;
      const vx = it.x - cur.x;
      const vy = it.y - cur.y;
      const along = vx * dx + vy * dy;
      const across = Math.abs(vx * dy) + Math.abs(vy * dx);
      if (along <= 1) return;
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) this.focus(best);
  }

  select() {
    const it = this.items[this.index];
    if (it && !it.disabled && it.onSelect) { playSfx(this.scene, 'ui_select'); it.onSelect(); }
  }

  _dir(dx, dy) {
    const it = this.items[this.index];
    if (it && it.onAdjust && dx !== 0 && !it.disabled) { it.onAdjust(dx); return; }
    this.move(dx, dy);
  }

  _back() {
    playSfx(this.scene, 'ui_back');
    this.onBack();
  }

  _key(ev) {
    // Пока фокус в DOM-поле (ввод ника), клавиши меню не срабатывают.
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    const d = KEY_DIRS[ev.code];
    if (d) { this._dir(d[0], d[1]); return; }
    if (ev.repeat) return;
    if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'NumpadEnter') this.select();
    else if (ev.code === 'Escape' && this.onBack) this._back();
  }

  // Вызывать из update() сцены: опрос геймпада.
  update(time) {
    const p = readPad();
    if (!p) return;
    const prev = this.padPrev;
    if (p.a && !prev.a) this.select();
    if (p.b && !prev.b && this.onBack) this._back();
    const dx = p.x > 0.5 ? 1 : p.x < -0.5 ? -1 : 0;
    const dy = p.y > 0.5 ? 1 : p.y < -0.5 ? -1 : 0;
    const key = `${dx},${dy}`;
    if (dx === 0 && dy === 0) {
      this.padDir = '';
    } else if (key !== this.padDir) {
      this.padDir = key;
      this.padNext = time + 300;
      // по диагонали приоритет вертикали (меню чаще вертикальные)
      if (dy !== 0) this._dir(0, dy); else this._dir(dx, 0);
    } else if (time >= this.padNext) {
      this.padNext = time + 120;
      if (dy !== 0) this._dir(0, dy); else this._dir(dx, 0);
    }
    this.padPrev = p;
  }

  destroy() {
    if (this.scene.input && this.scene.input.keyboard) this.scene.input.keyboard.off('keydown', this._onKey);
  }
}

// Кнопка-прямоугольник с текстом. Возвращает item (можно менять item.disabled и вызывать item.setLabel).
// selected: выбранный вариант из нескольких (сложность в лобби) — заливка фокуса и зелёная рамка, когда не в фокусе.
export function addButton(scene, nav,
    { x, y, w, h, label, onSelect, size = 14, color = '#ffffff', selected = false }) {
  const rect = addPanel(scene, x, y, w, h);
  const text = scene.add.text(x, y, label, textStyle(size, color)).setOrigin(0.5);
  const item = {
    x, y, w, h, onSelect, rect, text, disabled: false,
    setFocus(f) {
      if (!f && selected) rect.draw(PANEL.fillFocus, PANEL.borderSelected);
      else rect.setFocus(f);
    },
    setLabel(s) { text.setText(s); },
    setDisabled(d) {
      item.disabled = d;
      text.setAlpha(d ? 0.4 : 1);
      rect.setAlpha(d ? 0.5 : 1);
    },
  };
  item.setFocus(false);
  return nav.add(item);
}

// Слайдер 0..1 с шагом 0.1. get()/set(v) работают с настройками.
export function addSlider(scene, nav, { x, y, w, h = 24, label, get, set }) {
  const rect = addPanel(scene, x, y, w, h);
  const labelText = scene.add.text(x - w / 2 + 8, y, label, textStyle(12)).setOrigin(0, 0.5);
  const trackW = Math.round(w * 0.42);
  const trackX = x + w / 2 - trackW - 44;
  scene.add.rectangle(trackX, y, trackW, 6, 0x000000)
      .setOrigin(0, 0.5).setStrokeStyle(1, COLORS.stroke);
  const fill = scene.add.rectangle(trackX, y, 0, 6, 0xffd84a).setOrigin(0, 0.5);
  const valueText = scene.add.text(x + w / 2 - 8, y, '', textStyle(12)).setOrigin(1, 0.5);
  const refresh = () => {
    const v = get();
    fill.width = Math.round(trackW * v);
    valueText.setText(`${Math.round(v * 100)}%`);
  };
  const item = {
    x, y, w, h, rect, labelText, disabled: false,
    setFocus(f) { rect.setFocus(f); },
    onAdjust(dir) { set(get() + dir * 0.1); refresh(); },
    onPointer(p) {
      const v = (p.worldX - trackX) / trackW; // worldX учитывает зум камеры
      set(Math.min(1, Math.max(0, v)));
      refresh();
    },
    refresh,
  };
  refresh();
  item.setFocus(false);
  return nav.add(item);
}
