// window.__game.debug() отдаёт JSON состояния для тестов и агентов.
const errors = [];

window.addEventListener('error', (e) => errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

export function installDebug(game) {
  window.__game = {
    game,
    errors,
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
        weapons: sim ? sim.player.weapons.map((w) => ({ id: w.id, level: w.level })) : [],
        errors: errors.slice(),
      };
    },
  };
}
