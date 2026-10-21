// Оверлей «поверни телефон»: тач-устройство в портрете.
import { t } from '../i18n/index.js';

export function installOrientationOverlay() {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!touch) return;
  const el = document.createElement('div');
  el.textContent = t('orient.rotate');
  el.style.cssText = 'position:fixed;inset:0;z-index:10;display:none;align-items:center;justify-content:center;'
    + 'background:#000;color:#fff;font:bold 24px monospace;text-align:center;';
  document.body.appendChild(el);
  const check = () => { el.style.display = window.innerHeight > window.innerWidth ? 'flex' : 'none'; };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
  check();
}
