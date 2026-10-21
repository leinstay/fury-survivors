import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNick } from '../../src/core/nick.js';

test('nick: 3-6 ASCII letters/digits, returned in capitals', () => {
  assert.deepEqual(validateNick('  Lein  '), { ok: true, value: 'LEIN' });
  assert.deepEqual(validateNick('abc'), { ok: true, value: 'ABC' });
  assert.deepEqual(validateNick('A1b2C3'), { ok: true, value: 'A1B2C3' });
  assert.deepEqual(validateNick('007'), { ok: true, value: '007' });
  assert.equal(validateNick('ab').error, 'short');
  assert.equal(validateNick('abcdefg').error, 'long');
  assert.equal(validateNick('a b').error, 'chars');
  assert.equal(validateNick('Панда').error, 'chars');
  assert.equal(validateNick('a_b').error, 'chars');
  assert.equal(validateNick('<b>').error, 'chars');
  assert.equal(validateNick('ßßß').error, 'chars');
});

test('nick: edge cases', () => {
  assert.equal(validateNick('').error, 'short');
  assert.equal(validateNick('   ').error, 'short');
  assert.equal(validateNick(null).error, 'short');
  assert.equal(validateNick(undefined).error, 'short');
  assert.deepEqual(validateNick('\t Lein\n'), { ok: true, value: 'LEIN' });
  assert.equal(validateNick('a b c d').error, 'long');
  assert.equal(validateNick('a  b').error, 'chars');
});
