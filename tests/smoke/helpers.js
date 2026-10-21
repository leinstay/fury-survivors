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
