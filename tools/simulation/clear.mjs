// Метрика клира (docs/BALANCE_AUDIT.md, 12): сколько живёт обычный моб и сколько их на экране, по минутам.
// Наблюдатель sim.telemetryObservers: RNG и состояние не трогает. Провал — не смерть, а рост числа врагов
// на экране (билд не успевает убивать), поэтому меряется на бессмертных ботах (runner: immortal).
//   life     — с появления в мире (за краем экрана, SIM.spawnDistance) до смерти
//   visible  — с первого появления на экране (640×360 вокруг sim.view) до смерти: «сколько моб живёт»
//   ttk      — с первого попадания до смерти; hits — попаданий на убийство; oneShot — доля убитых одним ударом
//   onScreen — живых обычных врагов на экране (среднее за минуту; byType по видам, ~ — стена/пролёт), alive — во всём мире, cap — доля времени
//              у лимита SIM.maxEnemies (спавн режется, рост толпы скрыт лимитом)
// Боссы: время от появления до убийства (ttk) и HP при появлении.
import { GAME_WIDTH, GAME_HEIGHT, SIM } from '../../src/data/constants.js';

const HALF_W = GAME_WIDTH / 2;
const HALF_H = GAME_HEIGHT / 2;
const BIN = 0.25;          // с, шаг гистограммы жизни
const BINS = 160;          // до 40 с, дальше в последний
const SAMPLE = 0.25;       // с между замерами числа врагов

function emptyMinute() {
  return { kills: 0, life: 0, visible: 0, visibleN: 0, ttk: 0, ttkN: 0, hits: 0, oneShot: 0,
    hist: new Uint32Array(BINS), onScreen: 0, alive: 0, cap: 0, samples: 0, peakOnScreen: 0,
    byType: {} };
}

export function createClearMetrics(sim) {
  const tracked = new Map(); // uid -> { born, seen, first, hits, stamp }
  const minutes = [];
  const bosses = [];
  let stamp = 0;
  let nextSample = 0;
  let nextSweep = 1;
  const minute = (t) => {
    const m = Math.floor(t / 60);
    while (minutes.length <= m) minutes.push(emptyMinute());
    return minutes[m];
  };
  const recorder = {
    hit(s, e) {
      if (e.boss) {
        if (e.hp <= 0) {
          const b = bosses.find((x) => x.uid === e.uid && x.killed === null);
          if (b) { b.killed = s.time; b.ttk = s.time - b.spawned; }
        }
        return;
      }
      const r = tracked.get(e.uid);
      if (!r) return;
      if (r.first < 0) r.first = s.time;
      r.hits++;
      if (e.hp > 0 || e.elite) return;
      const m = minute(s.time);
      m.kills++;
      m.life += s.time - r.born;
      if (r.seen >= 0) {
        const v = s.time - r.seen;
        m.visible += v; m.visibleN++;
        m.hist[Math.min(BINS - 1, Math.floor(v / BIN))]++;
      }
      m.ttk += s.time - r.first; m.ttkN++;
      m.hits += r.hits;
      if (r.hits === 1) m.oneShot++;
      tracked.delete(e.uid);
    },
    afterStep(s) {
      stamp++;
      const v = s.view;
      const sample = s.time >= nextSample;
      let onScreen = 0;
      let alive = 0;
      const m = sample ? minute(s.time) : null;
      for (const e of s.enemies) {
        if (e.dead) continue;
        alive++;
        if (e.boss) {
          if (!bosses.some((b) => b.uid === e.uid)) {
            bosses.push({ uid: e.uid, id: e.type, spawned: s.time, hp: Math.round(e.maxHp),
              level: s.player.level, killed: null, ttk: null });
          }
          continue;
        }
        if (e.elite) continue;
        let r = tracked.get(e.uid);
        if (!r) {
          r = { born: s.time, seen: -1, first: -1, hits: 0, stamp };
          tracked.set(e.uid, r);
        }
        r.stamp = stamp;
        const vis = Math.abs(e.x - v.x) <= HALF_W + e.size &&
          Math.abs(e.y - v.y) <= HALF_H + e.size;
        if (vis) {
          if (r.seen < 0) r.seen = s.time;
          onScreen++;
          if (m) {
            const k = e.transient ? `${e.type}~` : e.type; // ~ — стена или пролёт
            m.byType[k] = (m.byType[k] || 0) + 1;
          }
        }
      }
      if (sample) {
        nextSample += SAMPLE;
        m.samples++; m.onScreen += onScreen; m.alive += alive;
        if (alive >= SIM.maxEnemies - 2) m.cap++;
        if (onScreen > m.peakOnScreen) m.peakOnScreen = onScreen;
      }
      if (s.time >= nextSweep) {
        nextSweep += 1;
        for (const [uid, r] of tracked) if (r.stamp !== stamp) tracked.delete(uid);
      }
    },
  };
  sim.telemetryObservers.add(recorder);
  return {
    detach: () => sim.telemetryObservers.delete(recorder),
    result: () => ({ minutes: minutes.map((m) => ({ ...m, hist: Array.from(m.hist) })),
      bosses: bosses.map(({ uid, ...b }) => b) }),
  };
}

/** Медиана по сумме гистограмм (с). */
export function histMedian(hist) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc * 2 >= total) return (i + 0.5) * BIN;
  }
  return null;
}
