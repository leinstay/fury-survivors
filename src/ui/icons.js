// Иконки оружия/пассивок. Нет текстуры: цветной квадрат с первой буквой названия.
import { t, hasKey } from '../i18n/index.js';
import { textStyle } from './style.js';
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';

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

// Возвращает Container размером size×size с центром в (x, y). iconKey может быть пустым.
export function addIcon(scene, x, y, iconKey, size, kind, id) {
  const c = scene.add.container(x, y);
  if (iconKey && scene.textures.exists(iconKey)) {
    const img = scene.add.image(0, 0, iconKey, 0);
    img.setScale(size / Math.max(img.width, img.height));
    c.add(img);
  } else {
    const box = scene.add.rectangle(0, 0, size, size, colorFor(id || 'x')).setStrokeStyle(1, 0x000000);
    const letter = displayName(kind, id).charAt(0).toUpperCase();
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
