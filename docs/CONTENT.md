# Как добавлять контент

Баланс и контент лежат в `src/data/`, строки в `src/i18n/en.js`, картинки в `assets/sprites/` (ключи в `assets/sprites/manifest.js`). Формат каждой записи описан комментарием в начале файла data. Как делать картинки: `docs/ASSETS.md`.

Общее для всех рецептов:

- Ключи i18n выводятся из id (таблица в `docs/ARCHITECTURE.md`). Нет ключа: `t()` вернёт сам ключ, игра не упадёт, но на экране будет `weapon.x.name`.
- Любой спрайт, на который ссылается data, должен быть в `manifest.js` и существовать как файл (тест `manifest: every sprite has a file`). Пока настоящего арта нет, `npm run placeholders` создаёт заглушку по записи manifest (существующие файлы не трогает, `--force` перезаписывает).
- После правок: `npm test`. Тесты в `tests/unit/data.test.js` считают количество контента (7 обычных оружий, 9 пассивок, 2 комбо, 6 врагов); при добавлении сущности обнови эти числа в тесте осознанно.

## Оружие с существующим behavior

Behavior: `slash`, `melee_arc`, `projectile`, `orbit`, `aura`, `boomerang`, `chain`, `area_drop`, `beam`, `summon`, `cloud`, `slam`, `impale`, `ice_orb`. Смысл полей уровня по behavior расписан в шапке `src/data/weapons.js`. Кратко о последних переделках:

- `slash` (Blade Arc, Crimson Arc): росчерк клинка через самую плотную группу врагов, не конус. Раз в `cooldown` серия из `amount` слэшей с паузой `WEAPON_BEHAVIOR.slash.gap`. Перед каждым: среди врагов в `searchRange` от героя (не больше `candidates` кандидатов) центр с наибольшим числом врагов в круге `clusterR`; слэш идёт через центр масс группы вдоль её главной оси (вытянутая толпа режется вдоль), круглая группа (`elongation`) режется поперёк направления от героя. Следующие слэши серии берут другие группы (дальше `apart` × `clusterR`), если их нет, крест-накрест через ту же. Врагов нет: через ближайший объект, иначе вдоль движения. Отрезок длиной `area` и шириной `width` (оба × стат `area`) проводится от начала к концу за `sweep` с и бьёт каждого задетого один раз, отбрасывая от линии; `status` (bleeding) как у прочих ударов. Без RNG. Картинка: зона `slash` в `src/render/zones.js` (шлейф, середина, белое ядро, сложение цвета, над персонажами), цвет `tint` оружия. Старый конус `melee_arc` остаётся в реестре, но оружие на нём сейчас нет.
- `slam` (Hammer, Titan Maul): удар по земле кругом радиусом `area`, а не конус. Серия из `amount` ударов: первый под героем со сдвигом к ближайшей цели (`WEAPON_BEHAVIOR.slam.offset` × `area`), каждый следующий в следующем направлении по кругу вокруг героя (той же дистанции), с паузой `gap`: молот не бьёт дальше `area` × (`offset` + 1). Удар бьёт один раз всех в круге и отбрасывает от центра (`knockback`). На месте удара трещина (радиус `area` × `crack`) на `duration` с: враги в ней ходят со скоростью × `slow`, ещё `slowTime` с после выхода. Сама трещина не бьёт, гаснет к концу (`fade`). Картинки: зоны `boom` и `crack` в `src/render/zones.js`, цвет `tint` оружия.
- `impale` (Spear, Dragon Lance): одно копьё (`amount` 1) в ближайшую цель, пробивает `1 + pierce` врагов и каждого пригвождает на `pin` с (замедление до 0 через `applySlow`, боссы вполсилы). Потом втыкается в землю и торчит `WEAPON_BEHAVIOR.impale.stuck` с. С `burst` воткнувшееся копьё взрывается кругом радиусом `burst` (× стат `area`): урон `damage` и пригвождение всех в круге. Луч (`beam`) от копья отличается: он случайный, бьёт всех на линии и слабо.
- `ice_orb` (Frost Orb, Blizzard): крупный медленный шар (радиус `area`, `speed`, живёт `duration` с) в ближайшую цель, пробивает всех, бьёт каждого внутри раз в `tick` на `damage` и замораживает (скорость × `slow` ещё `slowTime` с). С `turn` (рад/с) курс закручивается спиралью, и `amount` шаров выходят во все стороны поровну. Пока что заморозка идёт через `applySlow`; потом её переведут на статус `chill`.

