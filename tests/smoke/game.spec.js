import { test, expect } from '@playwright/test';
import { collectConsoleErrors, startGame, driveGame } from './helpers.js';

test('seeded human policy drives real controls and the world makes progress', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await startGame(page, 1111);
  const result = await driveGame(page, 12);
  expect(result.time).toBeGreaterThanOrEqual(12);
  expect(result.frame).toBeGreaterThan(600);
  const state = await page.evaluate(() => window.__game.debug());
  expect(state.errors).toEqual([]);
  expect(errors.get()).toEqual([]);
  expect(state.kills).toBeGreaterThan(0);
  const trace = await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Game');
    return { seed: s.sim.seed, inputs: s.telemetry.inputs, picks: s.telemetry.picks };
  });
  expect(trace.seed).toBe(1111);
  expect(trace.inputs.length).toBeGreaterThan(1);
});
