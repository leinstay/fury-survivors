# Статус

## Этап 0. Каркас: готов

- Phaser 3.90.0 в `vendor/`, `index.html`, `src/main.js`, пустые сцены (Boot, Menu, Game, LevelUp, Pause, GameOver, Victory).
- Контракты данных в `src/data/*` (формат записей в комментариях), `assets/sprites/manifest.js` + заглушки (`npm run placeholders`).
- `window.__game.debug()`, i18n через `t()`.
- `npm run serve` (локальный сервер, порт 8080), `npm test` (unit + balance), `npm run smoke` (Playwright).
- Pre-commit хук в `.githooks/` (`npm install` подключает его через `core.hooksPath`).
- Деплой: GitHub Pages из `main`, корень.

## Этап 1. Играбельная версия на заглушках: готов

- Ядро (`src/core`, `src/behaviors`), весь контент демки в `src/data` (7 оружий, 9 пассивок, 2 комбо, 6 врагов, босс, таймлайн леса).
- Сцены Menu / Game / LevelUp / Pause / GameOver / Victory, HUD, фокус-навигация (клава, мышь, геймпад), экранный джойстик, оверлей поворота.
- Декор леса по чанкам (`src/render/decor.js`), волны с минимумом живых врагов (`min`/`minEnd` в таймлайне).
- Генерация: `tools/gen-sprite.mjs` (OpenRouter `/api/v1/images`, модель `openai/gpt-image-2.5-flare`, ~$0.02 за картинку medium), `tools/clean-sprite.mjs`, `tools/contact-sheet.mjs`. Героиня сгенерирована и почищена в кадр 64×64.
- `tools/playtest.mjs`: headless-плейтест с логом `__game.debug()` и скриншотом.
- Баланс (8 сидов): бот с апгрейдами доживает до босса на 7/8, без апгрейдов умирает на 2:27–3:47, пик 240–270 врагов.

Открыто: иконки `icon_*` пока цветные заглушки; эффекты (fx), звук, остальные спрайты на этапе 2.
