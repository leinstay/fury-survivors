# Fury Survivors: карта проекта

Игра в жанре Vampire Survivors / HoloCure. JavaScript (без TypeScript и без сборки), Phaser 3.90, деплой на GitHub Pages.
Видение: `VISION.md`. Как добавлять контент: `docs/CONTENT.md`. Ассеты и пайплайн картинок: `docs/ASSETS.md`.

## Где что лежит

```
index.html                 точка входа, грузит vendor/phaser.min.js и src/main.js (ES-модули), регистрирует sw.js
sw.js                      service worker: каждый запрос перепроверяется на сервере (ETag), кэш только для офлайна
eslint.config.js           правила стиля (npm run lint)
vendor/phaser.min.js       Phaser 3.90.0, лежит в репо, не CDN
src/
  main.js                  конфиг Phaser (холст 1280x720, мир 640x360 через zoom 2), список сцен
  data/                    ВЕСЬ БАЛАНС И КОНТЕНТ. Логику тут не пишем
    constants.js           глобальные числа: лимиты врагов, i-frames, магнит, кривая опыта, SIM (тик), NET (lockstep)
    difficulty.js          сложности: normal, cursed (spawnMul)
    coop.js                кооп: множители спавна и HP врагов, слоты, оживание
    net.js                 сеть: комнаты Firestore (код, таймауты), STUN
    leaderboard.js         таблица: лимиты ника, пара ников, кулдаун
    heroes.js              герои: статы, стартовое оружие, спрайт (heroine мечница, mage магесса); выбор в меню и лобби
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
    lockstep.js            сетевой кооп: ввод с задержкой по тикам, команды экранов, хеш состояния
    actions.js             действия экранов (карточка, сундук, пауза) одним интерфейсом для соло и коопа
    nick.js                проверка ника и пары ников
    roads.js               дороги: детерминированная сетка по чанкам
    heroes.js              выбор героя: validHero, freeHero, distinctHeroes (в коопе герои разные)
  behaviors/
    weapons/<type>.js      melee_arc, projectile, orbit, aura, boomerang, chain, area_drop, combo
    enemies/<type>.js      chase, dash, ranged, swarm, phase, boss, drift (стена и пролёт: прямой курс, исчезает за краем)
  render/                  Phaser-слой: синхронизирует спрайты с sim, анимация, эффекты; decor.js декор с логикой расстановки, roads.js песок дорог по чанкам
    anim.js                процедурная ходьба/покачивание/наклон/вспышка/смерть
    fx.js                  частицы, числа урона, тряска, хитстоп
  scenes/                  Boot, Menu (выбор героя, вид Co-op), Lobby (код, герои, сложность, старт), Game, LevelUp, Chest, Pause, GameOver, Victory, Leaderboard
  services/                leaderboard.js (таблицы соло и коопа, ip), net.js (WebRTC + сигналинг через Firestore rooms, логи `[fury-net]` в консоль), firebase.js, nick-store.js
  ui/                      фокус-навигация (focus.js) (клава/мышь/геймпад), HUD (счёт, DPS, миникарта), экранный джойстик; settings.js настройки (качество графики, миникарта, DPS, последний герой и сложность); hero-picker.js карточки выбора героя (сетка от 3 героев); dom-input.js текстовое поле (ник, код) поверх холста; clipboard.js копирование в буфер (код лобби по тапу); text-align.js центрует текст по пикселям; fullscreen.js полный экран на телефоне (кнопка Play и настройка, не любое касание)
  audio/sfx.js             воспроизведение звуков, рандом тона, лимит одновременных
  debug.js                 window.__game.debug(), запись ошибок в localStorage
  i18n/                    en.js + index.js (t('key')). Все строки UI только через t()
assets/
  sprites/manifest.js      ключ спрайта -> файл, размер кадра, точка опоры, кадры
  sprites/*.png            спрайты (заглушки и настоящие с тем же именем и кадром)
  audio/sfx/*.wav          эффекты (jsfxr)
  audio/music/theme.mp3    фоновая музыка (Goukisan, см. README.md, Credits), заменяется подменой файла
  fonts/                   пиксельный шрифт (OFL)
tools/                     локальные скрипты Node, в игру не попадают
  gen-sprite.mjs           генерация через OpenRouter (ключ из .secrets/, бюджет из ledger)
  clean-sprite.mjs         чистка в пиксель-арт: хромакей, даунскейл, палитра, обводка, кадр
  slice-sheet.mjs          нарезка листа (персонажи, окружение, предметы, иконки, снаряды) по tools/sheets.json; "hd" — плавное уменьшение без сетки
  snap-image.mjs           целая картинка (фон меню) по родной сетке модели, клетка в пиксель
  crop-raw.mjs             фигура из сырого листа в исходном разрешении (героиня в меню)
  hd-frames.mjs            лента из готовой анимации (PixelLab) без снятия сетки: плавное уменьшение, показ 1:1
  demouth.mjs              убирает рот, который PixelLab дорисовывает на кадрах анимации (assets/raw/*_pixellab)
  trim-wisps.mjs           стирает лишние язычки пламени на кадрах жницы (зоны кадра), лента потом через hd-frames
  pixellab-anim.mjs        анимация по первому кадру через PixelLab (ключ только в env PL_KEY)
  turn-worker.js           Cloudflare Worker: временные учётные данные TURN для коопа (docs/COOP.md)
  make-grass.mjs           процедурный тайл травы
  make-slash.mjs           процедурный взмах клинка (гладкий полумесяц, proj_blade_arc)
  sprite-table.mjs         таблица спрайтов в docs/ASSETS.md из manifest и sheets.json
  make-music.mjs           процедурный чиптюн-луп (запасной, пишет theme.wav; игра грузит theme.mp3)
  palette.json             общая палитра всех спрайтов
  placeholders.mjs         заглушки по manifest.js
  make-sfx.mjs             генерация звуков из пресетов jsfxr
  contact-sheet.mjs        превью-лист спрайтов для проверки человеком
  gen-ledger.json          учёт трат на генерацию
tests/
  unit/                    node --test: grid, stats, upgrades, data-валидация
  balance/                 node --test: headless-бот играет забег на core/sim (players: 2 — кооп)
  smoke/                   Playwright: запуск, старт, 30 с игры, нет ошибок, fps; coop.spec.js два окна по WebRTC
docs/                      CONTENT.md, ARCHITECTURE.md, ASSETS.md, LEADERBOARD.md, COOP.md (сводка коопа: сделано, руками, ограничения)
references/                референсы, НЕ в git (скриншоты чужих игр)
.secrets/                  ключи, НЕ в git, никогда не читать в коде игры
```

