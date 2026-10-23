# Симуляции, боты и проверка баланса

Стенд исполняет настоящий `src/core/sim.js` на 60 Гц. Боты получают реальные RNG-карточки,
платят обычные reroll/skip/banish и выбирают сундуковые рецепты через общие actions.
Движение и выборы используют собственный RNG и наблюдение экрана/миникарты, а не будущие
предложения, скрытые HP врагов или RNG симуляции. Движение реагирует с задержкой,
учитывает угрозы, предметы, союзника и накопление опыта для магнита.

Для инструментов используйте Node 24 и `npm ci`; для браузера — `npx playwright install chromium`.
Команды выполняются из корня репозитория. Эксперименты пишут в игнорируемый `tools/out/`.

## Данные и модель выбора

```bash
npm run telemetry:export -- --from 2026-10-23T00:00:00Z --to 2026-10-24T00:00:00Z --out tools/out/telemetry
npm run telemetry:report -- tools/out/telemetry
npm run telemetry:train
```

Экспорт читает все страницы, проверяет HTTP/схему, распаковывает v2 detail, удаляет ID
документов и хеширует sessionId, сохраняет manifest/checksum и причины отклонений.
`--to` исключительная. В CI сеть не используется: `tests/fixtures/telemetry` содержит
закреплённые 13 v1 solo-забегов. Для обновления обучения сначала осознанно заменить
fixture и его manifest. Обучение проверяет checksum и генерирует `model.mjs` и validation.

Модель — интерпретируемые предпочтения карточек, проверяемые leave-one-run-out; оба
участника одной session не могут попасть в разные стороны обучения/проверки. Авто-heal
и применение уже выбранной эволюции не считаются независимыми кликами. Неизвестные
HP/бюджеты и пропавший при v1 collab урон остаются неизвестными. Совпадение восстановленных
конечных билдов проверяется, историческая таблица рецептов v1 пока не подтверждена.

`profiles.mjs` фиксирует смесь focus/evolution/collab/adaptive/defensive и отдельную
версию. Стратегия удерживается между предложениями; RNG может не выдать желаемую пару.
Есть все 21 пары оружия и 7 weapon/passive рецептов. Доли профилей, реакция и движение
пока предварительные: старые данные проверяют предпочтения, но не траектории и дуо.

## Один забег и точный replay

```bash
npm run sim:run -- --seed 42 --players 2 --difficulty cursed --profile focus,evolution --out tools/out/simulation/duo.json
npm run sim:replay -- tools/out/simulation/duo.json
npm run sim:run -- --config tools/out/simulation/duo.json --until 120
npm run sim:run -- --seed 42 --immortal --detailed --out tools/out/simulation/diagnostic.json
npm run sim:run -- --seed 42 --no-evolution --out tools/out/simulation/no-evolution.json
```

Config поддерживает независимый `behaviorSeed`, heroes/profiles, mask `immortal` и
`noEvolution` по участникам, horizon `until` (1080 секунд по умолчанию) и `experiment`.
`--telemetry` создаёт локальную v2 запись, не отправляя её в Firestore.
Exact replay хранит input по тикам, команды, detailed checkpoint/final hashes,
source/model/profile версии. Он требует ту же версию исходников. Человеческие v1/v2
записи не объявляются точными replay. Зависание watchdog и исключение дают `error`;
достижение horizon даёт `timeout`. Победа фиксируется при первом `sim.won`.

Бессмертие вмешивается только в летальный урон, сохраняя исходный вызов hurt и его
эффекты. Каждое спасение с тиком/причиной записывается; maxHP и оружие не увеличиваются.
Эти результаты служат диагностике поздних билдов и не попадают в доли поражений.

## Когорты и приёмка

```bash
npm run balance:quick -- --n 20 --workers 3 --out tools/out/simulation/baseline.json
npm run balance:quick -- --n 20 --split validation --out tools/out/simulation/validation.json
npm run balance:full -- --out tools/out/simulation/qualification.json
npm run balance:full -- --n 200 --no-evolution --out tools/out/simulation/no-evolution.json
npm run balance:quick -- --n 5 --immortal --out tools/out/simulation/immortal.json
npm run balance:quick -- --n 2 --recipes --immortal --out tools/out/simulation/recipes.json
npm run balance:report -- tools/out/simulation/baseline.json
```

