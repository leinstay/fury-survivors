import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

// Сетевой кооп в двух окнах одного браузера: реальный WebRTC, сигналинг вместо Firestore через localStorage
// (globalThis.__furySignal, см. src/services/net.js). Меню → Co-op → хост создаёт лобби, гость подключается
// по коду, хост выбирает сложность и стартует; обе страницы в Game с одинаковым состоянием; хост уходит →
// у гостя экран итогов с потерей связи.
const SIGNAL = `
  window.__furySignal = {
    async create(code, offer) { localStorage.setItem('room:' + code, JSON.stringify({ offer })); },
    async read(code) { const s = localStorage.getItem('room:' + code); return s ? JSON.parse(s) : null; },
    async answer(code, sdp) {
      const d = JSON.parse(localStorage.getItem('room:' + code)); d.answer = sdp;
      localStorage.setItem('room:' + code, JSON.stringify(d));
    },
    async remove() {},
  };`;

test('online co-op: lobby, connect by code, synced game, partner leaves', async ({ context }) => {
  test.setTimeout(120_000);
  const pages = [];
  const errs = [];
  for (let i = 0; i < 2; i++) {
    const page = await context.newPage();
    errs.push(collectConsoleErrors(page));
    await page.addInitScript(SIGNAL);
    await page.goto('/');
    await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 15_000 });
    pages.push(page);
  }
  const [host, guest] = pages;
  const lobby = (p) => p.evaluate(() => window.__game.game.scene.getScene('Lobby'));
  for (const p of pages) {
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(100);
    await p.keyboard.press('Enter'); // Co-op
    await p.waitForTimeout(300);
  }
  await host.evaluate(() => { document.querySelector('input').value = 'ANN'; });
  await guest.evaluate(() => { document.querySelector('input').value = 'BOB'; });
  await host.keyboard.press('ArrowDown'); // Create lobby
  await host.waitForTimeout(80);
  await host.keyboard.press('Enter');
  await host.waitForFunction(() => window.__game.debug().scene === 'Lobby', null, { timeout: 5_000 });
  await host.waitForFunction(() => {
    const s = window.__game.game.scene.getScene('Lobby');
    return s.code && s.code.length === 5;
  }, null, { timeout: 15_000 });
  const code = await host.evaluate(() => window.__game.game.scene.getScene('Lobby').code);
  await guest.evaluate((c) => {
    const el = document.querySelectorAll('input')[1];
    el.value = c;
    el.dispatchEvent(new CustomEvent('nick-enter')); // Connect
  }, code);
  await guest.waitForFunction(() => window.__game.debug().scene === 'Lobby', null, { timeout: 5_000 });
  for (const p of pages) {
    await p.waitForFunction(() => !!window.__game.game.scene.getScene('Lobby').partner, null, { timeout: 20_000 });
  }
  expect(await host.evaluate(() => window.__game.game.scene.getScene('Lobby').partner)).toBe('BOB');
  expect(await guest.evaluate(() => window.__game.game.scene.getScene('Lobby').partner)).toBe('ANN');

  // оба пришли с героиней по умолчанию: гость уступает (сообщение hero), хост видит магессу у напарника
  await host.waitForFunction(() => window.__game.game.scene.getScene('Lobby').partnerHero === 'mage',
      null, { timeout: 5_000 });
  expect(await guest.evaluate(() => window.__game.game.scene.getScene('Lobby').hero)).toBe('mage');
  // героиня занята хостом: выбор отклоняется
  await guest.evaluate(() => window.__game.game.scene.getScene('Lobby').pickHero('heroine'));
  expect(await guest.evaluate(() => window.__game.game.scene.getScene('Lobby').hero)).toBe('mage');
  // обмен: хост отпускает героиню повторным кликом, гость берёт её, хост берёт освободившуюся магессу
  await host.evaluate(() => window.__game.game.scene.getScene('Lobby').pickHero('heroine'));
  await guest.waitForFunction(() => window.__game.game.scene.getScene('Lobby').partnerHero === '',
      null, { timeout: 5_000 });
  await guest.evaluate(() => window.__game.game.scene.getScene('Lobby').pickHero('heroine'));
  await host.waitForFunction(() => window.__game.game.scene.getScene('Lobby').partnerHero === 'heroine',
      null, { timeout: 5_000 });
  await host.evaluate(() => window.__game.game.scene.getScene('Lobby').pickHero('mage'));
  await guest.waitForFunction(() => window.__game.game.scene.getScene('Lobby').partnerHero === 'mage',
      null, { timeout: 5_000 });
  // лобби живёт дольше NET.dropAfter: после старта игра не должна тут же решить, что напарник пропал
  // (часы сцены в create() стоят на прошлом кадре); порог укорочен, чтобы не ждать 20 с
  for (const p of pages) {
    await p.evaluate(async () => { (await import('/src/data/constants.js')).NET.dropAfter = 3; });
  }
  await host.waitForTimeout(4000);
  await host.evaluate(() => window.__game.game.scene.getScene('Lobby').pickDifficulty('cursed'));
  await guest.waitForFunction(() => window.__game.game.scene.getScene('Lobby').difficulty === 'cursed',
      null, { timeout: 5_000 });
  await host.evaluate(() => window.__game.game.scene.getScene('Lobby').start());
  for (const p of pages) await p.waitForFunction(() => window.__game.debug().scene === 'Game', null, { timeout: 5_000 });
  await host.evaluate(() => { window.__game.game.scene.getScene('Game').gameInput.read = () => ({ x: -1, y: 0 }); });
  await guest.evaluate(() => { window.__game.game.scene.getScene('Game').gameInput.read = () => ({ x: 1, y: 0 }); });
  await host.waitForTimeout(6000);
  const snap = (p) => p.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    const s = gs.sim;
    return {
      diff: s.difficulty, names: s.players.map((q) => q.name), heroes: s.players.map((q) => q.hero),
      desynced: gs.desynced, tick: gs.ls.tick,
      telemetrySession: gs.telemetry.sessionId, telemetryLocal: gs.telemetry.local,
      inputSamples: gs.telemetry.inputs.length,
    };
  });
  const a = await snap(host);
  const b = await snap(guest);
  expect(a.telemetrySession).toBeTruthy();
  expect(a.telemetrySession).toBe(b.telemetrySession);
  expect(a.telemetryLocal).toBe(0);
  expect(b.telemetryLocal).toBe(1);
  expect(a.inputSamples).toBeGreaterThan(0);
  expect(b.inputSamples).toBeGreaterThan(0);
  expect(a.diff).toBe('cursed');
  expect(a.names).toEqual(['ANN', 'BOB']);
  expect(b.names).toEqual(['ANN', 'BOB']);
  expect(a.heroes).toEqual(b.heroes);
  expect(b.heroes).toEqual(['mage', 'heroine']);
  expect(a.desynced || b.desynced).toBe(false);
  expect(Math.abs(a.tick - b.tick)).toBeLessThan(30);
  expect(a.tick).toBeGreaterThan(30);

  await host.evaluate(() => window.__game.game.scene.getScene('Game').scene.start('Menu'));
  await guest.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'), null, { timeout: 30_000 });
  for (const p of pages) expect(await p.evaluate(() => window.__game.debug().errors)).toEqual([]);
  for (const e of errs) expect(e.get()).toEqual([]);
});
