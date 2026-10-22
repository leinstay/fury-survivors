// Проверка ника для таблицы рекордов. Чистая функция, без DOM.
import { NICK, PAIR } from '../data/leaderboard.js';

/**
 * Обрезаются только края. Длина проверяется до набора символов. Принятый ник возвращается
 * в верхнем регистре (toUpperCase после проверок, поэтому длина не меняется).
 * @param {*} raw введённый ник
 * @return {{ok: boolean, value: (string|undefined), error: (string|undefined)}}
 *     { ok: true, value } или { ok: false, error: 'short'|'long'|'chars' }
 */
export function validateNick(raw) {
  const value = String(raw ?? '').trim();
  if (value.length < NICK.min) return { ok: false, error: 'short' };
  if (value.length > NICK.max) return { ok: false, error: 'long' };
  if (!NICK.re.test(value)) return { ok: false, error: 'chars' };
  return { ok: true, value: value.toUpperCase() };
}

/**
 * Имя пары для таблицы коопа: оба ника проходят validateNick, хост первым.
 * @param {*} host
 * @param {*} guest
 * @return {{ok: boolean, value: (string|undefined), error: (string|undefined)}}
 */
export function pairName(host, guest) {
  const a = validateNick(host);
  if (!a.ok) return a;
  const b = validateNick(guest);
  if (!b.ok) return b;
  return { ok: true, value: `${a.value}${PAIR.sep}${b.value}` };
}

/**
 * Проверка имени записи в таблице: соло — ник, кооп — пара.
 * @param {*} raw
 * @param {string=} mode 'solo' | 'coop'
 * @return {{ok: boolean, value: (string|undefined), error: (string|undefined)}}
 */
export function validateName(raw, mode = 'solo') {
  if (mode !== 'coop') return validateNick(raw);
  const parts = String(raw ?? '').split(PAIR.sep);
  if (parts.length !== 2) return { ok: false, error: 'chars' };
  return pairName(parts[0], parts[1]);
}
