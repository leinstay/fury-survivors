// Песчаные дороги: по чанкам рисуется canvas-текстура из формулы sim.roads (src/core/roads.js) и кладётся
// над травой, под цветами и всем остальным. Чанк без дороги текстуры не получает. Не больше одного чанка за кадр.
import { SIM, ROADS } from '../data/constants.js';

const ROAD_DEPTH = -9e6; // трава -1e7, цветы -200000

// Детерминированный шум по координате пикселя (0..1).
function noise(x, y) {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
}

export class Roads {
  constructor(scene, roads) {
    this.scene = scene;
    this.roads = roads;
    this.size = SIM.chunkSize;
    this.chunks = new Map(); // "cx,cy" -> image | null (нет дороги)
    this.queue = [];
  }

  _key(cx, cy) {
    return `road_${cx}_${cy}`;
  }

  _build(cx, cy) {
    const S = this.size;
    const x0 = cx * S;
    const y0 = cy * S;
    const r = this.roads;
    if (!r.crossesChunk(x0, y0, S)) return null;
    const c = ROADS;
    const half = r.cfg.width / 2;
    const key = this._key(cx, cy);
    const tex = this.scene.textures.createCanvas(key, S, S);
    const ctx = tex.getContext();
    const img = ctx.createImageData(S, S);
    const px = img.data;
    const tb = r.tables(x0, y0, S, S);
    let any = false;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = x0 + x;
        const wy = y0 + y;
        let d = Infinity;
        for (let i = 0; i < tb.h.length; i++) {
          const t = Math.abs(wy - tb.h[i][x]);
          if (t < d) d = t;
        }
        for (let i = 0; i < tb.v.length; i++) {
          const t = Math.abs(wx - tb.v[i][y]);
          if (t < d) d = t;
        }
        if (d >= half + c.edge) continue;
        const n = noise(wx, wy);
        // кромка: дорога растворяется в траве дизерингом
        if (d > half - c.edge && n < (d - (half - c.edge)) / (2 * c.edge)) continue;
        let col = c.base;
        const m = noise(wx >> 2, wy >> 1); // мазки 4×2 px
        if (m < 0.18) col = c.dark; else if (m > 0.84) col = c.light;
        // колея
        const inRut = d > half - c.rut - c.rutWidth && d < half - c.rut;
        if (inRut && noise(wx >> 1, wy >> 1) < 0.7) col = c.rutColor;
        if (n > 0.995) col = c.pebble;
        const o = (y * S + x) * 4;
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
        any = true;
      }
    }
    if (!any) { this.scene.textures.remove(key); return null; }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    return this.scene.add.image(x0, y0, key).setOrigin(0, 0).setDepth(ROAD_DEPTH);
  }

  update(cam) {
    const v = cam.worldView;
    const x0 = Math.floor(v.x / this.size) - 1;
    const x1 = Math.floor((v.x + v.width) / this.size) + 1;
    const y0 = Math.floor(v.y / this.size) - 1;
    const y1 = Math.floor((v.y + v.height) / this.size) + 1;
    for (const [key, img] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx < x0 - 1 || cx > x1 + 1 || cy < y0 - 1 || cy > y1 + 1) {
        if (img) { img.destroy(); this.scene.textures.remove(this._key(cx, cy)); }
        this.chunks.delete(key);
      }
    }
    // ближние к игроку чанки первыми, один чанк за кадр
    let built = 0;
    for (let cy = y0; cy <= y1 && built < 1; cy++) {
      for (let cx = x0; cx <= x1 && built < 1; cx++) {
        const key = `${cx},${cy}`;
        if (this.chunks.has(key)) continue;
        this.chunks.set(key, this._build(cx, cy));
        built++;
      }
    }
  }
}
