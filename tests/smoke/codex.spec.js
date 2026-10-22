import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

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

const scenes = (page) => page.evaluate(() => window.__game.debug().scenes);
const click = (page, x, y) => page.mouse.click(x * 2, y * 2); // холст 1280×720, координаты сцен 640×360
const TAB_X = [152, 264, 376, 488];

test('codex opens from the menu and from pause, tabs switch without errors', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**/www.gstatic.com/**', (r) => r.abort());
  await page.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem('codex-seeded')) {
      localStorage.setItem(k, v);
      sessionStorage.setItem('codex-seeded', '1');
    }
  }, [KEY, JSON.stringify(SAMPLE)]);
  const shot = (name) => (process.env.SHOT_DIR ? page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }) : null);

  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await shot('menu');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowDown'); // Co-op, Leaderboard, Codex
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.debug().scene === 'Codex', null, { timeout: 5_000 });
  await page.waitForTimeout(500);
  await shot('armory');
  // клавиатура: со вкладки вниз в сетку, вправо по записям
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await shot('armory_locked');
  await click(page, 28, 144); // первая эволюция (открыта: crimson_arc)
  await page.waitForTimeout(200);
  await shot('armory_evolution');
  await click(page, 28, 198); // первый коллаб
  await page.waitForTimeout(200);
  await shot('armory_collab');
  await click(page, 80, 198); // третий коллаб (открыт: phantom_blades, таблица по частям)
  await page.waitForTimeout(200);
  await shot('armory_collab_open');

  const names = ['armory', 'bestiary', 'bosses', 'chronicle'];
  for (let i = 1; i < names.length; i++) {
    await click(page, TAB_X[i], 40);
    await page.waitForFunction((n) => window.__game.game.scene.getScene('Codex').tab === n, names[i]);
    await page.waitForTimeout(600); // ходьба в превью успевает пройти несколько кадров
    await shot(names[i]);
  }
  // боссы: закрытый босс; бестиарий: закрытый монстр
  await click(page, TAB_X[2], 40);
  await page.waitForTimeout(200);
  await click(page, 229, 122);
  await page.waitForTimeout(300);
  await shot('bosses_locked');
  // летопись: страница 2, затем забег и назад к списку
  await click(page, TAB_X[3], 40);
  await page.waitForTimeout(200);
  await click(page, 494, 310); // >
  await page.waitForTimeout(200);
  await shot('chronicle_page2');
  await click(page, 444, 90); // первая строка страницы
  await page.waitForFunction(() => window.__game.game.scene.getScene('Codex').runIdx >= 0);
  await page.waitForTimeout(200);
  await shot('chronicle_run');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Codex').runIdx === -1);
  // восстановление: окно с полем id, неверный id, отмена
  await click(page, 566, 342);
  await page.waitForTimeout(200);
  const input = page.locator('input[maxlength="20"]');
  await expect(input).toHaveCount(1);
  await input.click();
  await page.keyboard.type('short');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await shot('chronicle_restore');
  await page.keyboard.press('Escape'); // снять фокус с поля
  await page.keyboard.press('Escape'); // закрыть окно
  await expect(input).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scene === 'Menu', null, { timeout: 5_000 });

  // из паузы: кодекс поверх, назад в паузу, забег жив
  await startGame(page);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await page.waitForTimeout(300);
  await shot('pause');
  const btn = await page.evaluate(() => {
    const p = window.__game.game.scene.getScene('Pause');
    const it = p.nav.items.find((i) => i.text && i.text.text === 'Codex');
    return it && { x: it.x, y: it.y };
  });
  expect(btn).toBeTruthy();
  await click(page, btn.x, btn.y);
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Codex'));
  await page.waitForTimeout(300);
  for (let i = 1; i < names.length; i++) {
    await click(page, TAB_X[i], 40);
    await page.waitForTimeout(150);
  }
  await shot('pause_codex');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Codex'));
  await page.waitForTimeout(300);
  expect(await scenes(page)).toContain('Pause');
  await page.keyboard.press('Escape'); // снова Esc: пауза закрывается, забег идёт
  await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'), null, { timeout: 5_000 });
  const t0 = await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.time);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.time)).toBeGreaterThan(t0);
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
});
