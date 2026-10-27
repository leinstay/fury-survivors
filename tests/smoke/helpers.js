// Сбор ошибок консоли и страницы.
export function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return {
    get() {
      return errors.slice();
    },
  };
}

const menuView = (page, view) => page.waitForFunction(
    (v) => window.__game.game.scene.getScene('Menu').view === v, view);

// Из меню в забег: Play → Solo → сложность → герой; Enter берёт то, что в фокусе (последний выбор).
export async function startGame(page, seed = 1111) {
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  await page.evaluate((s) => { window.__furyTestSeed = s; }, seed);
  await page.keyboard.press('Enter');
  await menuView(page, 'play');
  await page.keyboard.press('Enter');
  await menuView(page, 'difficulty');
  await page.keyboard.press('Enter');
  await menuView(page, 'hero');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.debug().scene === 'Game');
}

// Из меню в вид коопа: Play → Co-op (клавишами).
export async function openCoop(page) {
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  await page.keyboard.press('Enter');
  await menuView(page, 'play');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await menuView(page, 'coop');
}

export async function clickSceneItem(page, sceneName, index) {
  const item = await page.evaluate(([name, i]) => {
    const scene = window.__game.game.scene.getScene(name);
    const it = scene.nav.items[i];
    return { x: it.x, y: it.y };
  }, [sceneName, index]);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + item.x * box.width / 640,
      box.y + item.y * box.height / 360);
}

export async function waitChestReady(page) {
  await page.waitForFunction(() => {
    const game = window.__game.game;
    const chest = game.scene.getScene('Chest');
    return game.scene.isActive('Chest') && chest.okBtn && !chest.okBtn.disabled &&
      chest.time.now - chest.openedAt > 260 && !chest.closed;
  });
}

// Shared decision policy; actions are sent through actual keyboard/pointer UI.
export async function driveGame(page, until = 12, onProgress = async () => {}) {
  await page.evaluate(async () => {
    const { createPolicy } = await import('/tools/simulation/policy.mjs');
    const { observe } = await import('/tools/simulation/observe.mjs');
    const { PROFILES } = await import('/tools/simulation/profiles.mjs');
    const local = window.__game.game.scene.getScene('Game').sim.local;
    window.__smokePolicy = createPolicy({ seed: 71 + local, profile: PROFILES[local] });
    window.__smokeObserve = observe;
  });
  const held = new Set();
  const release = async () => {
    for (const key of held) await page.keyboard.up(key);
    held.clear();
  };
  try {
    for (let guard = 0; guard < Math.max(1000, until * 30); guard++) {
      const r = await page.evaluate(() => {
        const sim = window.__game.game.scene.getScene('Game').sim;
        const o = window.__smokeObserve(sim, sim.local);
        const p = window.__smokePolicy;
        return { scene: window.__game.debug().scene, time: sim.time, frame: sim.frame,
          state: sim.state,
          pickCount: window.__game.game.scene.getScene('Game').telemetry?.picks.length || 0,
          command: ['chest', 'levelup'].includes(sim.state) ? p.choose(o) : null,
          input: p.move(o) };
      });
      await onProgress(r);
      if (r.time >= until) return r;
      if (['GameOver', 'Victory'].includes(r.scene)) throw new Error(`Scene ended early: ${r.scene}`);
      if (['gameover', 'victory'].includes(r.state)) throw new Error(`Ended before ${until}s`);
      if (r.scene === 'LevelUp' && r.command) {
        await release();
        const c = r.command;
        if (c.k === 'card') await clickSceneItem(page, 'LevelUp', c.i);
        else {
          const count = await page.evaluate(() =>
            window.__game.game.scene.getScene('Game').sim.players[window.__game.game.scene.getScene('Game').sim.local].levelUp.cards.length);
          await clickSceneItem(page, 'LevelUp', count + { reroll: 0, skip: 1, banish: 2 }[c.k]);
          if (c.k === 'banish') {
            await page.waitForFunction(() => window.__game.game.scene.getScene('LevelUp').banishMode);
            await clickSceneItem(page, 'LevelUp', c.i);
          }
        }
        await page.waitForFunction((n) => window.__game.game.scene.getScene('Game')
          .telemetry.picks.length > n, r.pickCount);
      } else if (r.scene === 'Chest') {
        // сундук скиллов без выбора: выпавшее уже применено, Ok закрывает (в коопе — когда оба)
        await release(); await waitChestReady(page);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));
      } else {
        const desired = new Set();
        if (r.input.x > 0.25) desired.add('KeyD');
        if (r.input.x < -0.25) desired.add('KeyA');
        if (r.input.y > 0.25) desired.add('KeyS');
        if (r.input.y < -0.25) desired.add('KeyW');
        for (const key of held) {if (!desired.has(key)) {
          await page.keyboard.up(key); held.delete(key);
        }}
        for (const key of desired) {if (!held.has(key)) {
          await page.keyboard.down(key); held.add(key);
        }}
        await page.waitForFunction(([frame, state, scene]) => {
          const s = window.__game.game.scene.getScene('Game').sim;
          return s.frame >= frame + 6 || s.state !== state || window.__game.debug().scene !== scene;
        }, [r.frame, r.state, r.scene], { timeout: 10000 });
      }
    }
    throw new Error('Browser drive watchdog');
  } catch (error) {
    try {
      error.message += `\nBrowser state: ${JSON.stringify(await page.evaluate(() => window.__game.debug()))}`;
    } catch { /* page may already be closed after the test timeout */ }
    throw error;
  } finally { await release(); }
}

export async function clickSceneText(page, sceneName, label) {
  const index = await page.evaluate(([name, text]) => window.__game.game.scene.getScene(name)
    .nav.items.findIndex((it) => it.text?.text === text), [sceneName, label]);
  if (index < 0) throw new Error(`Missing ${sceneName} button: ${label}`);
  await clickSceneItem(page, sceneName, index);
}