- `cloud` (Poison Cloud, Miasma): облако ложится под героя (врагов в `WEAPON_BEHAVIOR.cloud.propRange` нет, а объект есть — на объект) и стоит `duration` с, бьёт каждого врага внутри раз в `tick` на `damage`, `area` — радиус. `amount` облаков: у каждого свой таймер `cooldown`, первые разнесены на `cooldown / amount`. Облака одного оружия бьют врага не чаще `tick`.
- `beam` (Beam, Prism Ray): раз в `cooldown` выпускает `amount` лучей из точки героя в случайные стороны (RNG сима, i-й луч в своём секторе 360° / `amount`), не целится и не следует за героем: луч стоит, где выпущен, `duration` с и каждые `tick` с бьёт всех на отрезке `area` × полуширина `width`. Картинка поднята на `WEAPON_BEHAVIOR.beam.lift` px (из середины тела).

Самонаводящиеся оружия (`projectile`, `boomerang`, `chain`, `summon`) берут цель через `sim.nearestTarget`: ближайший враг или разрушаемый объект из одного списка. Новое самонаводящееся оружие — так же.

### Статус (ДоТ) на оружии

Необязательное поле `status` на записи оружия или в уровне (уровень главнее): `status: { type, chance, share?, duration?, slow? }`. Типы и числа в `src/data/status.js`, логика в `src/behaviors/status.js`:

| type | стакание | эффект |
|---|---|---|
| `poison` | каждый удар — свой стак со своим таймером, до `maxStacks` | урон |
| `burning` | один, остаётся сильнейший, таймер обновляется | урон |
| `bleeding` | как `burning`; только у клинков `melee_arc` и `slash` (проверяет тест) | урон |
| `chill` | сильнее и дольше из действующего и нового | замедление без урона (`slow`, `duration`) |

Урон ДоТа = `share` × урон удара (после `attack`/`magic`, до крита), разложенный на `duration` тиками `DOT.tick`. Тики не критуют и идут в статистику оружия, которое наложило статус. Шанс `chance < 1` тянет RNG сима. В кодексе строка «… chance» по уровням (`codex.p.status_<type>` в i18n).

Радиусы `aura`, `melee_arc` и `orbit` берутся с одной лестницы колец `RINGS` (`src/data/weapons.js`): аура и взмах ставят `area: RINGS[k]`, орбита `area: onRing(k, ORBIT_R[спрайт] * size)`, тогда видимый край снаряда идёт ровно по линии кольца. Новый спрайт на орбите добавь в `ORBIT_R`. Проверка в `tests/unit/data.test.js`. Щиты не растут: базовые на T2, защитные апгрейды на T1, атакующие на T3.

1. `src/data/weapons.js`: запись по образцу `throwing_daggers`:
   ```js
   throwing_daggers: {
     icon: 'icon_throwing_daggers', sprite: 'proj_dagger', behavior: 'projectile', maxLevel: 7,
     levels: [ { damage: 8, cooldown: 1.0, amount: 1, speed: 280, duration: 1.2, pierce: 0, knockback: 40 }, /* ... 7 строк */ ],
   },
   ```
   `levels.length` равно `maxLevel`; у обычного оружия `maxLevel: 7`, `damage > 0`, `cooldown >= 0`, урон между уровнями не падает.
2. `assets/sprites/manifest.js`: `art('proj_<имя>', w, h)` для снаряда и `item('icon_<id>', 24, 24, '#цвет', 'rect')` для иконки.
3. `src/i18n/en.js`: `weapon.<id>.name`, `weapon.<id>.desc`. Необязательно `weapon.<id>.lvl<N>`: описание уровня на карточке (`src/scenes/LevelUp.js` берёт его раньше `.desc`).
4. Картинки: снаряд и иконка (`docs/ASSETS.md`, листы `projectiles` и `icons` в `tools/sheets.json`).
5. Тесты: `data: weapons have behavior, icon, sprite and full level tables`, `data: sprites referenced by content exist in manifest`. Баланс: `npm test` (бот из `tests/balance/`).

