# Архитектура

Два слоя: `src/core/` (чистая логика, без Phaser, запускается в Node) и Phaser-слой (`src/scenes`, `src/render`, `src/ui`), который каждый кадр двигает симуляцию и синхронизирует спрайты с её состоянием. Контент и баланс читаются из `src/data/`.

## Контракт sim (src/core/sim.js)

Рендер читает поля sim и вызывает его методы. Внутренности sim рендер не трогает.

```js
import { createSim } from './core/sim.js';

const sim = createSim({ hero: 'heroine', stage: 'forest', seed: 12345 });

sim.step(dt, input);   // dt в секундах (рендер режет до 1/20), input = { x, y } вектор движения длиной 0..1
                       // в состоянии 'levelup' / 'gameover' / 'victory' step ничего не делает
```

### Состояние (только чтение для рендера)

```js
sim.state      // 'running' | 'levelup' | 'gameover' | 'victory'
sim.time       // с с начала забега
sim.kills
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
                // pose: 'idle' | 'windup' | 'cast' (осмысленно у босса; anim.js: windup/cast = кадр 2), rage: bool (только босс)
sim.boss        // живой босс (та же сущность из sim.enemies, поля hp и maxHp для полосы HP) или null
sim.projectiles // [{ uid, sprite, x, y, angle, scale, alpha, owner: 'player' | 'enemy' }]
sim.pickups     // [{ uid, type, sprite, x, y }]
sim.props       // [{ uid, sprite, x, y, breakable }]  разрушаемые объекты
sim.events      // события этого шага, очищаются в начале step():
                //   { type: 'hit', x, y, amount, crit, weapon }
                //   { type: 'kill', x, y, enemy, elite }
                //   { type: 'playerHurt', amount }
                //   { type: 'pickup', kind }
                //   { type: 'levelup', level }
                //   { type: 'weaponFire', weapon }
                //   { type: 'chest', items: [...] }          формат ниже
                //   { type: 'propBreak', x, y, sprite }      сломан бочонок/фонарь
                //   { type: 'bossWarning', boss, seconds }   один раз, за stage.bossWarning с до босса
                //   { type: 'bossSpawn', boss }
                //   { type: 'bossRage', x, y }               босс упал ниже bosses[id].rage.hpFraction HP
                //   { type: 'gameover' } | { type: 'victory' }
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

Содержимое: супероружие, если обе части на maxLevel; иначе +1 уровень случайного оружия; иначе +1 уровень пассивки; иначе лечение.

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

Тексты карточек рендер берёт через `t()` по соглашению ключей ниже; описание уровня — `t('weapon.<id>.desc')` (общее) или `t('weapon.<id>.lvl<N>')` если есть.

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

Оружие: `{ init(weaponState, sim), update(weaponState, sim, dt) }`, где `weaponState = { id, level, def, params, cooldown, ... }`, `params` — числа текущего уровня с учётом статов игрока.
Враги: `{ init(enemy, sim), update(enemy, sim, dt) }`.

## Рендер

`src/scenes/Game.js` создаёт sim, каждый кадр читает ввод (`src/ui/input.js`: клавиатура, геймпад, экранный джойстик), вызывает `sim.step`, затем `src/render/world.js` синхронизирует спрайты, `src/ui/hud.js` обновляет HUD. При `state === 'levelup'` Game ставится на паузу и запускается сцена LevelUp поверх.
