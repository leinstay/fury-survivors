// Онлайн-таблица рекордов: конфиг, лимиты и формула очков. Логики здесь нет.
// Бэкенд: Cloud Firestore, собственный проект fury-survivors, база (default), коллекция 'fury_scores'.
// Правила: firestore.rules в корне, публикуются вручную в консоли.

// Публичный конфиг web-приложения проекта fury-survivors (не секрет: что можно читать и писать,
// решают только правила). measurementId не нужен: Analytics игра не подключает.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBJV2mRO3DxJ2OBmG_AK3jA5bQ9ta3WPYU',
  authDomain: 'fury-survivors.firebaseapp.com',
  projectId: 'fury-survivors',
  storageBucket: 'fury-survivors.firebasestorage.app',
  messagingSenderId: '489472154496',
  appId: '1:489472154496:web:9532f74e2d59a611cd7f65',
};

// Имя базы не входит в web-конфиг. null = база (default).
export const FIRESTORE_DB_ID = null;
export const COLLECTION = 'fury_scores';
export const SDK_URL = 'https://www.gstatic.com/firebasejs/12.19.0';

// Ник: 3-6 символов [A-Za-z0-9], хранится в верхнем регистре. Зеркалит firestore.rules.
export const NICK = { min: 3, max: 6, re: /^[A-Za-z0-9]+$/, storageKey: 'fury-survivors.nick' };

// Очки забега: floor(time) * perSecond + kills * perKill + coins * perCoin + (victory ? victoryBonus : 0).
// Монеты пока ничего не покупают и дают только очки.
export const SCORE_FORMULA = { perSecond: 10, perKill: 1, perCoin: 10, victoryBonus: 5000 };

// Сложность в документе: поле difficulty ('normal' | 'cursed'); старые записи без поля читаются как normal.
export const DIFFICULTY_FIELD = { key: 'difficulty', values: ['normal', 'cursed'], fallback: 'normal' };

// Допустимые диапазоны полей документа (клиентская проверка; правила держат те же границы).
export const LIMITS = { scoreMax: 9999999, timeMax: 86400, killsMax: 1000000, levelMax: 999 };

export const BOARD = {
  readLimit: 50,        // сколько документов читаем, чтобы набрать 10 разных игроков
  rows: 10,             // строк в таблице
  cooldownMs: 10000,    // пауза между отправками
  timeoutMs: 8000,      // зависший запрос = offline
};
