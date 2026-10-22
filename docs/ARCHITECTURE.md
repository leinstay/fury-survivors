# Архитектура

Два слоя: `src/core/` (чистая логика, без Phaser, запускается в Node) и Phaser-слой (`src/scenes`, `src/render`, `src/ui`), который каждый кадр двигает симуляцию и синхронизирует спрайты с её состоянием. Контент и баланс читаются из `src/data/`.

Стиль кода: практичное подмножество Google JavaScript Style Guide, проверяется `npm run lint` (`eslint.config.js`): `const`/`let` без `var`, `===`, одинарные кавычки, точки с запятой, одна переменная на объявление, строки до 100 символов, только именованные экспорты, JSDoc с `@param`/`@return` у экспортируемых функций `src/core/` и `src/services/`.

## Контракт sim (src/core/sim.js)

Рендер читает поля sim и вызывает его методы. Внутренности sim рендер не трогает.

```js
import { createSim } from './core/sim.js';

const sim = createSim({ hero: 'heroine', stage: 'forest', seed: 12345, difficulty: 'normal' });
// hero: id из data/heroes.js; stage: id этапа (сейчас таблица STAGES = { forest } зашита в sim.js);
// seed: тот же seed даёт тот же забег (core/rng.js), на этом стоят balance-тесты;
// difficulty: id из data/difficulty.js (spawnMul для директора, xpMul для опыта), по умолчанию normal
// players: 1 (по умолчанию) или 2 — кооп (data/coop.js), см. раздел «Кооп» ниже;
// heroes: ['heroine', 'mage'] — герои по индексам игроков в коопе (одинаковые заменяются, core/heroes.js)

sim.step(dt, input);   // dt в секундах (Game.js режет до 1/20, sim сам до 0.1), input = { x, y } вектор движения длиной 0..1
                       // кооп: input = { players: [{ x, y }, { x, y }] } по игрокам
                       // в состоянии 'levelup' / 'chest' / 'gameover' / 'victory' step ничего не делает
```

### Состояние (только чтение для рендера)

```js
sim.state      // 'running' | 'levelup' | 'chest' | 'gameover' | 'victory'
sim.won        // финальный босс убит: забег закончится победой (в овертайме смерть даёт 'victory', не 'gameover')
sim.overtime   // время начала овертайма (stage.overtime: бесконечные крепнущие волны ради очков) или -1
sim.finishOvertime()  // закончить овертайм досрочно: state = 'victory'
sim.time       // с с начала забега
sim.kills
sim.coins       // собранные монеты
sim.player = {
  x, y, hp, maxHp, level, xp, xpNext,
  facing,                 // 1 вправо, -1 влево
  moving,                 // bool, для анимации ходьбы
  iframes,                // > 0 пока неуязвим (рендер мигает)
  hurtFlash,              // > 0 после получения урона
  weapons:  [{ id, level }],
  passives: [{ id, level }],
  stats,                  // итоговые статы (core/stats.js)
}
sim.enemies     // [{ uid, type, sprite, x, y, hp, maxHp, size, facing, elite, boss, hitFlash, moving, pose, rage }]
                // size: радиус хитбокса (у элиты уже умножен на elite.sizeMul)
                // pose: 'idle' | 'windup' | 'cast'. Выставляет только behavior boss; у остальных всегда 'idle'.
                //   anim.js: у босса windup и cast показывают кадр 2 (замах рывка, призыв)
                // rage: bool, true после порога rage.hpFraction (только босс)
sim.telegraphs  // [{ uid, x, y, radius, delay, t, dmg }] предупреждения об ударах босса (slam), рендер рисует круг
sim.boss        // живой босс (та же сущность из sim.enemies, поля hp и maxHp для полосы HP) или null
sim.projectiles // [{ uid, sprite, x, y, angle, scale, alpha, owner: 'player' | 'enemy' }]
                // scale задаёт behavior (например, orbit: size из уровня оружия); рендер умножает на 1/density спрайта
sim.pickups     // [{ uid, type, sprite, kind, value, x, y }]  type = id из data/pickups.js
sim.props       // [{ uid, sprite, x, y, angle, breakable, hp, drop }]  только разрушаемые; декор рисует render/decor.js
sim.roads       // сеть песчаных дорог (core/roads.js: distance(x, y), onRoad, pointInChunk) или null; рендер рисует
                // песок по чанкам (render/roads.js), расстановка объектов учитывает дорогу (place в stage.props)
sim.events      // события этого шага, очищаются в начале step():
                //   { type: 'hit', x, y, amount, crit, weapon }
                //   { type: 'kill', x, y, enemy, elite, boss, sprite, size }
                //   { type: 'playerHurt', amount, player }
                //   { type: 'pickup', kind, player }
                //   { type: 'levelup', level }
                //   { type: 'weaponFire', weapon }
                //   { type: 'chest', items: [...] }          формат ниже
                //   { type: 'propBreak', x, y, sprite }      сломан бочонок/фонарь
                //   { type: 'bossWarning', boss, seconds }   один раз, за stage.bossWarning с до босса (seconds: сколько осталось)
                //   { type: 'bossSpawn', boss }
                //   { type: 'bossDown', boss }               убит нефинальный босс (выпал сундук, забег идёт дальше)
                //   { type: 'slam', x, y, radius }           сработал удар по земле
                //   { type: 'bossBlink', x, y }              босс появился после телепорта
                //   { type: 'bossRage', x, y }               босс упал ниже bosses[id].rage.hpFraction HP (один раз);
                //                                            fx: тряска, звук: boss_spawn ниже тоном
                //   { type: 'horde', x, y, enemy }           убита элита: вокруг её сундука кольцо врагов (stage.chestHorde)
                //   { type: 'overtime' }                     финальный босс убит, начался овертайм (hud: баннер)
                //   { type: 'gameover' } | { type: 'victory' }  victory: смерть или finishOvertime в овертайме
                //                                            (без stage.overtime приходит сразу после kill босса)
sim.damageByWeapon  // { weaponId: totalDamage }
// Снаряды с rehit бьют цель повторно не чаще rehit: обычно общий таймер на оружие (e.hitAt[slot]: аура, огонь),
// с rehitOwn — свой таймер у каждого снаряда (щиты orbit: четыре щита = четыре удара)
```

