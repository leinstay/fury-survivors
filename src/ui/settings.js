// Настройки в localStorage. Громкость 0..1 (положение ползунка; реальная громкость ещё умножается
// на AUDIO.gain в sfx.js), shake, glow, heroGlow — вкл/выкл, остальное — варианты из OPTIONS.
// glow — свечение снарядов (выкл: без шейдеров и с меньшим числом частиц, по умолчанию выкл на таче),
// heroGlow — белое свечение вокруг своего героя (видно себя в толпе и в коопе).
// detailStats — строки статов и иконки оружий на карточках уровня (как «advanced tooltips»), по умолчанию вкл.
// v2: шкала сменилась, старые сохранения не переносим.
import { HEROES, DEFAULT_HERO } from '../data/heroes.js';
import { DIFFICULTIES } from '../data/difficulty.js';

const KEY = 'fury-survivors.settings.v2';
const DEFAULTS = {
  music: 1, sfx: 1, shake: true, glow: true, heroGlow: true, detailStats: true, minimap: 'full', dps: 'full',
  difficulty: 'normal',
  hero: DEFAULT_HERO,
};
// Допустимые значения строковых настроек; порядок = порядок переключения кнопкой.
export const OPTIONS = {
  minimap: ['full', 'transparent'],  // радар не выключается
  dps: ['full', 'transparent', 'off'],
  difficulty: Object.keys(DIFFICULTIES),  // последний выбор перед забегом
  hero: Object.keys(HEROES),          // последний выбранный герой (соло и кооп)
};
let data = null;

// Телефон или планшет: основной указатель «грубый» (палец). ПК с тачскрином сюда не попадает
// (maxTouchPoints там тоже > 0, поэтому по нему судить нельзя).
export function isMobile() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function load() {
  if (data) return data;
  data = { ...DEFAULTS };
  data.glow = !isMobile();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k in DEFAULTS) {
      if (OPTIONS[k]) {
        if (OPTIONS[k].includes(raw[k])) data[k] = raw[k];
      } else if (typeof DEFAULTS[k] === 'boolean') {
        if (typeof raw[k] === 'boolean') data[k] = raw[k];
      } else if (typeof raw[k] === 'number') {
        data[k] = Math.min(1, Math.max(0, raw[k]));
      }
    }
  } catch { /* localStorage недоступен: живём с дефолтами */ }
  return data;
}

export function getVolume(kind) {
  return load()[kind];
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function setVolume(kind, v) {
  load()[kind] = Math.min(1, Math.max(0, Math.round(v * 10) / 10));
  save();
}

// Переключатели (shake, glow, heroGlow, minimap, dps).
export function getSetting(key) {
  return load()[key];
}

export function setSetting(key, v) {
  load()[key] = v;
  save();
}

// Следующее значение строковой настройки по кругу.
export function cycleSetting(key) {
  const list = OPTIONS[key];
  const v = list[(list.indexOf(getSetting(key)) + 1) % list.length];
  setSetting(key, v);
  return v;
}

// Свечение снарядов выключено: без шейдеров свечения, меньше частиц.
export function lowQuality() {
  return !getSetting('glow');
}
