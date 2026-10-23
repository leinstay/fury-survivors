// Отправка v2 в прежнюю fury_runs: внешняя форма совместима с опубликованными правилами.
import { TELEMETRY } from '../data/telemetry.js';
import { loadFirestore } from './firebase.js';
import { versionTag } from '../core/lockstep.js';

const bytes = (s) => new TextEncoder().encode(s).length;

// При переполнении сначала сокращаются вспомогательные потоки. Исходные количества и потери явны.
export function serializeRun(run) {
  const packed = { ...run, capture: { ...run.capture,
    dropped: { ...run.capture?.dropped }, stored: {}, total: {} } };
  const keys = ['offers', 'movement', 'inputs', 'events', 'applications', 'decisions',
    'snaps', 'picks', 'levels'];
  for (const key of keys) {
    packed[key] = (run[key] || []).slice();
    packed.capture.total[key] = packed[key].length + (packed.capture.dropped[key] || 0);
  }
  const encode = () => {
    for (const key of keys) packed.capture.stored[key] = packed[key].length;
    packed.capture.inputThroughTick = packed.inputs.at(-1)?.[0] ?? null;
    packed.capture.inputComplete = !(packed.capture.dropped.inputs > 0);
    return JSON.stringify(packed);
  };
  let data = encode();
  for (const key of keys) {
    while (bytes(data) >= TELEMETRY.maxBytes && packed[key].length) {
      const n = Math.max(1, Math.ceil(packed[key].length / 4));
      packed[key].splice(-n);
      packed.capture.dropped[key] = (packed.capture.dropped[key] || 0) + n;
      data = encode();
    }
  }
  if (bytes(data) >= TELEMETRY.maxBytes) throw new Error('telemetry summary too large');
  return data;
}

// Сжатые подробности позволяют сохранить целый обычный забег под прежним лимитом.
// Старые читатели по-прежнему видят picks/snaps/end; новый экспорт раскрывает detail.
export async function encodeRun(run) {
  const keys = ['decisions', 'offers', 'applications', 'inputs', 'movement', 'events'];
  if (typeof CompressionStream !== 'undefined') {
    const detail = Object.fromEntries(keys.map((k) => [k, run[k] || []]));
    const stream = new Blob([JSON.stringify(detail)]).stream()
      .pipeThrough(new CompressionStream('gzip'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (let i = 0; i < compressed.length; i += 8192) {
      binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
    }
    const packed = { ...run, detail: { encoding: 'gzip-base64', data: btoa(binary) },
      capture: { ...run.capture, stored: {}, total: {} } };
    for (const key of [...keys, 'picks', 'snaps', 'levels']) {
      packed.capture.stored[key] = (run[key] || []).length;
      packed.capture.total[key] = (run[key] || []).length + (run.capture?.dropped?.[key] || 0);
    }
    packed.capture.inputComplete = !(run.capture?.dropped?.inputs > 0);
    packed.capture.inputThroughTick = run.inputs?.at(-1)?.[0] ?? null;
    for (const key of keys) delete packed[key];
    const data = JSON.stringify(packed);
    if (bytes(data) < TELEMETRY.maxBytes) return data;
  }
  return serializeRun(run);
}

const OUTBOX = 'fury.telemetry.outbox.v2';

export function createTelemetrySender({ load = loadFirestore,
  storage = () => globalThis.localStorage,
  automated = () => !!globalThis.navigator?.webdriver,
  timeoutMs = TELEMETRY.timeoutMs } = {}) {
  let pending = null;
  let active = null;
  const queue = () => {
    if (pending) return pending;
    try {
      const saved = JSON.parse(storage()?.getItem(OUTBOX) || '[]');
      pending = Array.isArray(saved) ? saved.filter((x) =>
        typeof x.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x.id) &&
        typeof x.doc?.data === 'string' && bytes(x.doc.data) < TELEMETRY.maxBytes) : [];
    } catch { pending = []; }
    return pending;
  };
  const save = () => {
    try { storage()?.setItem(OUTBOX, JSON.stringify(queue())); }
    catch { /* очередь остаётся в памяти, если хранилище недоступно */ }
  };
  const upload = async (entry) => {
    const { fs, db } = await load();
    const ref = fs.doc(db, TELEMETRY.collection, entry.id);
    try {
      await fs.setDoc(ref, { ...entry.doc, createdAt: fs.serverTimestamp() });
    } catch (err) {
      // Повтор после потерянного ответа: правила запрещают update, но документ уже мог создаться.
      const existing = await fs.getDoc(ref);
      if (!existing.exists() || existing.data().data !== entry.doc.data) throw err;
    }
  };
  const flush = () => {
    if (automated()) return Promise.resolve(false);
    if (active) return active;
    active = (async () => {
      for (const entry of [...queue()]) {
        let timer;
        try {
          await Promise.race([upload(entry), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('offline')), timeoutMs);
          })]);
          const i = queue().indexOf(entry);
          if (i >= 0) queue().splice(i, 1);
          save();
        } catch {
          return false;
        } finally { clearTimeout(timer); }
      }
      return true;
    })().finally(() => { active = null; });
    return active;
  };
  const send = async (run) => {
    if (!run || automated()) return false;
    try {
      const data = await encodeRun(run);
      const id = `${run.sessionId || globalThis.crypto.randomUUID()}-${run.local || 0}`;
      const doc = {
        v: run.v || TELEMETRY.version, ver: versionTag(), mode: run.mode,
        difficulty: run.difficulty, status: run.status, time: Math.round(run.time),
        level: run.level, hero: run.hero, data,
      };
      if (!queue().some((x) => x.id === id)) queue().push({ id, doc });
      save();
      await flush();
      // flush мог уже обрабатывать более старые записи, когда поступил этот забег.
      if (queue().some((x) => x.id === id)) await flush();
      return !queue().some((x) => x.id === id);
    } catch { return false; }
  };
  return { send, flush };
}

const sender = createTelemetrySender();
export const sendRun = sender.send;
export const flushRuns = sender.flush;
