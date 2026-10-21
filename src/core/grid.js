// Пространственная сетка (хеш по ячейкам, без аллокаций при перестройке).
// Элементы — целочисленные id (обычно индекс в массиве врагов). Мир считается бесконечным:
// ячейки хешируются по модулю размера таблицы, поэтому запрос может вернуть лишних кандидатов
// из далёких ячеек; точную проверку расстояния делает вызывающий (или queryCircle).

export class Grid {
  constructor(cellSize = 64, bits = 7, capacity = 1024) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.n = 1 << bits;
    this.mask = this.n - 1;
    this.head = new Int32Array(this.n * this.n).fill(-1);
    this.next = new Int32Array(capacity);
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
  }

  clear() {
    this.head.fill(-1);
  }

  insert(id, x, y) {
    if (id >= this.next.length) this._grow(id + 1);
    const cx = Math.floor(x * this.inv) & this.mask;
    const cy = Math.floor(y * this.inv) & this.mask;
    const b = cy * this.n + cx;
    this.next[id] = this.head[b];
    this.head[b] = id;
    this.xs[id] = x;
    this.ys[id] = y;
  }

  // Кандидаты из ячеек, пересекающих квадрат [x-r, x+r] x [y-r, y+r]. Пишет id в out, возвращает число.
  query(x, y, r, out) {
    const inv = this.inv;
    const n = this.n;
    const x0 = Math.floor((x - r) * inv);
    const y0 = Math.floor((y - r) * inv);
    let x1 = Math.floor((x + r) * inv);
    let y1 = Math.floor((y + r) * inv);
    if (x1 - x0 >= n) x1 = x0 + n - 1;
    if (y1 - y0 >= n) y1 = y0 + n - 1;
    const cap = out.length;
    let count = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const row = (cy & this.mask) * n;
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.head[row + (cx & this.mask)]; i !== -1; i = this.next[i]) {
          if (count >= cap) return count;
          out[count++] = i;
        }
      }
    }
    return count;
  }

  // То же, но с точной проверкой расстояния по сохранённым координатам.
  queryCircle(x, y, r, out) {
    const cnt = this.query(x, y, r, out);
    const r2 = r * r;
    let k = 0;
    for (let i = 0; i < cnt; i++) {
      const id = out[i];
      const dx = this.xs[id] - x;
      const dy = this.ys[id] - y;
      if (dx * dx + dy * dy <= r2) out[k++] = id;
    }
    return k;
  }

  _grow(min) {
    let cap = this.next.length;
    while (cap < min) cap *= 2;
    const next = new Int32Array(cap); next.set(this.next);
    const xs = new Float32Array(cap); xs.set(this.xs);
    const ys = new Float32Array(cap); ys.set(this.ys);
    this.next = next; this.xs = xs; this.ys = ys;
  }
}