Все массивы сущностей живут дольше одного кадра: рендер сопоставляет спрайты по `uid` (создаёт новые, прячет пропавшие в пул).

### Кооп (players: 2)

Как local co-op в Vampire Survivors: один экран, общий опыт и уровень, карточки выбирают по очереди, смерть превращает
игрока в гроб. Числа в `src/data/coop.js`.

```js
sim.coop           // true при players > 1
sim.players        // [{ ...поля sim.player, id, slots: { weapons, passives }, dead, coffinT, revives, tint }]
sim.player         // = sim.players[0]; общие опыт и уровень (xp, xpNext, level) лежат только у него
sim.local          // индекс игрока за этим экраном (HUD и экраны выбора показывают его билд); сеть ставит 1 у гостя
sim.view           // { x, y, dirX, dirY } центр экрана: середина между игроками (гробы тоже), в соло сам игрок
sim.alive          // живые игроки
sim.target(x, y)   // ближайший живой игрок к точке: цель врагов и снарядов (behaviors/enemies/*)
sim.spawnMul       // множитель спавна директора: сложность × COOP.spawnMul
sim.levelUp.player // чей ход выбирать карточки (по очереди через sim.levelTurn, мёртвые тоже выбирают)
sim.chest.player   // кому достался сундук (тому, кто подобрал)
sim.hurtPlayer(raw, pl)  // в коопе смерть: pl.dead = true, pl.coffinT = COOP.reviveTime; 'gameover' только когда мертвы все
```

Движение: игроки не могут разойтись дальше экрана минус `COOP.edge` с каждой стороны (`_clampToPartners`). Гроб: таймер
идёт быстрее, пока напарник рядом (`allyRadius`, `allyBoost`), и медленнее, пока на гробу стоит враг (`enemySlow`);
по истечении игрок встаёт с `reviveHp` HP и `reviveIframes` с неуязвимости. Враги: спавн × `spawnMul`, HP обычных × `enemyHpMul`.
Слотов на игрока `COOP.slots` (меньше, чем `SLOTS`). Оружие знает владельца (`w.owner`), крит и статы берутся от него;
удача для дропа — лучшая среди живых. События получают `player`: `playerHurt`, `playerDown { x, y }`, `revive { x, y }`,
`pickup`, `chest`, `autoHeal`. Рендер: `render/world.js` рисует спрайт на игрока (второй подкрашен `tint`, мёртвый — гроб),
камера на `sim.view`; HUD показывает полоску напарника с таймером оживления.

