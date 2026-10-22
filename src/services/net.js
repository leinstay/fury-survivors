// Соединение двух игроков: WebRTC DataChannel (P2P, без сервера игры), обмен offer/answer через документ
// Firestore rooms/<код> (хост создаёт, гость отвечает, хост опрашивает). Без Phaser. Сигналинг подменяется
// (opts.signal) для тестов, где Firestore нет. Публичные функции возвращают Conn:
//   conn.send(obj)          объект уходит JSON-строкой
//   conn.onMessage(fn)      fn(obj) на каждое сообщение
//   conn.onClose(fn)        fn() когда канал закрылся или соединение упало
//   conn.close()
import { ROOMS, RTC } from '../data/net.js';
import { loadFirestore } from './firebase.js';

/**
 * Случайный код лобби.
 * @param {function(): number=} rnd
 * @return {string}
 */
export function makeCode(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < ROOMS.codeLength; i++) {
    s += ROOMS.codeChars[Math.floor(rnd() * ROOMS.codeChars.length)];
  }
  return s;
}

/**
 * Код из ввода пользователя: верхний регистр, только допустимые символы, нужной длины; '' если не годится.
 * @param {string} raw
 * @return {string}
 */
export function cleanCode(raw) {
  const s = String(raw || '').toUpperCase();
  const out = s.split('').filter((c) => ROOMS.codeChars.includes(c)).join('');
  return out.length === ROOMS.codeLength ? out : '';
}

// Сигналинг через Firestore: create(code, offer), read(code) -> { offer, answer } | null, answer(code, sdp).
function firestoreSignal() {
  let ctx = null;
  const get = async () => {
    if (!ctx) ctx = await loadFirestore();
    return ctx;
  };
  return {
    async create(code, offer) {
      const { fs, db } = await get();
      const ref = fs.doc(db, ROOMS.collection, code);
      await fs.setDoc(ref, { offer, createdAt: fs.serverTimestamp() });
    },
    async read(code) {
      const { fs, db } = await get();
      const snap = await fs.getDoc(fs.doc(db, ROOMS.collection, code));
      return snap.exists() ? snap.data() : null;
    },
    async answer(code, sdp) {
      const { fs, db } = await get();
      const ref = fs.doc(db, ROOMS.collection, code);
      await fs.updateDoc(ref, { answer: sdp, answeredAt: fs.serverTimestamp() });
    },
    async remove(code) {
      const { fs, db } = await get();
      try { await fs.deleteDoc(fs.doc(db, ROOMS.collection, code)); } catch (e) { /* не страшно */ }
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Логи соединения в консоль браузера (не мешают игре): что нашёл ICE, как меняется состояние, какой путь выбран.
// Найти: фильтр «fury-net» в консоли (F12).
export function netLog(...args) {
  if (typeof console !== 'undefined') console.info('[fury-net]', ...args);
}

// Кандидаты ICE из SDP по типам: host (локальный адрес, mdns — скрытый браузером), srflx (внешний адрес через
// STUN), relay (через TURN). Без srflx и relay соединиться можно только в одной сети.
function candidateSummary(sdp) {
  const n = { host: 0, mdns: 0, srflx: 0, prflx: 0, relay: 0, udp: 0, tcp: 0 };
  for (const line of String(sdp || '').split(/\r?\n/)) {
    if (!line.startsWith('a=candidate')) continue;
    const p = line.split(' ');
    const typ = p[p.indexOf('typ') + 1];
    if (typ in n) n[typ]++;
    if (typ === 'host' && /\.local$/.test(p[4])) n.mdns++;
    const proto = String(p[2]).toLowerCase();
    if (proto in n) n[proto]++;
  }
  return `host ${n.host} (mdns ${n.mdns}), srflx ${n.srflx}, relay ${n.relay}; udp ${n.udp}, tcp ${n.tcp}`;
}

// Подписка на состояния и итоговый путь соединения (после открытия канала).
function watchPeer(pc, who) {
  pc.addEventListener('iceconnectionstatechange', () => netLog(who, 'ice', pc.iceConnectionState));
  pc.addEventListener('connectionstatechange', () => netLog(who, 'connection', pc.connectionState));
  pc.addEventListener('icecandidateerror', (e) => {
    netLog(who, 'ice candidate error', e.errorCode, e.errorText || '', e.url || '');
  });
}

async function logRoute(pc, who) {
  try {
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach((s) => {
      if (s.type === 'candidate-pair' && (s.selected || s.nominated) && s.state === 'succeeded') pair = s;
    });
    if (!pair) return;
    const l = stats.get(pair.localCandidateId);
    const r = stats.get(pair.remoteCandidateId);
    netLog(who, 'route', l && l.candidateType, '->', r && r.candidateType, l && l.protocol,
        'rtt', pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) + 'ms' : '?');
  } catch (e) { /* статистика не обязательна */ }
}

// Сигналинг по умолчанию: Firestore; smoke-тесты подменяют его через globalThis.__furySignal
// (два окна одного origin, обмен через localStorage), чтобы гонять WebRTC без сети.
const defaultSignal = (opts) => opts.signal || globalThis.__furySignal || firestoreSignal();

// Ждём сбор ICE-кандидатов (без trickle: весь SDP одним куском в документе).
function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, ROOMS.gatherMs);
  });
}

