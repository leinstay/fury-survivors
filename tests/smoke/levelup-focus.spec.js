import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';
// Экран уровня: после Skip (и взятой карточки) новый набор встаёт с фокусом на первой карточке — пробел не
// жмёт Skip на каждом следующем уровне; после Reroll фокус остаётся на Reroll (рероллить подряд).
test('level-up focus: back to the first card after skip, stays on reroll', async ({ page }) => {
  await page.goto('/');
  await startGame(page);
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    window.__log = [];
    for (const k of ['card', 'reroll', 'skip']) {
      const o = gs.act[k]; gs.act[k] = (...a) => { window.__log.push(k); return o(...a); };
    }
    gs.sim.player.xp += 3000;
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('LevelUp'));
  await page.waitForTimeout(300);
  // фокус на Skip (как мышь у центра низа), пробел — пропуск; на следующем уровне фокус снова на карточке
  const go = (label) => page.evaluate((l) => {
    const s = window.__game.game.scene.getScene('LevelUp');
    const i = s.nav.items.findIndex((it) => it.text && it.text.text.startsWith(l));
    s.nav.focus(i);
  }, label);
  await go('Skip');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await go('Reroll');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const log = await page.evaluate(() => window.__log);
  expect(log).toEqual(['skip', 'card', 'reroll', 'reroll']);
});