### Сундук

Падает с каждой элиты и с босса (`drop: 'chest'` в data). При подборе применяется сразу и шлёт `{ type: 'chest', items }`. Каждый item:

```js
{ kind: 'weapon' | 'passive' | 'heal', id, level, isNew, icon,
  evolved?: true,        // только супероружие
  from?: [idA, idB] }    // только супероружие: обе части (из data/combos.js), они убраны, результат встал на слот from[0]
```

Содержимое: супероружие, если готова запись из `combos.js` (оружие на maxLevel + второе оружие на maxLevel или пассивка любого уровня); иначе +1 уровень случайного оружия; иначе +1 уровень пассивки; иначе лечение.

Если готово хотя бы одно супероружие, сундук ничего не применяет: `sim.state = 'chest'`, до `CHEST.maxChoices` карточек в `sim.chest.cards`, событие `{ type: 'chest', items: [], choice: true }`. Рендер показывает выбор; `sim.chooseChest(i)` применяет карточку, `sim.skipChest()` вместо неё выдаёт обычное содержимое (как будто супероружий нет) и возвращает его. Оба шлют `{ type: 'chest', items, applied: true }` (экран сундука уже открыт, Game его не открывает заново) и возвращают `'running'` (отложенные уровни откроются следом).

### Улучшения уровня

Когда игрок набирает уровень, `sim.state = 'levelup'`, `sim.picker` — индекс того, кто выбирает, и заполняется его
`players[picker].levelUp` (в соло `sim.levelUp` — это `players[0].levelUp`):

```js
pl.levelUp = {
  cards: [{ kind: 'weapon' | 'passive' | 'heal', id, level, isNew, icon }], // до 4 карточек
  rerolls, skips, banishes,  // оставшиеся (у каждого игрока свои)
  banished,                  // Set 'kind:id', изгнанные этим игроком
  done,                      // не его ход или уже выбрал
}
sim.chooseCard(i, who = 0)  // применить карточку i; если впереди ещё уровни, сразу новый набор, иначе 'running'
                            // когда выбирать нечего (всё на максимуме), карточка лечения применяется сама без
                            // экрана, событие { type: 'autoHeal' }
sim.reroll(who = 0)
sim.skip(who = 0)
sim.banish(i, who = 0)      // убрать карточку i из пула игрока до конца забега и выдать замену
```

Кооп: опыт и уровень общие, карточки по очереди (`levelTurn`), но каждый тянет из своего пула и тратит свои
reroll/skip/banish. Урон и DPS по оружию тоже у каждого свои (`pl.damageByWeapon`, `pl.dpsByWeapon`): HUD и итоги
показывают своего игрока.

Тексты карточек рендер берёт через `t()` по соглашению ключей ниже. Описание: `<kind>.<id>.lvl<N>` если ключ есть (`hasKey`), иначе `<kind>.<id>.desc`; у карточки лечения `card.heal.desc` (`src/scenes/LevelUp.js`). В пул карточек попадает всё из `WEAPONS` (кроме `evolved` и оружия, уже поглощённого супероружием игрока) и `PASSIVES`: новая карточка при свободном слоте (`SLOTS`), повышение уровня пока не максимум.

## Соглашение ключей i18n

| Что | Ключи |
|---|---|
| Оружие | `weapon.<id>.name`, `weapon.<id>.desc` |
| Пассивка | `passive.<id>.name`, `passive.<id>.desc` |
| Герой | `hero.<id>.name` |
| Враг, босс | `enemy.<id>.name`, `boss.<id>.name` |
| Этап | `stage.<id>.name` |
| Лечение-карточка | `card.heal.name`, `card.heal.desc` |

Данные (`src/data/*`) хранят только id; ключи строк выводятся из id по таблице.

## Поведения

`src/behaviors/weapons/<behavior>.js` и `src/behaviors/enemies/<behavior>.js` экспортируют объект и регистрируются в `src/behaviors/index.js` по имени. Новое поведение = новый файл + строка в реестре. Запись в data ссылается на поведение строкой `behavior`.