`n` — матчей на режим (normal/cursed × solo/duo); рецептная матрица дополнительно
перебирает 28 профилей. Duo считается по команде. Seeds tuning/validation/qualification
не пересекаются. При подборе параметров использовать tuning; validation — для отбора,
qualification — один раз после фиксации параметров и поведения, не подбирать по нему.

`qualified` требует ≥400 независимых уникальных qualification матчей на режим,
нулевые error/timeout и весь 95% Wilson CI внутри 45–55% поражений normal / 70–80% cursed.
Cursed без супероружий: ≥200 матчей, верхний односторонний 95% предел побед ≤5%.
Для normal без эволюций целевой процент не задаётся. Recipe/immortal/partial-no-evolution
когорты показываются отдельно и не получают основную квалификацию.

Отчёт содержит все исходы, число выживших к минуте, уровень, личные полезные применения,
оставшиеся достижимые варианты и ранний auto-heal. Минутные медианы условны на дожитие;
их нельзя сравнивать без `n`. Сохраняются XP generated/picked/ground, магниты,
рецепты, блоки, incoming damage и вмешательства. Полный JSON нужен для собственного анализа.

Эксперимент задаётся JSON, передаётся через `--experiment path.json` и применяется
только внутри прогона/replay, после чего production data/fingerprint восстанавливаются:

```json
{
  "xp": {
    "steps": [{"below":20,"per":10},{"below":40,"per":25},{"below":1000000000,"per":45}],
    "thresholds": []
  },
  "cursedXP": 0.9,
  "coopXP": 1.25,
  "coopLevelScale": 2
}
```

Это пример кандидата, не доказанный баланс. `coopLevelScale:2` использует личные круги:
командные уровни 1/2 стоят как solo 1, 3/4 как solo 2. Проверять одновременно личную
прокачку, доступность эволюций, исчерпание к 15:00 и HP боссов, зависящее от общего уровня.

## Оружие и защитные эффекты

```bash
npm run sim:combat -- --all --n 3 --seconds 30 --out tools/out/simulation/combat.json
npm run perf
```

Combat — явно установленные билды, бессмертие и заданные толпы/хрупкие/стреляющие/босс.
Каждая пара сравнивается A, B, A+B и одиночным оружием с дополнительными пассивками
при одинаковом числе вложенных улучшений; collab отмечает стоимость рецепта отдельно.
Все варианты получают общий motion tape и seed раскладки. Враги пополняются по мере
смерти: это одинаковая процедура возможностей, не идентичный список погибших целей.

Сохраняются effective/raw damage, overkill, попадания частей combo, дистанции,
время геометрической доступности целей, first-hit → finisher связи и отбрасывания. Поэтому низкий DPS
меча можно отличать от нехватки целей рядом, ранних убийств молнией и полезных добиваний.
Само совместное попадание не доказывает причинную синергию: использовать парные сравнения.
Для щитов есть block-on/off при общем вводе; уничтоженные снаряды и interceptedRaw не
равны предотвращённому HP. Fixture DPS не предсказывает вероятность победы партии.

Performance сообщает CPU/Node и mean/p95/p99/max отдельно от правильности. Значения
на загруженном CI не превращаются в случайный FPS-gate.

## Браузер, проверки и публикация

```bash
npm run build:manifest
node tools/build-manifest.mjs --check
npm run lint
npm test
npm run smoke
node tools/playtest.mjs 60 --shot tools/out/playtest.png
```

Smoke использует тот же policy через настоящие клавиши/указатель. Семь сценариев
проверяют старт/прогресс, карточки, сундуки/эволюцию/отказ, pause/results, Codex,
leaderboard и настоящий WebRTC с совпадением хешей на одинаковых тиках обоих клиентов.
Локальный сигналинг заменяет Firestore, транспорт остаётся WebRTC. Фикстуры редких UI
состояний помечены явно. Готовность проверяется по состоянию/тику, не среднему FPS.
Визуальный playtest использует этот же driver; `--god`/`--weapons` — явные диагностические
режимы, их результаты не используются для квалификации.

`build:manifest` обновляет runtime SHA-256 в `src/data/build.js`. Делать после изменений
runtime перед commit/deploy; новые человеческие записи привязываются к этому source.