// Обёртка DataChannel в Conn. Пока обработчика нет (onMessage(null)), сообщения копятся и отдаются
// следующему обработчику: лобби передаёт канал сцене Game, а первые тики уже летят.
function wrap(pc, ch) {
  let onMessage = null;
  let onClose = () => {};
  let closed = false;
  const queue = [];
  const fail = (why) => {
    if (closed) return;
    closed = true;
    netLog('channel closed:', typeof why === 'string' ? why : (why && why.type) || 'closed',
        'connection', pc.connectionState);
    try { pc.close(); } catch (e) { /* уже закрыт */ }
    onClose();
  };
  ch.onmessage = (e) => {
    let obj = null;
    try { obj = JSON.parse(e.data); } catch (err) { return; }
    if (!obj || typeof obj !== 'object') return;
    if (onMessage) onMessage(obj); else queue.push(obj);
  };
  ch.onclose = fail;
  ch.onerror = fail;
  // 'disconnected' не считаем концом: это часто временный сбой ICE, соединение возвращается само;
  // настоящую потерю ловит тишина в lockstep (NET.dropAfter)
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') fail();
  };
  return {
    send(obj) {
      if (closed || ch.readyState !== 'open') return;
      ch.send(JSON.stringify(obj));
    },
    onMessage(fn) {
      onMessage = fn || null;
      if (fn) while (queue.length) fn(queue.shift());
    },
    onClose(fn) { onClose = fn || (() => {}); },
    close: () => fail('closed by us'),
    get closed() { return closed; },
  };
}

function openChannel(ch) {
  if (ch.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    ch.onopen = resolve;
    ch.onerror = (e) => reject(new Error('failed'));
    setTimeout(() => reject(new Error('timeout')), ROOMS.connectMs);
  });
}

function peer(opts) {
  const PC = (opts && opts.RTCPeerConnection) || globalThis.RTCPeerConnection;
  if (!PC) throw new Error('unsupported');
  return new PC({ iceServers: RTC.iceServers });
}

/**
 * Хост: создать лобби. Возвращает код сразу (после записи offer); conn — промис соединения.
 * @param {{signal: (Object|undefined), onStatus: (function(string)|undefined),
 *     RTCPeerConnection: (Function|undefined)}=} opts
 * @return {!Promise<{code: string, conn: !Promise<!Object>, cancel: function()}>}
 *     статусы: 'creating' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'cancelled'
 */
