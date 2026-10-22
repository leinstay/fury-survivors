// Иконки оружия/пассивок. Нет текстуры: цветной квадрат с первой буквой названия.
import { t, hasKey } from '../i18n/index.js';
import { textStyle } from './style.js';
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { RENDER_ZOOM } from '../data/constants.js';

function colorFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return Phaser.Display.Color.HSVToRGB((h % 360) / 360, 0.55, 0.75).color;
}

export function nameKey(kind, id) {
  if (kind === 'heal') return 'card.heal.name';
  return `${kind}.${id}.name`;
}

export function displayName(kind, id) {
  const k = nameKey(kind, id);
  return hasKey(k) ? t(k) : id;
}

// Иконка лежит в манифесте крупнее любого показа. Под каждый размер на холсте она один раз плавно уменьшается
// в отдельную текстуру (альфа порогом, как в tools/hd-frames.mjs) и рисуется 1:1, без растяжения пикселей.
function sizedTexture(scene, key, px) {
  const id = `${key}@${px}`;
  if (scene.textures.exists(id)) return id;
  const src = scene.textures.get(key).getSourceImage();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const k = px / Math.max(src.width, src.height);
  const w = Math.round(src.width * k);
  const h = Math.round(src.height * k);
  g.drawImage(src, Math.floor((px - w) / 2), Math.floor((px - h) / 2), w, h);
  const im = g.getImageData(0, 0, px, px);
  for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 110 ? 255 : 0;
  g.putImageData(im, 0, 0);
  scene.textures.addCanvas(id, canvas);
  return id;
}

// Возвращает Container размером size×size с центром в (x, y). iconKey может быть пустым.
export function addIcon(scene, x, y, iconKey, size, kind, id) {
  const c = scene.add.container(x, y);
  if (iconKey && scene.textures.exists(iconKey)) {
    const img = scene.add.image(0, 0, sizedTexture(scene, iconKey, size * RENDER_ZOOM));
    img.setScale(1 / RENDER_ZOOM);
    c.add(img);
  } else {
    const box = scene.add.rectangle(0, 0, size, size, colorFor(id || 'x')).setStrokeStyle(1, 0x000000);
    const letter = String(displayName(kind, id) || '?').charAt(0).toUpperCase();
    const txt = scene.add.text(0, 0, letter, textStyle(Math.max(8, Math.round(size * 0.6)), '#ffffff', { stroke: '#000000', strokeThickness: 2 })).setOrigin(0.5);
    c.add([box, txt]);
  }
  return c;
}

// Ключ иконки из data; если записи нет, соглашение icon_<id>.
export function iconKeyFor(kind, id) {
  const def = kind === 'weapon' ? WEAPONS[id] : kind === 'passive' ? PASSIVES[id] : null;
  return (def && def.icon) || `icon_${id}`;
}