Оружие попадает в пул карточек само: список берётся из `WEAPONS`. Супероружие (`evolved: true`) в карточки не попадает, см. рецепт «Комбо».

## Оружие с новым behavior

1. Файл `src/behaviors/weapons/<имя>.js`, `export const <имяCamelCase> = { init(w, sim), update(w, sim, dt) }` (только именованный экспорт, `export default` запрещён линтером). `w` это состояние оружия: `w.id`, `w.level`, `w.def`, `w.params` (числа текущего уровня; `params.damage` уже умножен на `attack` или `magic` по `dmgType`, `params.cooldown` поделён на `haste`, `area` и `duration` умножены на статы `area` и `duration`), `w.slot`. Снаряды: `sim.addProjectile('player', w.def.sprite)`, затем заполнить `life`, `radius`, `dmg`, `vx/vy` и т. д. Образцы: `projectile.js` (простой), `orbit.js` (снаряд с `p.bk = orbit` и методом `moveProjectile`). Событие выстрела: `sim.events.push({ type: 'weaponFire', weapon: w.id })`.
2. Регистрация: именованный импорт и строка в `WEAPON_BEHAVIORS` в `src/behaviors/index.js` (имя ключа = значение `behavior` в data).
3. Дальше как в рецепте выше. `src/core/` не импортирует Phaser и DOM; числа берутся из `w.params`, не хардкодятся.
4. Новые поля уровня опиши в шапке `src/data/weapons.js`.

## Пассивка

1. `src/data/passives.js`: `{ icon: 'icon_<id>', stat, levels: [...], minLevel? }`. `stat` обязан быть ключом `src/data/stats.js` (вид сложения percent/flat и капы там же); все пассивки increased. `minLevel` — карточка не предлагается до этого уровня команды. Значения строго растут. `maxLevel` равен `levels.length`.
2. Новый стат (а не новая пассивка на существующий): добавить в `stats` героя (`src/data/heroes.js`), учесть в `src/core/stats.js` и в месте применения в `sim.js`. Это правка кода, не только данных.
3. manifest: `item('icon_<id>', 24, 24, ...)`. i18n: `passive.<id>.name`, `passive.<id>.desc`.
4. Тест: `data: passives are well formed`. Он же считает пассивки (сейчас 9).

## Герой

Герои перечислены только в `src/data/heroes.js`. Меню (картинки у кнопок), карточки выбора в соло и в лобби коопа, сим и тесты читают этот список сами, правок в сценах не нужно.

1. `src/data/heroes.js`: запись `id: { sprite, portrait, menu?, startWeapon, stats }`. `stats` с полным набором статов из `src/data/stats.js` (`maxHp, attack, magic, speed, crit, critDmg, area, duration, pickup, haste, luck, resistance, regen, xpGain, dodge, thorns`). `menu: { art, side }` необязательно: картинка у кнопок главного меню, `side: 'left'` рисуется отражённой, несколько на одной стороне встают дальше от кнопок по порядку. Порядок записей = порядок карточек выбора.
2. Спрайты в `assets/sprites/manifest.js`: лента ходьбы `chara('<id>', '#цвет')` (кадр 110×110, число кадров по ширине PNG, кадр 0 стойка, см. `docs/ASSETS.md`), портрет 48×48 и картинка меню. Как сделать ленту того же размера пикселя: `docs/ASSETS.md` (PixelLab, `hd-frames.mjs`, пример магессы).
3. i18n: `hero.<id>.name`. Статы игроку числами не показываются: на карточке выбора черты относительно среднего героя `HERO_BASE` (`+ATK` зелёным, `-HP` красным, `core/heroes.js heroTraits`); подписи `trait.<stat>` уже есть.
4. Тест `data: every hero is complete` проверяет спрайты, картинку меню, имя и набор статов; `data: hero start weapons exist` проверяет оружие.

