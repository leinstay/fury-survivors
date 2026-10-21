import en from './en.js';

const langs = { en };
let current = langs.en;

export function setLang(code) {
  current = langs[code] || langs.en;
}

// t('key', { n: 3 }) подставляет {n}. Неизвестный ключ возвращается как есть.
export function t(key, params) {
  let s = current[key] ?? langs.en[key] ?? key;
  if (params) for (const k in params) s = s.replaceAll(`{${k}}`, params[k]);
  return s;
}
