import { test, expect } from '@playwright/test';
import { collectConsoleErrors, startGame } from './helpers.js';

// Игра: Play, 30 с случайного движения, выбор карточек на LevelUp, без ошибок, fps и враги в норме.
const MIN_FPS = 50;
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

test('plays 30s without errors', async ({ page }) => {
  test.setTimeout(80_000);
  const consoleErrors = collectConsoleErrors(page);

  await page.goto('/');
  await startGame(page);

  const fpsSamples = [];
  let maxEnemies = 0;
  let levelUps = 0;
  const held = new Set();
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const s = await page.evaluate(() => window.__game.debug());
    maxEnemies = Math.max(maxEnemies, s.enemies);
    if (s.scene === 'LevelUp') {
      levelUps++;
      await page.keyboard.press('Enter');
    } else if (s.scene === 'Game') {
      if (s.time > 3) fpsSamples.push(s.fps);
      // меняем набор зажатых клавиш
      for (const k of [...held]) {
        if (Math.random() < 0.5) {
          await page.keyboard.up(k);
          held.delete(k);
        }
      }
      const k = KEYS[Math.floor(Math.random() * KEYS.length)];
      if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    }
    await page.waitForTimeout(400);
  }
  for (const k of held) await page.keyboard.up(k);

  if (process.env.SHOT) await page.screenshot({ path: 'tests/smoke/shot.png', clip: { x: 0, y: 0, width: 1280, height: 720 } });

  const state = await page.evaluate(() => window.__game.debug());
  const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / Math.max(1, fpsSamples.length);
  console.log(`avg fps ${avgFps.toFixed(1)}, max enemies ${maxEnemies}, levelups ${levelUps}, time ${state.time}`);

  expect(state.errors).toEqual([]);
  expect(consoleErrors.get()).toEqual([]);
  expect(maxEnemies).toBeGreaterThan(0);
  expect(avgFps).toBeGreaterThan(MIN_FPS);
});
