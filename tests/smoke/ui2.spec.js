import { test, expect, devices } from '@playwright/test';
import { collectConsoleErrors, startGame, clickSceneText } from './helpers.js';

// Меню (столбец кнопок, Play → сложность → герой, Co-op под Play), пауза в той же раскладке с ачивками,
// кодекс (Armory без наезда заголовков, карточки героев как у боссов), карточки уровня с изменением
// статов. Десктоп и телефон; скриншоты tools/out/shots/ui2-<вид>-<экран>.png.
const SHOTS = 'tools/out/shots';
const { defaultBrowserType, ...PIXEL } = devices['Pixel 7 landscape'];

const menuView = (page, v) => page.waitForFunction(
    (x) => window.__game.game.scene.getScene('Menu').view === x, v);

// Прямоугольники кнопок столбца сцены (x, y, w, h), без зон, по порядку фокуса.
const rects = (page, name) => page.evaluate((n) => window.__game.game.scene.getScene(n).nav.items
    .map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h, label: i.text?.text })), name);

async function pass(page, tag) {
  const shot = (name) => page.screenshot({ path: `${SHOTS}/ui2-${tag}-${name}.png` });
  const errs = collectConsoleErrors(page);
  await page.route(/firestore\.googleapis|firebaseio|googleapis\.com\/identitytoolkit/, (r) => r.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  await page.waitForTimeout(300);
  await shot('menu');
  const main = await rects(page, 'Menu');
  expect(main.map((r) => r.label)).toEqual(['Play', 'Co-op', 'Inventory', 'Codex', 'Achievements', 'Leaderboard',
    'Settings']);
  expect(new Set(main.map((r) => `${r.w}x${r.h}`)).size).toBe(1);

  // Play → сложность, Co-op; Esc назад в главное
  await page.keyboard.press('Enter');
  await menuView(page, 'difficulty');
  await shot('difficulty');
  await page.keyboard.press('Escape');
  await menuView(page, 'main');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await menuView(page, 'coop');
  await page.keyboard.press('Escape');
  await menuView(page, 'main');

  // кодекс: Armory, Characters, Bosses
  await clickSceneText(page, 'Menu', 'Codex');
  await page.waitForFunction(() => window.__game.debug().scene === 'Codex');
  await page.waitForTimeout(300);
  await shot('codex-armory');
  const codexTab = async (id) => {
    await page.evaluate((k) => {
      const s = window.__game.game.scene.getScene('Codex');
      s.setTab(k);
    }, id);
    await page.waitForTimeout(300);
    await shot(`codex-${id}`);
  };
  await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Codex');
    // показ открытой пассивки: только в памяти сцены, без записи в сохранение
    s.codex = { ...s.codex, seen: { ...s.codex.seen, passive: { attack: 1 },
      weapon: { blade_arc: 1, throwing_daggers: 1 } } };
    s.render();
    const i = s.nav.items.findIndex((it) => /^passive:attack$/.test(String(it.key)));
    if (i >= 0) s.nav.focus(i);
  });
  await page.waitForTimeout(200);
  await shot('codex-passive');
  await codexTab('characters');
  await codexTab('bosses');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

  // инвентарь: строка заголовков (Bag, Stash с сортировкой текстом, валюты справа), сумка и крафт
  await page.evaluate(async () => {
    const I = await import('/src/core/items.js');
    const R = await import('/src/core/rng.js');
    const S = await import('/src/services/inventory.js');
    const rng = R.createRng(5);
    const cur = S.getInventory();
    S.setInventory({ ...cur, stash: [I.rollItem(rng, 2, { type: 'belt', uid: 'ub' }),
      I.rollItem(rng, 3, { type: 'ring', rarity: 'epic', uid: 'ur' })] });
  });
  await clickSceneText(page, 'Menu', 'Inventory');
  await page.waitForFunction(() => window.__game.debug().scene === 'Inventory');
  const inv = await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Inventory');
    const it = (k) => s.nav.items.find((i) => i.key === k);
    return { hero: !!it('hero'), sort: !!it('sort:type'), rect: !!it('sort:type')?.rect };
  });
  expect(inv).toEqual({ hero: true, sort: true, rect: false });
  await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Inventory');
    s.sort('rarity');
    s.nav.focus(s.nav.items.findIndex((i) => i.key === 'hero'));
  });
  await page.waitForTimeout(200);
  await shot('inventory');
  await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Inventory');
    s.sel = 'ur';
    s.switchTab('craft');
    s.nav.focus(s.nav.items.findIndex((i) => i.key === 'op:dis'));
  });
  await page.waitForTimeout(200);
  await shot('inventory-craft');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

  // лидерборд: активная вкладка выбрана (зелёная рамка), не выключена
  await clickSceneText(page, 'Menu', 'Leaderboard');
  await page.waitForFunction(() => window.__game.debug().scene === 'Leaderboard');
  await page.waitForTimeout(300);
  await shot('leaderboard');
  const tabs = await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Leaderboard');
    return Object.fromEntries(Object.entries(s.tabs)
        .map(([k, b]) => [k, [b.selected, b.disabled]]));
  });
  expect(tabs).toEqual({ solo: [true, false], coop: [false, false] });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

  // забег, карточки уровня с предпросмотром
  await startGame(page);
  await page.evaluate(() => {
    const sim = window.__game.game.scene.getScene('Game').sim;
    sim.player.xp = sim.player.xpNext;
    sim._checkLevel();
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('LevelUp'));
  await page.evaluate(async () => {
    const { PASSIVES } = await import('/src/data/passives.js');
    const { WEAPONS } = await import('/src/data/weapons.js');
    const sim = window.__game.game.scene.getScene('Game').sim;
    const pl = sim.players[sim.picker];
    const w = pl.weapons[0];
    const card = (id) => ({ kind: 'passive', id, level: 1, isNew: true, icon: PASSIVES[id].icon });
    pl.levelUp.cards = [
      { kind: 'weapon', id: w.id, level: w.level + 1, isNew: false, icon: WEAPONS[w.id].icon },
      card('attack'), card('haste'), card('max_hp'),
    ];
  });
  await page.waitForTimeout(400);
  await shot('levelup');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('LevelUp'));

  // пауза: та же раскладка, что главное меню; ачивки поверх паузы и назад
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await page.waitForTimeout(300);
  await shot('pause');
  const pause = await rects(page, 'Pause');
  pause.forEach((r, i) => {
    expect([r.x, r.y, r.w, r.h]).toEqual([main[i].x, main[i].y, main[i].w, main[i].h]);
  });
  await clickSceneText(page, 'Pause', 'Achievements');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Achievements'));
  await page.waitForTimeout(300);
  await shot('pause-achievements');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Achievements'));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game.debug().scenes)).toContain('Pause');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'));

  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errs.get().filter((e) => !/firestore|firebase|net::|Failed to load resource/i.test(e))).toEqual([]);
}

test('ui2 desktop: menu, pause, codex, level-up cards', async ({ page }) => {
  test.setTimeout(120_000);
  await pass(page, 'desktop');
});

test.describe('ui2 phone', () => {
  test.use(PIXEL);
  test('ui2 phone: same screens on Pixel 7 landscape', async ({ page }) => {
    test.setTimeout(120_000);
    await pass(page, 'phone');
  });
});
