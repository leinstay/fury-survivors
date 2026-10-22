// Полный экран на телефоне: первое касание разворачивает игру на весь экран (панели браузера прячутся)
// и фиксирует альбомную ориентацию, где браузер это позволяет. Если браузер отказал (iOS Safari, встроенные
// окна приложений), игра просто остаётся в окне. Повтор при каждом касании, пока не в полном экране.
// После любой смены размера окна Phaser пересчитывает холст (панели браузера появляются и прячутся).
export function installTouchFullscreen(game) {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const refresh = () => setTimeout(() => game.scale.refresh(), 100);
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refresh);
  if (!touch) return;
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;
  const enter = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = request.call(root, { navigationUI: 'hide' });
      if (p && p.then) {
        p.then(() => {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
          refresh();
        }).catch(() => {});
      }
    } catch { /* браузер не даёт полный экран */ }
  };
  window.addEventListener('pointerup', enter);
}
