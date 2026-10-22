# Ассеты

Картинки: генерация (`tools/gen-sprite.mjs`), чистка в пиксель-арт (`tools/clean-sprite.mjs`, `tools/slice-sheet.mjs`), ключи и геометрия кадров в `assets/sprites/manifest.js`. Звук и музыка процедурные (`tools/make-sfx.mjs`, `tools/make-music.mjs`). Все скрипты запускаются из корня репозитория, `sharp` ставит `npm install`. Игра ссылается на спрайты только по ключу из manifest: настоящий файл подменяет заглушку тем же именем, размером кадра и опорой.

## Плотность пикселей

Мир и UI в координатах 640×360, холст 1280×720 (`RENDER_ZOOM = 2`). Спрайт рисуется в масштабе `1 / density` (`src/render/density.js`), поэтому поле `density` в manifest говорит, сколько пикселей картинки приходится на пиксель мира. Все спрайты рисуются целым множителем, без пересэмплинга.

| density | масштаб в мире | 1 пиксель картинки на холсте | Когда брать |
|---|---|---|---|
| 2 | 0.5 | 1 px | сейчас не используется: пиксель вдвое мельче, чем у персонажей |
| 1 (по умолчанию) | 1 | 2×2 px | всё: персонажи (~50 px в кадре 56×56), боссы (~95 px в кадре 96×96), окружение, предметы, иконки. Персонажи и окружение сняты с родной сетки модели клетка в пиксель |
| 2/3 | 1.5 | 3×3 px | боссы: тот же лист, что персонажи, но втрое выше героини |
| 0.4 | 2.5 | 5×5 px | фон меню (`tools/snap-image.mjs`) |
| 4, smooth | 0.25 | плавно | `proj_blade_arc`: процедурная дуга взмаха (`tools/make-slash.mjs`), хранится в размере самого крупного показа и уменьшается линейно (`smooth` в manifest), без пиксельной сетки |

Правило выбора: всё новое делаем в density 1 и на той же сетке, что персонажи (рост обычного персонажа ~50 клеток, дерево ~100). 0.5 только для больших эффектов, растягиваемых от ширины 64 px.

Растяжка холста на экран: при целом масштабе экрана пиксели чёткие (`image-rendering: pixelated`), при нецелом включается мягкое сглаживание (`src/ui/scaling.js`).

## Генерация: `tools/gen-sprite.mjs`

```
node tools/gen-sprite.mjs <name> [--ref path]... [--aspect 3:2] [--quality medium] [--bg transparent] [--model google/gemini-3-pro-image] [--resolution 2K] [--dry-run]
```

