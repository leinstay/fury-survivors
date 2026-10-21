// Быстрый плейтест в headless Chromium: Play, движение по кругу, выбор первой карточки на уровнях,
// каждые 10 с печатает __game.debug(). Скриншот (опционально) делается на shotAt-й секунде.
// node tools/playtest.mjs [seconds=60] [--shot path.png] [--shot-at 25] [--url http://...]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const seconds = Number(args.find((a) => /^\d+$/.test(a)) || 60);
const shot = opt('--shot', null);
const shotAt = Number(opt('--shot-at', 25));
let url = opt('--url', null);

let srv = null;
if (!url) {
  srv = spawn(process.execPath, ['tools/serve.mjs', '8125']);
  url = 'http://localhost:8125/';
  await new Promise((r) => setTimeout(r, 800));
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  for (let s = 0; s < seconds; s++) {
    const k = keys[s % 4];
    await page.keyboard.down(k);
    await page.waitForTimeout(1000);
    await page.keyboard.up(k);
    const d = await page.evaluate(() => window.__game.debug());
    if (d.scene === 'LevelUp') await page.keyboard.press('Enter');
    if (s % 10 === 9 || d.scene === 'GameOver' || d.scene === 'Victory') {
      console.log(JSON.stringify({
        t: Math.round(d.time), scene: d.scene, fps: d.fps, enemies: d.enemies, hp: d.hp && Math.round(d.hp), lvl: d.level,
        weapons: d.weapons.map((w) => `${w.id}:${w.level}`).join(','),
      }));
    }
    if (shot && s === shotAt) await page.screenshot({ path: shot });
    if (d.scene === 'GameOver' || d.scene === 'Victory') break;
  }
  console.log('errors:', JSON.stringify(errors));
} finally {
  await browser.close();
  if (srv) srv.kill();
}
