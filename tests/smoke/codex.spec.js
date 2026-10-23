import { test, expect } from '@playwright/test';
import { startGame, clickSceneText, clickSceneItem } from './helpers.js';

// Кодекс из меню и из паузы: вкладки, детали, забег в летописи, возврат без ошибок.
// Firebase заблокирован: резервная копия молча не уходит. SHOT_DIR: куда сохранить скриншоты вкладок.
const KEY = 'fury-survivors.codex';
const SAMPLE = {
  v: 1, id: 'abcdefghij0123456789', nick: 'ANN',
  seen: {
    weapon: { blade_arc: 1, storm_chain: 1, firebomb: 1, crimson_arc: 1, phantom_blades: 1 },
    passive: { attack: 1, armor: 1, luck: 1 },
    enemy: { harpy: 1, slime: 1, catgirl: 1, foxgirl: 1 },
    boss: { kitsune_empress: 1 },
  },
  foes: {
    harpy: { kills: 812, elites: 3, hits: 41, taken: 205, met: 0 },
    kitsune_empress: { kills: 1, elites: 0, hits: 6, taken: 90, met: 2 },
  },
  totals: {
    runs: { solo: 12, duo: 3 }, wins: { solo: 2, duo: 1 }, time: 9876, dist: 456789, kills: 23456,
    damage: 3456789, coins: 321, pickups: { xp: 9000, heal: 40, magnet: 12, chest: 30, coin: 321 },
    best: { solo: 4321, duo: 6543 }, heroes: { heroine: 10, mage: 5 },
  },
  runs: Array.from({ length: 12 }, (_, i) => ({
    at: Date.UTC(2026, 9, 20, 12, i), mode: i % 4 === 0 ? 'duo' : 'solo', partner: i % 4 === 0 ? 'BOB' : '',
    hero: i % 2 ? 'mage' : 'heroine', difficulty: i % 3 ? 'normal' : 'cursed',
    status: ['victory', 'dead', 'disconnected', 'quit'][i % 4], time: 300 + i * 61, level: 10 + i, kills: 500 + i * 37,
    coins: 20 + i, score: 1000 + i * 111, dist: 20000 + i * 1000,
    damage: { blade_arc: 40000 + i, storm_chain: 22000, crimson_arc: 61000, firebomb: 9000 },
    held: { blade_arc: 200, storm_chain: 300, crimson_arc: 120, firebomb: 250 },
    weapons: [['crimson_arc', 1], ['storm_chain', 7], ['firebomb', 5]], passives: [['attack', 5], ['armor', 2], ['luck', 1]],
  })),
};

const TABS = ['armory', 'characters', 'bestiary', 'bosses', 'chronicle'];
async function clickKey(page, key) {
  const index = await page.evaluate((k) => window.__game.game.scene.getScene('Codex')
    .nav.items.findIndex((item) => item.key === k), key);
  expect(index, `Codex item ${key}`).toBeGreaterThanOrEqual(0);
  await clickSceneItem(page, 'Codex', index);
}
async function tab(page, id) {
  await clickKey(page, `tab:${id}`);
  await page.waitForFunction((value) =>
    window.__game.game.scene.getScene('Codex').tab === value, id);
}

test('codex opens from menu and pause, entries, tabs, history and restore work', async ({ page }) => {
  await page.route('**/www.gstatic.com/**', (r) => r.abort());
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value),
      [KEY, JSON.stringify(SAMPLE)]);
  const shot = (name) => process.env.SHOT_DIR ?
    page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }) : null;
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  await clickSceneText(page, 'Menu', 'Codex');
  await page.waitForFunction(() => window.__game.debug().scene === 'Codex');
  for (const key of ['evolution:crimson_arc', 'collab:phantom_blades']) {
    await clickKey(page, key);
    await page.waitForFunction((value) =>
      window.__game.game.scene.getScene('Codex').shown === value, key);
    await shot(key.replace(':', '_'));
  }
  for (const name of TABS) { await tab(page, name); await shot(name); }
  await clickKey(page, 'next');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Codex').page === 1);
  await clickKey(page, 'run:9');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Codex').runIdx >= 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Codex').runIdx === -1);
  await clickKey(page, 'restore');
  const input = page.locator('input[maxlength="20"]');
  await expect(input).toBeVisible(); await input.fill('short');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('SHORT');
  await page.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

  await startGame(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await clickSceneText(page, 'Pause', 'Codex');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Codex'));
  for (const name of TABS) await tab(page, name);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Codex'));
  expect(await page.evaluate(() => window.__game.debug().scenes)).toContain('Pause');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'));
  const time = await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.time);
  await page.waitForFunction((before) =>
    window.__game.game.scene.getScene('Game').sim.time > before, time);
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
});