Экран выбора (`src/ui/hero-picker.js`): при двух героях большие карточки, с трёх и больше сетка плиток (`GRID_FROM`). Число рядов подбирается под самую крупную плитку, герои делятся по рядам поровну (7 = 4 + 3, 13 = 7 + 6), каждый ряд по центру; под сеткой строка с именем, оружием и чертами героя в фокусе. Проверка на тестовых героях из монстров игры (3, 4, 7, 13, 20): скрипт съёмки описан в `docs/COOP.md`.

Правила выбора (`src/core/heroes.js`): неизвестный id заменяется `DEFAULT_HERO`; в коопе у каждого игрока свой герой (`distinctHeroes`), в лобби герой напарника занят, при одновременном выборе одного героя уступает гость.

## Враг

Behavior: `chase`, `dash`, `ranged`, `swarm`, `phase` (`boss` только для боссов). Параметры `params` по behavior смотри в соответствующем файле `src/behaviors/enemies/`.

1. `src/data/enemies.js`:
   ```js
   foxgirl: {
     sprite: 'foxgirl', behavior: 'dash', hp: 26, speed: 50, damage: 9, xp: 4, size: 9, knockbackResist: 0,
     params: { range: 140, windup: 0.45, dashSpeed: 240, dashTime: 0.35, cooldown: 2.2 },
     elite: elite(0xff8040),
   },
   ```
   `size` это радиус хитбокса в px мира. Нулевых `hp/speed/damage/xp/size` быть не должно.
2. manifest: `girl('<id>', 56, '#цвет', 'humanoid' | 'blob' | 'flyer')` (боссы: кадр 96). Рисунок: строка в промпте `tools/prompts/roster.txt` и ключ в `items` листа `roster` в `tools/sheets.json`, затем `node tools/slice-sheet.mjs roster`.
3. i18n: `enemy.<id>.name`.
4. Чтобы враг появился, добавь его в `timeline` этапа (рецепт «Волна»).
5. Тесты: `data: enemies have behavior, positive stats, elite block`, `stage: timeline sorted and references known enemies`.

Новое поведение: файл `src/behaviors/enemies/<имя>.js` (`init(e, sim)`, `update(e, sim, dt)`) и строка в `ENEMY_BEHAVIORS` в `src/behaviors/index.js`. Образец: `chase.js`.

## Элита

Элитная версия не отдельная запись: у врага есть блок `elite`, и тест требует его у каждого врага (`hpMul > 1`, `sizeMul > 1`, `drop === 'chest'`).

1. В `src/data/enemies.js` блок `elite: elite()`. Хелпер даёт `hpMul: 8, damageMul: 1.5, sizeMul: 1.5, xpMul: 6, glow: 0xff3d6e, drop: 'chest'`; `glow` это цвет свечения вокруг силуэта. Нужны другие числа: напиши объект вручную.
2. Появление: событие `{ at, type: 'elite', enemy }` в `timeline` (рецепт «Волна»). Из элиты всегда выпадает сундук (`src/core/sim.js`, тест `chest: elite always drops a chest, boss drops one too`).
3. Отдельного спрайта и i18n не нужно: рендер добавляет пульсирующее свечение цветом `glow` (тело не перекрашивается) и увеличивает спрайт на `sizeMul` (тот же множитель, что у хитбокса).

## Босс

