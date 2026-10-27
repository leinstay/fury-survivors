import { test, expect } from '@playwright/test';
import { collectConsoleErrors, clickSceneText, startGame } from './helpers.js';

const SHOTS = 'tools/out/shots';

test('achievement toast pops up in the run as soon as the condition is met', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await startGame(page);
  // убить босса: First Trophy получается сразу, плашка в забеге, а не на итогах
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    const e = gs.sim.spawnBoss('kitsune_empress');
    gs.sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
    // удар вне тика: события отдаём сцене сами, как после sim.step
    gs.handleEvents(gs.sim.events.slice());
  });
  await page.waitForFunction(() => window.__game.debug().toasts.includes('first_trophy'));
  expect(await page.evaluate(() => window.__game.game.scene.isActive('Toast'))).toBe(true);
  const done = await page.evaluate(async () =>
    (await import('/src/services/achievements.js')).getAchievements().done.first_trophy);
  expect(done).toBeTruthy();
  // плашка выехала: сцена Toast наверху, сам экран для debug() остаётся Game
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__game.debug().scenes)).not.toContain('Toast');
  await page.screenshot({ path: `${SHOTS}/toast-in-run.png` });
  // плашка уезжает и сцена останавливается сама
  await page.waitForFunction(() => !window.__game.game.scene.isActive('Toast'), null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errors.get()).toEqual([]);
});

test('achievement bonuses reach the run and the stats panels show the breakdown', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  const ids = ['first_trophy', 'three_crowns', 'untouchable', 'hoarder', 'smith', 'vacuum']; // порядок данных
  await page.evaluate(async (ids) => {
    const A = await import('/src/services/achievements.js');
    const C = await import('/src/core/achievements.js');
    const I = await import('/src/core/items.js');
    const R = await import('/src/core/rng.js');
    const S = await import('/src/services/inventory.js');
    const st = C.emptyAchievements();
    for (const id of ids) st.done[id] = 1;
    A.replaceAchievements(C.markSeen(st));
    const rng = R.createRng(11);
    const cur = S.getInventory();
    let bag = I.createBag(cur.bag.cols, cur.bag.rows);
    bag = I.place(bag, I.rollItem(rng, 3, { type: 'gloves', rarity: 'epic', uid: 'shotgloves' }), 0, 0) || bag;
    bag = I.place(bag, I.rollItem(rng, 3, { type: 'boots', rarity: 'rare', uid: 'shotboots' }), 2, 0) || bag;
    S.setInventory({ ...cur, bag });
  }, ids);
  await clickSceneText(page, 'Menu', 'Inventory');
  await page.waitForFunction(() => window.__game.debug().scene === 'Inventory');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/stats-inventory.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

  await startGame(page);
  const run = await page.evaluate(async () => {
    const L = await import('/src/core/loadout.js');
    const gs = window.__game.game.scene.getScene('Game');
    const p = gs.sim.player;
    p.passives.push({ id: 'attack', level: 2 }, { id: 'pickup', level: 3 });
    gs.sim._syncBuild();
    const exp = L.loadoutStats(p.heroDef.stats, p.passives, p.bag);
    return { ach: p.bag.ach, attack: p.stats.attack, want: exp.attack };
  });
  expect(run.ach).toEqual(ids);
  expect(Math.abs(run.attack - run.want)).toBeLessThan(1e-9);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await clickSceneText(page, 'Pause', 'Inventory');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Pause').view === 'inventory');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/stats-pause.png` });

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'));
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errors.get()).toEqual([]);
});

test('achievements screen lists the permanent bonus of every achievement', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  await page.evaluate(async () => {
    const A = await import('/src/services/achievements.js');
    const C = await import('/src/core/achievements.js');
    const st = C.emptyAchievements();
    for (const id of ['first_trophy', 'hunger', 'tetris', 'medic']) st.done[id] = 1;
    A.replaceAchievements(st);
  });
  await clickSceneText(page, 'Menu', 'Achievements');
  await page.waitForFunction(() => window.__game.debug().scene === 'Achievements');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/achievements-bonuses.png` });
  const texts = await page.evaluate(() => window.__game.game.scene.getScene('Achievements')
      .children.list.filter((o) => o.type === 'Text').map((o) => o.text));
  expect(texts.some((s) => s.includes('Attack'))).toBe(true);
  expect(errors.get()).toEqual([]);
});
