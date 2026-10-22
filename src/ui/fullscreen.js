// Полный экран на телефоне: панели браузера прячутся, ориентация фиксируется альбомной, где браузер это
// позволяет. Включается только явно: кнопкой Play в меню и переключателем в настройках (раньше любое касание
// разворачивало игру, и случайный тап на экране итогов или в паузе переключал режим). Если браузер отказал
// (iOS Safari, встроенные окна приложений), игра просто остаётся в окне.
// После любой смены размера окна Phaser пересчитывает холст (панели браузера появляются и прячутся).
import { isMobile } from './settings.js';

let refreshFn = null;

function root() {
  return document.documentElement;
}

// Браузер умеет полный экран и это телефон или планшет (на десктопе есть F11, кнопка не нужна).
export function canFullscreen() {
  if (typeof document === 'undefined') return false;
  const r = root();
  return isMobile() && !!(r.requestFullscreen || r.webkitRequestFullscreen);
}

export function isFullscreen() {
  return typeof document !== 'undefined' && !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function requestFullscreen() {
  if (!canFullscreen() || isFullscreen()) return;
  const r = root();
  const request = r.requestFullscreen || r.webkitRequestFullscreen;
  try {
    const p = request.call(r, { navigationUI: 'hide' });
    if (p && p.then) {
      p.then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
        if (refreshFn) refreshFn();
      }).catch(() => {});
    }
  } catch { /* браузер не даёт полный экран */ }
}

export function exitFullscreen() {
  if (!isFullscreen()) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    const p = exit && exit.call(document);
    if (p && p.catch) p.catch(() => {});
  } catch { /* ignore */ }
}

export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen(); else requestFullscreen();
}

export function installTouchFullscreen(game) {
  refreshFn = () => setTimeout(() => game.scale.refresh(), 100);
  window.addEventListener('resize', refreshFn);
  window.addEventListener('orientationchange', refreshFn);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refreshFn);
}
