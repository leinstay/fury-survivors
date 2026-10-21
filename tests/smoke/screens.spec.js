import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

// Сцены Chest, Victory, GameOver, Pause открываются на живом sim без ошибок.
test('chest and result screens open without errors', async ({ page }) => {
  test.setTimeout(40_000);
  const consoleErrors = collectConsoleErrors(page);
  const shot = (name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }) : null);

  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 15_000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.debug().scene === 'Game', null, { timeout: 5_000 });
  await page.waitForTimeout(500);

  const scenes = () => page.evaluate(() => window.__game.debug().scenes);

  // Сундук: обычный предмет, закрытие по Enter возвращает Game
  await page.evaluate(() => {
    const g = window.__game.game;
    const gs = g.scene.getScene('Game');
    const sim = gs.sim;
    gs.scene.pause();
    gs.scene.launch('Chest', { sim, items: [{ kind: 'weapon', id: 'blade_arc', level: 3, isNew: false }] });
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Chest'));
  await page.waitForTimeout(1000);
  await shot('chest');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));
  expect(await scenes()).toContain('Game');

  // Сундук: эволюция, пропуск анимации клавишей
  await page.evaluate(() => {
    const g = window.__game.game;
    const gs = g.scene.getScene('Game');
    const sim = gs.sim;
    gs.scene.pause();
    gs.scene.launch('Chest', { sim, items: [{ kind: 'evolution', id: 'aegis_storm', level: 1, isNew: true, from: ['blade_arc', 'guardian_shields'] }] });
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Chest'));
  await page.waitForTimeout(300);
  await page.keyboard.press('Space'); // пропуск анимации
  await page.waitForTimeout(500);
  await shot('chest_evo');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Chest'));

  // Пауза
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await page.waitForTimeout(200);
  await shot('pause');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'));

  // Итоги
  for (const name of ['Victory', 'GameOver']) {
    await page.evaluate((n) => {
      const g = window.__game.game;
      const gs = g.scene.getScene('Game');
    const sim = gs.sim;
      sim.damageByWeapon = { blade_arc: 1200, throwing_daggers: 800, storm_chain: 300 };
      gs.scene.pause();
      gs.scene.launch(n, { sim });
    }, name);
    await page.waitForFunction((n) => window.__game.debug().scenes.includes(n), name);
    await page.waitForTimeout(600);
    await shot(name.toLowerCase());
    await page.evaluate((n) => window.__game.game.scene.stop(n), name);
  }

  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(consoleErrors.get()).toEqual([]);
});
