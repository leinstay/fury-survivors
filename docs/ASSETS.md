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
| 0.5 | 2 | 4×4 px | эффекты, которые поведение масштабирует от опорной ширины 64 px мира (`proj_blade_arc`, `proj_holy_ground`): родной рисунок модели ~30 px |

Правило выбора: всё новое делаем в density 1 и на той же сетке, что персонажи (рост обычного персонажа ~50 клеток, дерево ~100). 0.5 только для больших эффектов, растягиваемых от ширины 64 px.

Растяжка холста на экран: при целом масштабе экрана пиксели чёткие (`image-rendering: pixelated`), при нецелом включается мягкое сглаживание (`src/ui/scaling.js`).

## Генерация: `tools/gen-sprite.mjs`

```
node tools/gen-sprite.mjs <name> [--ref path]... [--aspect 3:2] [--quality medium] [--bg transparent] [--dry-run]
```

- Промпт: `tools/prompts/_style.txt` (общий стиль, идёт первым) + `tools/prompts/<name>.txt` (персонаж или лист). Результат: `assets/raw/<name>.png`, сырой ответ модели.
- Референсы `--ref`: `references/main.png` (техника и чибиобразные пропорции) для листа персонажей; готовый `assets/raw/roster.png` для остальных листов, чтобы держать размер клетки и стиль. Папка `references/` не в git.
- Персонажи: один общий лист `roster` (`tools/prompts/roster.txt`, `--aspect 21:9 --quality high`): героиня, враги и три босса вдвое выше, все в стойке в три четверти вправо. Ходьба процедурная (`src/render/anim.js`). Лист окружения или предметов: объекты с промежутками, размеры заданы относительно персонажа («вдвое выше девушки»).
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
- Слипшиеся позы. Позы ищутся по пустым столбцам; если соседние позы перекрываются по x (так было у босса), они склеиваются в один кадр. Тогда лист разводят заранее: позы раскладываются по связным областям с промежутками, получившийся файл идёт на вход чистки. Для босса это `assets/raw/dryad_queen_split.png` (`docs/STATUS.md`). Разводилось одноразовым скриптом: связные области маски (8-связность), три крупнейшие — позы, мелкие куски прицепляются к ближайшей по x, позы копируются без пересэмплинга через 80 px пустоты; на вход `clean-sprite` подавался `dryad_queen_split.png`. Альтернатива: перегенерировать лист с просьбой о больших промежутках между позами.

Проверка результата: `node tools/contact-sheet.mjs <key>` и просмотр глазами.

## Листы объектов: `tools/slice-sheet.mjs` и `tools/sheets.json`

Для окружения, предметов, иконок и снарядов: одна картинка с разрозненными объектами.

```
node tools/slice-sheet.mjs <sheet> [--report]
```

- `tools/sheets.json`: `{ "<sheet>": { "raw": "assets/raw/x.png", "items": [...] } }`. Листы: `roster`, `env_props`, `items`, `icons`, `projectiles`. Необязательные поля листа: `step: [min, max]` (границы шага сетки модели, px исходника; при `--quality high` около 4.5–7), `rows: "center"` (ряды по центрам, для листа с высокими фигурами на два ряда), `mergeGap` (сливать области ближе этого, по умолчанию 14; 0, если фигуры стоят тесно), `cuts: [[x, y0, y1], ...]` (вертикальные разрезы маски, если соседние фигуры касаются свечением или хвостом).
- `items` идут в порядке чтения (ряды сверху вниз, слева направо). Элемент: ключ спрайта, или `{ "key", "frame", "flip" }` для кадра многокадрового спрайта (`tree`, `flower`), или `null`, чтобы пропустить найденный объект (в `icons` последний `null`).
- `--report` только печатает найденные объекты и их родные размеры, файлы не пишет. Запускай его первым: число объектов должно совпасть с `items`.
- Объект больше `manifest.size` уменьшается голосованием по блокам, меньше остаётся родным. При `origin[1] = 1` он ставится низом на нижнюю строку кадра, иначе центром.
- Новый объект: ключ в manifest, строка в `items` листа в нужной позиции, промпт `tools/prompts/<лист>.txt`.

## Остальные скрипты

- `node tools/contact-sheet.mjs [key ...] [--scale 4] [--out tools/out/contact-sheet.png] [--bg grass]`: превью спрайтов на шахматке или траве с подписью и линией опоры. Без ключей берёт все из manifest. `tools/out/` в `.gitignore`.
- `node tools/snap-image.mjs <raw.png> <out.png> [--step N]`: целая картинка (фон) по родной сетке модели без потерь; показ целым множителем через `density` в manifest.
- `node tools/make-grass.mjs [--seed 7]`: процедурный бесшовный тайл `assets/sprites/grass.png` (128×128).
- `node tools/placeholders.mjs [--force]` (или `npm run placeholders`): цветные заглушки по manifest (форма из `shape`, цвет из `color`). Существующие файлы не трогает без `--force`, чтобы не затереть настоящие спрайты.
- `node tools/playtest.mjs`: headless-плейтест с логом `__game.debug()` и скриншотом, для проверки результата в самой игре.

## Звук

