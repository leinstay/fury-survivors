// Настройки громкости в localStorage. Значения 0..1 (положение ползунка; реальная громкость ещё умножается
// на AUDIO.gain в sfx.js). v2: шкала сменилась, старые сохранения не переносим.
const KEY = 'fury-survivors.settings.v2';
const DEFAULTS = { music: 1, sfx: 1 };
let data = null;

function load() {
  if (data) return data;
  data = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k in DEFAULTS) if (typeof raw[k] === 'number') data[k] = Math.min(1, Math.max(0, raw[k]));
  } catch { /* localStorage недоступен: живём с дефолтами */ }
  return data;
}

export function getVolume(kind) {
  return load()[kind];
}

export function setVolume(kind, v) {
  load()[kind] = Math.min(1, Math.max(0, Math.round(v * 10) / 10));
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
