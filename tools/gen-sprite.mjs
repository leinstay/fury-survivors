// Генерация картинки через OpenRouter. Ключ читается только здесь, из .secrets/, и никуда не пишется.
// Без файла ключа (облачная сессия) запрос уходит без Authorization: заголовок подставляет прокси окружения.
// Учёт трат в tools/gen-ledger.json, жёсткий стоп по ledger.stop. Одновременно работает один процесс (lock-файл).
//
// node tools/gen-sprite.mjs <name> [--ref path]... [--aspect 3:2] [--quality high] [--moderation low] [--bg transparent]
//                            [--model id] [--resolution 1K|2K|4K] [--dry-run]
//   model: по умолчанию ledger.model (gpt-image). Для google/gemini-3-pro-image (Nano Banana Pro) quality, background
//          и moderation не передаются (модель их не принимает, фон всегда непрозрачный: просим в промпте пурпурный),
//          resolution 1K/2K/4K (1K и 2K стоят одинаково).
//   quality: auto | low | medium | high | xhigh | max (выше качество — чётче края пикселей, дороже)
//   moderation: передаётся провайдеру OpenAI как есть (low снижает отказы на нарядах персонажей)
//   промпт: tools/prompts/<name>.txt (+ общий tools/prompts/_style.txt в начале)
//   результат: assets/raw/<name>.png (сырой ответ модели, дальше tools/clean-sprite.mjs)
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(root, 'tools', 'gen-ledger.json');
const LOCK = join(root, 'tools', '.gen.lock');
const KEY_FILE = join(root, '.secrets', 'openrouter-flare');
const ENDPOINT = 'https://openrouter.ai/api/v1/images';

function parseArgs(argv) {
  const args = { refs: [], aspect: null, quality: 'high', moderation: 'low', bg: 'transparent', model: null, resolution: null, dryRun: false, name: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ref') args.refs.push(argv[++i]);
    else if (a === '--aspect') args.aspect = argv[++i];
    else if (a === '--quality') args.quality = argv[++i];
    else if (a === '--moderation') args.moderation = argv[++i];
    else if (a === '--bg') args.bg = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--resolution') args.resolution = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (!args.name) args.name = a;
  }
  return args;
}

function readKey() {
  if (!existsSync(KEY_FILE)) return null;
  const raw = readFileSync(KEY_FILE, 'utf8');
  const m = raw.match(/sk-or-[A-Za-z0-9_-]+/);
  if (!m) throw new Error('no OpenRouter key found in .secrets/openrouter-flare');
  return m[0];
}

function loadLedger() {
  return JSON.parse(readFileSync(LEDGER, 'utf8'));
}

function saveLedger(l) {
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
}

function dataUrl(path) {
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(path).toLowerCase()];
  if (!mime) throw new Error(`unsupported ref type: ${path}`);
  return `data:${mime};base64,${readFileSync(join(root, path)).toString('base64')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name) {
    console.error('usage: node tools/gen-sprite.mjs <name> [--ref path]... [--aspect 3:2] [--dry-run]');
    process.exit(2);
  }
  const ledger = loadLedger();
  const promptFile = join(root, 'tools', 'prompts', `${args.name}.txt`);
  const styleFile = join(root, 'tools', 'prompts', '_style.txt');
  // Gemini рисует непрозрачный фон: общий стиль (прозрачность, сетка Flare) ему не подходит, промпт сам задаёт пурпурный фон.
  const useStyle = existsSync(styleFile) && !(args.model || ledger.model).startsWith('google/');
  const prompt = [useStyle ? readFileSync(styleFile, 'utf8').trim() : '', readFileSync(promptFile, 'utf8').trim()]
    .filter(Boolean).join('\n\n');

  // Оценка следующей траты: самая дорогая из прошлых или стартовая оценка.
  const estimate = Math.max(ledger.estimatePerImage, ...ledger.entries.map((e) => e.cost || 0));
  console.log(`spent $${ledger.spent.toFixed(3)} / stop $${ledger.stop}, next ~$${estimate.toFixed(3)}`);
  if (ledger.spent + estimate > ledger.stop) {
    console.error('budget stop: generation refused');
    process.exit(3);
  }

  const model = args.model || ledger.model;
  const gemini = model.startsWith('google/');
  const body = { model, prompt, n: 1 };
  if (!gemini) Object.assign(body, { quality: args.quality, background: args.bg, output_format: 'png' });
  if (args.aspect) body.aspect_ratio = args.aspect;
  if (args.resolution) body.resolution = args.resolution;
  if (args.moderation && !gemini) body.moderation = args.moderation;

  if (args.dryRun) {
    console.log(JSON.stringify({ ...body, input_references: args.refs.map((r) => `<ref ${r}>`) }, null, 2));
    return;
  }
  if (args.refs.length) body.input_references = args.refs.map((r) => ({ type: 'image_url', image_url: { url: dataUrl(r) } }));

  let lock;
  try {
    lock = openSync(LOCK, 'wx');
  } catch {
    console.error(`another generation is running (${LOCK}); refusing`);
    process.exit(4);
  }

  try {
    const started = Date.now();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        ...(readKey() ? { Authorization: `Bearer ${readKey()}` } : {}),
        'Content-Type': 'application/json', 'X-Title': 'Fury Survivors asset tool',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json.error || json).slice(0, 500)}`);

    const b64 = json.data?.[0]?.b64_json;
    const cost = json.usage?.cost ?? null;
    const entry = {
      date: new Date().toISOString(), name: args.name, model, refs: args.refs,
      resolution: args.resolution, quality: args.quality, moderation: args.moderation,
      aspect: args.aspect, cost, usage: json.usage,
      seconds: Math.round((Date.now() - started) / 1000),
    };
    // Деньги списаны даже без картинки: в ledger пишем всегда. Неизвестную цену считаем по оценке.
    ledger.spent += cost ?? estimate;
    if (!b64) {
      entry.file = null;
      entry.note = `no image in response: ${JSON.stringify(json).slice(0, 200)}`;
      ledger.entries.push(entry);
      saveLedger(ledger);
      throw new Error(entry.note);
    }
    const outDir = join(root, 'assets', 'raw');
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, `${args.name}.png`);
    writeFileSync(out, Buffer.from(b64, 'base64'));
    entry.file = `assets/raw/${args.name}.png`;
    ledger.entries.push(entry);
    saveLedger(ledger);
    console.log(`saved ${entry.file}, cost $${cost ?? '?'}, spent $${ledger.spent.toFixed(3)}, ${entry.seconds}s`);
  } finally {
    closeSync(lock);
    unlinkSync(LOCK);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
