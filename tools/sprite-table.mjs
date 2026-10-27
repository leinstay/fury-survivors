// Таблица спрайтов для docs/ASSETS.md из assets/sprites/manifest.js и tools/sheets.json.
// Заменяет всё от «## Таблица спрайтов» до конца файла.
// node tools/sprite-table.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SPRITES } from '../assets/sprites/manifest.js';
import { frameCount } from './sprite-frames.mjs';

const DOC = 'docs/ASSETS.md';
// Спрайты не из листов: процедурные и собранные из готовой анимации.
const ART = 'tools/make-weapon-art.mjs';
const TOOLS = { grass: 'tools/make-grass.mjs', proj_blade_arc: 'tools/make-slash.mjs', proj_crescent: 'tools/make-slash.mjs', menu_bg: '`assets/raw/menu_bg.png` (tools/snap-image.mjs)',
  proj_wisp: ART, proj_wisp_shot: `${ART} (proj_enemy, оттенок в голубой)`, proj_meteor: ART, proj_spear: ART, proj_bolt: ART,
  proj_mine: ART, proj_frost: ART, proj_beam: ART, proj_poison_cloud: `${ART} (только кодекс: в игре зона)`,
  heroine_menu: 'tools/crop-raw.mjs', heroine_portrait: 'заглушка (tools/placeholders.mjs)',
  heroine: '`assets/raw/heroine_walk256_pixellab/` (стойка PixelLab Edit Pro + ходьба Animate V3, 256×256, tools/hd-frames.mjs ×0.5)',
  mage: '`assets/raw/mage_walk256_pixellab/` (стойка PixelLab Edit Pro + ходьба Animate V3, 256×256, tools/hd-frames.mjs ×0.5)',
  mage_portrait: 'заглушка (tools/placeholders.mjs)',
  mage_menu: '`assets/raw/roster/mage.png`: вырезка из `assets/raw/mage.png` (tools/crop-raw.mjs), уменьшена ×261/637 по копии героини на том же листе' };

const sheets = JSON.parse(readFileSync('tools/sheets.json', 'utf8'));
const fromSheet = {};
for (const sh of Object.values(sheets)) {
  for (const it of sh.items || []) {
    const key = typeof it === 'string' ? it : it?.key;
    if (key && !(typeof it === 'object' && it.hd === false)) fromSheet[key] ??= `\`${sh.raw}\``;
  }
}

function source(key) {
  if (TOOLS[key]) return TOOLS[key];
  for (const dir of [`assets/raw/${key}_anim_pixellab`, `assets/raw/${key}_walk_pixellab`]) {
    if (existsSync(`${dir}/0.png`)) return `\`${dir}/\` (PixelLab, tools/hd-frames.mjs)`;
  }
  return fromSheet[key] || '';
}

const fmt = (d) => (d == null ? 1 : Number.isInteger(d) ? d : +d.toFixed(2));
const rows = Object.entries(SPRITES).map(([key, s]) =>
  `| \`${key}\` | ${s.frameWidth}×${s.frameHeight} | ${frameCount(s)} | ${fmt(s.density)}${s.smooth ? ', smooth' : ''} | ${source(key)} |`);

const head = `## Таблица спрайтов

Собрана из \`assets/sprites/manifest.js\` (кадр, число кадров, density) и \`tools/sheets.json\` (лист-источник) скриптом \`node tools/sprite-table.mjs\`.

| Ключ | Кадр | Кадров | density | Источник |
|---|---|---|---|---|
`;
const doc = readFileSync(DOC, 'utf8');
const at = doc.indexOf('## Таблица спрайтов');
if (at < 0) throw new Error('no sprite table section');
writeFileSync(DOC, doc.slice(0, at) + head + rows.join('\n') + '\n');
console.log(`${rows.length} sprites`);
