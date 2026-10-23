// Чистка Firestore проекта fury-survivors на бесплатном тарифе (Spark: 1 ГиБ места, 50k чтений, 20k записей
// и 20k удалений в сутки; TTL-политики там не работают, им нужен биллинг). Что и когда чистить: docs/FIRESTORE.md.
//
// По умолчанию только отчёт: сколько документов и байт в каждой коллекции и что попало бы под чистку.
// С --apply удаляет. Забеги телеметрии перед удалением целиком пишутся в архив tools/out/firestore-archive/
// (JSON Lines, документы как их отдаёт REST; tools/runs-report.mjs --archive читает их вместе с базой).
//
//   node tools/firestore-cleanup.mjs                 отчёт
//   node tools/firestore-cleanup.mjs --apply         архив + удаление
//   node tools/firestore-cleanup.mjs --runs-days 14  держать забеги 14 дней вместо RETENTION.runsDays
//   node tools/firestore-cleanup.mjs --codex-days 365 --apply   ещё и копии кодекса, не обновлявшиеся год
//
// Доступ: правила базы запрещают клиентам удалять забеги, поэтому скрипт ходит с правами владельца проекта
// (запросы с токеном Google Cloud правила не проверяют). Токен: env FIRESTORE_TOKEN, иначе
// `gcloud auth print-access-token` (gcloud auth login под аккаунтом владельца проекта).
import { execSync } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'fury-survivors';
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ARCHIVE = join(import.meta.dirname, 'out', 'firestore-archive');

// Сроки хранения. 0 — коллекцию не чистить.
const RETENTION = {
  runsDays: 30,       // fury_runs: 150–200 КБ на забег, главный расход места; старше — в архив и удалить
  roomsHours: 1,      // rooms: лобби живёт минуты; хост не дождался или закрыл вкладку — документ остался
  codexDays: 0,       // fury_codex: резервная копия кодекса игрока; по умолчанию не трогаем (восстановление по id)
};
const QUOTA_BYTES = 1024 ** 3;
const DAY = 24 * 3600 * 1000;

const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const num = (k, def) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : def; };
const apply = flag('apply');
const runsDays = num('runs-days', RETENTION.runsDays);
const roomsHours = num('rooms-hours', RETENTION.roomsHours);
const codexDays = num('codex-days', RETENTION.codexDays);

function token() {
  if (process.env.FIRESTORE_TOKEN) return process.env.FIRESTORE_TOKEN.trim();
  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Error('нет токена: задайте FIRESTORE_TOKEN или войдите в gcloud (gcloud auth login)');
  }
}
const AUTH = { authorization: `Bearer ${token()}`, 'x-goog-user-project': PROJECT };

async function call(url, body) {
  const res = await fetch(url, body === undefined ? { headers: AUTH } : {
    method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Все документы коллекции. full: false — без полей (только имя и время: дёшево по трафику, чтение то же).
async function list(collection, full) {
  const out = [];
  let page = '';
  do {
    const mask = full ? '' : '&mask.fieldPaths=__none__';
    const j = await call(`${ROOT}/${collection}?pageSize=300${mask}${page ? `&pageToken=${page}` : ''}`);
    out.push(...(j.documents || []));
    page = j.nextPageToken || '';
  } while (page);
  return out;
}

// Примерный размер документа в хранилище (у Firestore: имя + поля + 32 байта; здесь по JSON полей).
const size = (d) => Buffer.byteLength(d.name) + 32
  + Buffer.byteLength(JSON.stringify(d.fields || {}));

async function remove(docs) {
  for (let i = 0; i < docs.length; i += 500) {
    const writes = docs.slice(i, i + 500).map((d) => ({ delete: d.name }));
    const j = await call(`${ROOT}:batchWrite`, { writes });
    const bad = (j.status || []).filter((s) => s.code);
    if (bad.length) throw new Error(`не удалилось ${bad.length}: ${bad[0].message}`);
  }
}

function archive(collection, docs) {
  if (!docs.length) return '';
  mkdirSync(ARCHIVE, { recursive: true });
  const file = join(ARCHIVE, `${collection}-${new Date().toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(file, docs.map((d) => JSON.stringify(d)).join('\n') + '\n');
  return file;
}

const now = Date.now();
const age = (d) => now - Date.parse(d.updateTime || d.createTime);
let total = 0;
const plan = [];

for (const [collection, keepMs, full] of [
  ['fury_runs', runsDays * DAY, true],
  ['rooms', roomsHours * 3600 * 1000, false],
  ['fury_codex', codexDays * DAY, true],
  ['fury_scores', 0, true],
  ['fury_scores_coop', 0, true],
]) {
  const docs = await list(collection, full);
  const bytes = docs.reduce((s, d) => s + size(d), 0);
  if (full) total += bytes;
  const old = keepMs > 0 ? docs.filter((d) => age(d) > keepMs) : [];
  const oldBytes = old.reduce((s, d) => s + size(d), 0);
  console.log(`${collection.padEnd(17)} ${String(docs.length).padStart(6)} док. ${(bytes / 1048576).toFixed(1).padStart(7)} МБ` +
    (keepMs > 0 ? `   к чистке ${old.length} (${(oldBytes / 1048576).toFixed(1)} МБ)` : '   не чистится'));
  if (old.length) plan.push({ collection, old });
}
console.log(`\nвсего ≈ ${(total / 1048576).toFixed(1)} МБ из ${QUOTA_BYTES / 1048576} МБ бесплатных ` +
  `(${((total / QUOTA_BYTES) * 100).toFixed(1)} %; без индексов, в консоли Firebase будет больше)`);

if (!apply) {
  if (plan.length) console.log('\nотчёт без изменений; удалить: --apply');
} else {
  for (const { collection, old } of plan) {
    if (collection === 'fury_runs') console.log(`архив: ${archive(collection, old)}`);
    await remove(old);
    console.log(`${collection}: удалено ${old.length}`);
  }
}
