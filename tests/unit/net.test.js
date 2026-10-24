import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinRoom, roomAbandoned } from '../../src/services/net.js';
import { ROOMS } from '../../src/data/net.js';

// Поддельный RTCPeerConnection для гостя: ответ готов сразу, канал открывается, если хост жив.
function fakePC(open) {
  return class {
    constructor() { this.iceGatheringState = 'complete'; this.iceConnectionState = 'new'; this.closed = false; }
    addEventListener() {}
    removeEventListener() {}
    async setRemoteDescription() {}
    async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' }; }
    async setLocalDescription(d) {
      this.localDescription = d;
      if (open) setTimeout(() => this.ondatachannel({ channel: { readyState: 'open' } }), 0);
    }
    close() { this.closed = true; }
  };
}

// Сигналинг в памяти; now — «время сервера» для answeredAt.
function memSignal(doc, now) {
  const rooms = new Map([['ABCDE', doc]]);
  return {
    rooms,
    async read(code) { return rooms.has(code) ? { ...rooms.get(code) } : null; },
    async answer(code, sdp) { Object.assign(rooms.get(code), { answer: sdp, answeredAt: now }); },
    async remove(code) { rooms.delete(code); },
  };
}

test('net: a room is abandoned when the host has not checked in for staleMs', () => {
  const t = 1e9;
  assert.equal(roomAbandoned(null), false);
  assert.equal(roomAbandoned({ offer: 'x' }), false, 'no answer time — nothing to compare');
  assert.equal(roomAbandoned({ aliveAt: t, answeredAt: t + ROOMS.staleMs - 1 }), false);
  assert.equal(roomAbandoned({ aliveAt: t, answeredAt: t + ROOMS.staleMs + 1 }), true);
  // Timestamp Firestore (toMillis) тоже читается
  const ts = (ms) => ({ toMillis: () => ms });
  assert.equal(roomAbandoned({ aliveAt: ts(t), answeredAt: ts(t + ROOMS.staleMs + 1) }), true);
  // хост ни разу не отметился (старые правила): ориентир createdAt и предел ожидания хоста
  assert.equal(roomAbandoned({ createdAt: t, answeredAt: t + ROOMS.staleMs + 1 }), false);
  assert.equal(roomAbandoned({ createdAt: t, answeredAt: t + ROOMS.waitMs + 1 }), true);
});

test('net: joining an abandoned room fails fast with notfound and removes the room', async () => {
  const t = 1e9;
  const signal = memSignal({ offer: 'offer-sdp', createdAt: t, aliveAt: t }, t + ROOMS.staleMs * 2);
  const started = Date.now();
  await assert.rejects(joinRoom('ABCDE', { signal, RTCPeerConnection: fakePC(false), iceServers: [] }),
      /notfound/);
  assert.ok(Date.now() - started < ROOMS.connectMs / 2, 'does not wait for the connect timeout');
  assert.equal(signal.rooms.has('ABCDE'), false, 'abandoned room is removed');
});

test('net: joining a live room connects', async () => {
  const t = 1e9;
  const signal = memSignal({ offer: 'offer-sdp', createdAt: t, aliveAt: t + 1000 }, t + 2000);
  const conn = await joinRoom('ABCDE', { signal, RTCPeerConnection: fakePC(true), iceServers: [] });
  assert.equal(conn.closed, false);
  conn.close();
});
