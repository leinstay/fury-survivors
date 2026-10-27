import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

// Залипание движения на ПК: клавиша, отпущенная, пока окно без фокуса или открыто контекстное меню, не должна
// держать героя; мышь не управляет экранным джойстиком.
test('movement does not stick after blur or context menu; mouse does not drive the stick', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  const vec = () => page.evaluate(() => window.__game.game.scene.getScene('Game').gameInput.read());
  for (const ev of ['blur', 'contextmenu']) {
    await page.keyboard.down('d');
    await page.waitForTimeout(100);
    expect((await vec()).x).toBe(1);
    await page.evaluate((e) => window.dispatchEvent(new Event(e)), ev);
    await page.waitForTimeout(50);
    expect(await vec()).toEqual({ x: 0, y: 0 });
    await page.keyboard.up('d');
  }
  // клик мышью по левой половине и уход курсора без кнопки — герой стоит
  await page.mouse.move(200, 400);
  await page.mouse.down();
  await page.mouse.move(100, 400);
  await page.mouse.up();
  await page.mouse.move(50, 380);
  expect(await vec()).toEqual({ x: 0, y: 0 });
});
