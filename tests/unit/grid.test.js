import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../../src/core/grid.js';

test('grid: query finds neighbours and skips far cells', () => {
  const g = new Grid(64);
  g.insert(0, 10, 10);
  g.insert(1, 50, 20);
  g.insert(2, 1000, 1000);
  const out = new Int32Array(16);
  const n = g.query(20, 20, 40, out);
  const ids = Array.from(out.subarray(0, n)).sort();
  assert.deepEqual(ids, [0, 1]);
});

test('grid: queryCircle filters by exact distance', () => {
  const g = new Grid(64);
  g.insert(0, 0, 0);
  g.insert(1, 30, 0);
  g.insert(2, 60, 0); // та же область ячеек, но дальше радиуса
  const out = new Int32Array(16);
  const n = g.queryCircle(0, 0, 35, out);
  assert.deepEqual(Array.from(out.subarray(0, n)).sort(), [0, 1]);
});

test('grid: negative coordinates and clear', () => {
  const g = new Grid(64);
  g.insert(0, -10, -10);
  g.insert(1, 10, 10);
  const out = new Int32Array(16);
  assert.equal(g.queryCircle(0, 0, 20, out), 2);
  g.clear();
  assert.equal(g.query(0, 0, 200, out), 0);
});

test('grid: grows beyond initial capacity and never returns duplicates', () => {
  const g = new Grid(64, 7, 4);
  for (let i = 0; i < 300; i++) g.insert(i, (i % 20) * 7, Math.floor(i / 20) * 7);
  const out = new Int32Array(1024);
  const n = g.query(70, 50, 100000, out); // запрос шире таблицы
  const set = new Set(Array.from(out.subarray(0, n)));
  assert.equal(set.size, n);
  assert.equal(n, 300);
});
