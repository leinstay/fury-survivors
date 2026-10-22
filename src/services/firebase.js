// Ленивая загрузка Firebase web SDK (firestore-lite) с CDN: общая для таблицы рекордов и сигналинга коопа.
// Без сети import() падает, ошибка не кэшируется: следующий вызов попробует снова.
import { FIREBASE_CONFIG, FIRESTORE_DB_ID, SDK_URL } from '../data/leaderboard.js';

/**
 * @return {!Promise<{fs: !Object, db: !Object}>} модуль firestore-lite и база
 */
export async function loadFirestore() {
  if (!FIREBASE_CONFIG) throw new Error('offline');
  const { initializeApp, getApps, getApp } = await import(`${SDK_URL}/firebase-app.js`);
  const fs = await import(`${SDK_URL}/firebase-firestore-lite.js`);
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  const db = FIRESTORE_DB_ID ? fs.getFirestore(app, FIRESTORE_DB_ID) : fs.getFirestore(app);
  return { fs, db };
}
