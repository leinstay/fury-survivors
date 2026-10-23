import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

// Этап 0: страница грузится, Phaser стартует, меню на экране, ошибок нет.
test('boots to menu without errors', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 15_000 });

  const state = await page.evaluate(() => window.__game.debug());
  expect(state.errors).toEqual([]);
  expect(consoleErrors.get()).toEqual([]);
  expect(state.scene).toBe('Menu');
});