Оружие: `{ init(w, sim), update(w, sim, dt) }`, где `w = { id, level, def, params, slot, ... }`. `params` — копия строки уровня из data с пересчётом: `damage` умножен на `atk`, `cooldown` поделён на `haste`; остальные поля (`amount`, `area`, `speed`, ...) как в data. Снаряды берутся из пула через `sim.addProjectile(owner, sprite)`; поведение, которому нужно двигать снаряд само, ставит `p.bk` и реализует `moveProjectile(p, w, sim)` (так делает `orbit`).

Поля уровня, которые читает конкретное поведение, перечислены в шапке `src/data/weapons.js`. Для `orbit` это `amount`, `area` (радиус орбиты), `speed` (рад/с), `duration`/`cooldown`, а также `size` (масштаб спрайта щита, по умолчанию 1) и `hitRadius` (радиус попадания, по умолчанию 10); `duration: 1e9` и `cooldown: 0` дают вечные щиты (супероружие `aegis_storm`).

Враги: `{ init(e, sim), update(e, sim, dt) }`; `e.params` — `params` из data. Поведение `boss` читает `def.attacks` (`dash`: `windup`, `speed`, `time`; `summon`: `enemy`, `count`, `radius`) и `def.rage`; пишет в `e.pose` и `e.rage`, при пороге шлёт `bossRage`.

Директор (`src/core/director.js`) исполняет `timeline` этапа: `spawn` (поддерживает минимум живых врагов через `min`/`minEnd`), `ring`, `elite`, `burst`, `boss`; за `stage.bossWarning` секунд до события `boss` шлёт `bossWarning`. Масштабирование врагов по времени: `stage.scaling`.

## Сетевой кооп

Два игрока в одном мире, P2P по WebRTC DataChannel, без игрового сервера. Всё держится на детерминизме sim:
оба клиента крутят одну и ту же симуляцию (общий seed) по тикам фиксированного шага и обмениваются только вводом.

- `src/core/lockstep.js` (без Phaser): `createLockstep({ sim, local, send, onDesync })`. `advance(input, dt)` записывает
  свой ввод на тик `tick + NET.inputDelay`, шлёт его напарнику (`{ t, x, y, c? }`) и считает тик, только когда ввод
  напарника на него уже пришёл (иначе `false`, HUD показывает «ждём напарника»). Чтобы не дёргаться: Game копит
  время ожидания (`NET.backlog`) и догоняет до `NET.maxCatchUp` тиков за кадр; по `ls.drift()` (опережение
  напарника по тикам, из `a` во вводе) свои часы чуть замедляются (`NET.syncSlow`); свой герой рисуется со сдвигом
  ещё не применённого ввода (`ls.predictOffset`), поэтому задержка ввода (`NET.inputDelay`, 100 мс) не чувствуется. Выборы экранов (карточка, реролл,
  сундук, пауза, конец овертайма) идут командами в том же сообщении и применяются у обоих на одном тике
  (`applyCommand`: карточку применяет только тот, чей ход, сундук тот, кому он достался). Раз в `NET.hashEvery` тиков
  хеш состояния (`hashSim`) сравнивается с хешем напарника; расхождение — `onDesync` (Game только помечает).
- `src/core/actions.js`: `createActions(sim, ls)` — один интерфейс действий для экранов: соло зовёт sim сразу, кооп
  отправляет команды. Экраны `LevelUp`, `Chest`, `Pause` не ждут результата, а следят за `sim.state` в `update()` и
  закрываются, когда sim ушёл из состояния выбора; в коопе Game под ними не ставится на паузу (lockstep крутится,
  сим сам стоит в `levelup`/`chest`), а общая пауза это флаг `ls.paused` по команде `pause`/`resume`.
- `src/services/net.js`: `createRoom()` (хост: offer в документ Firestore `rooms/<код>`, опрос ответа),
  `joinRoom(code)` (гость: answer в тот же документ), дальше только DataChannel (ordered, reliable). `Conn`:
  `send(obj)`, `onMessage(fn)` (без обработчика сообщения копятся: лобби передаёт канал в Game), `onClose(fn)`,
  `close()`. STUN Google, TURN нет: за симметричным NAT соединение может не пройти (`lobby.failed`).
  Числа в `src/data/net.js`; для smoke-тестов сигналинг подменяется через `globalThis.__furySignal`.
