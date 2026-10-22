// Сетевой кооп: сигналинг и соединение. Логики здесь нет (src/services/net.js).
export const ROOMS = {
  collection: 'rooms',        // Firestore: документ на лобби, id = код; поля offer / answer (SDP строкой)
  codeChars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // без 0/O, 1/I
  codeLength: 5,
  pollMs: 1500,               // хост опрашивает документ, ждёт answer (firestore-lite без подписок)
  waitMs: 10 * 60 * 1000,     // сколько хост ждёт напарника
  gatherMs: 3000,             // сбор ICE-кандидатов: ждём complete или столько мс (без trickle)
  connectMs: 20000,           // от answer до открытого канала, иначе failed
  sdpMax: 20000,              // SDP в документе короче этого (зеркалит firestore.rules: size() < 20000)
};

export const RTC = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  channel: 'fury',            // имя DataChannel; ordered + reliable, lockstep этого требует
  // TURN (посредник, когда напрямую нельзя: строгий NAT, CGNAT, закрытый UDP): адрес Cloudflare Worker
  // (tools/turn-worker.js), который отдаёт { iceServers } с временными учётными данными. '' — без TURN.
  turnUrl: 'https://fury-turn.leinstay.workers.dev',
  turnTimeoutMs: 3000,        // не ответил за столько — соединяемся без TURN
};
