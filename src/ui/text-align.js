// Центровка текста по нарисованным пикселям, а не по метрикам шрифта: метрики Jersey 15 в разных браузерах
// дают сдвиг на 1 px, и цифры в значках сползали. После каждой отрисовки текста:
//   по X при originX 0.5 центр берётся по краям чернил самой строки;
//   по Y при originY 0.5 — по полосе заглавных и цифр (пробный «H0» того же стиля), чтобы хвосты g, y не тянули строку вверх.
// Точка опоры округляется до целого пикселя холста: при целой позиции текст не размазывается между пикселями.
const probes = new Map();

function inkBox(canvas, rows = true) {
  const { width: w, height: h } = canvas;
  if (!w || !h) return null;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (rows) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}

// Полоса заглавных для стиля: у одного стиля одинаковые отступы, базовая линия и обводка, поэтому её строки совпадают.
function capBand(text) {
  const s = text.style;
  const key = [s.fontFamily, s.fontSize, s.strokeThickness, s.resolution, JSON.stringify(s.metrics), JSON.stringify(text.padding)].join('|');
  if (!probes.has(key)) {
    const probe = new Phaser.GameObjects.Text(text.scene, 0, 0, '', s.toJSON());
    probe._probe = true;
    probe.setPadding(text.padding);
    probe.setText('H0');
    probes.set(key, inkBox(probe.canvas));
    probe.destroy();
  }
  return probes.get(key);
}

export function installTextAlign() {
  const T = Phaser.GameObjects.Text.prototype;
  const baseUpdateText = T.updateText;
  const baseOrigin = T.updateDisplayOrigin;
  T.updateText = function updateText() {
    baseUpdateText.call(this);
    if (this._probe || !this.scene) return this;
    this._ink = null;
    if (this.originX === 0.5 || this.originY === 0.5) {
      const ink = inkBox(this.canvas, false);
      this._ink = ink && { x: ink, y: this.originY === 0.5 ? capBand(this) : null };
    }
    this.updateDisplayOrigin();
    return this;
  };
  T.updateDisplayOrigin = function updateDisplayOrigin() {
    baseOrigin.call(this);
    const res = (this.style && this.style.resolution) || 1;
    const ink = this._ink;
    // canvas текста в px холста (resolution), точка опоры в px мира
    if (ink && this.originX === 0.5 && ink.x) {
      this._displayOriginX = (ink.x.x0 + ink.x.x1 + 1) / 2 / res;
    }
    if (ink && this.originY === 0.5 && ink.y) {
      this._displayOriginY = (ink.y.y0 + ink.y.y1 + 1) / 2 / res;
    }
    this._displayOriginX = Math.round(this._displayOriginX * res) / res;
    this._displayOriginY = Math.round(this._displayOriginY * res) / res;
    return this;
  };
}
