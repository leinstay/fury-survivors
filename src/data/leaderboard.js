// Онлайн-таблица рекордов: конфиг, лимиты и формула очков. Логики здесь нет.
// Бэкенд: Cloud Firestore, проект fruit-madness-52222, именованная база 'fruit-madness',
// отдельная коллекция 'fury_scores'. Правила: firestore.rules в корне (общий файл на всю базу).

// Публичный конфиг web-приложения fury-survivors-web (не секрет: что можно читать и писать, решают только правила).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAGEpbUurZBgzybDEVkqKri-i20_R4z8FA',
  authDomain: 'fruit-madness-52222.firebaseapp.com',
  projectId: 'fruit-madness-52222',
  storageBucket: 'fruit-madness-52222.firebasestorage.app',
  messagingSenderId: '278926995710',
  appId: '1:278926995710:web:9c7fd175bc8cafb02e35af',
};

// Имя базы не входит в web-конфиг. null = база (default).
export const FIRESTORE_DB_ID = 'fruit-madness';
export const COLLECTION = 'fury_scores';
export const SDK_URL = 'https://www.gstatic.com/firebasejs/12.19.0';

// Ник: 3-6 символов [A-Za-z0-9], хранится в верхнем регистре. Зеркалит firestore.rules.
export const NICK = { min: 3, max: 6, re: /^[A-Za-z0-9]+$/, storageKey: 'fury-survivors.nick' };

// Очки забега: floor(time) * perSecond + kills * perKill + (victory ? victoryBonus : 0).
export const SCORE_FORMULA = { perSecond: 10, perKill: 1, victoryBonus: 5000 };

// Допустимые диапазоны полей документа (клиентская проверка; правила держат те же границы).
export const LIMITS = { scoreMax: 9999999, timeMax: 86400, killsMax: 1000000, levelMax: 999 };

export const BOARD = {
  readLimit: 50,        // сколько документов читаем, чтобы набрать 10 разных игроков
  rows: 10,             // строк в таблице
  cooldownMs: 10000,    // пауза между отправками
  timeoutMs: 8000,      // зависший запрос = offline
};
