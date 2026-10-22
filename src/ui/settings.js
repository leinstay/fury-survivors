// Настройки в localStorage. Громкость 0..1 (положение ползунка; реальная громкость ещё умножается
// на AUDIO.gain в sfx.js), shake — тряска экрана вкл/выкл. v2: шкала сменилась, старые сохранения не переносим.
const KEY = 'fury-survivors.settings.v2';
const DEFAULTS = { music: 1, sfx: 1, shake: true };
let data = null;

function load() {
  if (data) return data;
  data = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k in DEFAULTS) {
      if (typeof DEFAULTS[k] === 'boolean') {
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

// Переключатели (shake).
export function getSetting(key) {
  return load()[key];
}

export function setSetting(key, v) {
  load()[key] = v;
  save();
}
