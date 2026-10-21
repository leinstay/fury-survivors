# Fury Survivors: карта проекта

Игра в жанре Vampire Survivors / HoloCure. JavaScript (без TypeScript и без сборки), Phaser 3.90, деплой на GitHub Pages.
Видение: `VISION.md`. План работ и этапы: `docs/PLAN.md`. Как добавлять контент: `docs/HOW-TO-ADD.md`.

## Где что лежит

```
index.html                 точка входа, грузит vendor/phaser.min.js и src/main.js (ES-модули)
vendor/phaser.min.js       Phaser 3.90.0, лежит в репо, не CDN
src/
  main.js                  конфиг Phaser (холст 1280x720, мир 640x360 через zoom 2), список сцен
  data/                    ВЕСЬ БАЛАНС И КОНТЕНТ. Логику тут не пишем
    constants.js           глобальные числа: лимиты врагов, i-frames, магнит, кривая опыта
    heroes.js              герои: статы, стартовое оружие, спрайт
    weapons.js             оружие: behavior + уровни (урон, кулдаун, количество, area...)
    passives.js            пассивки и статы по уровням
    combos.js              супероружие: { from: [a, b], result }
    enemies.js             враги: behavior, hp, speed, damage, xp, size, sprite, elite-варианты
    bosses.js              боссы
    pickups.js             опыт, еда, магнит, монеты, сундук
    stages/forest.js       карта: тайлы, объекты, таймлайн волн и событий, босс
  core/                    ЧИСТАЯ ЛОГИКА БЕЗ PHASER (запускается в Node для тестов)
    sim.js                 шаг симуляции: игрок, враги, снаряды, урон, опыт, уровни
    grid.js                пространственная сетка для коллизий
    stats.js               подсчёт итоговых статов из базовых + пассивок
    upgrades.js            генерация карточек улучшений, reroll/skip/banish
    director.js            спавн волн по таймлайну этапа
    rng.js                 сидируемый RNG
  behaviors/
    weapons/<type>.js      melee_arc, projectile, orbit, aura, boomerang, chain, area_drop
    enemies/<type>.js      chase, dash, ranged, swarm, phase
  render/                  Phaser-слой: синхронизирует спрайты с sim, анимация, эффекты
    anim.js                процедурная ходьба/покачивание/наклон/вспышка/смерть
    fx.js                  частицы, числа урона, тряска, хитстоп
  scenes/                  Boot, Menu, Game, LevelUp, Pause, GameOver, Victory
  ui/                      фокус-навигация (клава/мышь/геймпад), HUD, экранный джойстик
  audio/sfx.js             воспроизведение звуков, рандом тона, лимит одновременных
  i18n/                    en.js + index.js (t('key')). Все строки UI только через t()
assets/
  sprites/manifest.js      ключ спрайта -> файл, размер кадра, точка опоры, кадры
  sprites/*.png            спрайты (заглушки и настоящие с тем же именем и кадром)
  audio/sfx/*.wav          эффекты (jsfxr)
  audio/music/theme.mp3    фоновая музыка (Goukisan, см. CREDITS.md), заменяется подменой файла
  fonts/                   пиксельный шрифт (OFL)
tools/                     локальные скрипты Node, в игру не попадают
  gen-sprite.mjs           генерация через OpenRouter (ключ из .secrets/, бюджет из ledger)
  clean-sprite.mjs         чистка в пиксель-арт: хромакей, даунскейл, палитра, обводка, кадр
  slice-sheet.mjs          нарезка листа объектов (окружение, предметы, иконки, снаряды) по tools/sheets.json
  snap-image.mjs           целая картинка (фон меню) по родной сетке модели, клетка в пиксель
  make-grass.mjs           процедурный тайл травы
  make-music.mjs           процедурный чиптюн-луп (запасной, пишет theme.wav; игра грузит theme.mp3)
  palette.json             общая палитра всех спрайтов
  placeholders.mjs         заглушки по manifest.js
  make-sfx.mjs             генерация звуков из пресетов jsfxr
  contact-sheet.mjs        превью-лист спрайтов для проверки человеком
  gen-ledger.json          учёт трат на генерацию
tests/
  unit/                    node --test: grid, stats, upgrades, data-валидация
  balance/                 node --test: headless-бот играет 10 мин на core/sim
  smoke/                   Playwright: запуск, старт, 30 с игры, нет ошибок, fps
docs/                      PLAN.md, HOW-TO-ADD.md, ARCHITECTURE.md, ASSETS.md, STATUS.md
references/                референсы, НЕ в git (скриншоты чужих игр)
.secrets/                  ключи, НЕ в git, никогда не читать в коде игры
```

## Правила

- Баланс и контент только в `src/data/`. Числа в логике не хардкодим.
- `src/core/` не импортирует Phaser и не трогает DOM.
- Новое оружие или враг с существующим behavior: только запись в data + спрайт. Новое поведение: новый файл в `behaviors/`, регистрируется по имени.
- Строки UI только через `t()` из `src/i18n/`.
- Состояние для проверки: `window.__game.debug()` возвращает JSON (сцена, fps, врагов, hp, уровень, оружие, ошибки).
- Тесты: `npm test` (unit + balance), `npm run smoke` (Playwright). Перед коммитом оба зелёные.
- Генерацию ассетов запускает только один процесс за раз. Бюджет $5, стоп на $4.50 (`tools/gen-ledger.json`).
- `.secrets/` никогда не коммитим, не читаем агентами, не вставляем в код.
- Субагенты не коммитят. Коммитит, пушит и деплоит основная сессия.
