// Проверка ника для таблицы рекордов. Чистая функция, без DOM.
import { NICK } from '../data/leaderboard.js';

/**
 * validateNick(raw) -> { ok: true, value } | { ok: false, error: 'short'|'long'|'chars' }
 * Обрезаются только края. Длина проверяется до набора символов. Принятый ник возвращается
 * в верхнем регистре (toUpperCase после проверок, поэтому длина не меняется).
 */
export function validateNick(raw) {
  const value = String(raw ?? '').trim();
  if (value.length < NICK.min) return { ok: false, error: 'short' };
  if (value.length > NICK.max) return { ok: false, error: 'long' };
  if (!NICK.re.test(value)) return { ok: false, error: 'chars' };
  return { ok: true, value: value.toUpperCase() };
}