export async function createRoom(opts = {}) {
  const signal = defaultSignal(opts);
  const status = opts.onStatus || (() => {});
  const pc = peer(opts);
  const ch = pc.createDataChannel(RTC.channel, { ordered: true });
  status('creating');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  watchPeer(pc, 'host');
  await gathered(pc);
  const sdp = pc.localDescription.sdp;
  netLog('host', 'offer candidates', candidateSummary(sdp));
  if (sdp.length >= ROOMS.sdpMax) throw new Error('failed');
  const code = makeCode();
  try {
    await signal.create(code, sdp);
  } catch (e) {
    netLog('host', 'room create failed', e && (e.code || e.message));
    pc.close();
    throw e;
  }
  netLog('host', 'room', code, 'waiting for answer');
  status('waiting');
  let cancelled = false;
  const conn = (async () => {
    const until = Date.now() + ROOMS.waitMs;
    let answer = null;
    while (!cancelled && Date.now() < until) {
      await sleep(ROOMS.pollMs);
      if (cancelled) break;
      let d = null;
      try { d = await signal.read(code); } catch (e) { continue; }
      if (d && d.answer) { answer = d.answer; break; }
    }
    if (cancelled) { status('cancelled'); throw new Error('cancelled'); }
    // документ комнаты не нужен ни после соединения, ни после провала: иначе брошенные коды копятся
    if (signal.remove) signal.remove(code);
    if (!answer) { netLog('host', 'no answer in time'); status('failed'); pc.close(); throw new Error('timeout'); }
    netLog('host', 'answer candidates', candidateSummary(answer));
    status('connecting');
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      await openChannel(ch);
    } catch (e) {
      netLog('host', 'channel failed:', e && e.message, 'ice', pc.iceConnectionState,
          '(no common route: a strict NAT or blocked UDP on one side, TURN would relay)');
      status('failed');
      pc.close();
      throw e;
    }
    netLog('host', 'channel open');
    logRoute(pc, 'host');
    status('connected');
    return wrap(pc, ch);
  })();
  conn.catch(() => {});
  return {
    code, conn,
    cancel() {
      cancelled = true;
      try { pc.close(); } catch (e) { /* уже закрыт */ }
      if (signal.remove) signal.remove(code);
    },
  };
}

/**
 * Гость: подключиться по коду.
 * @param {string} code
 * @param {{signal: (Object|undefined), onStatus: (function(string)|undefined),
 *     RTCPeerConnection: (Function|undefined)}=} opts
 * @return {!Promise<!Object>} Conn; ошибки: 'notfound' (нет лобби или уже занято), 'failed', 'timeout'
 */
export async function joinRoom(code, opts = {}) {
  const signal = defaultSignal(opts);
  const status = opts.onStatus || (() => {});
  status('connecting');
  let d = null;
  try {
    d = await signal.read(code);
  } catch (e) {
    netLog('guest', 'room read failed', e && (e.code || e.message));
    throw e;
  }
  if (!d || !d.offer || d.answer) {
    netLog('guest', 'room', code, !d ? 'not found' : d.answer ? 'already taken' : 'has no offer');
    status('failed');
    throw new Error('notfound');
  }
  netLog('guest', 'room', code, 'offer candidates', candidateSummary(d.offer));
  const pc = peer(opts);
  watchPeer(pc, 'guest');
  const chP = new Promise((resolve) => { pc.ondatachannel = (e) => resolve(e.channel); });
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: d.offer });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await gathered(pc);
    netLog('guest', 'answer candidates', candidateSummary(pc.localDescription.sdp));
    await signal.answer(code, pc.localDescription.sdp);
    const ch = await Promise.race([chP, sleep(ROOMS.connectMs).then(() => { throw new Error('timeout'); })]);
    await openChannel(ch);
    netLog('guest', 'channel open');
    logRoute(pc, 'guest');
    status('connected');
    return wrap(pc, ch);
  } catch (e) {
    netLog('guest', 'failed:', e && (e.code || e.message), 'ice', pc.iceConnectionState,
        '(no common route: a strict NAT or blocked UDP on one side, TURN would relay)');
    status('failed');
    pc.close();
    throw e;
  }
}
