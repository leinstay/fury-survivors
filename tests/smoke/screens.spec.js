import { test, expect } from '@playwright/test';
import { collectConsoleErrors, startGame, waitChestReady, clickSceneItem } from './helpers.js';

// Explicit fixture for rare screens; never used to estimate balance or win rate.
test('chest rewards and an evolution choice apply, pause and result screens work', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/'); await startGame(page);
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim._openChest(gs.sim.player);
    gs.handleEvents(gs.sim.events);
  });
  await waitChestReady(page);
  const upgraded = await page.evaluate(() =>
    window.__game.game.scene.getScene('Game').sim.player.weapons[0].level);
  expect(upgraded).toBe(2);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim.player.weapons = [{ id: 'blade_arc', level: 7 }];
    gs.sim.player.passives = [{ id: 'attack', level: 1 }];
    gs.sim._syncBuild(); gs.sim._openChest(gs.sim.player);
  });
  await waitChestReady(page);
  const ids = await page.evaluate(() =>
    window.__game.game.scene.getScene('Chest').choices.map((c) => c.id));
  expect(ids).toEqual(['crimson_arc']);
  await clickSceneItem(page, 'Chest', 2); // Skip evolution; the ordinary reward is still real.
  await waitChestReady(page);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Game')
    .sim.player.weapons[0].id)).toBe('blade_arc');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim._openChest(gs.sim.player);
  });
  await waitChestReady(page);
  await clickSceneItem(page, 'Chest', 1); // Continue, through UI
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Game')
    .sim.player.weapons[0].id)).toBe('crimson_arc');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'));
  for (const name of ['Victory', 'GameOver']) {
    await page.evaluate((n) => {
      const gs = window.__game.game.scene.getScene('Game');
      gs.scene.pause(); gs.scene.launch(n, { sim: gs.sim });
    }, name);
    await page.waitForFunction((n) => window.__game.debug().scenes.includes(n), name);
    await page.evaluate((n) => window.__game.game.scene.stop(n), name);
  }
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errors.get()).toEqual([]);
});