1. `src/data/bosses.js`: поля как у врага плюс `attacks`, `rage`, `drop`:
   ```js
   dryad_queen: {
     sprite: 'dryad_queen', behavior: 'boss', hp: 30000, speed: 34, damage: 44, xp: 0, size: 26, knockbackResist: 1,
     attacks: [
       { type: 'dash', cooldown: 5, windup: 0.8, speed: 260, time: 0.6 },
       { type: 'summon', cooldown: 8, enemy: 'catgirl', count: 6, radius: 90 },
       { type: 'slam', cooldown: 6.5, count: 4, radius: 36, delay: 0.9, interval: 0.55, damage: 34 },
     ],
     rage: { hpFraction: 0.5, cooldownMul: 0.7, speedMul: 1.25 },
     final: true,
     drop: 'chest',
   },
   ```
   - `dash`: `windup` (замах, поза `windup`), `speed`, `time` (длительность рывка).
   - `summon`: `enemy` (id из `enemies.js`), `count`, `radius` (кольцо вокруг босса; поза `cast` 0.6 с).
   - `fan`: `count` снарядов веером на игрока, `spread` (градусы, полный угол), `speed`, `damage`, `life`; необязательно `volleys` (залпов, по умолчанию 1) и `interval` (пауза между залпами, 0.4 с).
   - `ring`: кольцо из `count` снарядов, `volleys` залпов через `interval`, каждый следующий повёрнут на `spin` рад (спираль); `speed`, `damage`, `life`.
   - `slam`: `count` ударов по земле через `interval`; каждый целится в позицию игрока в момент предупреждения. Через `delay` с круг `radius` бьёт на `damage`, если игрок внутри. Предупреждение лежит в `sim.telegraphs`, рисует его `src/render/world.js` (красный круг, заливка растёт за `delay`); по удару шлётся событие `slam`.
   - `blink`: босс растворяется за `delay` с (`e.alpha` падает до 0), появляется на расстоянии `distance` от игрока и проявляется за `fadeIn` (0.3 с); событие `bossBlink`.
   - Любая атака принимает `rageOnly: true`: включается только в ярости. Урон снарядов и ударов умножается на рост урона босса со временем (`stage.scaling`).
   - `hpPerLevel`: если задано, HP босса = `hpPerLevel × уровень игрока` при появлении (правило Vampire Survivors), `hp` не используется.
   - Честность (общие числа `BOSS` в `src/data/bosses.js`, работают для всех боссов): перед веером и кольцом замах `castDelay`; веер и кольцо не начинаются, пока героиня ближе `minRange`; рывок обрывается на `dashStop` px от героини; после рывка и телепорта босс стоит `recover` с и не атакует.
   - `rage`: когда `hp <= maxHp * hpFraction`, один раз шлётся `bossRage`, кулдауны умножаются на `cooldownMul`, скорость ходьбы на необязательный `speedMul`.
   - `final: true`: убийство этого босса даёт победу. У остальных боссов падает только `drop` (сундук), шлётся `bossDown`, забег идёт дальше. Каждый босс ещё даёт сундук шмоток (лут, `BOSS_DROPS` в `src/data/items.js`): экран лута открывается сразу (сцена `Loot`, docs/META.md 2.1).
   - Другой тип атаки: ветка в `src/behaviors/enemies/boss.js` и добавь тип в проверку теста `data: bosses use known behavior, attacks and summons`; тест на механику добавь в `tests/unit/boss.test.js`.
2. manifest: 3 кадра: 0 стойка, 1 шаг, 2 каст/замах (`anim.js`: у босса позы `windup` и `cast` показывают кадр 2). Образец `dryad_queen` (128×128, обычная плотность).
3. i18n: `boss.<id>.name`.
4. Этап: `{ at, type: 'boss', boss: '<id>' }`. В лесу три босса: 5:00, 10:00 и финальный на `duration` (15:00, последнее событие таймлайна, у него `final: true`). За `bossWarning` секунд до каждого директор шлёт `bossWarning`, HUD показывает баннер `boss.warning`, полоса HP берёт имя из `boss.<id>.name`.
5. Победа наступает после убийства босса с `final: true` (`victory` в `sim.js`).
6. Тесты: `data: bosses use known behavior...`, `tests/unit/mechanics.test.js` (`boss: ...`: предупреждение, позы, ярость).

## Карта (этап)

`src/data/stages/forest.js`: формат в шапке файла.

