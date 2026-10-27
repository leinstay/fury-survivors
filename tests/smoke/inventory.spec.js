import { test, expect } from '@playwright/test';
import { collectConsoleErrors, clickSceneText, startGame } from './helpers.js';

// Клик по точке мира 640×360 на холсте.
async function worldPoint(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  return { x: box.x + x * box.width / 640, y: box.y + y * box.height / 360 };
}

async function clickWorld(page, x, y, opts = {}) {
  const p = await worldPoint(page, x, y);
  await page.mouse.click(p.x, p.y, opts);
}

const bagOf = (page) => page.evaluate(() =>
  window.__game.game.scene.getScene('Inventory').inv.bag.items
      .map((e) => ({ uid: e.item.uid, x: e.x, y: e.y, rot: e.rot })));

test('inventory: open from menu, place, rotate, drag; pause shows the bag read-only', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  // В стеше два предмета, сумка пустая (модули те же, что у игры: один URL — один экземпляр).
  await page.evaluate(async () => {
    const I = await import('/src/core/items.js');
    const R = await import('/src/core/rng.js');
    const S = await import('/src/services/inventory.js');
    const rng = R.createRng(5);
    const cur = S.getInventory();
    S.setInventory({
      ...cur, bag: I.createBag(cur.bag.cols, cur.bag.rows),
      stash: [I.rollItem(rng, 2, { type: 'belt', uid: 'smokebelt' }),
        I.rollItem(rng, 2, { type: 'ring', uid: 'smokering' })],
    });
  });
  await clickSceneText(page, 'Menu', 'Inventory');
  await page.waitForFunction(() => window.__game.debug().scene === 'Inventory');

  // клик по первому месту стеша берёт пояс, клик по клетке (0, 0) кладёт
  await clickWorld(page, 228, 62);
  await page.waitForFunction(() => window.__game.game.scene.getScene('Inventory').held?.uid === 'smokebelt');
  await clickWorld(page, 21, 63);
  expect(await bagOf(page)).toEqual([{ uid: 'smokebelt', x: 0, y: 0, rot: false }]);

  // R поворачивает выбранный предмет в сумке
  await page.keyboard.press('KeyR');
  expect(await bagOf(page)).toEqual([{ uid: 'smokebelt', x: 0, y: 0, rot: true }]);

  // перетаскивание кольца из стеша в клетку (3, 1)
  const from = await worldPoint(page, 228, 62);
  const to = await worldPoint(page, 10 + 3 * 22 + 11, 52 + 22 + 11);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const bag = await bagOf(page);
  expect(bag).toContainEqual({ uid: 'smokering', x: 3, y: 1, rot: false });

  // клавиатура: фокус ходит по клеткам, Enter берёт и кладёт
  await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Inventory');
    s.nav.focus(s.nav.items.findIndex((it) => it.key === 'bag:3,1'));
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Inventory').held?.uid === 'smokering');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await bagOf(page)).toContainEqual({ uid: 'smokering', x: 4, y: 1, rot: false });

  // вкладка крафта открывается и показывает предметы
  await clickSceneText(page, 'Inventory', 'Craft');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Inventory').tab === 'craft');
  await clickWorld(page, 18, 60);
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Inventory').sel)).toBeTruthy();

  // назад в меню, забег с этой сумкой, вкладка инвентаря в паузе
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu');
  await startGame(page);
  const loadout = await page.evaluate(() =>
    window.__game.game.scene.getScene('Game').sim.player.bag.items.map((e) => e.item.uid).sort());
  expect(loadout).toEqual(['smokebelt', 'smokering']);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await clickSceneText(page, 'Pause', 'Inventory');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Pause').view === 'inventory');
  expect(await page.evaluate(() =>
    window.__game.game.scene.getScene('Pause').bagView.bag.items.length)).toBe(2);
  // подсказка по наведению на предмет
  const hover = await worldPoint(page, 8 + 12, 46 + 14 + 12);
  await page.mouse.move(hover.x, hover.y);
  await page.waitForFunction(() => !!window.__game.game.scene.getScene('Pause').tip.box);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Pause').view === 'main');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'));

  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errors.get()).toEqual([]);
});

test('achievements view opens from the menu', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  await clickSceneText(page, 'Menu', 'Achievements');
  await page.waitForFunction(() => window.__game.debug().scene === 'Achievements');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu');
  expect(errors.get()).toEqual([]);
});

test('boss loot opens right away: take, disassemble for crystals, world waits', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await startGame(page);
  const before = await page.evaluate(async () => {
    const S = await import('/src/services/inventory.js');
    const A = await import('/src/services/achievements.js');
    const gs = window.__game.game.scene.getScene('Game');
    const e = gs.sim.spawnBoss('kitsune_empress');
    gs.sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
    const inv = S.getInventory();
    return { stash: inv.stash.length, crystals: inv.wallet.crystals || 0,
      dis: A.getAchievements().counters.disassembled || 0 };
  });
  // сундук шмоток открывается сам: анимация, затем карточки
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Loot'));
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.state)).toBe('loot');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Loot').nav.items?.length > 0);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tools/out/shots/loot-screen.png' });
  const entries = await page.evaluate(() =>
    window.__game.game.scene.getScene('Game').sim.player.loot[0].entries.map((e) =>
      (e.item ? { kind: e.kind, uid: e.item.uid } : { kind: e.kind })));
  const items = entries.filter((e) => e.kind !== 'scroll');
  // Esc не закрывает экран
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__game.debug().scenes.includes('Loot'))).toBe(true);
  const t0 = await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.time);
  let want = 0;
  if (items.length) {
    await clickSceneText(page, 'Loot', 'Take'); // первый предмет в стеш
    if (items.length > 1) {
      const label = await page.evaluate(() => window.__game.game.scene.getScene('Loot').nav.items
        .map((i) => i.text?.text).find((s) => s && s.startsWith('Disassemble all')));
      want = Number(label.match(/\+(\d+)/)[1]);
      await clickSceneText(page, 'Loot', label);
    }
  }
  await clickSceneText(page, 'Loot', 'Done');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Loot'));
  await page.waitForFunction((t) => window.__game.game.scene.getScene('Game').sim.time > t, t0);
  const after = await page.evaluate(async () => {
    const S = await import('/src/services/inventory.js');
    const A = await import('/src/services/achievements.js');
    const inv = S.getInventory();
    return { stash: inv.stash.length, crystals: inv.wallet.crystals || 0,
      dis: A.getAchievements().counters.disassembled || 0 };
  });
  expect(after.stash).toBe(before.stash + (items.length ? 1 : 0));
  expect(after.crystals).toBeGreaterThanOrEqual(before.crystals + want);
  expect(after.dis).toBe(before.dis + Math.max(0, items.length - 1));
  // экрана лута после забега нет
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.scene.pause();
    gs.scene.launch('GameOver', { sim: gs.sim });
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'));
  expect(await page.evaluate(() => window.__game.game.scene.getScene('GameOver').nav.items
    .some((i) => i.text?.text === 'Take'))).toBe(false);
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errors.get()).toEqual([]);
});
