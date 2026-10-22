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

sim.step(dt, input);   // dt в секундах (Game.js режет до 1/20, sim сам до 0.1), input = { x, y } вектор движения длиной 0..1
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
sim.props       // [{ uid, sprite, x, y, breakable, hp, drop }]  только разрушаемые; декор рисует render/decor.js
sim.events      // события этого шага, очищаются в начале step():
                //   { type: 'hit', x, y, amount, crit, weapon }
                //   { type: 'kill', x, y, enemy, elite, boss, sprite, size }
                //   { type: 'playerHurt', amount }
                //   { type: 'pickup', kind }
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
```

Все массивы сущностей живут дольше одного кадра: рендер сопоставляет спрайты по `uid` (создаёт новые, прячет пропавшие в пул).

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

Когда игрок набирает уровень, `sim.state = 'levelup'` и заполняется `sim.levelUp`:

```js
sim.levelUp = {
  cards: [{ kind: 'weapon' | 'passive' | 'heal', id, level, isNew, icon }], // до 4 карточек
  rerolls, skips, banishes,  // оставшиеся
}
sim.chooseCard(i)   // применить карточку i; если впереди ещё уровни, сразу новый набор, иначе state = 'running'
sim.reroll()
sim.skip()
sim.banish(i)       // убрать карточку i из пула до конца забега и выдать замену
```

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

## Рендер

`src/scenes/Game.js` создаёт sim, каждый кадр читает ввод (`src/ui/input.js`: клавиатура, геймпад, экранный джойстик), вызывает `sim.step`, затем `handleEvents(sim.events)` (хитстоп, эффекты, звук), `src/render/world.js` синхронизирует спрайты, `src/ui/hud.js` обновляет HUD. При `levelup`, сундуке, `gameover` и `victory` Game ставится на паузу (`scene.pause('Game')`) и поверх запускается `LevelUp`, `Chest`, `GameOver` или `Victory`; `Pause` запускается по кнопке.

Файлы `src/render/`: `world.js` (спрайты по uid, тени, камера, свечение элиты (glow) цветом `elite.glow`), `anim.js` (процедурная анимация), `fx.js` (частицы, числа урона, тряска), `decor.js` (декор этапа по чанкам), `density.js` (масштаб спрайта).

## Рендер и координаты

- Мир, данные и UI в координатах 640×360 (`GAME_WIDTH`, `GAME_HEIGHT` в `src/data/constants.js`). Холст в `RENDER_ZOOM` = 2 раза больше: 1280×720 (`src/main.js`).
- Каждая сцена при старте получает камеру с origin (0, 0) и `zoom` = `RENDER_ZOOM` (обёртка `zoomed` в `main.js`), поэтому код сцен, HUD и меню про удвоение не знает. Текст создаётся с `resolution: RENDER_ZOOM`, чтобы не размываться.
- Phaser: `pixelArt: true`, `roundPixels: true`, Scale FIT. Растяжка холста на экран: целый масштаб даёт `image-rendering: pixelated`, нецелый мягкое сглаживание, чтобы пиксели не рябили при движении (`src/ui/scaling.js`). На телефоне первое касание включает полный экран и фиксирует альбомную ориентацию, где браузер это позволяет (`src/ui/fullscreen.js`); холст пересчитывается при каждой смене размера окна.
- `density` спрайта в manifest это число пикселей текстуры на 1 px мира. Спрайт рисуется в масштабе `1 / density` (`src/render/density.js`): density 2 показывает каждый пиксель текстуры на холсте, density 1 даёт блоки 2×2 px, density 0.5 блоки 4×4 px. Выбор плотности: `docs/ASSETS.md`.
- Камера следует за игроком (`scrollX/scrollY` в мировых координатах), фон `grass` это `tileSprite` с `scrollFactor` 0. Опора спрайта (`origin` в manifest) у персонажей стоит на ногах; глубина персонажей равна их `y`, снаряды рисуются поверх (`PROJ_DEPTH`).
- Размер элиты на экране и хитбокс берут один множитель `elite.sizeMul`.