1. Новый файл `src/data/stages/<id>.js` с `export const <id> = { id, name: 'stage.<id>', duration, bossWarning, tiles, props, scaling, timeline }`.
2. Регистрация: пока этапы зашиты в код: `const STAGES = { forest }` в `src/core/sim.js` (там же импорт) и `stage: 'forest'` в `src/scenes/Game.js`. Для второго этапа нужно править эти места (вне `data`).
3. `props`: список `{ sprite, density, breakable, hp?, drop?, place?, big? }`. `density` это среднее число на чанк `SIM.chunkSize` (320 px). Неразрушаемые (`breakable: false`) только декор: их рисует `src/render/decor.js`, sim о них не знает. Разрушаемые создаёт sim (см. «Разрушаемый объект»). `place`: `'ground'` (по умолчанию, не на дороге), `'any'`, `'road'` (на оси дороги, объект смотрит по её направлению), `'roadside'` (у обочины; без дороги в чанке объект пропускается, если не задан `fallback: 'ground'`, как у фонаря); `big: true` для деревьев и кустов: объект занимает клетку сетки 4×4 чанка, поэтому крупные объекты не растут друг в друге (sim и декор используют одно правило, `placeProp` / `Decor._place`).
   `roads: { spacing, width, chance, wobble, wave, wave2 }` задаёт сеть песчаных дорог (`src/core/roads.js`): полосы через `spacing` px по обеим осям, каждая с шансом `chance`, извилистость `wobble` с периодами `wave`, `wave2`. Дорога задана формулой на весь мир, поэтому не обрывается; песок рисует `src/render/roads.js` по чанкам.
4. `tiles`: поле есть в формате, но рендер сейчас рисует фон из спрайта `grass` (`src/render/world.js`) и поле не читает. Другой фон потребует правки `world.js`.
5. `scaling: { hpPerMinute, damagePerMinute }`: рост HP и урона врагов, множитель `1 + k * минуты`.
6. `timeline`: события отсортированы по `at` (с). Типы (директор: `src/core/director.js`):
   - `spawn`: `{ at, type: 'spawn', enemy, rate, rateEnd?, until?, group, min?, minEnd? }`. `rate` групп/с, к `rateEnd` линейно до `until` (`until > at`); `group` врагов в группе; `min`/`minEnd`: держать не меньше столько живых врагов этого вида (линейно).
   - `ring`: `{ at, type: 'ring', enemy, count, radius? }`, кольцо вокруг игрока.
   - `elite`: `{ at, type: 'elite', enemy }`, один элитный враг с дропом-сундуком.
   - `burst`: `{ at, type: 'burst', enemy, count }`, кучка врагов у края экрана.
   - `boss`: `{ at, type: 'boss', boss }`.
   - `wall`, `flyby`: шеренга и пролёт стаи (формат в шапке `forest.js`).
   - У любого события, кроме `boss`, необязательное `afterBoss: N`: событие ждёт, пока убито N боссов
     (`sim.bossKills`, общее в коопе, детерминировано). Разовое (`ring`, `elite`, `burst`, `wall`, `flyby`)
     срабатывает в момент убийства, если его `at` уже прошло. `spawn` идёт в своём окне `at..until`
     (рост `rate` и `min` по абсолютному времени); если окно кончилось раньше убийства, не начинается.
     Призывы боссов (`attacks: summon`) не гейтятся. В лесу: лисы (`foxgirl`) `afterBoss: 1`, суккубы `afterBoss: 2`
     (тест `forest: kitsune (foxgirl) waves after the 1st boss, succubi after the 2nd`, `tests/unit/director.test.js`).
7. `bossWarning`: за сколько секунд до события `boss` слать `bossWarning` (0 или не задано: без предупреждения).
8. i18n: `stage.<id>.name`. manifest: спрайты props и фон.
9. Тесты: `stage: timeline sorted and references known enemies`, `data: pickups, props drops and timeline are consistent` (проверяют `forest`; для нового этапа добавь аналогичные проверки). Баланс: `tests/balance/` ходит по лесу.

## Разрушаемый объект

1. В `props` этапа: `{ sprite: 'barrel', density: 0.6, breakable: true, hp: 1, drop: { food: 0.3, coin: 0.35, magnet: 0.05 } }`.
   - `drop`: `{ pickupId: шанс }`, ключи из `src/data/pickups.js`, шансы в `(0, 1]`, суммарно умножаются на `luck`, выпадает максимум один предмет (кумулятивный бросок).
   - `hp` по умолчанию 1; каждое попадание снимает 1.
   - Ломает любое оружие. Снаряды бьют объекты по пути; оружие с наведением (кинжалы, топор, бомба, молния) без врагов в радиусе целится в ближайший объект (`sim.nearestProp`); молния бьёт мгновенно, поэтому ломает объекты вдоль своего пути сама (`sim.hitPropsOnSegment`). Новое поведение оружия с мгновенным уроном должно делать так же: тест `every weapon breaks props on its own` проходит по всем записям `WEAPONS`.
