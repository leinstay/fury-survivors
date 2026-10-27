// Цифры чисел урона одной картинкой: шрифт игры с тёмной обводкой рисуется один раз в текстуру и регистрируется
// как bitmap-шрифт. Число урона — BitmapText: новое значение меняет только квадраты букв, без перерисовки канваса и
// загрузки текстуры в GPU (Text делал это на каждое попадание и каждую смену цвета или размера — тысячи раз в
// секунду на поздних минутах). Цифры белые, цвет — setTint (обводка тёмная, тинт её почти не меняет).
// Текстура в RENDER_ZOOM раз крупнее, BitmapText показывается с масштабом 1 / RENDER_ZOOM: 1:1 к пикселям экрана.
import { RENDER_ZOOM } from '../data/constants.js';
import { FONT } from '../ui/style.js';

const CHARS = '0123456789-+';
const FONT_SCALE = 1.15; // как textStyle (ui/style.js): размер в «пунктах игры» → px шрифта

/**
 * Bitmap-шрифт цифр размера size (как в textStyle) с обводкой stroke px. Ключ шрифта возвращается; повторный
 * вызов с теми же параметрами отдаёт уже готовый.
 * @param {!Phaser.Scene} scene
 * @param {number} size
 * @param {string} strokeColor
 * @param {number} stroke
 * @return {string}
 */
export function digitFont(scene, size, strokeColor, stroke) {
  const key = `digits_${size}_${strokeColor.replace('#', '')}_${stroke}`;
  if (scene.cache.bitmapFont.exists(key)) return key;
  const z = RENDER_ZOOM;
  const px = Math.round(size * FONT_SCALE) * z;
  const sw = stroke * z;
  const pad = sw + 2; // поле вокруг цифры под обводку
  const GAP = 4 * z;   // пустота между клетками атласа: обводка соседней цифры не попадает в чужую клетку
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `${px}px ${FONT}`;
  const widths = [...CHARS].map((c) => {
    const m = probe.measureText(c);
    const box = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
    return Math.ceil(Math.max(m.width, box));
  });
  const cellH = px + 2 * pad;
  const cells = widths.map((w) => w + 2 * pad);
  const W = cells.reduce((a, b) => a + b + GAP, 0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = cellH;
  const g = canvas.getContext('2d');
  g.font = `${px}px ${FONT}`;
  g.textBaseline = 'top';
  g.lineJoin = 'round';
  g.lineWidth = sw;
  g.strokeStyle = strokeColor;
  g.fillStyle = '#ffffff';
  const chars = {};
  let x = 0;
  [...CHARS].forEach((c, i) => {
    const cw = cells[i];
    g.strokeText(c, x + pad, pad);
    g.fillText(c, x + pad, pad);
    chars[c.charCodeAt(0)] = {
      x, y: 0, width: cw, height: cellH,
      centerX: Math.floor(cw / 2), centerY: Math.floor(cellH / 2),
      xOffset: 0, yOffset: 0, xAdvance: cw - 2 * pad + Math.round(sw / 2), data: {}, kerning: {},
      u0: x / W, v0: 0, u1: (x + cw) / W, v1: 1,
    };
    x += cw + GAP;
  });
  scene.textures.addCanvas(key, canvas);
  const data = { font: key, size: cellH, lineHeight: cellH, chars };
  scene.cache.bitmapFont.add(key, { data, texture: key, frame: null });
  return key;
}
