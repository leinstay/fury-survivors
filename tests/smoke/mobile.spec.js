import { test, expect, devices } from '@playwright/test';

// Телефон: тач, альбомная ориентация (портрет закрыт оверлеем «поверни телефон»). Всё проходится только
// касаниями: меню, выбор героя, джойстик, пауза, инвентарь (взять, перетащить, повернуть, замок, пресеты,
// крафт, герой статов), ачивки, плашка ачивки, лут после забега, кодекс, лобби коопа.
// Скриншоты каждого экрана: tools/out/shots/mobile-*.png.
const SHOTS = 'tools/out/shots';
const { defaultBrowserType, ...PIXEL } = devices['Pixel 7 landscape'];
const { defaultBrowserType: _p, ...PORTRAIT } = devices['Pixel 7'];

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/mobile-${name}.png` });
const scene = (page) => page.evaluate(() => window.__game.debug().scene);

// Точка мира 640×360 в координатах страницы.
async function worldPoint(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  return { x: box.x + x * box.width / 640, y: box.y + y * box.height / 360 };
}

async function tapWorld(page, x, y) {
  const p = await worldPoint(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(60);
}

// Касание по пункту фокус-навигации сцены: по подписи кнопки или по ключу пункта.
async function tapItem(page, sceneName, pick) {
  const it = await page.evaluate(([name, p]) => {
    const items = window.__game.game.scene.getScene(name).nav.items;
    const found = items.find((i) => i.key === p || i.text?.text === p);
    return found ? { x: found.x, y: found.y, w: found.w } : null;
  }, [sceneName, pick]);
  if (!it) throw new Error(`${sceneName}: no item ${pick}`);
  await tapWorld(page, it.x, it.y);
  return it;
}

// Тач с движением (джойстик, перетаскивание предмета) через CDP: у page.touchscreen есть только tap.
async function touchDrag(page, cdp, from, to, { steps = 8, hold = 0 } = {}) {
  const a = await worldPoint(page, from.x, from.y);
  const b = await worldPoint(page, to.x, to.y);
  const pt = (p) => [{ x: p.x, y: p.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(a) });
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: pt({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }) });
    await page.waitForTimeout(16);
  }
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
}

// Все пункты фокуса сцены не мельче min по меньшей стороне (в пикселях мира; на Pixel 7 1 px мира ≈ 1 px CSS).
async function smallItems(page, sceneName, min) {
  return page.evaluate(([name, m]) => window.__game.game.scene.getScene(name).nav.items
      .filter((i) => Math.min(i.w, i.h) < m && !String(i.key || '').match(/^(bag|stash|craft):/))
      .map((i) => `${i.key || i.text?.text}: ${i.w}×${i.h}`), [sceneName, min]);
}

async function seedStash(page) {
  await page.evaluate(async () => {
    const I = await import('/src/core/items.js');
    const R = await import('/src/core/rng.js');
    const S = await import('/src/services/inventory.js');
    const rng = R.createRng(5);
    const cur = S.getInventory();
    S.setInventory({
      ...cur, bag: I.createBag(cur.bag.cols, cur.bag.rows),
      stash: [I.rollItem(rng, 2, { type: 'belt', uid: 'mbelt' }), I.rollItem(rng, 2, { type: 'ring', uid: 'mring' }),
        I.rollItem(rng, 3, { type: 'gloves', rarity: 'epic', uid: 'mgloves' }),
        I.rollUnique(rng, 3, { id: 'dice', uid: 'mdice' })],
    });
  });
}

// Сундук и карточки уровня закрываются тапом по первому пункту (после босса они идут подряд).
async function clearOverlays(page) {
  for (let guard = 0; guard < 20; guard++) {
    const over = await page.evaluate(() => ['Chest', 'LevelUp']
        .find((n) => window.__game.debug().scenes.includes(n)) || null);
    if (!over) {
      if (await scene(page) === 'Game') break;
      await page.waitForTimeout(200);
      continue;
    }
    if (over === 'Chest') {
      await page.waitForFunction(() => {
        const c = window.__game.game.scene.getScene('Chest');
        return c.revealed && c.time.now - c.revealAt > 260;
      });
    }
    await page.waitForTimeout(300);
    await shot(page, over.toLowerCase());
    const it = await page.evaluate((n) => {
      const i = window.__game.game.scene.getScene(n).nav.items.find((x) => !x.disabled);
      return { x: i.x, y: i.y };
    }, over);
    await tapWorld(page, it.x, it.y);
    if (over === 'Chest') {
      const c = await page.evaluate(() => {
        const b = window.__game.game.scene.getScene('Chest').confirmBtn;
        return b ? { x: b.x, y: b.y } : null;
      });
      if (c) await tapWorld(page, c.x, c.y);
    }
    await page.waitForTimeout(400);
  }
}

const bagOf = (page) => page.evaluate(() => window.__game.game.scene.getScene('Inventory').inv.bag.items
    .map((e) => ({ uid: e.item.uid, x: e.x, y: e.y, rot: e.rot })));

test.describe('mobile landscape', () => {
  test.use(PIXEL);

  test('touch-only pass through menu, run, pause, inventory, codex, loot, lobby', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/firestore|firebase|net::|Failed to load resource|workers.dev/i.test(m.text())) {
        errors.push(m.text());
      }
    });
    await page.route(/firestore\.googleapis|firebaseio|googleapis\.com\/identitytoolkit/, (r) => r.abort());
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
    expect(await page.evaluate(() => window.__game.game.device.input.touch)).toBe(true);
    await page.waitForTimeout(300);
    await shot(page, 'menu');
    await seedStash(page);

    // ---------- инвентарь из меню ----------
    await tapItem(page, 'Menu', 'Inventory');
    await page.waitForFunction(() => window.__game.debug().scene === 'Inventory');
    // тап по стешу берёт пояс, тап по клетке кладёт
    await tapWorld(page, 228, 62);
    await page.waitForFunction(() => window.__game.game.scene.getScene('Inventory').held?.uid === 'mbelt');
    await tapWorld(page, 21, 63);
    expect(await bagOf(page)).toEqual([{ uid: 'mbelt', x: 0, y: 0, rot: false }]);
    // кнопка Rotate поворачивает выбранный
    await tapItem(page, 'Inventory', 'act:rotate');
    expect(await bagOf(page)).toEqual([{ uid: 'mbelt', x: 0, y: 0, rot: true }]);
    // перетаскивание пальцем: кольцо из стеша в клетку (3, 1)
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(page, cdp, { x: 228, y: 62 }, { x: 10 + 3 * 22 + 11, y: 52 + 22 + 11 });
    expect(await bagOf(page)).toContainEqual({ uid: 'mring', x: 3, y: 1, rot: false });
    // замок кнопкой
    await tapItem(page, 'Inventory', 'act:lock');
    expect(await page.evaluate(() => {
      const s = window.__game.game.scene.getScene('Inventory');
      return s.inv.bag.items.find((e) => e.item.uid === 'mring').item.locked;
    })).toBe(true);
    // пресет: сохранить, снять всё в стеш руками, надеть обратно
    await tapItem(page, 'Inventory', 'save:0');
    await tapWorld(page, 21, 63);
    await tapWorld(page, 300, 120);
    expect((await bagOf(page)).length).toBe(1);
    await tapItem(page, 'Inventory', 'load:0');
    expect((await bagOf(page)).length).toBe(2);
    // герой статов: тап по правой части переключателя — следующий, по левой — предыдущий
    const sw = await page.evaluate(() => {
      const s = window.__game.game.scene.getScene('Inventory');
      const it = s.nav.items.find((i) => i.key === 'hero');
      return { x: it.x, y: it.y, w: it.w, hero: s.viewHero };
    });
    await tapWorld(page, sw.x + sw.w / 2 - 3, sw.y);
    const next = await page.evaluate(() => window.__game.game.scene.getScene('Inventory').viewHero);
    expect(next).not.toBe(sw.hero);
    await shot(page, 'inventory');
    await tapWorld(page, sw.x - sw.w / 2 + 3, sw.y);
    expect(await page.evaluate(() => window.__game.game.scene.getScene('Inventory').viewHero)).toBe(sw.hero);
    expect(await smallItems(page, 'Inventory', 14)).toEqual([]);
    // крафт: вкладка, выбор предмета, операция
    await tapItem(page, 'Inventory', 'tab:craft');
    await page.waitForFunction(() => window.__game.game.scene.getScene('Inventory').tab === 'craft');
    await tapWorld(page, 18, 60);
    expect(await page.evaluate(() => window.__game.game.scene.getScene('Inventory').sel)).toBeTruthy();
    await shot(page, 'craft');
    expect(await smallItems(page, 'Inventory', 14)).toEqual([]);
    await tapItem(page, 'Inventory', 'back');
    await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

    // ---------- ачивки ----------
    await tapItem(page, 'Menu', 'Achievements');
    await page.waitForFunction(() => window.__game.debug().scene === 'Achievements');
    await page.waitForTimeout(200);
    await shot(page, 'achievements');
    await tapItem(page, 'Achievements', 'Back');
    await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

    // ---------- кодекс (уникалки в арсенале) ----------
    await tapItem(page, 'Menu', 'Codex');
    await page.waitForFunction(() => window.__game.debug().scene === 'Codex');
    const uniq = await page.evaluate(() => window.__game.game.scene.getScene('Codex').nav.items
        .map((i) => i.key).find((k) => /unique/.test(String(k))));
    if (uniq) await tapItem(page, 'Codex', uniq);
    await page.waitForTimeout(200);
    await shot(page, 'codex-unique');
    await tapItem(page, 'Codex', 'tab:characters');
    await page.waitForTimeout(200);
    await shot(page, 'codex-characters');
    await tapItem(page, 'Codex', 'Back');
    await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

    // ---------- кооп: вид в меню и лобби ----------
    await tapItem(page, 'Menu', 'Co-op');
    await page.waitForFunction(() => window.__game.game.scene.getScene('Menu').view === 'coop');
    await page.waitForTimeout(200);
    await shot(page, 'coop');
    await page.evaluate(() => {
      const m = window.__game.game.scene.getScene('Menu');
      m.inputs[0].el.value = 'ANN';
    });
    await tapItem(page, 'Menu', 'Create lobby');
    await page.waitForFunction(() => window.__game.debug().scene === 'Lobby');
    await page.waitForTimeout(800);
    await shot(page, 'lobby');
    await page.evaluate(() => window.__game.game.scene.getScene('Lobby').scene.start('Menu'));
    await page.waitForFunction(() => window.__game.debug().scene === 'Menu');

    // ---------- забег: выбор героя тапом, джойстик ----------
    await page.evaluate(() => { window.__furyTestSeed = 1111; });
    await tapItem(page, 'Menu', 'Play');
    await page.waitForFunction(() => window.__game.game.scene.getScene('Menu').view === 'hero');
    await page.waitForTimeout(200);
    await shot(page, 'hero');
    const heroCard = await page.evaluate(() => {
      const it = window.__game.game.scene.getScene('Menu').nav.items[0];
      return { x: it.x, y: it.y };
    });
    await tapWorld(page, heroCard.x, heroCard.y);
    await page.waitForFunction(() => window.__game.game.scene.getScene('Menu').view === 'difficulty');
    await shot(page, 'difficulty');
    await tapItem(page, 'Menu', 'Normal');
    await page.waitForFunction(() => window.__game.debug().scene === 'Game');
    const p0 = await page.evaluate(() => {
      const p = window.__game.game.scene.getScene('Game').sim.player;
      return { x: p.x, y: p.y };
    });
    // палец в левой половине, тянем вправо и держим
    const drag = touchDrag(page, cdp, { x: 120, y: 250 }, { x: 160, y: 250 }, { hold: 900 });
    await page.waitForTimeout(700);
    await shot(page, 'game-joystick');
    await drag;
    const p1 = await page.evaluate(() => {
      const p = window.__game.game.scene.getScene('Game').sim.player;
      return { x: p.x, y: p.y };
    });
    expect(p1.x - p0.x).toBeGreaterThan(20);

    // плашка ачивки в забеге (босс убит)
    await page.evaluate(() => {
      const gs = window.__game.game.scene.getScene('Game');
      const e = gs.sim.spawnBoss('kitsune_empress');
      gs.sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
      gs.handleEvents(gs.sim.events.slice());
    });
    await page.waitForFunction(() => window.__game.debug().toasts.includes('first_trophy'));
    await page.waitForTimeout(500);
    await shot(page, 'toast');

    // пауза тапом по кнопке в левом нижнем углу; до неё закрываем сундук и карточки уровня
    const paused = () => page.evaluate(() => window.__game.debug().scenes.includes('Pause'));
    for (let i = 0; i < 6 && !(await paused()); i++) {
      await clearOverlays(page);
      await tapWorld(page, 22, 338);
      await page.waitForTimeout(400);
    }
    expect(await page.evaluate(() => window.__game.debug().scenes)).toContain('Pause');
    await page.waitForTimeout(300);
    await shot(page, 'pause');
    await tapItem(page, 'Pause', 'Inventory');
    await page.waitForFunction(() => window.__game.game.scene.getScene('Pause').view === 'inventory');
    await page.waitForTimeout(200);
    await shot(page, 'pause-inventory');
    await tapItem(page, 'Pause', 'Back');
    await page.waitForFunction(() => window.__game.game.scene.getScene('Pause').view === 'main');
    await tapItem(page, 'Pause', 'Resume');
    await page.waitForFunction(() => !window.__game.debug().scenes.includes('Pause'));

    // ---------- лут после забега ----------
    await page.evaluate(() => {
      const gs = window.__game.game.scene.getScene('Game');
      const e = gs.sim.spawnBoss('kitsune_empress');
      gs.sim.damageEnemy(e, 1e12, 'test', 0, 0, 0);
      gs.scene.pause();
      gs.scene.launch('GameOver', { sim: gs.sim });
    });
    await page.waitForFunction(() => window.__game.debug().scenes.includes('GameOver'));
    await page.waitForTimeout(400);
    await shot(page, 'loot');
    // по сундуку на босса: Take (если есть предметы), затем Next / Done
    for (let guard = 0; guard < 6; guard++) {
      const labels = await page.evaluate(() => {
        const g = window.__game.game.scene.getScene('GameOver');
        if (g.data0.lootDone) return null;
        return g.nav.items.filter((i) => !i.disabled).map((i) => i.text?.text);
      });
      if (!labels) break;
      if (labels.includes('Take')) await tapItem(page, 'GameOver', 'Take');
      await tapItem(page, 'GameOver', labels.includes('Done') ? 'Done' : 'Next chest');
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(() => window.__game.game.scene.getScene('GameOver').data0.lootDone);
    await page.waitForTimeout(400);
    await shot(page, 'results');

    expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
    expect(errors).toEqual([]);
    expect(await scene(page)).toBe('GameOver');
  });
});

test.describe('mobile portrait', () => {
  test.use(PORTRAIT);

  test('portrait shows the rotate overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.debug().scene === 'Menu');
    await page.waitForTimeout(300);
    await shot(page, 'portrait');
    const shown = await page.evaluate(() => [...document.body.children]
        .some((el) => el.style && el.style.display === 'flex' && el.style.position === 'fixed'));
    expect(shown).toBe(true);
  });
});
