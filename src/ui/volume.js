// Настройки для Menu и Pause: два слайдера громкости (музыка, звуки) и переключатель тряски экрана.
import { t } from '../i18n/index.js';
import { addSlider, addButton } from './focus.js';
import { getVolume, setVolume, getSetting, setSetting } from './settings.js';
import { applyVolumes, playSfx } from '../audio/sfx.js';

export function addVolumeSliders(scene, nav, { x, y, w, gap = 30 }) {
  addSlider(scene, nav, {
    x, y, w, label: t('settings.music'),
    get: () => getVolume('music'),
    set: (v) => {
      setVolume('music', v);
      applyVolumes();
    },
  });
  addSlider(scene, nav, {
    x, y: y + gap, w, label: t('settings.sfx'),
    get: () => getVolume('sfx'),
    set: (v) => {
      const old = getVolume('sfx');
      setVolume('sfx', v);
      if (getVolume('sfx') !== old) playSfx(scene, 'ui_move');
    },
  });
  const shakeLabel = () => `${t('settings.shake')}: ${t(getSetting('shake') ? 'settings.on' : 'settings.off')}`;
  const toggle = addButton(scene, nav, {
    x, y: y + 2 * gap, w, h: 24, size: 12, label: shakeLabel(),
    onSelect: () => {
      setSetting('shake', !getSetting('shake'));
      toggle.setLabel(shakeLabel());
      playSfx(scene, 'ui_move');
    },
  });
}
