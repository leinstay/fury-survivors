import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

// Не зависит от Firebase: gstatic заблокирован, таблица обязана показать OFFLINE, а не упасть.
test('leaderboard scene and nick input work offline', async ({ page }) => {
  test.setTimeout(40_000);
  await page.route('**/www.gstatic.com/**', (r) => r.abort());
  const shot = (name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }) : null);

  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 15_000 });

  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowDown'); // Co-op
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown'); // Leaderboard
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.debug().scene === 'Leaderboard', null, { timeout: 5_000 });
  await page.waitForTimeout(800);
  await shot('leaderboard');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu', null, { timeout: 5_000 });

  await startGame(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim.kills = 42;
    gs.scene.pause();
    gs.scene.launch('GameOver', { sim: gs.sim });
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'));
  await page.waitForTimeout(400);

  const input = page.locator('input[maxlength="6"]');
  await expect(input).toHaveCount(1);
  await input.click();
  await page.keyboard.type('wasd1234');
  await expect(input).toHaveValue('WASD12');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__game.debug().scenes.includes('GameOver'))).toBe(true);
  await shot('nick');

  await page.evaluate(() => window.__game.game.scene.stop('GameOver'));
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
});
