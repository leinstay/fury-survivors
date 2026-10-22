// Кодекс: оружие, монстры, боссы и летопись забегов игрока (src/core/codex.js, src/services/codex.js, сцена Codex).
export const CODEX = {
  version: 1,                         // версия схемы сохранения (поле v); новее нашей не читаем
  storageKey: 'fury-survivors.codex', // ключ localStorage
  maxRuns: 100,                       // в истории остаются последние забеги
  idLength: 20,                       // случайный id кодекса, [a-z0-9]: имя документа в Firestore
  collection: 'fury_codex',           // коллекция резервных копий в Firestore (firestore.rules)
  maxBytes: 800000,                   // предел JSON в поле data (правила: data.size() < 800000)
  timeoutMs: 8000,                    // мс на чтение и запись резервной копии
  pxPerMeter: 20,                     // героиня ~34 px мира ростом ≈ 1.7 м
  minQuitTime: 10,                    // с: выход в меню раньше не записывается
  seenRange: 340,                     // px от своего героя: враг в этом радиусе считается увиденным
  scanEvery: 1,                       // с сима между проверками увиденных врагов
  maxJump: 200,                       // px за кадр: больше — телепорт, в пройденное не идёт
  runsPerPage: 9,                     // строк истории на странице летописи
};
