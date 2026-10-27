import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startGame, waitChestReady } from './helpers.js';

// Размеры кнопок по всем экранам (src/ui/menu-layout.js): одинаковая роль — одинаковый размер.
// Обходит сцены, собирает кнопки (пункты фокуса с рамкой и подписью) и пишет таблицу
// «экран → кнопка → размер и центр» в tools/out/ui-sizes.json.

// Кнопки сцены: подпись, размер, центр.
const buttons = (page, name) => page.evaluate((n) => window.__game.game.scene.getScene(n).nav.items
    .filter((i) => i.rect && i.text)
    .map((i) => ({ label: i.text.text, w: i.w, h: i.h, x: Math.round(i.x), y: Math.round(i.y) })),
name);

const menuView = (page, v) => page.evaluate((x) => window.__game.game.scene.getScene('Menu').show(x), v);
const size = (b) => `${b.w}x${b.h}`;

test('button sizes: one size per role on every screen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route(/firestore\.googleapis|firebaseio|googleapis\.com\/identitytoolkit/, (r) => r.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  const table = {};
  const grab = async (screen, scene) => { table[screen] = await buttons(page, scene); };

  // заголовок экрана (ui/menu-layout.js screenTitle): текст, x, y, размер шрифта и цвет
  const titles = {};
  let playTitle;
  const TITLES = { difficulty: 'Choose difficulty', hero: 'Choose class',
    coop: 'Online co-op', settings: 'Settings' };
  const title = (scene, label) => page.evaluate(([n, l]) => {
    const o = window.__game.game.scene.getScene(n).children.list
        .find((c) => c.type === 'Text' && c.text === l);
    if (!o) return null;
    return { x: Math.round(o.x), y: Math.round(o.y), size: o.style.fontSize, color: o.style.color };
  }, [scene, label]);
  for (const v of ['main', 'play', 'difficulty', 'hero', 'coop', 'settings']) {
    await menuView(page, v);
    await grab(`Menu/${v}`, 'Menu');
    if (TITLES[v]) titles[`Menu/${v}`] = await title('Menu', TITLES[v]);
    if (v === 'play') playTitle = await title('Menu', 'Choose mode');
  }
  await menuView(page, 'main');
  const PAGE_TITLES = { Codex: 'Codex', Inventory: 'Inventory', Achievements: 'Achievements',
    Leaderboard: 'Leaderboard' };
  for (const [screen, scene, data] of [['Codex', 'Codex', { from: 'Menu' }], ['Inventory', 'Inventory', {}],
    ['Inventory/craft', 'Inventory', { tab: 'craft' }], ['Achievements', 'Achievements', {}],
    ['Leaderboard', 'Leaderboard', {}]]) {
    await page.evaluate(([s, d]) => window.__game.game.scene.getScene('Menu').scene.start(s, d), [scene, data]);
    await page.waitForFunction((s) => window.__game.debug().scene === s, scene);
    await page.waitForTimeout(100);
    await grab(screen, scene);
    if (PAGE_TITLES[screen]) titles[screen] = await title(scene, PAGE_TITLES[screen]);
    await page.evaluate((s) => window.__game.game.scene.getScene(s).scene.start('Menu'), scene);
    await page.waitForFunction(() => window.__game.debug().scene === 'Menu');
  }

  await startGame(page);
  await page.evaluate(() => {
    const sim = window.__game.game.scene.getScene('Game').sim;
    sim.player.xp = sim.player.xpNext;
    sim._checkLevel();
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('LevelUp'));
  await page.waitForTimeout(200);
  await grab('LevelUp', 'LevelUp');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim._openChest(gs.sim.player);
    gs.handleEvents(gs.sim.events);
  });
  await waitChestReady(page);
  await grab('Chest', 'Chest');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await grab('Pause', 'Pause');
  for (const v of ['options', 'inventory']) {
    await page.evaluate((x) => window.__game.game.scene.getScene('Pause').show(x), v);
    await grab(`Pause/${v}`, 'Pause');
    titles[`Pause/${v}`] = await title('Pause', v === 'options' ? 'Options' : 'Inventory');
    // «Paused» только на корне паузы
    expect(await title('Pause', 'Paused')).toBe(null);
  }
  await page.evaluate(() => {
    window.__game.game.scene.stop('Pause');
    const gs = window.__game.game.scene.getScene('Game');
    gs.scene.pause();
    gs.scene.launch('GameOver', { sim: gs.sim });
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'));
  await page.waitForTimeout(300);
  await grab('GameOver', 'GameOver');

  mkdirSync('tools/out', { recursive: true });
  writeFileSync('tools/out/ui-sizes.json', JSON.stringify(table, null, 1));

  // столбик меню и паузы: один размер, пиксель в пиксель
  const column = table['Menu/main'];
  expect(new Set(column.map(size))).toEqual(new Set(['160x24']));
  const rect = (b) => [b.x, b.y, b.w, b.h];
  table.Pause.forEach((b, i) => expect(rect(b)).toEqual(rect(column[i])));
  // подэкраны Play: столбик той же ширины и с тем же шагом, что главное меню, по центру катка (Back отдельно)
  const mids = [];
  // Play как корневой: логотип, без заголовка экрана, Solo / Co-op на месте первых строк главного меню
  expect(playTitle).toBe(null);
  expect(table['Menu/play'].filter((b) => b.label !== 'Back').map(rect)).toEqual(column.slice(0, 2).map(rect));
  for (const v of ['difficulty', 'coop']) {
    const col = table[`Menu/${v}`].filter((b) => b.label !== 'Back');
    expect(new Set(col.map(size))).toEqual(new Set(['160x24']));
    expect(new Set(col.map((b) => b.x))).toEqual(new Set([column[0].x]));
    // кооп: в nav-кнопках нет поля ника (первая строка, на шаг выше Create lobby)
    const top = v === 'coop' ? col[0].y - (column[1].y - column[0].y) : col[0].y;
    mids.push(Math.round((top + col[col.length - 1].y) / 2));
  }
  for (const m of mids) expect(Math.abs(m - mids[0])).toBeLessThanOrEqual(1);
  // настройки меню и Options паузы — одинаковые строки
  expect(table['Pause/options'].map((b) => [b.x, b.y, b.w, b.h]))
      .toEqual(table['Menu/settings'].map((b) => [b.x, b.y, b.w, b.h]));
  // заголовок экрана: на всех подэкранах меню, страницах и подэкранах паузы один стиль и одна точка
  for (const [s, v] of Object.entries(titles)) expect([s, !!v]).toEqual([s, true]);
  expect(new Set(Object.values(titles).map((v) => `${v.x}/${v.y}/${v.size}/${v.color}`)).size).toBe(1);
  // Back: одна точка и один размер на всех страницах и подэкранах меню
  const backScreens = ['Menu/play', 'Menu/difficulty', 'Menu/hero', 'Menu/coop', 'Menu/settings', 'Codex',
    'Inventory', 'Inventory/craft', 'Achievements', 'Leaderboard', 'Pause/options', 'Pause/inventory'];
  for (const s of backScreens) {
    const b = table[s].find((x) => x.label === 'Back');
    expect([s, b && [b.x, b.y, b.w, b.h]]).toEqual([s, [68, 340, 120, 24]]);
  }
  // кнопки в ряд под содержимым — action
  for (const s of ['LevelUp', 'Chest']) expect(new Set(table[s].map(size))).toEqual(new Set(['120x24']));
  // вкладки — одна высота
  const tabs = [...table.Codex.filter((b) => ['Armory', 'Bestiary'].includes(b.label)),
    ...table.Inventory.filter((b) => ['Bag', 'Craft'].includes(b.label)),
    ...table.Leaderboard.filter((b) => ['Solo', 'Co-op'].includes(b.label))];
  expect(new Set(tabs.map((b) => b.h))).toEqual(new Set([20]));
});
