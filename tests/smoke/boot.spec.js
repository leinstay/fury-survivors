import { test, expect } from '@playwright/test';

// Этап 0: страница грузится, Phaser стартует, меню на экране, ошибок нет.
test('boots to menu without errors', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 15_000 });
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => window.__game.debug());
  expect(state.errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(state.fps).toBeGreaterThan(30);
});
