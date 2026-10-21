// Два слайдера громкости (музыка, звуки) для Menu и Pause.
import { t } from '../i18n/index.js';
import { addSlider } from './focus.js';
import { getVolume, setVolume } from './settings.js';

export function addVolumeSliders(scene, nav, { x, y, w, gap = 30 }) {
  addSlider(scene, nav, { x, y, w, label: t('settings.music'), get: () => getVolume('music'), set: (v) => setVolume('music', v) });
  addSlider(scene, nav, { x, y: y + gap, w, label: t('settings.sfx'), get: () => getVolume('sfx'), set: (v) => setVolume('sfx', v) });
}
