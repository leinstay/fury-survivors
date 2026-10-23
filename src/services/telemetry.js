// Отправка телеметрии забега (src/core/telemetry.js) в Firestore. Ошибки молча глотаются: игре не мешаем.
import { TELEMETRY } from '../data/telemetry.js';
import { loadFirestore } from './firebase.js';
import { versionTag } from '../core/lockstep.js';

/**
 * @param {?Object} run итог Telemetry.finish
 * @return {!Promise<boolean>} записано ли
 */
export async function sendRun(run) {
  if (!run) return false;
  // Браузер под автоматизацией (Playwright smoke): тестовые забеги в боевую базу не пишем.
  if (globalThis.navigator && globalThis.navigator.webdriver) return false;
  try {
    const data = JSON.stringify(run);
    if (data.length >= TELEMETRY.maxBytes) return false;
    const { fs, db } = await loadFirestore();
    const doc = {
      v: TELEMETRY.version, ver: versionTag(), mode: run.mode, difficulty: run.difficulty,
      status: run.status, time: Math.round(run.time), level: run.level, hero: run.hero, data,
      createdAt: fs.serverTimestamp(),
    };
    let timer = null;
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('offline')), TELEMETRY.timeoutMs);
    });
    await Promise.race([fs.addDoc(fs.collection(db, TELEMETRY.collection), doc), guard])
        .finally(() => clearTimeout(timer));
    return true;
  } catch {
    return false;
  }
}