## Правила

- Баланс и контент только в `src/data/`. Числа в логике не хардкодим.
- `src/core/` не импортирует Phaser и не трогает DOM.
- Новое оружие или враг с существующим behavior: только запись в data + спрайт. Новое поведение: новый файл в `behaviors/`, регистрируется по имени.
- Строки UI только через `t()` из `src/i18n/`.
- Сетевой кооп: сим детерминирован, клиенты обмениваются только вводом (`core/lockstep.js`). В `core/sim.js` ничего недетерминированного (Math.random, Date, порядок обхода Map по вставке ок).
- Состояние для проверки: `window.__game.debug()` возвращает JSON (сцена, fps, врагов, hp, уровень, оружие, ошибки). Необработанная ошибка показывается красной строкой поверх игры и пишется в localStorage (`window.__game.lastError()`): Phaser на ней останавливает цикл кадров.
- Тесты и стиль: `npm run lint` (ESLint, подмножество Google JS Style Guide), `npm test` (unit + balance), `npm run smoke` (Playwright). Перед коммитом все три зелёные.
- Только именованные экспорты (`export default` запрещён линтером, кроме `*.config.js`).
- Генерацию ассетов запускает только один процесс за раз. Бюджет $5, стоп на $4.50 (`tools/gen-ledger.json`).
- `.secrets/` никогда не коммитим, не читаем агентами, не вставляем в код.
- Субагенты не коммитят. Коммитит, пушит и деплоит основная сессия.
