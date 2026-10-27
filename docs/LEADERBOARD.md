# Таблица рекордов (Cloud Firestore)

Собственный проект Firebase `fury-survivors` (владелец leinstay@gmail.com), web-приложение в нём, база `(default)`.

Анонимный онлайн-топ-10. Клиент не авторизован, единственная защита это `firestore.rules`. Архитектура перенесена из Fruit Madness (`.claude/docs/leaderboard.md` там). Игра полностью работает без сети.

## Безопасность

Никогда не запускать `gcloud`, `firebase` CLI и всё, что трогает учётки Google. Консолью Firebase владелец управляет вручную. Правила не деплоятся автоматически.

## Что где

| Файл | Что |
|---|---|
| `src/data/leaderboard.js` | FIREBASE_CONFIG (публичный), FIRESTORE_DB_ID, коллекции соло и коопа (`MODES`), ник, пара (`PAIR`), поле ip (`IP_FIELD`), формула очков, диапазоны, лимиты (readLimit, rows, cooldown, timeout) |
| `src/services/leaderboard.js` | сервис: `fetchTop10(mode)`, `submitScore(run, mode)`, `isOnline`, `topTen`, `rankOf`, `computeScore`, `fetchIp`, `__setBackendForTests`. Без Phaser и DOM на импорте, SDK грузится ленивым `import()` с gstatic (12.19.0, firestore-lite) через `src/services/firebase.js` |
| `src/services/net.js`, `src/data/net.js` | сигналинг коопа: документ `rooms/<код>` с offer/answer (см. `docs/ARCHITECTURE.md`, «Сетевой кооп») |
| `src/services/nick-store.js` | ник в localStorage, ключ `fury-survivors.nick` |
| `src/core/nick.js` | `validateNick`: 3-6 `[A-Za-z0-9]`, результат в верхнем регистре; `pairName`, `validateName(raw, mode)` для пары коопа |
| `src/scenes/Leaderboard.js` | сцена топ-10 (LOADING / OFFLINE / пусто / таблица), вкладки Solo / Co-op, вход из меню |
| `src/ui/results.js` | экран итогов: очки, DOM-поле ника поверх холста, Submit, статус и место |
| `firestore.rules` | правила базы, публикуются вручную |

Ошибки сервиса (`Error.message`): `offline` (нет сети, SDK не загрузился, таймаут 8 с), `cooldown` (отправка раньше 10 с после прошлой), `invalid` (ник или числа не прошли локальную проверку), `denied` (правила отказали).

## Данные

- Проект `fury-survivors`, база `(default)` (`FIRESTORE_DB_ID = null`), коллекции `fury_scores` (соло) и `fury_scores_coop` (кооп, своя таблица); кодекс игрока лежит в `fury_codex/{id}` (резервная копия, см. `docs/ARCHITECTURE.md`, «Кодекс»); телеметрия для баланса в `fury_runs` (каждый забег каждого игрока, только создание, чтение открыто; разбор: `node tools/runs-report.mjs`).
- Документ: `{ name, score, time, kills, level, victory, difficulty, hero, stage, ip, createdAt }`. `hero` id героя (в коопе `'heroine+mage'`), `stage` id зоны (`'forest'`); записи без них читаются как `heroine` и `forest`, правила допускают их отсутствие. `time` целые секунды, `createdAt` серверное время, `difficulty` `'normal' | 'cursed'` (`src/data/difficulty.js`); записи без поля (до появления сложности) читаются как `normal`, правила допускают его отсутствие.
- `name`: в соло ник, в коопе пара `HOST+GUEST` (хост первым; пара с другими никами это другая запись). Отправить может любой из двоих, лучшая запись пары остаётся.
- `ip`: публичный IP отправителя (запрос к `api.ipify.org` при отправке, до 3 с; не вышло — поля нет). При чтении `topTen` сначала оставляет на каждый IP только лучшую запись (под любым ником), потом лучшую на имя. Записи без `ip` (старые) участвуют только во второй проверке.
- Лобби коопа: коллекция `rooms`, документ на лобби (id = код из 5 символов): `{ offer, createdAt }` пишет хост, `{ answer, answeredAt }` один раз дописывает гость; после соединения хост документ удаляет. Брошенные лобби можно чистить TTL-политикой по `createdAt` (Firestore → TTL, необязательно).
- Формула: `score = floor(floor(time) * 10 + kills * 1.5 + coins * 15 + (victory ? 5000 : 0))` (с 27.10.2026 убийство и монета ×1.5) (монеты пока ничего не покупают и дают только очки), числа в `SCORE_FORMULA`. Правила проверяют только диапазоны, а не равенство формуле: менять формулу можно без публикации правил, но клиент может прислать любые числа в диапазоне (защиты от подделки нет, как и в Fruit Madness).
- Запрос: `orderBy('score','desc').limit(50)`, затем `topTen` оставляет лучший результат каждого игрока (имя без учёта регистра) и режет до 10. Индекс автоматический.
- Диапазоны (дублируются в `LIMITS` и в правилах): score 1..9999999, time 0..86400, kills 0..1000000, level 1..999.
- Забег с 0 очков отправить нельзя (правила требуют score > 0), Submit отключён.

## Ввод ника

DOM `<input>` создаётся поверх холста при открытии GameOver/Victory и удаляется при выходе из сцены. Позиция берётся из `getBoundingClientRect` холста, `autocapitalize="characters"`, `maxlength=6`, допускаются только латинские буквы и цифры, регистр поднимается сам. Клавиши поля не доходят до Phaser (WASD, Space и Esc не двигают меню). Esc или Enter в поле: Esc снимает фокус, Enter отправляет. С геймпада: A на поле фокусирует его, A на Submit отправляет (при сохранённом нике фокус сразу на Submit). Один успешный submit на забег; при ошибке повтор возможен.

## Настройка в консоли (вручную, без CLI)

Создание базы:
1. <https://console.firebase.google.com>, аккаунт leinstay@gmail.com, проект `fury-survivors`.
2. Databases & Storage → Firestore → **Create database**.
3. Edition: **Standard**. Database ID оставить **`(default)`**: игра обращается именно к ней.
4. Location: **eur3 (Europe)**. Изменить потом нельзя.
5. Mode: **Production mode** (всё закрыто, пока не опубликованы правила). Create.

Правила:
1. Firestore → вкладка **Rules**.
2. Заменить содержимое целиком текстом `firestore.rules` из репозитория → **Publish**.
3. Проверка: забег, ник, Submit; в Data появится коллекция `fury_scores` с документом, в меню Leaderboard покажет строку.
4. Кооп: после публикации правил с `rooms` и `fury_scores_coop` создать лобби из меню Co-op, второй игрок входит по коду; коллекции появятся при первой записи.

Коллекцию создавать руками не нужно, она появится при первой записи. Индекс для запроса автоматический.

Модерация: клиент может только создавать. Мусорные строки удаляются вручную в консоли (Data, `fury_scores`, удалить документ).

Расширенная телеметрия v2, полнота данных и очередь доставки: [TELEMETRY.md](TELEMETRY.md).
