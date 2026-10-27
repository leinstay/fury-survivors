// Метрика клира (docs/BALANCE_AUDIT.md, 12–13): сколько живёт обычный моб и сколько их в рамке героя, по минутам.
// Наблюдатель sim.telemetryObservers: RNG и состояние не трогает. Провал — не смерть, а рост числа врагов
// в рамке (билд не успевает убивать), поэтому меряется на бессмертных ботах (runner: immortal).
// Рамка — CLEAR.frameW × CLEAR.frameH вокруг героя (src/data/constants.js). Кооп: жизнь — с входа в рамку любого
// живого героя, число в рамке — среднее по героям (объединение двух рамок завышало бы толпу).
// Считать от рамки, а не от экрана или появления: дальнобойное оружие бьёт мобов за краем рамки, и метрика
// «с появления» упиралась бы в него (владелец, 27.10).
//   frame    — с первого входа в рамку до смерти: «сколько моб живёт» (главная метрика; убитые до рамки не входят)
//   visible  — с первого появления на экране (640×360 вокруг sim.view) до смерти (старая метрика, для сравнения)
//   life     — с появления в мире (за краем экрана, SIM.spawnDistance) до смерти
//   ttk      — с первого попадания до смерти; hits — попаданий на убийство; oneShot — доля убитых одним ударом
//   preFrame — доля убийств до входа в рамку (дальнобойное добивает раньше)
//   inFrame  — живых обычных врагов в рамке (среднее за минуту; byType по видам, ~ — стена/пролёт);
//   onScreen — то же на экране; alive — во всём мире; cap — доля времени у лимита SIM.maxEnemies
// Оружие (weapons[m]['id@level']): dealt — снятый HP, raw — урон до обрезки по HP (с оверкиллом), base — dealt / стат своего типа (attack или magic владельца,
// без вклада пассивок и сумки в урон), held — секунд в сборке, hits, kills, dist — Σ dealt × расстояние до цели
// (средняя дистанция попадания, взвешенная уроном).
// Боссы: время от появления до убийства (ttk) и HP при появлении.
import { GAME_WIDTH, GAME_HEIGHT, SIM, CLEAR } from '../../src/data/constants.js';
import { WEAPONS } from '../../src/data/weapons.js';

const HALF_W = GAME_WIDTH / 2;
const HALF_H = GAME_HEIGHT / 2;
export const FRAME_HALF_W = CLEAR.frameW / 2;
export const FRAME_HALF_H = CLEAR.frameH / 2;
const BIN = 0.25;          // с, шаг гистограммы жизни
const BINS = 160;          // до 40 с, дальше в последний
const SAMPLE = 0.25;       // с между замерами числа врагов

function emptyMinute() {
  return { kills: 0, life: 0, visible: 0, visibleN: 0, frame: 0, frameN: 0, preFrame: 0,
    ttk: 0, ttkN: 0, hits: 0, oneShot: 0, hist: new Uint32Array(BINS), onScreen: 0, inFrame: 0,
    alive: 0, cap: 0, samples: 0, peakOnScreen: 0, peakInFrame: 0, byType: {}, weapons: {} };
}

/** Враг в рамке героя p (касается рамки хитбоксом). */
export function inFrameOf(e, p) {
  return Math.abs(e.x - p.x) <= FRAME_HALF_W + e.size &&
    Math.abs(e.y - p.y) <= FRAME_HALF_H + e.size;
}

export function createClearMetrics(sim) {
  const tracked = new Map(); // uid -> { born, seen, framed, first, hits, stamp }
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
  const weaponRow = (m, p, id) => {
    const w = p.weapons.find((x) => x.id === id);
    const key = `${id}@${w ? w.level : 0}`;
    return m.weapons[key] ||
      (m.weapons[key] = { dealt: 0, raw: 0, base: 0, held: 0, hits: 0, kills: 0, dist: 0 });
  };
  const recorder = {
    hit(s, e, p, weapon, raw, dealt) {
      if (p && weapon && WEAPONS[weapon]) {
        const row = weaponRow(minute(s.time), p, weapon);
        const mul = p.stats?.[WEAPONS[weapon].dmgType] || 1;
        row.dealt += dealt; row.raw += raw; row.base += dealt / mul; row.hits++;
        row.dist += dealt * Math.hypot(e.x - p.x, e.y - p.y);
        if (e.hp <= 0) row.kills++;
      }
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
      if (r.seen >= 0) { m.visible += s.time - r.seen; m.visibleN++; }
      // Убит до входа в рамку: в жизнь не входит (моб не дошёл до героя), считается долей preFrame.
      if (r.framed < 0) m.preFrame++;
      else {
        const f = s.time - r.framed;
        m.frame += f; m.frameN++;
        m.hist[Math.min(BINS - 1, Math.floor(f / BIN))]++;
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
      const heroes = s.players.filter((p) => !p.dead);
      let onScreen = 0;
      let inFrame = 0;
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
          r = { born: s.time, seen: -1, framed: -1, first: -1, hits: 0, stamp };
          tracked.set(e.uid, r);
        }
        r.stamp = stamp;
        const vis = Math.abs(e.x - v.x) <= HALF_W + e.size &&
          Math.abs(e.y - v.y) <= HALF_H + e.size;
        if (vis) {
          if (r.seen < 0) r.seen = s.time;
          onScreen++;
        }
        // в коопе жизнь — с входа в рамку любого героя, число — среднее по рамкам героев
        let k = 0;
        for (const p of heroes) if (inFrameOf(e, p)) k++;
        if (k) {
          if (r.framed < 0) r.framed = s.time;
          inFrame += k / heroes.length;
          if (m) {
            const key = e.transient ? `${e.type}~` : e.type; // ~ — стена или пролёт
            m.byType[key] = (m.byType[key] || 0) + k / heroes.length;
          }
        }
      }
      if (sample) {
        nextSample += SAMPLE;
        m.samples++; m.onScreen += onScreen; m.inFrame += inFrame; m.alive += alive;
        if (alive >= SIM.maxEnemies - 2) m.cap++;
        if (onScreen > m.peakOnScreen) m.peakOnScreen = onScreen;
        if (inFrame > m.peakInFrame) m.peakInFrame = inFrame;
        for (const p of s.players) {
          for (const w of p.weapons) weaponRow(m, p, w.id).held += SAMPLE;
        }
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