2. manifest: спрайт (`art('barrel', 18, 20, { origin: FEET })`), опора у основания.
3. Sim шлёт `{ type: 'propBreak', x, y, sprite }` при поломке (рендер: осколки и звук).
4. Тест: `props: break from weapons, push propBreak, drop by table` (`tests/unit/mechanics.test.js`), `data: pickups, props drops...`.

Новый подбираемый предмет: запись в `src/data/pickups.js` (`kind`: `xp | heal | magnet | coin | chest`), спрайт в manifest. Новый `kind` требует ветки в `sim.js`.

## Волна и событие

Правится только `timeline` в `src/data/stages/<этап>.js`.

```js
{ at: 150, type: 'ring', enemy: 'ghost', count: 16 },
{ at: 240, type: 'elite', enemy: 'slime' },
{ at: 510, type: 'burst', enemy: 'slime', count: 30 },
{ at: 390, type: 'spawn', enemy: 'bunnygirl', rate: 0.1, rateEnd: 0.25, until: 560, group: 2 },
{ at: 660, type: 'spawn', enemy: 'succubus', rate: 0.8, rateEnd: 1.5, until: 780, group: 2, afterBoss: 2 },
```

Держи список отсортированным по `at`. Лимит живых врагов `SIM.maxEnemies` (400) общий; при нехватке места элита и босс вытесняют самого дальнего обычного врага. Проверка: `npm test` (структура и отсортированность) и баланс-тесты (пик врагов не выше лимита).

## Супероружие: эволюции

Коллабов (оружие + оружие) больше нет (docs/META.md 1.4). Каждая запись в `src/data/combos.js` — эволюция
(как в Vampire Survivors), 1 к 1: `{ from: ['blade_arc', 'attack'], result: 'crimson_arc' }` — оружие на `maxLevel`
и своя пассивка любого уровня; пассивка остаётся.

Результат встаёт в слот оружия. Даёт его только сундук скиллов (с элит, docs/META.md 1.4): если эволюция готова, сундук показывает выбор из готовых (`chestChoices`, до `CHEST.maxChoices`), карточка с `evolved: true` и `from`. На карточках уровня эволюций нет.

1. `src/data/weapons.js`, запись с `evolved: true`, `maxLevel: 1`, одним уровнем, тем же `dmgType`, что у оружия. Одно поведение с усиленными числами и необязательным цветом снарядов:
   ```js
   crimson_arc: {
     icon: 'icon_crimson_arc', sprite: 'proj_blade_arc', behavior: 'slash', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xff5050,
     levels: [ { damage: 58, cooldown: 0.7, amount: 4, area: 200, width: 34, sweep: 0.1, knockback: 150 } ],
   },
   ```
2. Запись в `src/data/combos.js`.
3. Иконка `icon_<result>` в manifest (`icon(...)`, кадр 96×96) и на листе `assets/raw/icons_evo.png` (`sheets.json` `icons_evo`, `node tools/slice-sheet.mjs icons_evo`). i18n: `weapon.<result>.name`, `weapon.<result>.desc`.
4. Тесты: `data: combos use maxed regular weapons and evolved results` (одна эволюция на оружие и на пассивку), `data: evolutions are weapon + passive`, `combo: <id> works in sim` в `mechanics.test.js` (каждое супероружие наносит урон в sim).
5. Посмотреть вживую: `node tools/playtest.mjs 15 --god --weapons crimson_arc:1 --shot out.png --shot-at 12 --size 1280x720`.

## Чек-лист перед коммитом

- [ ] Все новые id есть в data, и у каждого есть ключи i18n (имя и описание) в `src/i18n/en.js`; строки в коде только через `t()`.
- [ ] Каждый новый спрайт есть в `assets/sprites/manifest.js` и файл лежит в `assets/sprites/` (заглушка допустима).
- [ ] `npm test` зелёный (unit + balance).
- [ ] `npm run smoke` зелёный, если трогал сцены, UI, рендер, manifest или спрайты.
- [ ] Не трогал `.secrets/`, ключи и `tools/gen-ledger.json` вручную.
- [ ] Новые поля data описаны в шапке соответствующего файла.
