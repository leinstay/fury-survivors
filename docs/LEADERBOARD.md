# Таблица рекордов (Cloud Firestore)

Собственный проект Firebase `fury-survivors` (владелец leinstay@gmail.com), web-приложение в нём, база `(default)`.

Анонимный онлайн-топ-10. Клиент не авторизован, единственная защита это `firestore.rules`. Архитектура перенесена из Fruit Madness (`.claude/docs/leaderboard.md` там). Игра полностью работает без сети.

## Безопасность

Никогда не запускать `gcloud`, `firebase` CLI и всё, что трогает учётки Google. Консолью Firebase владелец управляет вручную. Правила не деплоятся автоматически.

## Что где

| Файл | Что |
|---|---|
| `src/data/leaderboard.js` | FIREBASE_CONFIG (публичный), FIRESTORE_DB_ID, коллекция, ник, формула очков, диапазоны, лимиты (readLimit, rows, cooldown, timeout) |
| `src/services/leaderboard.js` | сервис: `fetchTop10`, `submitScore`, `isOnline`, `topTen`, `rankOf`, `computeScore`, `__setBackendForTests`. Без Phaser и DOM на импорте, SDK грузится ленивым `import()` с gstatic (12.19.0, firestore-lite) |
| `src/services/nick-store.js` | ник в localStorage, ключ `fury-survivors.nick` |
| `src/core/nick.js` | `validateNick`: 3-6 `[A-Za-z0-9]`, результат в верхнем регистре |
| `src/scenes/Leaderboard.js` | сцена топ-10 (LOADING / OFFLINE / пусто / таблица), вход из меню |
| `src/ui/results.js` | экран итогов: очки, DOM-поле ника поверх холста, Submit, статус и место |
| `firestore.rules` | правила базы, публикуются вручную |

Ошибки сервиса (`Error.message`): `offline` (нет сети, SDK не загрузился, таймаут 8 с), `cooldown` (отправка раньше 10 с после прошлой), `invalid` (ник или числа не прошли локальную проверку), `denied` (правила отказали).

## Данные

- Проект `fury-survivors`, база `(default)` (`FIRESTORE_DB_ID = null`), коллекция `fury_scores`.
- Документ: `{ name, score, time, kills, level, victory, createdAt }`. `time` целые секунды, `createdAt` серверное время.
- Формула: `score = floor(time) * 10 + kills * 1 + coins * 10 + (victory ? 5000 : 0)` (монеты пока ничего не покупают и дают только очки), числа в `SCORE_FORMULA`. Правила проверяют только диапазоны, а не равенство формуле: менять формулу можно без публикации правил, но клиент может прислать любые числа в диапазоне (защиты от подделки нет, как и в Fruit Madness).
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

Коллекцию создавать руками не нужно, она появится при первой записи. Индекс для запроса автоматический.

Модерация: клиент может только создавать. Мусорные строки удаляются вручную в консоли (Data, `fury_scores`, удалить документ).
