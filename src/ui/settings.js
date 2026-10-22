// Настройки в localStorage. Громкость 0..1 (положение ползунка; реальная громкость ещё умножается
// на AUDIO.gain в sfx.js), shake — тряска экрана вкл/выкл, остальное — варианты из OPTIONS.
// v2: шкала сменилась, старые сохранения не переносим.
const KEY = 'fury-survivors.settings.v2';
const DEFAULTS = { music: 1, sfx: 1, shake: true, quality: null, minimap: 'full', dps: 'full', difficulty: 'normal' };
// Допустимые значения строковых настроек; порядок = порядок переключения кнопкой.
export const OPTIONS = {
  quality: ['high', 'low'],          // low: без свечения снарядов и элит, меньше частиц (по умолчанию на таче)
  minimap: ['full', 'transparent', 'off'],
  dps: ['full', 'transparent', 'off'],
  difficulty: ['normal', 'cursed'],  // последний выбор перед забегом (data/difficulty.js)
};
let data = null;

function isTouch() {
  return typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis);
}

function load() {
  if (data) return data;
  data = { ...DEFAULTS };
  data.quality = isTouch() ? 'low' : 'high';
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

// Переключатели (shake, quality, minimap, dps).
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

// Низкое качество графики: без свечения, меньше частиц.
export function lowQuality() {
  return getSetting('quality') === 'low';
}