- Эффекты: `node tools/make-sfx.mjs [имя...]` (или `npm run sfx`) пишет `assets/audio/sfx/<имя>.wav` (22050 Гц, моно, 16 бит) из пресетов `PRESETS` в начале скрипта; поля пресета описаны там же комментарием (`wave`, `freq`, `slide`, `attack/sustain/decay`, `steps`, `lp`, `noiseMix`). Синтез детерминирован. Новый звук: пресет, имя в `SFX_NAMES` в `src/audio/sfx.js` (оттуда загрузка и лимит одновременных), вызов `playSfx(scene, '<имя>')` или ветка в обработчике событий того же файла.
- Подмена звука файлом: положи wav с тем же именем в `assets/audio/sfx/`. После этого запускай `make-sfx.mjs` только с явными именами: без аргументов он перезапишет все эффекты.
- Музыка: `assets/audio/music/theme.mp3`, трек Goukisan «Guitar Vs. Piano 1.2» (4:16, 128 кбит/с, источник в `CREDITS.md`), ключ `music_theme` в `src/audio/sfx.js`. Запасной процедурный луп: `node tools/make-music.mjs` пишет `theme.wav` (ля минор, 140 bpm, ~41 с); чтобы играл он, поменяй путь в `preloadAudio`. Источник и лицензию внешнего файла впиши в `CREDITS.md`.

## Шрифт

`assets/fonts/PixelifySans.ttf` (лицензия OFL, `assets/fonts/OFL.txt`), грузится через `FontFace` в `src/scenes/Boot.js`; источники в `CREDITS.md`. Подмена: другой файл по тому же пути либо смена `FONT_NAME` и пути в `Boot.js`.

## Таблица спрайтов

Собрана из `assets/sprites/manifest.js` (кадр, число кадров, density) и `tools/sheets.json` (лист-источник).

| Ключ | Кадр | Кадров | density | Источник |
|---|---|---|---|---|
| `heroine` | 56×56 | 4 | 1 | `assets/raw/heroine_walk.png` |
| `heroine_portrait` | 48×48 | 1 | 1 | нет (заглушка) |
| `catgirl` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `foxgirl` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `succubus` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `slime` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `ghost` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `bunnygirl` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `harpy` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `lamia` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `elf_archer` | 56×56 | 1 | 1 | `assets/raw/roster.png` |
| `kitsune_empress` | 96×96 | 1 | 2/3 | `assets/raw/roster.png` |
| `harpy_queen` | 96×96 | 1 | 2/3 | `assets/raw/roster.png` |
| `dryad_queen` | 96×96 | 1 | 2/3 | `assets/raw/roster.png` |
| `xp_small` | 10×12 | 1 | 1 | `assets/raw/items.png` |
| `xp_medium` | 12×14 | 1 | 1 | `assets/raw/items.png` |
| `xp_large` | 14×20 | 1 | 1 | `assets/raw/items.png` |
| `food` | 16×16 | 1 | 1 | `assets/raw/items.png` |
| `magnet` | 16×16 | 1 | 1 | `assets/raw/items.png` |
| `coin` | 12×14 | 1 | 1 | `assets/raw/items.png` |
| `chest` | 22×20 | 1 | 1 | `assets/raw/items.png` |
| `proj_blade_arc` | 32×32 | 1 | 0.5 | `assets/raw/projectiles.png` |
| `proj_dagger` | 20×10 | 1 | 1 | `assets/raw/projectiles.png` |
| `proj_shield` | 22×22 | 1 | 1 | `assets/raw/projectiles.png` |
| `proj_holy_ground` | 32×32 | 1 | 0.5 | `assets/raw/projectiles.png` |
| `proj_axe` | 22×22 | 1 | 1 | `assets/raw/projectiles.png` |
| `proj_chain` | 22×22 | 1 | 1 | `assets/raw/projectiles.png` |
| `proj_firebomb` | 22×22 | 1 | 1 | `assets/raw/projectiles.png` |
| `proj_enemy` | 10×10 | 1 | 1 | `assets/raw/projectiles.png` |
| `icon_blade_arc` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_throwing_daggers` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_guardian_shields` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_holy_ground` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_war_axe` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_storm_chain` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_firebomb` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_aegis_storm` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_thunder_knives` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_max_hp` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_attack` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_speed` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_crit` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_pickup` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_haste` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_luck` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_armor` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_regen` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `icon_heal` | 24×24 | 1 | 1 | `assets/raw/icons.png` |
| `menu_bg` | 265×150 | 1 | 0.4 | `assets/raw/menu_bg.png` (tools/snap-image.mjs) |
| `grass` | 128×128 | 1 | 1 | tools/make-grass.mjs |
| `tree` | 64×104 | 2 | 1 | `assets/raw/env_props.png` |
| `rock` | 28×28 | 1 | 1 | `assets/raw/env_props.png` |
| `bush` | 32×32 | 1 | 1 | `assets/raw/env_props.png` |
| `flower` | 22×22 | 2 | 1 | `assets/raw/env_props.png` |
| `barrel` | 22×26 | 1 | 1 | `assets/raw/env_props.png` |
| `lantern` | 26×40 | 1 | 1 | `assets/raw/env_props.png` |
