// Сбор ошибок консоли и страницы.
export function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return {
    get() {
      return errors.slice();
    },
  };
}

// Из меню в забег: Play → выбор героя → выбор сложности; Enter берёт то, что в фокусе (последний выбор).
export async function startGame(page) {
  await page.waitForFunction(() => window.__game && window.__game.debug().scene === 'Menu', null, { timeout: 15_000 });
  await page.keyboard.press('Enter'); // Play (фокус на первой кнопке)
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter'); // герой
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter'); // сложность
  await page.waitForFunction(() => window.__game.debug().scene === 'Game', null, { timeout: 5_000 });
}
