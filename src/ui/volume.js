// Настройки для Menu и Pause: слайдеры громкости (музыка, звуки) и переключатели: тряска, графика, статы на карточках уровня, миникарта,
// DPS-метр, полный экран (только на таче, где браузер его даёт). Возвращает число строк.
import { t } from '../i18n/index.js';
import { addSlider, addButton } from './focus.js';
import { getVolume, setVolume, getSetting, setSetting, cycleSetting } from './settings.js';
import { applyVolumes, playSfx } from '../audio/sfx.js';
import { canFullscreen, isFullscreen, toggleFullscreen } from './fullscreen.js';

/** Сколько строк нарисует addVolumeSliders (для центрирования столбца до рисования). */
export function optionRows() {
  return 8 + (canFullscreen() ? 1 : 0);
}

export function addVolumeSliders(scene, nav, { x, y, w, gap = 30 }) {
  let row = 0;
  addSlider(scene, nav, {
    x, y: y + gap * row++, w, label: t('settings.music'),
    get: () => getVolume('music'),
    set: (v) => {
      setVolume('music', v);
      applyVolumes();
    },
  });
  addSlider(scene, nav, {
    x, y: y + gap * row++, w, label: t('settings.sfx'),
    get: () => getVolume('sfx'),
    set: (v) => {
      const old = getVolume('sfx');
      setVolume('sfx', v);
      if (getVolume('sfx') !== old) playSfx(scene, 'ui_move');
    },
  });
  // Кнопка «Название: значение»; onCycle возвращает новое значение.
  const cycle = (labelKey, value, onCycle) => {
    const label = () => `${t(labelKey)}: ${value()}`;
    const b = addButton(scene, nav, {
      x, y: y + gap * row++, w, h: 24, size: 12, label: label(),
      onSelect: () => {
        onCycle();
        b.setLabel(label());
        playSfx(scene, 'ui_move');
      },
    });
    return b;
  };
  const onOff = (v) => t(v ? 'settings.on' : 'settings.off');
  cycle('settings.shake', () => onOff(getSetting('shake')), () => setSetting('shake', !getSetting('shake')));
  cycle('settings.glow', () => onOff(getSetting('glow')), () => setSetting('glow', !getSetting('glow')));
  cycle('settings.hero_glow', () => onOff(getSetting('heroGlow')), () => setSetting('heroGlow', !getSetting('heroGlow')));
  cycle('settings.detail_stats', () => onOff(getSetting('detailStats')),
      () => setSetting('detailStats', !getSetting('detailStats')));
  cycle('settings.minimap', () => t(`settings.mode.${getSetting('minimap')}`), () => cycleSetting('minimap'));
  cycle('settings.dps', () => t(`settings.mode.${getSetting('dps')}`), () => cycleSetting('dps'));
  if (canFullscreen()) {
    cycle('settings.fullscreen', () => onOff(isFullscreen()), () => toggleFullscreen());
  }
  return row;
}
