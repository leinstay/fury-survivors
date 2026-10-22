# Fury Survivors

Небольшая игра в духе Vampire Survivors / HoloCure. Весь проект собрал Claude Code по одному брифу, [`VISION.md`](VISION.md), за два пятичасовых лимита Claude Code. Opus 5.5 вёл сессию, планировал работу, писал большую часть кода и проверял её; субагенты Sonnet 5.5 параллельно брали отдельные задачи по коду (см. [`.claude/agents/coder.md`](.claude/agents/coder.md)). Графику рисовала модель GPT 2.5 Flare. Анимации из PixelLab.

**Играть:** https://leinstay.github.io/fury-survivors/

## Что в игре

- Один этап: 15 минут в лесу с волнами врагов по таймлайну, элитами, из которых падают сундуки, и боссом каждые пять минут: Kitsune Empress в 5:00, Harpy Queen в 10:00 и финальная Dryad Queen в 15:00.
- 7 видов оружия по 7 уровней, 9 пассивок, выбор карточек с реролом, пропуском и баном.
- 28 супероружий, есть как коллаб для каждой пары оружия, так и эволюция каждого оружия с пассивкой.
- 8 типов врагов и 3 босса со своими атаками.
- Онлайн-таблица на Cloud Firestore.

## Управление

| Действие | Клавиатура | Геймпад | Сенсор |
|---|---|---|---|
| Движение | WASD / стрелки | левый стик / крестовина | вести пальцем где угодно |
| Выбор | Enter / пробел | A | тап |
| Назад / пауза | Esc | B / Start | кнопка паузы |

## Запуск локально

Нужен Node.js 20+. Сборки нет: игра состоит из обычных ES-модулей, Phaser 3.90 лежит в `vendor/`.

```bash
npm install
npm run serve
```

Затем откройте http://localhost:8080. Подойдёт и любой другой статический сервер.

## Тесты

```bash
npm test
npm run smoke
```

`npm test` запускает unit-тесты и headless-прогоны баланса на симуляции; `npm run smoke` запускает игру в Playwright и играет 30 секунд. `node tools/playtest.mjs` проходит забег в headless Chromium и умеет делать скриншот.

## Структура проекта

- `src/data/`: весь баланс и контент (оружие, пассивки, комбо, враги, боссы, таймлайн этапа).
- `src/core/`: симуляция без Phaser, запускается в Node для тестов.
- `src/behaviors/`: поведения оружия и врагов, регистрируются по имени.
- `src/render/`, `src/scenes/`, `src/ui/`: слой Phaser.
- `assets/sprites/manifest.js`: все спрайты по ключам; `assets/raw/`: оригиналы от модели.
- `tools/`: скрипты для ассетов (генерация через OpenRouter, нарезка, анимация PixelLab, звуки).

Подробнее: [`CLAUDE.md`](CLAUDE.md) (карта и правила), [`docs/CONTENT.md`](docs/CONTENT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ASSETS.md`](docs/ASSETS.md), [`docs/LEADERBOARD.md`](docs/LEADERBOARD.md).

## Авторы и лицензии

- **Движок:** [Phaser](https://phaser.io) 3.90.0, лицензия MIT.
- **Шрифт:** Jersey 15, Copyright 2023 The Soft Type Project Authors ([источник](https://github.com/scfried/soft-type-jersey)), SIL Open Font License 1.1; текст лицензии в `assets/fonts/OFL.txt`.
- **Музыка:** «Guitar Vs. Piano 1.2», автор Goukisan, [Newgrounds Audio Portal](https://www.newgrounds.com/audio/listen/53576). Все права принадлежат автору; используется по решению владельца проекта. Запасной процедурный луп: `tools/make-music.mjs`.
- **Звуковые эффекты:** сгенерированы `tools/make-sfx.mjs` (собственный синтезатор в стиле sfxr, без чужих сэмплов).
- **Графика:** сгенерирована моделью `openai/gpt-image-2.5-flare` через OpenRouter (листы, иконки, окружение) и анимирована в [PixelLab](https://pixellab.ai); чистка и нарезка скриптами из `tools/`.
- Механики вдохновлены Vampire Survivors и HoloCure; ассеты и названия из них не используются.
