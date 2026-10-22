// Полный сетевой поток в двух окнах: меню → кооп → хост создаёт лобби, гость подключается по коду,
// хост выбирает Cursed и жмёт Start, обе страницы в Game, играют 8 с, хост закрывает → у гостя итоги.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const dir = '/tmp/claude-0/-home-user-fury-survivors/e8e7b7bf-1bf5-53fd-b7f8-f117cb419236/scratchpad/shots';
const srv = spawn('node', ['tools/serve.mjs', '8131'], { cwd: '/home/user/fury-survivors', stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const errors = [];
const pages = [];
// сигналинг вместо Firestore: localStorage одного origin (оба окна); подменяем loadFirestore через window-хук
const signalJs = `
  window.__furySignal = {
    async create(code, offer) { localStorage.setItem('room:' + code, JSON.stringify({ offer })); },
    async read(code) { const s = localStorage.getItem('room:' + code); return s ? JSON.parse(s) : null; },
    async answer(code, sdp) { const d = JSON.parse(localStorage.getItem('room:' + code)); d.answer = sdp; localStorage.setItem('room:' + code, JSON.stringify(d)); },
    async remove() {},
  };`;
for (let i = 0; i < 2; i++) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`p${i}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`p${i}: ${m.text()}`); });
  await page.addInitScript(signalJs);
  await page.goto('http://localhost:8131/');
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 20000 });
  pages.push(page);
}
const [host, guest] = pages;
const dbg = (p) => p.evaluate(() => window.__game.debug());
// меню → Co-op
for (const p of pages) { await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100); await p.keyboard.press('Enter'); await p.waitForTimeout(400); }
await host.screenshot({ path: `${dir}/lobby-menu.png` });
// ник через DOM input
await host.evaluate(() => { const el = document.querySelector('input'); el.value = 'ANN'; });
await guest.evaluate(() => { const el = document.querySelector('input'); el.value = 'BOB'; });
// хост: Create lobby (фокус на поле ника? при пустом нике фокус 0 = поле; у нас ник пуст при старте → индекс 0). Enter на поле фокусирует input. Жмём стрелку вниз и Enter.
await host.keyboard.press('ArrowDown'); await host.waitForTimeout(80); await host.keyboard.press('Enter');
try {
  await host.waitForFunction(() => window.__game.debug().scene === 'Lobby', null, { timeout: 5000 });
} catch (e) {
  console.log('host stuck', JSON.stringify(await dbg(host)), 'lastError', await host.evaluate(() => window.__game.lastError && window.__game.lastError()));
  console.log('errors', errors);
  await host.screenshot({ path: `${dir}/lobby-stuck.png` });
  await browser.close(); srv.kill(); process.exit(1);
}
await host.waitForFunction(() => { const s = window.__game.game.scene.getScene('Lobby'); return s.code && s.code.length === 5; }, null, { timeout: 15000 });
const code = await host.evaluate(() => window.__game.game.scene.getScene('Lobby').code);
console.log('code', code);
await host.screenshot({ path: `${dir}/lobby-host-wait.png` });
// гость: код в поле и Connect
await guest.evaluate((c) => { const els = document.querySelectorAll('input'); els[1].value = c; }, code);
await guest.evaluate(() => document.querySelectorAll('input')[1].dispatchEvent(new CustomEvent('nick-enter')));
await guest.waitForFunction(() => window.__game.debug().scene === 'Lobby', null, { timeout: 5000 });
await host.waitForFunction(() => { const s = window.__game.game.scene.getScene('Lobby'); return !!s.partner; }, null, { timeout: 20000 });
await guest.waitForFunction(() => { const s = window.__game.game.scene.getScene('Lobby'); return !!s.partner; }, null, { timeout: 20000 });
await host.waitForTimeout(400);
console.log('host lobby', await host.evaluate(() => { const s = window.__game.game.scene.getScene('Lobby'); return [s.partner, s.difficulty, s.status.text]; }));
console.log('guest lobby', await guest.evaluate(() => { const s = window.__game.game.scene.getScene('Lobby'); return [s.partner, s.difficulty, s.status.text]; }));
// хост выбирает Cursed (кнопка 2) и Start
await host.evaluate(() => window.__game.game.scene.getScene('Lobby').pickDifficulty('cursed'));
await host.waitForTimeout(400);
await host.screenshot({ path: `${dir}/lobby-host.png` });
await guest.screenshot({ path: `${dir}/lobby-guest.png` });
console.log('guest diff', await guest.evaluate(() => window.__game.game.scene.getScene('Lobby').difficulty));
await host.evaluate(() => window.__game.game.scene.getScene('Lobby').start());
await host.waitForFunction(() => window.__game.debug().scene === 'Game', null, { timeout: 5000 });
await guest.waitForFunction(() => window.__game.debug().scene === 'Game', null, { timeout: 5000 });
await host.evaluate(() => { const gs = window.__game.game.scene.getScene('Game'); gs.gameInput.read = () => ({ x: -1, y: 0 }); });
await guest.evaluate(() => { const gs = window.__game.game.scene.getScene('Game'); gs.gameInput.read = () => ({ x: 1, y: 0 }); });
await host.waitForTimeout(8000);
const snap = (p) => p.evaluate(() => { const gs = window.__game.game.scene.getScene('Game'); const s = gs.sim; return { tick: gs.ls.tick, time: +s.time.toFixed(2), diff: s.difficulty, local: s.local, names: s.players.map((q) => q.name), ps: s.players.map((q) => [Math.round(q.x), Math.round(q.y)]), desynced: gs.desynced, lost: gs.lost, waitT: gs.ls.waitT }; });
console.log('host game', JSON.stringify(await snap(host)));
console.log('guest game', JSON.stringify(await snap(guest)));
await guest.screenshot({ path: `${dir}/lobby-game-guest.png` });
// хост уходит в меню (Game shutdown закрывает канал) → гость видит потерю связи
await host.evaluate(() => { const gs = window.__game.game.scene.getScene('Game'); gs.scene.start('Menu'); });
await guest.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'), null, { timeout: 30000 });
await guest.waitForTimeout(500);
await guest.screenshot({ path: `${dir}/lobby-lost.png` });
console.log('errors', errors);
await browser.close(); srv.kill();
