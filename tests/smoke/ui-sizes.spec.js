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
  let lbPanel;
  let pauseInv;
  // фон экрана: есть ли арт меню и героини главного меню (ui/menu-layout.js menuBackdrop)
  const backdrops = {};
  const backdrop = (scene) => page.evaluate(async (n) => {
    const { HEROES } = await import('/src/data/heroes.js');
    const arts = new Set(Object.values(HEROES).map((h) => h.menu && h.menu.art).filter(Boolean));
    const list = window.__game.game.scene.getScene(n).children.list.filter((c) => c.type === 'Image');
    return { art: list.some((c) => c.texture.key === 'menu_bg'),
      heroines: list.some((c) => arts.has(c.texture.key)) };
  }, scene);
  // заголовок экрана поверх забега (overlayTitle): y и размер по ключу строки
  const overlays = {};
  const overlay = (scene, key) => page.evaluate(async ([n, k]) => {
    const { t } = await import('/src/i18n/index.js');
    const o = window.__game.game.scene.getScene(n).children.list
        .find((c) => c.type === 'Text' && c.text === t(k));
    return o ? { y: Math.round(o.y), size: o.style.fontSize } : null;
  }, [scene, key]);
  const TITLES = { play: 'Choose mode', difficulty: 'Choose difficulty', hero: 'Choose class',
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
    backdrops[`Menu/${v}`] = await backdrop('Menu');
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
    backdrops[screen] = await backdrop(scene);
    if (screen === 'Leaderboard') {
      lbPanel = await page.evaluate(() => window.__game.game.scene.getScene('Leaderboard').panelBox);
    }
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
  overlays.LevelUp = await overlay('LevelUp', 'levelup.title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim._openChest(gs.sim.player);
    gs.handleEvents(gs.sim.events);
  });
  await waitChestReady(page);
  await grab('Chest', 'Chest');
  overlays.Chest = await overlay('Chest', 'chest.title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await grab('Pause', 'Pause');
  overlays.Pause = await overlay('Pause', 'pause.title');
  for (const v of ['options', 'inventory']) {
    await page.evaluate((x) => window.__game.game.scene.getScene('Pause').show(x), v);
    await grab(`Pause/${v}`, 'Pause');
    backdrops[`Pause/${v}`] = await backdrop('Pause');
    // подэкраны паузы — заголовком экрана, «Paused» только у корня
    titles[`Pause/${v}`] = await title('Pause', v === 'options' ? 'Options' : 'Inventory');
    expect(await title('Pause', 'Paused')).toBe(null);
    if (v === 'inventory') {
      // строка заголовков Bag и Stats на одной линии; сетка и панель статов сверху и снизу на одной линии
      pauseInv = await page.evaluate(() => {
        const s = window.__game.game.scene.getScene('Pause');
        const txt = (re) => s.children.list.find((c) => c.type === 'Text' && re.test(c.text));
        return { bag: Math.round(txt(/^Bag /).y), stats: Math.round(txt(/^Stats$/).y),
          hint: !!txt(/only be changed/), legend: !!txt(/^passives$/) };
      });
    }
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
  overlays.GameOver = await overlay('GameOver', 'gameover.title');

  mkdirSync('tools/out', { recursive: true });
  writeFileSync('tools/out/ui-sizes.json', JSON.stringify(table, null, 1));

  // столбик меню и паузы: один размер, пиксель в пиксель
  const column = table['Menu/main'];
  expect(new Set(column.map(size))).toEqual(new Set(['160x24']));
  const rect = (b) => [b.x, b.y, b.w, b.h];
  table.Pause.forEach((b, i) => expect(rect(b)).toEqual(rect(column[i])));
  // подменю: столбик той же ширины и с тем же шагом, что главное меню, с одного y (Solo там же, где Normal)
  const step = column[1].y - column[0].y;
  const tops = [];
  for (const v of ['play', 'difficulty', 'coop']) {
    const col = table[`Menu/${v}`].filter((b) => b.label !== 'Back');
    expect(new Set(col.map(size))).toEqual(new Set(['160x24']));
    expect(new Set(col.map((b) => b.x))).toEqual(new Set([column[0].x]));
    // кооп: в nav-кнопках нет поля ника (первая строка, на шаг выше Create lobby)
    tops.push(v === 'coop' ? col[0].y - step : col[0].y);
  }
  expect(new Set(tops).size).toBe(1);
  // настройки: первые две строки — слайдеры (в таблице кнопок их нет), шаг строк настроек 27
  expect(table['Menu/settings'][0].y).toBe(tops[0] + 2 * 27);
  // фон: арт меню везде, героини только у корня главного меню
  for (const [s, b] of Object.entries(backdrops)) {
    expect([s, b]).toEqual([s, { art: true, heroines: s === 'Menu/main' }]);
  }
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
  // лидерборд как кодекс: панель от края до края, низ на общей линии; Refresh зеркально Back
  expect(lbPanel).toEqual({ left: 8, right: 632, top: 59, bottom: 322 });
  const refresh = table.Leaderboard.find((b) => b.label === 'Refresh');
  expect([refresh.x, refresh.y, refresh.w, refresh.h]).toEqual([640 - 68, 340, 120, 24]);
  expect(pauseInv).toEqual({ bag: pauseInv.stats, stats: pauseInv.stats, hint: true,
    legend: false });
  // заголовки поверх забега: один y и один размер
  for (const [s, v] of Object.entries(overlays)) expect([s, v]).toEqual([s, overlays.LevelUp]);
  expect(overlays.LevelUp && overlays.LevelUp.y).toBe(26);
  // кнопки в ряд под содержимым — action
  for (const s of ['LevelUp', 'Chest']) expect(new Set(table[s].map(size))).toEqual(new Set(['120x24']));
  // вкладки — одна высота
  const tabs = [...table.Codex.filter((b) => ['Armory', 'Bestiary'].includes(b.label)),
    ...table.Inventory.filter((b) => ['Bag', 'Craft'].includes(b.label)),
    ...table.Leaderboard.filter((b) => ['Solo', 'Co-op'].includes(b.label))];
  expect(new Set(tabs.map((b) => b.h))).toEqual(new Set([20]));
});
