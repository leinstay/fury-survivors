import { test, expect } from '@playwright/test';
import { collectConsoleErrors, startGame } from './helpers.js';

// Экран уровня открывается не один раз: Phaser переиспользует сцену, выбор должен закрывать её каждый раз.
test('level-up screen closes after every pick, not only the first', async ({ page }) => {
  const errs = collectConsoleErrors(page);
  await page.goto('/');
  await startGame(page);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const sim = window.__game.game.scene.getScene('Game').sim;
      sim.player.xp = sim.player.xpNext;
      sim._checkLevel();
    });
    await page.waitForFunction(() => window.__game.debug().scenes.includes('LevelUp'), null, { timeout: 5_000 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter'); // первая карточка в фокусе
    await page.waitForFunction(() => !window.__game.debug().scenes.includes('LevelUp') &&
        window.__game.game.scene.isActive('Game'), null, { timeout: 5_000 });
  }
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.player.level)).toBe(4);
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errs.get()).toEqual([]);
});
