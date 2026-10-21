// Растяжка холста на экран. При целом масштабе (×1, ×2, ×3) пиксели остаются чёткими (nearest);
// при нецелом (например ×1.5 на 1080p) соседние пиксели вышли бы разной ширины и рябили при движении,
// поэтому там включается мягкое сглаживание браузера.
const EPS = 0.02;

export function installCrispScaling(game) {
  const apply = () => {
    const canvas = game.canvas;
    if (!canvas) return;
    const scale = (canvas.getBoundingClientRect().height * (window.devicePixelRatio || 1)) / game.scale.height;
    const integer = Math.abs(scale - Math.round(scale)) < EPS;
    canvas.style.imageRendering = integer ? 'pixelated' : 'auto';
    game.renderScale = { scale: +scale.toFixed(3), crisp: integer };
  };
  // Размер холста на странице меняет ScaleManager (FIT) после раскладки, поэтому следим за самим холстом.
  game.events.once('ready', () => {
    apply();
    if (window.ResizeObserver) new ResizeObserver(apply).observe(game.canvas);
    else window.addEventListener('resize', () => setTimeout(apply, 0));
  });
}
