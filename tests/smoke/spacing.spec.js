import { test, expect } from '@playwright/test';
import { startGame, waitChestReady } from './helpers.js';

// Отступы на всех экранах: собирает рамки текста (getBounds) и прямоугольников (панели, кнопки, сетки —
// graphics с __box) и проверяет: текст не пересекает чужую рамку и не ближе MIN_GAP к ней снаружи, внутри
// рамки отстоит от краёв хотя бы на MIN_PAD, тексты не налезают друг на друга. Падает со списком нарушений.
// Числа — по рамкам Phaser (в них уже есть запас шрифта и обводка): MIN_GAP 3 ≈ 4 px до видимой кромки букв.
const MIN_GAP = 3;
const MIN_PAD = 1;

function check(page, screen, sceneName) {
  return page.evaluate(([scr, n, gap, pad]) => {
    const s = window.__game.game.scene.getScene(n);
    const r = (o) => ({ x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w),
      h: Math.round(o.h) });
    const texts = s.children.list
        .filter((o) => o.type === 'Text' && o.visible && o.alpha > 0 && o.text.trim())
        .map((o) => {
          const b = o.getBounds();
          const label = o.text.slice(0, 24).replace(/\n/g, ' ');
          return { label, ...r({ x: b.x, y: b.y, w: b.width, h: b.height }) };
        });
    const boxes = s.children.list.filter((o) => o.__box && o.visible && o.active)
        .map((o) => r(o.__box));
    const out = [];
    const sep = (a, b) => ({
      x: Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)),
      y: Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h)),
    });
    for (const t of texts) {
      for (const b of boxes) {
        const d = sep(t, b);
        if (d.x >= gap || d.y >= gap) continue; // далеко
        const inside = t.x >= b.x && t.y >= b.y && t.x + t.w <= b.x + b.w && t.y + t.h <= b.y + b.h;
        if (inside) {
          const p = Math.min(t.x - b.x, t.y - b.y, b.x + b.w - t.x - t.w, b.y + b.h - t.y - t.h);
          if (p < pad) out.push(`${scr}: «${t.label}» у края рамки ${JSON.stringify(b)} (${p})`);
          continue;
        }
        // рамка целиком внутри текста (подложка под текстом) — не про отступы
        if (b.x >= t.x && b.y >= t.y && b.x + b.w <= t.x + t.w && b.y + b.h <= t.y + t.h) continue;
        if (d.x < 0 && d.y < 0) out.push(`${scr}: «${t.label}» пересекает рамку ${JSON.stringify(b)}`);
        else out.push(`${scr}: «${t.label}» ближе ${gap} к рамке ${JSON.stringify(b)} (${Math.max(d.x, d.y)})`);
      }
    }
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const d = sep(texts[i], texts[j]);
        if (d.x < 0 && d.y < 0) out.push(`${scr}: «${texts[i].label}» налезает на «${texts[j].label}»`);
      }
    }
    return out;
  }, [screen, sceneName, MIN_GAP, MIN_PAD]);
}

test('spacing: no text touches or crosses frames and other texts', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route(/firestore\.googleapis|firebaseio|googleapis\.com\/identitytoolkit/, (r) => r.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
  // предметы в стеше и сумке, чтобы проверить имя выбранного предмета и крафт
  await page.evaluate(async () => {
    const I = await import('/src/core/items.js');
    const R = await import('/src/core/rng.js');
    const S = await import('/src/services/inventory.js');
    const rng = R.createRng(5);
    const cur = S.getInventory();
    S.setInventory({ ...cur, stash: [I.rollItem(rng, 2, { type: 'belt', uid: 'ub' }),
      I.rollItem(rng, 3, { type: 'ring', rarity: 'epic', uid: 'ur' })] });
  });
  const all = [];
  const run = async (screen, scene) => all.push(...await check(page, screen, scene));

  for (const v of ['main', 'difficulty', 'hero', 'coop', 'settings']) {
    await page.evaluate((x) => window.__game.game.scene.getScene('Menu').show(x), v);
    await page.waitForTimeout(100);
    await run(`Menu/${v}`, 'Menu');
  }
  const open = async (scene, data) => {
    await page.evaluate(([s, d]) => {
      const g = window.__game.game;
      g.scene.getScenes(true)[0].scene.start(s, d);
    }, [scene, data]);
    await page.waitForFunction((s) => window.__game.debug().scene === s, scene);
    await page.waitForTimeout(300);
  };
  await open('Codex', { from: 'Menu' });
  for (const tab of ['armory', 'characters', 'bestiary', 'bosses', 'chronicle']) {
    await page.evaluate((k) => window.__game.game.scene.getScene('Codex').setTab(k), tab);
    await page.waitForTimeout(150);
    await run(`Codex/${tab}`, 'Codex');
  }
  await open('Inventory', {});
  await page.evaluate(() => {
    const s = window.__game.game.scene.getScene('Inventory');
    s.sel = 'ur';
    s.render();
  });
  await run('Inventory', 'Inventory');
  await page.evaluate(() => window.__game.game.scene.getScene('Inventory').switchTab('craft'));
  await run('Inventory/craft', 'Inventory');
  await open('Achievements', {});
  await run('Achievements', 'Achievements');
  await open('Leaderboard', {});
  await page.waitForTimeout(500);
  await run('Leaderboard', 'Leaderboard');
  await open('Menu', {});

  await startGame(page);
  await page.evaluate(() => {
    const sim = window.__game.game.scene.getScene('Game').sim;
    sim.player.xp = sim.player.xpNext;
    sim._checkLevel();
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('LevelUp'));
  await page.waitForTimeout(300);
  await run('LevelUp', 'LevelUp');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.evaluate(() => {
    const gs = window.__game.game.scene.getScene('Game');
    gs.sim._openChest(gs.sim.player);
    gs.handleEvents(gs.sim.events);
  });
  await waitChestReady(page);
  await run('Chest', 'Chest');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.game.scene.getScene('Game').sim.state === 'running');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.debug().scenes.includes('Pause'));
  await page.waitForTimeout(300);
  await run('Pause', 'Pause');
  for (const v of ['options', 'inventory']) {
    await page.evaluate((x) => window.__game.game.scene.getScene('Pause').show(x), v);
    await run(`Pause/${v}`, 'Pause');
  }
  await page.evaluate(() => {
    window.__game.game.scene.stop('Pause');
    const gs = window.__game.game.scene.getScene('Game');
    gs.scene.pause();
    gs.scene.launch('GameOver', { sim: gs.sim });
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'));
  await page.waitForTimeout(300);
  await run('GameOver', 'GameOver');

  expect(all).toEqual([]);
});
