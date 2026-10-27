import { test, expect } from '@playwright/test';
import { collectConsoleErrors, startGame, waitChestReady, clickSceneItem, clickSceneText } from './helpers.js';

// Explicit fixture for rare screens; never used to estimate balance or win rate.
test('skill chest: upgrades without a choice, evolution choice when ready, pause and results work', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/'); await startGame(page);
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim._openChest(gs.sim.player);
  });
  await waitChestReady(page);
  const upgraded = await page.evaluate(() =>
    window.__game.game.scene.getScene('Game').sim.player.weapons[0].level);
  expect(upgraded).toBe(2);
  // мир стоит, пока показ открыт
  const t0 = await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.time);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.time)).toBe(t0);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  // без готовых эволюций: +1 пассивке и +1 оружию, показ Treasure
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim.player.weapons = [{ id: 'blade_arc', level: 3 }];
    gs.sim.player.passives = [{ id: 'attack', level: 2 }];
    gs.sim._syncBuild(); gs.sim._openChest(gs.sim.player);
  });
  await waitChestReady(page);
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Chest').cards
    .map((c) => [c.id, c.prev, c.level]))).toEqual([['attack', 2, 3], ['blade_arc', 3, 4]]);
  await page.screenshot({ path: 'tools/out/shots/skill-chest.png' });
  await clickSceneItem(page, 'Chest', 0); // Ok, through UI
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  // готовая эволюция: старый экран выбора, Continue, затем показ выбранного
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim.player.weapons = [{ id: 'blade_arc', level: 5 }];
    gs.sim._syncBuild(); gs.sim._openChest(gs.sim.player);
  });
  await page.waitForFunction(() => window.__game.game.scene.getScene('Chest').confirmBtn &&
    window.__game.game.scene.isActive('Chest'));
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Chest').choices.map((c) => c.id)))
      .toEqual(['crimson_arc']);
  await page.screenshot({ path: 'tools/out/shots/skill-chest-choice.png' });
  await clickSceneText(page, 'Chest', 'Continue');
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