- Промпт: `tools/prompts/_style.txt` (общий стиль, идёт первым) + `tools/prompts/<name>.txt` (персонаж или лист). Результат: `assets/raw/<name>.png`, сырой ответ модели.
- Референсы `--ref`: `references/main.png` (техника и чибиобразные пропорции) для листа персонажей; готовый `assets/raw/roster.png` для остальных листов, чтобы держать размер клетки и стиль. Папка `references/` не в git.
- Персонажи: один общий лист `roster` (`tools/prompts/roster.txt`, `--aspect 21:9 --quality high`): героиня, враги и три босса вдвое выше, все в стойке в три четверти вправо. Ходьба процедурная (`src/render/anim.js`). Лист окружения или предметов: объекты с промежутками, размеры заданы относительно персонажа («вдвое выше девушки»).
- `--model`: по умолчанию модель из ledger (Flare). Gemini (Nano Banana Pro, `google/gemini-3-pro-image`, ~$0.136 за картинку 1K/2K): без `quality`, `background`, `moderation`, фон непрозрачный (промпт просит пурпурный #FF00FF), `_style.txt` к нему не добавляется. Сетка у Gemini мыльная и неровная (клетка 18–22 px), кадры приходится уменьшать.
- Правка готового листа: лист в `--ref` и промпт «верни ту же картинку, измени только …» (отдельный файл в `tools/prompts/`, после правки его можно удалить). Flare держит раскладку и сетку, но мелкие детали в 1–2 клетки (рот) не стирает.
- Все спрайты с листов модели идут в HD: `sheets.json` `"hd": { "default": k, "<ключ>": k }` — фигура не снимается по сетке,
  а плавно уменьшается из исходника (lanczos3, альфа порогом) в k раз и показывается 1:1 на холсте (`density: 2`, константа `HD` в manifest).
  Множители: персонажи 0.392 (как героиня), боссы 0.588, окружение 0.28, предметы и снаряды 0.152, взмах 0.62 (кадр 256, density 4, smooth), святой круг 0.28, иконки 0.31.
  Кадр в manifest в px холста (вдвое больше мира). Элемент `{ "key", "hd": false }` только даёт исходник (`--raw`): так у героини и кошки, у них свои ленты ходьбы.
- Иконки лежат в кадре 96×96, `src/ui/icons.js` один раз уменьшает их под каждый размер показа и рисует 1:1.
- Анимация персонажа: PixelLab `animate-with-text-v3` (первый кадр до 256×256, исходник из `assets/raw/roster/`), кадры в `assets/raw/<анимация>/`, лента через `node tools/hd-frames.mjs <out.png> <scale> <кадры...>` и `density: 2` в manifest. По сетке такие кадры не резать: детализация в 1 px.
  Первый кадр: исходник из `assets/raw/roster/<ключ>.png`, уменьшенный в 256/261 (как героиня), низом в холст 192×256; запуск `tools/pixellab-anim.mjs`.
  Шов цикла: если стойка (кадр 0) по силуэту ближе к кадрам 8 и 1, чем они друг к другу, её ставят переходом (`walk: [1..8, 0]`, так у героини).

### План анимаций PixelLab по персонажам

Холст 192×256 стоит 6 генераций пробного тарифа (на 33 из 40 хватило героини и кошки, осталось 27: ещё 4 персонажа).

Действие уходит в PixelLab по-английски как есть (`PL_ACTION`), рядом перевод.

| Персонаж | Действие (PL_ACTION) | Перевод | Статус |
|---|---|---|---|
| catgirl | walking to the right in place, light graceful cat-like walk cycle, small steps, arms swing gently, cat tail sways behind her, ears twitch | шагает вправо на месте, лёгкая грациозная кошачья походка, мелкие шаги, руки мягко качаются, хвост покачивается, уши подёргиваются | готово |
| foxgirl | walking to the right in place, playful bouncy walk cycle, arms swing, big fluffy fox tail swishes side to side | шагает вправо на месте, игривая пружинистая походка, руки качаются, пушистый лисий хвост мотается из стороны в сторону | готово |
| succubus | hovering in place facing right, slow wing flaps, gentle up and down float, tail sways | парит на месте лицом вправо, медленные взмахи крыльев, плавно покачивается вверх-вниз, хвост колышется | готово |
| bunnygirl | hopping in place facing right, small rabbit hops, ears bounce, knees bend on landing | прыгает на месте лицом вправо, мелкие заячьи прыжки, уши подпрыгивают, колени сгибаются при приземлении | готово |
| harpy | hovering in place facing right, strong wing flaps, talons dangle, gentle bob | парит на месте лицом вправо, сильные взмахи крыльев, когти свисают, плавно покачивается | готово |
| lamia | slithering to the right in place, snake tail undulates in waves, upper body sways, arms relaxed | ползёт вправо на месте, змеиный хвост извивается волнами, корпус покачивается, руки расслаблены | готово |
| slime | bouncing in place, squash and stretch, jelly body wobbles, hair-like drips sway | подпрыгивает на месте, сжимается и растягивается, желейное тело колышется, капли-пряди покачиваются | готово |
| ghost | floating in place facing right, gentle bob up and down, wispy tail and sleeves drift | парит на месте лицом вправо, плавно покачивается вверх-вниз, призрачный хвост и рукава развеваются | готово |
| kitsune_empress (босс) | standing idle facing right, nine tails sway in slow waves, sleeves and hair drift, calm breathing | стоит лицом вправо, девять хвостов медленно колышутся волнами, рукава и волосы развеваются, спокойное дыхание | готово |
| harpy_queen (босс) | hovering in place facing right, large slow wing flaps, crown and feathers ruffle | парит на месте лицом вправо, большие медленные взмахи крыльев, корона и перья топорщатся | готово |
| dryad_queen (босс) | standing idle facing right, swaying like a tree in wind, leaves and vines in her hair rustle | стоит лицом вправо, покачивается, как дерево на ветру, листья и лозы в волосах шелестят | готово |

- `--dry-run` печатает тело запроса без отправки и без трат.
- Деньги: `tools/gen-ledger.json` (`budget` 5, `stop` 4.5, `spent`, список трат). Скрипт отказывается работать, если `spent + оценка > stop` (оценка: самая дорогая из прошлых трат или `estimatePerImage`). Трата пишется в ledger даже если картинки в ответе нет. Вручную ledger не править.
- Один процесс за раз: lock-файл `tools/.gen.lock` (в `.gitignore`); второй запуск завершится с кодом 4. Если процесс убили и lock остался, удали файл.
- Ключ читает только этот скрипт, из `.secrets/`; в игру и логи он не попадает. Агентам `.secrets/` не читать.
- Перегенерация не чаще одного раза на позицию; дальше чинить скриптом чистки или оставить процедурную анимацию.

## Чистка: `tools/clean-sprite.mjs`

```
node tools/clean-sprite.mjs <raw.png> <spriteKey> [--frames N] [--colors 16 | --palette] [--threshold 0.4] [--dark 0.3]
  [--no-outline] [--grid | --resample] [--height N] [--frame N] [--out path]
```

Размер кадра, опора и рост берутся из записи `spriteKey` в manifest; результат пишется в `assets/sprites/<key>.png` (strip по горизонтали). `--out` пишет в другой файл (для проб). Печатает JSON с режимом и размером каждой позы; `clipped` больше нуля значит, что рисунок не влез в кадр: увеличь кадр в manifest или задай `--height`.

Шаги: фон (альфа или пурпурный хромакей, убирается ореол), поиск поз (столбцы с пикселями режутся по пустым промежуткам), затем один из режимов, удаление одиночных пикселей, постановка в кадр с опорой по ногам.

- `--grid` включён по умолчанию для спрайтов с `density > 1`. Модель рисует пиксель-арт на своей неровной сетке; границы клеток ищутся по перепадам цвета, из каждой клетки берётся самый частый цвет. Рисунок переносится один арт-пиксель в один пиксель, без новой палитры и обводки (своя уже есть).
- `--resample` (режим по умолчанию при density 1): уменьшает рисунок до роста из manifest, квантует (`--colors N` или общая `tools/palette.json` через `--palette`) и рисует обводку 1 px.
- Shrink: если родной рост после `--grid` больше `manifest.size[1]` (или `--height`) больше чем на 10%, рисунок уменьшается голосованием по блокам. Нужен, потому что модель рисует разные листы на сетке разного шага.
- Слипшиеся позы. Позы ищутся по пустым столбцам; если соседние позы перекрываются по x (так было у босса), они склеиваются в один кадр. Тогда лист разводят заранее: позы раскладываются по связным областям с промежутками, получившийся файл идёт на вход чистки. Для босса это `assets/raw/dryad_queen_split.png`. Разводилось одноразовым скриптом: связные области маски (8-связность), три крупнейшие — позы, мелкие куски прицепляются к ближайшей по x, позы копируются без пересэмплинга через 80 px пустоты; на вход `clean-sprite` подавался `dryad_queen_split.png`. Альтернатива: перегенерировать лист с просьбой о больших промежутках между позами.

Проверка результата: `node tools/contact-sheet.mjs <key>` и просмотр глазами.

## Листы объектов: `tools/slice-sheet.mjs` и `tools/sheets.json`

Для окружения, предметов, иконок и снарядов: одна картинка с разрозненными объектами.

```
node tools/slice-sheet.mjs <sheet> [--report]
```

- `tools/sheets.json`: `{ "<sheet>": { "raw": "assets/raw/x.png", "items": [...] } }`. Листы: `roster`, `env_props`, `items`, `icons`, `projectiles`. Необязательные поля листа: `step: [min, max]` (границы шага сетки модели, px исходника; при `--quality high` около 4.5–7), `rows: "center"` (ряды по центрам, для листа с высокими фигурами на два ряда), `mergeGap` (сливать области ближе этого, по умолчанию 14; 0, если фигуры стоят тесно), `cuts: [[x, y0, y1], ...]` (вертикальные разрезы маски, если соседние фигуры касаются свечением или хвостом; `[x0, x1, y, "h"]` — горизонтальный отрезок для ступенчатого разреза вокруг выступа), `boxes: [[x0, y0, x1, y1], ...]` (рамка на каждый item: область достаётся рамке, где её центр, у каждой фигуры своя маска; так нарезан `roster`), `drop: [[x0, y0, x1, y1]]` (области с центром внутри выбрасываются), `align: "head"` (кадры шага выравниваются по голове).
- `items` идут в порядке чтения (ряды сверху вниз, слева направо). Элемент: ключ спрайта, или `{ "key", "frame", "flip" }` для кадра многокадрового спрайта (`tree`, `flower`), или `null`, чтобы пропустить найденный объект (в `icons` последний `null`).
- `--raw` (листы с `boxes`): каждая фигура ещё и в исходном разрешении с прозрачным фоном, `assets/raw/<лист>/<ключ>.png`. Это референсы для Nano Banana и героиня в меню (`heroine_menu` = `assets/raw/roster/heroine.png`).
- `--report` только печатает найденные объекты и их родные размеры, файлы не пишет. Запускай его первым: число объектов должно совпасть с `items`.
- Объект больше `manifest.size` уменьшается голосованием по блокам, меньше остаётся родным. При `origin[1] = 1` он ставится низом на нижнюю строку кадра, иначе центром.
- Новый объект: ключ в manifest, строка в `items` листа в нужной позиции, промпт `tools/prompts/<лист>.txt`.

## Остальные скрипты

- `node tools/contact-sheet.mjs [key ...] [--scale 4] [--out tools/out/contact-sheet.png] [--bg grass]`: превью спрайтов на шахматке или траве с подписью и линией опоры. Без ключей берёт все из manifest. `tools/out/` в `.gitignore`.
- `node tools/snap-image.mjs <raw.png> <out.png> [--step N]`: целая картинка (фон) по родной сетке модели без потерь; показ целым множителем через `density` в manifest.
- `node tools/make-grass.mjs [--seed 7]`: процедурный бесшовный тайл `assets/sprites/grass.png` (128×128).
- `node tools/make-slash.mjs`: взмах клинка `assets/sprites/proj_blade_arc.png`, край удара конусом: кусок кольца вокруг героя из SVG почти белого цвета (tint супероружия красит его целиком). Геометрия кадра в `WEAPON_BEHAVIOR.melee_arc` (`src/data/weapons.js`), её же читает оружие; после правки чисел перезапусти скрипт.
- `node tools/demouth.mjs [key...] [--dry] [--debug]`: PixelLab дорисовывает персонажам рот, которого нет на исходном рисунке. Скрипт находит голову на каждом кадре (сдвиг относительно кадра 0), ищет под глазами замкнутые пятна не цвета кожи и заливает их кожей вокруг; правит `assets/raw/<key>_{anim|walk}_pixellab/*.png` на месте, после него ленты пересобираются `tools/hd-frames.mjs` (0.4 для обычных, 1 для боссов). Точки лица по персонажам и ручные прямоугольники для трудных кадров заданы в начале скрипта; `--debug` пишет лист проверки `tools/out/demouth-debug.png`.
- `node tools/sprite-table.mjs`: пересобирает раздел «Таблица спрайтов» в этом файле; запускать после правок manifest.
- `node tools/placeholders.mjs [--force]` (или `npm run placeholders`): цветные заглушки по manifest (форма из `shape`, цвет из `color`). Существующие файлы не трогает без `--force`, чтобы не затереть настоящие спрайты.
- `node tools/playtest.mjs`: headless-плейтест с логом `__game.debug()` и скриншотом, для проверки результата в самой игре.

## Звук

- Эффекты: `node tools/make-sfx.mjs [имя...]` (или `npm run sfx`) пишет `assets/audio/sfx/<имя>.wav` (22050 Гц, моно, 16 бит) из пресетов `PRESETS` в начале скрипта; поля пресета описаны там же комментарием (`wave`, `freq`, `slide`, `attack/sustain/decay`, `steps`, `lp`, `noiseMix`). Синтез детерминирован. Новый звук: пресет, имя в `SFX_NAMES` в `src/audio/sfx.js` (оттуда загрузка и лимит одновременных), вызов `playSfx(scene, '<имя>')` или ветка в обработчике событий того же файла.
- Подмена звука файлом: положи wav с тем же именем в `assets/audio/sfx/`. После этого запускай `make-sfx.mjs` только с явными именами: без аргументов он перезапишет все эффекты.
- Музыка: `assets/audio/music/theme.mp3`, трек Goukisan «Guitar Vs. Piano 1.2» (4:16, 128 кбит/с, источник в README.md, раздел Credits), ключ `music_theme` в `src/audio/sfx.js`. Запасной процедурный луп: `node tools/make-music.mjs` пишет `theme.wav` (ля минор, 140 bpm, ~41 с); чтобы играл он, поменяй путь в `preloadAudio`. Источник и лицензию внешнего файла впиши в раздел Credits в `README.md`.

## Шрифт

`assets/fonts/Jersey15-Regular.ttf` (лицензия OFL, `assets/fonts/OFL.txt`), грузится через `FontFace` в `src/scenes/Boot.js`; источник в README.md, раздел Credits. Подмена: другой файл по тому же пути либо смена `FONT_NAME` и пути в `Boot.js`.

## Таблица спрайтов

Собрана из `assets/sprites/manifest.js` (кадр, число кадров, density) и `tools/sheets.json` (лист-источник) скриптом `node tools/sprite-table.mjs`.

| Ключ | Кадр | Кадров | density | Источник |
|---|---|---|---|---|
| `heroine` | 77×102 | 9 | 2 | `assets/raw/heroine_walk_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `heroine_portrait` | 48×48 | 1 | 1 | заглушка (tools/placeholders.mjs) |
| `heroine_menu` | 139×261 | 1 | 2 | tools/crop-raw.mjs |
| `catgirl` | 77×102 | 9 | 2 | `assets/raw/catgirl_walk_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `foxgirl` | 77×102 | 9 | 2 | `assets/raw/foxgirl_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `succubus` | 77×102 | 9 | 2 | `assets/raw/succubus_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `slime` | 77×102 | 9 | 2 | `assets/raw/slime_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `ghost` | 77×102 | 9 | 2 | `assets/raw/ghost_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `bunnygirl` | 77×102 | 9 | 2 | `assets/raw/bunnygirl_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `harpy` | 77×102 | 9 | 2 | `assets/raw/harpy_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `lamia` | 77×102 | 9 | 2 | `assets/raw/lamia_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `kitsune_empress` | 192×256 | 9 | 2 | `assets/raw/kitsune_empress_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `harpy_queen` | 192×256 | 9 | 2 | `assets/raw/harpy_queen_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `dryad_queen` | 192×256 | 9 | 2 | `assets/raw/dryad_queen_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `xp_small` | 20×24 | 1 | 2 | `assets/raw/items.png` |
| `xp_medium` | 24×30 | 1 | 2 | `assets/raw/items.png` |
| `xp_large` | 28×40 | 1 | 2 | `assets/raw/items.png` |
| `food` | 34×34 | 1 | 2 | `assets/raw/items.png` |
| `magnet` | 32×32 | 1 | 2 | `assets/raw/items.png` |
| `coin` | 24×28 | 1 | 2 | `assets/raw/items.png` |
| `chest` | 44×40 | 1 | 2 | `assets/raw/items.png` |
| `proj_blade_arc` | 256×256 | 1 | 4, smooth | tools/make-slash.mjs |
| `proj_crescent` | 256×256 | 1 | 4, smooth | tools/make-slash.mjs |
| `proj_dagger` | 40×20 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_shield` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_holy_ground` | 128×128 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_axe` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_chain` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_firebomb` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_enemy` | 20×20 | 1 | 2 | `assets/raw/projectiles.png` |
| `icon_blade_arc` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_throwing_daggers` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_guardian_shields` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_holy_ground` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_war_axe` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_storm_chain` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_firebomb` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_aegis_storm` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_thunder_knives` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_max_hp` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_attack` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_speed` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_crit` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_pickup` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_haste` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_luck` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_armor` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_regen` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_heal` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_phantom_blades` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_sacred_edge` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_reaper_crescent` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_storm_edge` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_inferno_slash` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_knife_carousel` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_holy_rain` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_gale_cutters` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_ember_knives` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_sanctuary` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_bulwark_spin` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_tesla_ward` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_comet_ring` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_judgement_wheel` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_divine_storm` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_hellfire` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_thunder_axe` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_blast_axe` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_plasma_storm` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_crimson_arc` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_thousand_edge` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_aegis_bastion` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_soul_garden` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_death_spiral` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_thunder_loop` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `icon_napalm_rain` | 96×96 | 1 | 2 | `assets/raw/icons_evo.png` |
| `menu_bg` | 265×150 | 1 | 0.4 | `assets/raw/menu_bg.png` (tools/snap-image.mjs) |
| `grass` | 128×128 | 1 | 1 | tools/make-grass.mjs |
| `tree` | 128×208 | 2 | 2 | `assets/raw/env_props.png` |
| `rock` | 56×56 | 1 | 2 | `assets/raw/env_props.png` |
| `bush` | 64×64 | 1 | 2 | `assets/raw/env_props.png` |
| `flower` | 44×44 | 2 | 2 | `assets/raw/env_props.png` |
| `barrel` | 44×52 | 1 | 2 | `assets/raw/env_props.png` |
| `lantern` | 52×80 | 1 | 2 | `assets/raw/env_props.png` |