- `src/scenes/Lobby.js`: хост видит код и ждёт, гость входит по коду; после соединения обмен `hello { name, hero }`,
  `hero { id }` (смена своего героя; герой напарника занят, при совпадении уступает гость; повторный клик по своему отпускает его, `id: ''`, напарник может взять), `diff` (сложность,
  выбирает хост), `start { seed, difficulty, names, heroes }`, `leave`; оба стартуют `Game` с
  `data.coop = { net, local, seed, difficulty, names, heroes }` (хост — игрок 0). Меню: вид «Co-op» с полями ника и кода.
- `src/scenes/Game.js` в коопе: фиксированный шаг через `ls.advance`, хитстоп выключен (остановил бы тики у одного),
  потеря канала (`onClose` или `NET.dropAfter` с тишины) завершает забег экраном итогов с пометкой `lost`.
- Детерминизм: `Math.sin/cos/atan2` могут отличаться между движками JS в последних битах; на практике Chrome и
  Android Chrome совпадают, расхождение ловит хеш. Балансные числа коопа в `src/data/coop.js`.

## Рендер

`src/scenes/Game.js` создаёт sim, каждый кадр читает ввод (`src/ui/input.js`: клавиатура, геймпад, экранный джойстик), копит время и шагает sim фиксированным шагом `1 / SIM.tickRate` (не больше `SIM.maxTicksPerFrame` за кадр), затем `handleEvents(sim.events)` (хитстоп, эффекты, звук), `src/render/world.js` синхронизирует спрайты, `src/ui/hud.js` обновляет HUD. При `levelup`, сундуке, `gameover` и `victory` Game ставится на паузу (`scene.pause('Game')`) и поверх запускается `LevelUp`, `Chest`, `GameOver` или `Victory`; `Pause` запускается по кнопке. Экраны получают `{ sim, act }` (`core/actions.js`) и сами закрываются, когда `sim.state` сменился.

Файлы `src/render/`: `world.js` (спрайты по uid, тени, камера, свечение элиты (glow) цветом `elite.glow`), `anim.js` (процедурная анимация), `fx.js` (частицы, числа урона, тряска), `decor.js` (декор этапа по чанкам), `density.js` (масштаб спрайта).

## Рендер и координаты

- Мир, данные и UI в координатах 640×360 (`GAME_WIDTH`, `GAME_HEIGHT` в `src/data/constants.js`). Холст в `RENDER_ZOOM` = 2 раза больше: 1280×720 (`src/main.js`).
- Каждая сцена при старте получает камеру с origin (0, 0) и `zoom` = `RENDER_ZOOM` (обёртка `zoomed` в `main.js`), поэтому код сцен, HUD и меню про удвоение не знает. Текст создаётся с `resolution: RENDER_ZOOM`, чтобы не размываться.
- Phaser: `pixelArt: true`, `roundPixels: true`, Scale FIT. Растяжка холста на экран: целый масштаб даёт `image-rendering: pixelated`, нецелый мягкое сглаживание, чтобы пиксели не рябили при движении (`src/ui/scaling.js`). На телефоне первое касание включает полный экран и фиксирует альбомную ориентацию, где браузер это позволяет (`src/ui/fullscreen.js`); холст пересчитывается при каждой смене размера окна.
- `density` спрайта в manifest это число пикселей текстуры на 1 px мира. Спрайт рисуется в масштабе `1 / density` (`src/render/density.js`): density 2 показывает каждый пиксель текстуры на холсте, density 1 даёт блоки 2×2 px, density 0.5 блоки 4×4 px. Выбор плотности: `docs/ASSETS.md`.
- Камера следует за игроком (`scrollX/scrollY` в мировых координатах), фон `grass` это `tileSprite` с `scrollFactor` 0. Опора спрайта (`origin` в manifest) у персонажей стоит на ногах; глубина персонажей равна их `y`, снаряды рисуются поверх (`PROJ_DEPTH`).
- Размер элиты на экране и хитбокс берут один множитель `elite.sizeMul`.
