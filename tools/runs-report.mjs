// Разбор телеметрии (коллекция fury_runs, src/core/telemetry.js): читает все забеги через REST и печатает
// по минутам средний уровень и по каждому оружию средний урон за минуту (нанесено / замах) у тех, кто его держал.
// node tools/runs-report.mjs [--difficulty cursed] [--mode solo] [--ver 2617f0] [--json out.json] [--archive]
// --archive: ещё и забеги, удалённые из базы tools/firestore-cleanup.mjs (tools/out/firestore-archive/fury_runs-*.jsonl)
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const BASE = 'https://firestore.googleapis.com/v1/projects/fury-survivors/databases/(default)/documents/fury_runs';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : ''; };

// Документы из архива чистки: по строке JSON на документ, в том же виде, что отдаёт REST.
function archived() {
  const dir = join(import.meta.dirname, 'out', 'firestore-archive');
  if (!args.includes('--archive') || !existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^fury_runs-.*\.jsonl$/.test(f))
      .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
}

// Все документы fury_runs из базы (REST, постранично).
async function fetchDocs() {
  const out = [];
  let token = '';
  do {
    const res = await fetch(`${BASE}?pageSize=300${token ? `&pageToken=${token}` : ''}`);
    if (!res.ok) throw new Error(`Firestore HTTP ${res.status}`);
    const j = await res.json();
    out.push(...(j.documents || []));
    token = j.nextPageToken || '';
  } while (token);
  return out;
}

async function fetchAll() {
  const out = [];
  const seen = new Set();
  for (const d of [...archived(), ...await fetchDocs()]) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    const f = d.fields || {};
    try {
      const run = JSON.parse(f.data.stringValue);
      if (run.detail?.encoding === 'gzip-base64') {
        const raw = gunzipSync(Buffer.from(run.detail.data, 'base64'),
            { maxOutputLength: 32 * 1024 * 1024 });
        Object.assign(run, JSON.parse(raw.toString('utf8')));
        delete run.detail;
      }
      out.push({ ver: f.ver?.stringValue || '', at: d.createTime, ...run });
    } catch (err) { console.warn(`Нечитаемая запись ${d.name}: ${err.message}`); }
  }
  return out;
}

const runs = (await fetchAll()).filter((r) => (!opt('difficulty') || r.difficulty === opt('difficulty'))
  && (!opt('mode') || r.mode === opt('mode')) && (!opt('ver') || r.ver === opt('ver')));
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(runs));
console.log(`забегов: ${runs.length}`);
const incomplete = runs.filter((r) => Object.values(r.capture?.dropped || {}).some((n) => n > 0));
if (incomplete.length) console.warn(`С сокращённой телеметрией: ${incomplete.length}; см. capture.dropped в JSON`);
const byMin = new Map();
for (const r of runs) {
  let prev = null;
  for (const s of r.snaps) {
    const m = s.t / 60;
    if (!byMin.has(m)) byMin.set(m, { n: 0, lv: 0, w: {} });
    const row = byMin.get(m);
    row.n++;
    row.lv += s.lv;
    for (const [id, lv, dealt, raw] of s.w) {
      const p = prev && prev.w.find((x) => x[0] === id);
      const a = row.w[id] || (row.w[id] = { n: 0, lv: 0, dealt: 0, raw: 0 });
      a.n++;
      a.lv += lv;
      a.dealt += dealt - (p ? p[2] : 0);
      a.raw += raw - (p ? p[3] : 0);
    }
    prev = s;
  }
}
for (const [m, row] of [...byMin].sort((a, b) => a[0] - b[0])) {
  console.log(`\n${m}:00  забегов ${row.n}, уровень ${(row.lv / row.n).toFixed(1)}`);
  const ws = Object.entries(row.w).sort((a, b) => b[1].raw / b[1].n - a[1].raw / a[1].n);
  for (const [id, a] of ws) {
    console.log(`  ${id.padEnd(18)} у ${String(a.n).padStart(3)}  ур ${(a.lv / a.n).toFixed(1)}  ` +
      `нанесено/мин ${Math.round(a.dealt / a.n)}  замах/мин ${Math.round(a.raw / a.n)}`);
  }
}
