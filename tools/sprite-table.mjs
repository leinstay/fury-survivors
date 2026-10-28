// Sprite table for docs/ASSETS.md from assets/sprites/manifest.js and tools/sheets.json.
// Replaces everything from "## Sprite table" to the end of the file.
// node tools/sprite-table.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SPRITES } from '../assets/sprites/manifest.js';
import { frameCount } from './sprite-frames.mjs';

const DOC = 'docs/ASSETS.md';
// Sprites that do not come from sheets: procedural ones and ones built from a finished animation.
const ART = 'tools/make-weapon-art.mjs';
const TOOLS = { grass: 'tools/make-grass.mjs', proj_blade_arc: 'tools/make-slash.mjs', proj_crescent: 'tools/make-slash.mjs', menu_bg: '`assets/raw/menu_bg.png` (tools/snap-image.mjs)',
  proj_wisp: ART, proj_wisp_shot: `${ART} (proj_enemy, tinted blue)`, proj_meteor: ART, proj_spear: ART, proj_bolt: ART,
  proj_mine: ART, proj_frost: ART, proj_beam: ART, proj_poison_cloud: `${ART} (codex only, in game it is a zone)`,
  heroine_menu: 'tools/crop-raw.mjs', heroine_portrait: 'placeholder (tools/placeholders.mjs)',
  heroine: '`assets/raw/heroine_walk256_pixellab/` (PixelLab Edit Pro stance and Animate V3 walk, 256×256, tools/hd-frames.mjs ×0.5)',
  mage: '`assets/raw/mage_walk256_pixellab/` (PixelLab Edit Pro stance and Animate V3 walk, 256×256, tools/hd-frames.mjs ×0.5)',
  mage_portrait: 'placeholder (tools/placeholders.mjs)',
  mage_menu: '`assets/raw/roster/mage.png`: cut from `assets/raw/mage.png` (tools/crop-raw.mjs), scaled ×261/637 to match the copy of the Hero on the same sheet' };

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

const head = `## Sprite table

Built by \`node tools/sprite-table.mjs\` from \`assets/sprites/manifest.js\` (frame, frame count and density) and \`tools/sheets.json\` (source sheet).

| Key | Frame | Frames | density | Source |
|---|---|---|---|---|
`;
const doc = readFileSync(DOC, 'utf8');
const at = doc.indexOf('## Sprite table');
if (at < 0) throw new Error('no sprite table section');
writeFileSync(DOC, doc.slice(0, at) + head + rows.join('\n') + '\n');
console.log(`${rows.length} sprites`);
