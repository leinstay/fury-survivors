// Телеметрия для баланса (src/core/telemetry.js, src/services/telemetry.js): каждый забег каждого игрока
// одним документом в Firestore, внутри срезы раз в минуту. Ника и IP нет.
export const TELEMETRY = {
  version: 2,                // версия схемы (поле v)
  collection: 'fury_runs',   // коллекция в Firestore (firestore.rules)
  every: 60,                 // с сима между срезами
  minTime: 30,               // с: забег короче не отправляется (случайный старт и выход)
  maxBytes: 200000,          // предел JSON в поле data (правила: data.size() < 200000)
  distanceBins: [32, 64, 128, 256], // границы расстояний попадания, последний bin — дальше
  movementEvery: 1,          // с: положение, окружение и HP; ввод записывается при каждом изменении
  maxInputChanges: 12000,    // ограничение памяти на аналоговом джойстике
  maxMovementSamples: 3600,
  maxEvents: 4000,
  maxDecisions: 2000,
  maxOffers: 2000,
  maxApplications: 2000,
  maxSnapshots: 1440,
  timeoutMs: 8000,           // мс на запись
};
