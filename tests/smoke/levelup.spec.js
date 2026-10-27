import { test, expect } from '@playwright/test';
import { collectConsoleErrors, startGame } from './helpers.js';

// Экран уровня открывается не один раз: Phaser переиспользует сцену, выбор должен закрывать её каждый раз.
test('level-up screen closes after every pick, not only the first', async ({ page }) => {
  const errs = collectConsoleErrors(page);
  await page.goto('/');
  await startGame(page);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const sim = window.__game.game.scene.getScene('Game').sim;
      sim.player.xp = sim.player.xpNext;
      sim._checkLevel();
    });
    await page.waitForFunction(() => window.__game.debug().scenes.includes('LevelUp'), null, { timeout: 5_000 });
    await page.keyboard.press('Enter'); // первая карточка в фокусе
    await page.waitForFunction(() => !window.__game.debug().scenes.includes('LevelUp') &&
        window.__game.game.scene.isActive('Game'), null, { timeout: 5_000 });
  }
  expect(await page.evaluate(() => window.__game.game.scene.getScene('Game').sim.player.level)).toBe(4);
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  const telemetry = await page.evaluate(() => {
    const tr = window.__game.game.scene.getScene('Game').telemetry;
    return { offers: tr.offers.length, takes: tr.decisions.filter((d) => d.pick[1] === 'take'),
      inputs: tr.inputs.length };
  });
  expect(telemetry.offers).toBeGreaterThanOrEqual(3);
  expect(telemetry.takes).toHaveLength(3);
  expect(telemetry.takes.every((d) => d.offerId && d.decisionMs >= 0)).toBe(true);
  expect(errs.get()).toEqual([]);
});

// Строки статов на карточках: у нового оружия и пассивки — значение без «»», у следующего уровня —
// «было » станет»; настройка Detailed stats (Off) прячет строки и иконки.
test('level-up cards: values for new picks, detailed stats toggle hides them', async ({ page }) => {
  const errs = collectConsoleErrors(page);
  await page.goto('/');
  await startGame(page);
  await page.evaluate(() => {
    const sim = window.__game.game.scene.getScene('Game').sim;
    sim.player.xp = sim.player.xpNext;
    sim._checkLevel();
  });
  await page.waitForFunction(() => window.__game.debug().scenes.includes('LevelUp'));
  const lines = (detail) => page.evaluate(async (on) => {
    const { setSetting } = await import('/src/ui/settings.js');
    const { PASSIVES } = await import('/src/data/passives.js');
    const { WEAPONS } = await import('/src/data/weapons.js');
    setSetting('detailStats', on);
    const s = window.__game.game.scene.getScene('LevelUp');
    const sim = window.__game.game.scene.getScene('Game').sim;
    const pl = sim.players[sim.picker];
    const w = pl.weapons[0];
    const fresh = Object.keys(WEAPONS)
        .find((id) => !WEAPONS[id].evolved && !pl.weapons.some((x) => x.id === id));
    pl.levelUp.cards = [
      { kind: 'weapon', id: fresh, level: 1, isNew: true, icon: WEAPONS[fresh].icon },
      { kind: 'weapon', id: w.id, level: w.level + 1, isNew: false, icon: WEAPONS[w.id].icon },
      { kind: 'passive', id: 'attack', level: 1, isNew: true, icon: PASSIVES.attack.icon },
    ];
    s.render();
    return s.children.list.filter((o) => o.type === 'Text' && o.style.color === '#8cff6a')
        .map((o) => ({ text: o.text, y: Math.round(o.y), x: Math.round(o.x) }));
  }, detail);
  const on = await lines(true);
  const xs = [...new Set(on.map((l) => l.x))].sort((a, b) => a - b);
  const col = (i) => on.filter((l) => l.x === xs[i]);
  expect(col(0)[0].text).toMatch(/^Damage: [\d.]+$/);
  expect(col(1)[0].text).toContain('»');
  expect(col(2)[0].text).toMatch(/^Attack: \+/);
  // первая строка на одном y у всех карточек
  expect(new Set([col(0)[0].y, col(1)[0].y, col(2)[0].y]).size).toBe(1);
  expect(await lines(false)).toEqual([]);
  await page.evaluate(async () => (await import('/src/ui/settings.js')).setSetting('detailStats', true));
  expect(await page.evaluate(() => window.__game.debug().errors)).toEqual([]);
  expect(errs.get()).toEqual([]);
});
