// window.__game.debug() отдаёт JSON состояния для тестов и агентов.
// Ошибки: копятся в errors, последняя пишется в localStorage (LAST_ERROR_KEY, с состоянием игры) и показывается
// красной строкой поверх игры, чтобы игрок мог прислать скриншот: Phaser останавливает цикл кадров на
// необработанном исключении, и без этого зависание выглядит как «просто повисло».
const errors = [];
const LAST_ERROR_KEY = 'fury-survivors.lastError';
let banner = null;

function showError(text) {
  if (typeof document === 'undefined') return;
  if (!banner) {
    banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:20;padding:6px 10px;background:#7a1020;color:#fff;'
      + 'font:12px monospace;white-space:pre-wrap;word-break:break-all;max-height:40%;overflow:auto;';
    banner.addEventListener('click', () => banner.remove());
    document.body.appendChild(banner);
  }
  banner.textContent = `Error (tap to hide): ${text}`;
}

function record(err, stack) {
  const text = String(err);
  errors.push(text);
  let state = null;
  try { state = window.__game && window.__game.debug(); } catch { /* состояние недоступно */ }
  try {
    localStorage.setItem(LAST_ERROR_KEY, JSON.stringify({
      at: new Date().toISOString(), error: text, stack: stack || null, state,
    }));
  } catch { /* localStorage недоступен */ }
  showError(`${text}\n${(stack || '').split('\n').slice(1, 3).join('\n')}`);
}

window.addEventListener('error', (e) => record(e.message || e, e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => record(e.reason, e.reason && e.reason.stack));

export function installDebug(game) {
  window.__game = {
    game,
    errors,
    // Только для плейтестов (tools/playtest.mjs --god): держит героя живым, правила sim не меняются.
    god(on = true) {
      if (this._godTimer) clearInterval(this._godTimer);
      this._godTimer = null;
      if (!on) return;
      this._godTimer = setInterval(() => {
        const gs = game.scene.getScene('Game');
        const p = gs && gs.sim && gs.sim.player;
        if (p) p.hp = p.maxHp || p.hp;
      }, 50);
    },
    debug() {
      const active = game.scene.getScenes(true).map((s) => s.sys.settings.key);
      const gameScene = game.scene.getScene('Game');
      const sim = gameScene && gameScene.sim;
      return {
        scenes: active,
        scene: active[active.length - 1] || null,
        fps: Math.round(game.loop.actualFps),
        state: sim ? sim.state : null,
        kills: sim ? sim.kills : null,
        enemies: sim ? sim.enemies.length : 0,
        hp: sim ? sim.player.hp : null,
        level: sim ? sim.player.level : null,
        time: sim ? sim.time : null,
        network: gameScene?.ls ? {
          tick: gameScene.ls.tick, paused: gameScene.ls.paused, local: sim.local,
          picker: sim.picker, pendingLevels: sim.pendingLevels, resumeT: sim.resumeT,
          waitT: gameScene.ls.waitT, silence: gameScene.ls.silence(gameScene.now()),
          pendingCommands: gameScene.ls.pendingCmds.length, overlay: gameScene.overlay,
        } : null,
        overlays: ['LevelUp', 'Chest', 'Pause'].map((key) => {
          const ui = game.scene.getScene(key);
          return { key, active: game.scene.isActive(key), paused: game.scene.isPaused(key),
            closed: ui?.closed ?? null, alpha: ui?.cameras?.main?.alpha ?? null,
            input: ui?.input?.enabled ?? null, keyboard: ui?.input?.keyboard?.enabled ?? null,
            items: ui?.nav?.items.length ?? 0 };
        }),
        weapons: sim ? sim.player.weapons.map((w) => ({ id: w.id, level: w.level })) : [],
        errors: errors.slice(),
      };
    },
    // Последняя записанная ошибка (localStorage) или null.
    lastError() {
      try { return JSON.parse(localStorage.getItem(LAST_ERROR_KEY)); } catch { return null; }
    },
  };
}
