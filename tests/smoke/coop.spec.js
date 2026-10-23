import { test, expect } from '@playwright/test';
import { collectConsoleErrors, clickSceneText, clickSceneItem, driveGame } from './helpers.js';

// Local signalling replaces Firestore, but data and commands travel over real WebRTC.
const SIGNAL = `window.__furySignal = {
  async create(code, offer) { localStorage.setItem('room:' + code, JSON.stringify({ offer })); },
  async read(code) { const s = localStorage.getItem('room:' + code); return s ? JSON.parse(s) : null; },
  async answer(code, answer) {
    const d = JSON.parse(localStorage.getItem('room:' + code)); d.answer = answer;
    localStorage.setItem('room:' + code, JSON.stringify(d));
  },
  async remove() {},
}; window.__furyTestSeed = 1111;`;

test('real WebRTC duo: both UI players act and matching ticks have matching state', async ({ context }) => {
  test.setTimeout(120000);
  const pages = [await context.newPage(), await context.newPage()];
  const errors = pages.map(collectConsoleErrors);
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
  await clickSceneText(host, 'Lobby', 'Cursed');
  await guest.waitForFunction(() =>
    window.__game.game.scene.getScene('Lobby').difficulty === 'cursed');
  // Exercise start after a lobby longer than the short disconnect threshold.
  for (const p of pages) {await p.evaluate(async () => {
    (await import('/src/data/constants.js')).NET.dropAfter = 3;
  });}
  await host.evaluate(() => { window.__lobbyWaitStart = performance.now(); });
  await host.waitForFunction(() => performance.now() - window.__lobbyWaitStart > 3500);
  await clickSceneText(host, 'Lobby', 'Start');
  for (const p of pages) await p.waitForFunction(() => window.__game.debug().scene === 'Game');
  for (const p of pages) {await p.evaluate(() => {
    const ls = window.__game.game.scene.getScene('Game').ls;
    window.__smokeHashes = [];
    const send = ls.send;
    ls.send = (message) => {
      if (message.h !== undefined) window.__smokeHashes.push([message.h, message.v]);
      send(message);
    };
  });}
  await Promise.all(pages.map((p) => driveGame(p, 12)));
  const snapshot = (p) => p.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    return { names: gs.sim.players.map((x) => x.name), heroes: gs.sim.heroes,
      seed: gs.sim.seed, tick: gs.ls.tick, parts: window.__smokeHashes, desynced: gs.desynced,
      session: gs.telemetry.sessionId, local: gs.telemetry.local,
      picks: gs.telemetry.picks.length, inputs: gs.telemetry.inputs.length };
  });
  const [a, b] = await Promise.all(pages.map(snapshot));
  expect(a.names).toEqual(['ANN', 'BOB']); expect(b.names).toEqual(a.names);
  expect(a.heroes).toEqual(b.heroes); expect(a.heroes[0]).not.toBe(a.heroes[1]);
  expect(a.seed).toBe(1111); expect(a.session).toBe(b.session);
  expect([a.local, b.local]).toEqual([0, 1]);
  expect(a.inputs).toBeGreaterThan(1); expect(b.inputs).toBeGreaterThan(1);
  expect(a.picks).toBeGreaterThan(0); expect(b.picks).toBeGreaterThan(0);
  const common = a.parts.filter(([tick]) => b.parts.some(([other]) => tick === other));
  expect(common.length).toBeGreaterThan(0);
  for (const [tick, parts] of common) expect(b.parts.find(([t]) => t === tick)[1]).toEqual(parts);
  expect(a.desynced || b.desynced).toBe(false);
  // Explicit UI/network regression fixture at 6:11. Apply at a common future tick so
  // both WebRTC clients keep the same simulation state, regardless of browser timing.
  const at = Math.max(a.tick, b.tick) + 120;
  for (const p of pages) {await p.evaluate((tick) => {
    const gs = window.__game.game.scene.getScene('Game');
    const ls = gs.ls;
    const advance = ls.advance.bind(ls);
    let installed = false;
    let stalePause = false;
    ls.advance = (...args) => {
      if (!installed && ls.tick === tick) {
        installed = true;
        const sim = gs.sim;
        sim.time = 371; sim.state = 'running'; sim.pendingLevels = 0;
        sim.levelTurn = 1; sim.pickups = []; sim.enemies = []; sim.deadN = 0;
        sim.director.update = () => {};
        sim.player.xp = sim.player.xpNext;
        sim._checkLevel();
      }
      // Model an Escape already in transit when the guest selects their card.
      if (installed && !stalePause && ls.local === 0 && gs.sim.state === 'resume') {
        stalePause = true; ls.command({ k: 'pause' });
      }
      return advance(...args);
    };
  }, at);}
  for (const p of pages) {await p.waitForFunction(() => {
    const gs = window.__game.game.scene.getScene('Game');
    return gs.sim.time === 371 && gs.sim.picker === 1 &&
      gs.scene.isActive('LevelUp') && !gs.scene.get('LevelUp').closed;
  });}
  await host.keyboard.press('Escape');
  await guest.keyboard.press('Escape');
  await clickSceneItem(guest, 'LevelUp', 0);
  for (const p of pages) {await p.waitForFunction(() => {
    const gs = window.__game.game.scene.getScene('Game');
    return gs.sim.time > 372 && gs.sim.state === 'running' && !gs.ls.paused &&
      !gs.scene.isActive('LevelUp') && !gs.scene.isActive('Pause');
  }, null, { timeout: 15000 });}
  // Ordinary shared pause and resume must still work after the rejected stale command.
  await host.keyboard.press('Escape');
  for (const p of pages) await p.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await clickSceneText(guest, 'Pause', 'Resume');
  for (const p of pages) {await p.waitForFunction(() => {
    const gs = window.__game.game.scene.getScene('Game');
    return !gs.ls.paused && gs.sim.time > 373 && !gs.scene.isActive('Pause');
  });}
  const [afterA, afterB] = await Promise.all(pages.map(snapshot));
  expect(afterA.desynced || afterB.desynced).toBe(false);
  const afterHashes = afterA.parts.filter(([tick]) => tick >= at &&
    afterB.parts.some(([other]) => other === tick));
  expect(afterHashes.length).toBeGreaterThan(0);
  for (const [tick, hash] of afterHashes) {
    expect(afterB.parts.find(([other]) => other === tick)[1]).toEqual(hash);
  }
  await host.evaluate(() => window.__game.game.scene.getScene('Game').scene.start('Menu'));
  await guest.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'));
  for (const p of pages) expect(await p.evaluate(() => window.__game.debug().errors)).toEqual([]);
  for (const e of errors) expect(e.get()).toEqual([]);
});
