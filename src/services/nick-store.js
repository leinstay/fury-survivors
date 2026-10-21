// Запоминание ника в localStorage. Без DOM на импорте: всё через globalThis и в try.
import { NICK } from '../data/leaderboard.js';

export function readNick() {
  try {
    const s = (globalThis.localStorage && globalThis.localStorage.getItem(NICK.storageKey)) || '';
    return s.toUpperCase();
  } catch {
    return '';
  }
}

export function writeNick(value) {
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(NICK.storageKey, value);
  } catch { /* ник просто не запомнится */ }
}
