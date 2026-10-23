// Телеметрия для баланса (src/core/telemetry.js, src/services/telemetry.js): каждый забег каждого игрока
// одним документом в Firestore, внутри срезы раз в минуту. Ника и IP нет.
export const TELEMETRY = {
  version: 1,                // версия схемы (поле v)
  collection: 'fury_runs',   // коллекция в Firestore (firestore.rules)
  every: 60,                 // с сима между срезами
  minTime: 30,               // с: забег короче не отправляется (случайный старт и выход)
  maxBytes: 200000,          // предел JSON в поле data (правила: data.size() < 200000)
  timeoutMs: 8000,           // мс на запись
};
