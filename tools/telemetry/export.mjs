import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { decodeRun, validateRun } from './data.mjs';

export async function fetchRuns({ fetcher = fetch, from = '', to = '', retries = 2 } = {}) {
  const base = 'https://firestore.googleapis.com/v1/projects/fury-survivors/databases/(default)/documents/fury_runs';
  const records = [];
  const rejected = [];
  let token = '';
  const seen = new Set();
  do {
    if (seen.has(token)) throw new Error('repeated pagination cursor');
    seen.add(token);
    let body;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetcher(`${base}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`,
            { signal: AbortSignal.timeout(20000) });
        if (!res.ok) {throw Object.assign(new Error(`Firestore HTTP ${res.status}`),
            { retryable: res.status === 429 || res.status >= 500 });}
        body = await res.json();
        if (body.error) throw new Error(JSON.stringify(body.error));
        break;
      } catch (err) {
        if (attempt >= retries || err.retryable === false) throw err;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    for (const d of body.documents || []) {
      const at = d.fields?.createdAt?.timestampValue || d.createTime;
      if (!at || (from && Date.parse(at) < Date.parse(from)) ||
          (to && Date.parse(at) >= Date.parse(to))) continue;
      try {
        const r = decodeRun(JSON.parse(d.fields.data.stringValue));
        r.ver = d.fields.ver?.stringValue || '';
        r.v = r.v || Number(d.fields.v?.integerValue || 1);
        const errors = validateRun(r);
        if (errors.length) throw new Error(errors.join('; '));
        // Session link is retained as a hash; external document IDs are omitted.
        if (r.sessionId) r.sessionId = createHash('sha256').update(r.sessionId).digest('hex').slice(0, 20);
        records.push({ at, run: r });
      } catch (err) {
        rejected.push({ at, reason: err.message });
      }
    }
    token = body.nextPageToken || '';
  } while (token);
  records.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) ||
    JSON.stringify(a.run).localeCompare(JSON.stringify(b.run)));
  return { records, rejected };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const opt = (k, fallback) => { const i = args.indexOf(`--${k}`); return i < 0 ? fallback : args[i + 1]; };
  const from = opt('from', '');
  const to = opt('to', '');
  for (const at of [from, to]) {if (at && (!at.endsWith('Z') || !Number.isFinite(Date.parse(at)))) {
    throw new Error('Use UTC ISO timestamps with Z');
  }}
  const out = opt('out', 'tools/out/telemetry');
  const result = await fetchRuns({ from, to });
  const data = JSON.stringify(result.records, null, 2) + '\n';
  const manifest = { schema: 1, exportedAt: new Date().toISOString(), from, to,
    count: result.records.length, rejected: result.rejected,
    versions: [...new Set(result.records.map((r) => r.run.ver))],
    sha256: createHash('sha256').update(data).digest('hex') };
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/runs.json`, data);
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
}
