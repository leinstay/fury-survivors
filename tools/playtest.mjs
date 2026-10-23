// Visual sandbox only. Honest headless balance uses npm run sim:run / balance:quick.
// node tools/playtest.mjs [seconds=60] [--shot path.png] [--shot-at 25] [--url URL]
// --god and --weapons are explicit visual interventions; never estimate win rates here.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { startGame, driveGame } from '../tests/smoke/helpers.js';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const seconds = Number(args.find((a) => /^\d+$/.test(a)) || 60);
let url = opt('--url', '');
let server;
if (!url) {
  server = spawn(process.execPath, ['tools/serve.mjs', '8125']);
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
  url = 'http://localhost:8125/';
}
const browser = await chromium.launch();
try {
  const [width, height] = opt('--size', '1280x720').split('x').map(Number);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url); await startGame(page, Number(opt('--seed', 1111)));
  if (args.includes('--god')) await page.evaluate(() => window.__game.god(true));
  const weapons = opt('--weapons', '');
  if (weapons) {await page.evaluate((text) => {
    const s = window.__game.game.scene.getScene('Game').sim;
    s.player.weapons = text.split(',').map((x) => {
      const [id, level] = x.split(':'); return { id, level: Number(level || 1) };
    });
    s._syncBuild();
  }, weapons);}
  let nextLog = 0;
  let shot = false;
  await driveGame(page, seconds, async (r) => {
    if (r.time >= nextLog) { console.log(JSON.stringify(r)); nextLog += 10; }
    if (!shot && opt('--shot', '') && r.time >= Number(opt('--shot-at', 25))) {
      shot = true; await page.screenshot({ path: opt('--shot') });
    }
  });
} finally { await browser.close(); if (server) server.kill(); }
