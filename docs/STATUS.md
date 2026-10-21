# Статус

## Этап 0. Каркас: готов

- Phaser 3.90.0 в `vendor/`, `index.html`, `src/main.js`, пустые сцены (Boot, Menu, Game, LevelUp, Pause, GameOver, Victory).
- Контракты данных в `src/data/*` (формат записей в комментариях), `assets/sprites/manifest.js` + заглушки (`npm run placeholders`).
- `window.__game.debug()`, i18n через `t()`.
- `npm run serve` (локальный сервер, порт 8080), `npm test` (unit + balance), `npm run smoke` (Playwright).
- Pre-commit хук в `.githooks/` (`npm install` подключает его через `core.hooksPath`).
- Деплой: GitHub Pages из `main`, корень.
