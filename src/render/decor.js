// Декор этапа (неразрушаемые props: деревья, камни, кусты, цветы). Только рендер, на игру не влияет.
// Мир делится на чанки SIM.chunkSize; содержимое чанка выводится из его координат, поэтому
// при возвращении в то же место декор стоит там же. Видимые чанки берут спрайты из пула.
import { SIM } from '../data/constants.js';
import { SPRITES } from '../../assets/sprites/manifest.js';
import { spriteScale } from './density.js';

const FLAT_DEPTH = -200000; // цветы и прочая мелочь лежат под всеми

// Небольшой детерминированный генератор по координатам чанка.
function chunkRng(cx, cy, salt) {
  let h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Decor {
  constructor(scene, stage) {
    this.scene = scene;
    this.defs = (stage.props || []).filter((p) => !p.breakable && scene.textures.exists(p.sprite));
    this.size = SIM.chunkSize;
    this.chunks = new Map(); // "cx,cy" -> [sprite]
    this.free = [];
  }

  _build(cx, cy) {
    const list = [];
    this.defs.forEach((def, di) => {
      const rnd = chunkRng(cx, cy, di);
      // density — среднее на чанк: целая часть + шанс на ещё один
      const n = Math.floor(def.density) + (rnd() < def.density % 1 ? 1 : 0);
      const spec = SPRITES[def.sprite];
      for (let i = 0; i < n; i++) {
        const s = this.free.pop() || this.scene.add.image(0, 0, def.sprite, 0);
        const frame = spec && spec.frames > 1 ? Math.floor(rnd() * spec.frames) : 0;
        s.setTexture(def.sprite, frame).setVisible(true);
        s.setOrigin(spec ? spec.origin[0] : 0.5, spec ? spec.origin[1] : 1);
        const x = Math.round((cx + rnd()) * this.size);
        const y = Math.round((cy + rnd()) * this.size);
        s.setPosition(x, y).setFlipX(rnd() < 0.5).setScale(spriteScale(def.sprite));
        s.setDepth(def.flat || def.sprite === 'flower' ? FLAT_DEPTH + y : y);
        list.push(s);
      }
    });
    return list;
  }

  update(cam) {
    const v = cam.worldView; // видимая область мира с учётом зума
    const x0 = Math.floor(v.x / this.size) - 1, x1 = Math.floor((v.x + v.width) / this.size) + 1;
    const y0 = Math.floor(v.y / this.size) - 1, y1 = Math.floor((v.y + v.height) / this.size) + 1;
    for (const [key, list] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) {
        for (const s of list) { s.setVisible(false); this.free.push(s); }
        this.chunks.delete(key);
      }
    }
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const key = `${cx},${cy}`;
      if (!this.chunks.has(key)) this.chunks.set(key, this._build(cx, cy));
    }
  }
}
