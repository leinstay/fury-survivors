import { test, expect } from '@playwright/test';
import { clickSceneText } from './helpers.js';

// Диагностика зависания дуо без Escape (docs/BALANCE_AUDIT.md): один игрок сворачивает вкладку,
// пока второй выбирает карточку. Только по FURY_DUO_HIDDEN=1: на текущем коде сценарий
// воспроизводит обрыв и потому не входит в обычный smoke.
const SIGNAL = `window.__furySignal = {
  async create(code, offer) { localStorage.setItem('room:' + code, JSON.stringify({ offer })); },
  async read(code) { const s = localStorage.getItem('room:' + code); return s ? JSON.parse(s) : null; },
  async answer(code, answer) {
    const d = JSON.parse(localStorage.getItem('room:' + code)); d.answer = answer;
    localStorage.setItem('room:' + code, JSON.stringify(d));
  },
  async remove() {},
}; window.__furyTestSeed = 1111;`;

// Скрытие вкладки: document.hidden + visibilitychange (так видит Phaser) и остановка цикла кадров.
// Headless Chromium не останавливает requestAnimationFrame в фоне, настоящий браузер и телефон —
// останавливают; loop.sleep/wake воспроизводят именно это, сеть и обработчики сообщений работают.
const setHidden = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true,
    get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
  if (h) window.__game.game.loop.sleep();
  else window.__game.game.loop.wake();
}, hidden);

const net = (page) => page.evaluate(() => {
  const gs = window.__game.game.scene.getScene('Game');
  return { tick: gs.ls.tick, lost: gs.lost, silence: gs.ls.silence(gs.now()),
    scene: window.__game.debug().scene, state: gs.sim.state };
});

test('duo: partner tab hidden during a choice', async ({ context }) => {
  test.skip(!process.env.FURY_DUO_HIDDEN, 'diagnostic, set FURY_DUO_HIDDEN=1');
  test.setTimeout(180000);
  await context.route('**/www.gstatic.com/**', (route) => route.abort());
  await context.route('**/firestore.googleapis.com/**', (route) => route.abort());
  const pages = [await context.newPage(), await context.newPage()];
  for (const p of pages) {
    await p.addInitScript(SIGNAL); await p.goto('/');
    await p.waitForFunction(() => window.__game?.debug().scene === 'Menu');
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__game.game.scene.getScene('Menu').view === 'coop');
  }
  const [host, guest] = pages;
  await host.locator('input').nth(0).fill('ANN');
  await guest.locator('input').nth(0).fill('BOB');
  await clickSceneText(host, 'Menu', 'Create lobby');
  await host.waitForFunction(() => window.__game.game.scene.getScene('Lobby').code?.length === 5);
  const code = await host.evaluate(() => window.__game.game.scene.getScene('Lobby').code);
  await guest.locator('input').nth(1).fill(code);
  await guest.locator('input').nth(1).press('Enter');
  for (const p of pages) {await p.waitForFunction(() => {
    const s = window.__game.game.scene.getScene('Lobby');
    return s.partner && s.partnerHero && s.hero && s.hero !== s.partnerHero;
  });}
  await clickSceneText(host, 'Lobby', 'Start');
  for (const p of pages) await p.waitForFunction(() => window.__game.debug().scene === 'Game');
  const hideMs = Number(process.env.FURY_DUO_HIDDEN_MS || 25000);
  await host.waitForFunction(() => window.__game.game.scene.getScene('Game').ls.tick > 300);
  const before = await Promise.all(pages.map(net));
  // Гость «ушёл» в другую вкладку/приложение, хост в это время ждёт (как при выборе карточки).
  await setHidden(guest, true);
  await host.waitForTimeout(hideMs);
  const hostDuring = await net(host);
  await setHidden(guest, false);
  await guest.waitForTimeout(3000);
  const after = await Promise.all(pages.map(net));
  console.log(JSON.stringify({ hideMs, before, hostDuring, after }));
  // Ожидаемое поведение: короткий уход не рвёт сессию и не останавливает её навсегда.
  expect(after[0].lost || after[1].lost).toBe(false);
  expect(after[0].tick).toBeGreaterThan(hostDuring.tick);
});
