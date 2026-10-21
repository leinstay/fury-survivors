// Процедурный чиптюн-луп: бас, арпеджио, лид, барабаны из шума. Ля минор, 140 bpm, 24 такта (~41 с).
// node tools/make-music.mjs  ->  assets/audio/music/theme.wav (22050 Гц моно 16 бит, бесшовный луп:
// хвосты нот в конце заворачиваются в начало). Детерминирован (сидируемый RNG).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const BPM = 140;
const BEAT = 60 / BPM;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio', 'music', 'theme.wav');

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(777);

// Аккорды: корень (midi, бас), тоны (pitch class).
const CH = {
  Am: { root: 45, pcs: [9, 0, 4] },
  F: { root: 41, pcs: [5, 9, 0] },
  C: { root: 48, pcs: [0, 4, 7] },
  G: { root: 43, pcs: [7, 11, 2] },
  Dm: { root: 38, pcs: [2, 5, 9] },
  E: { root: 40, pcs: [4, 8, 11] }, // мажорная доминанта (соль-диез) для напряжения
};
// Секция A: i VI III VII. Секция B: iv i VI V.
const A = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'];
const B = ['Dm', 'Am', 'F', 'E', 'Dm', 'Am', 'F', 'E'];
const BARS = [...A, ...B, ...A];
const LEAD_FROM = 4; // лид включается с 5-го такта (первые такта без него)

const totalSec = BARS.length * 4 * BEAT;
const N = Math.round(totalSec * RATE);
const mix = new Float32Array(N);

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Добавляет ноту с заворачиванием за конец буфера.
function note({ start, dur, freq, wave = 'square', duty = 0.5, vol = 0.2, decay = 0, vib = 0, release = 0.03 }) {
  const n0 = Math.round(start * RATE);
  const len = Math.round((dur + release) * RATE);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    let f = freq * (vib ? 1 + vib * Math.sin(2 * Math.PI * 5.5 * Math.max(0, t - 0.12)) : 1);
    phase = (phase + f / RATE) % 1;
    let v = wave === 'square' ? (phase < duty ? 1 : -1) : wave === 'tri' ? 4 * Math.abs(phase - 0.5) - 1 : 1 - 2 * phase;
    let env = Math.min(1, t / 0.004);
    if (decay) env *= Math.exp(-t * decay);
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / release);
    mix[(n0 + i) % N] += v * env * vol;
  }
}

function kick(start) {
  const n0 = Math.round(start * RATE);
  const len = Math.round(0.16 * RATE);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    phase += (140 * Math.exp(-t * 28) + 42) / RATE;
    mix[(n0 + i) % N] += Math.sin(phase * 2 * Math.PI) * Math.exp(-t * 18) * 0.55;
  }
}
function noiseHit(start, dur, vol, hp) {
  const n0 = Math.round(start * RATE);
  const len = Math.round(dur * RATE);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const r = rng() * 2 - 1;
    const v = hp ? r - prev * 0.9 : r; // грубый хайпасс для хэта
    prev = r;
    mix[(n0 + i) % N] += v * Math.exp(-t / (dur / 5)) * vol;
  }
}

// Ступени гаммы ля минор (pitch classes) и ближайшая нота лида.
const SCALE = [9, 11, 0, 2, 4, 5, 7];
const LEAD_LO = 69, LEAD_HI = 86;
function scaleNotes(chordName) {
  const out = [];
  for (let m = LEAD_LO; m <= LEAD_HI; m++) {
    let pc = m % 12;
    if (chordName === 'E' && pc === 7) pc = 8; // не используем G при E-мажоре
    if (chordName === 'E' ? (SCALE.includes(pc) || pc === 8) && pc !== 7 : SCALE.includes(pc)) out.push(m);
  }
  return out;
}

let leadIdx = null;
for (let bar = 0; bar < BARS.length; bar++) {
  const name = BARS[bar];
  const ch = CH[name];
  const t0 = bar * 4 * BEAT;
  const E8 = BEAT / 2;
  const S16 = BEAT / 4;

  // Бас: восьмые, корень с октавным прыжком на слабых долях.
  for (let i = 0; i < 8; i++) {
    const m = ch.root + (i % 4 === 3 ? 12 : 0) + (i === 6 ? 7 : 0);
    note({ start: t0 + i * E8, dur: E8 * 0.85, freq: hz(m), wave: 'tri', vol: 0.34, release: 0.02 });
  }

  // Арпеджио: шестнадцатые по тонам аккорда в верхней октаве, тихое.
  const pattern = [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2];
  for (let i = 0; i < 16; i++) {
    const base = 60 + ((ch.pcs[pattern[i] % 3] - 60) % 12 + 12) % 12;
    note({ start: t0 + i * S16, dur: S16 * 0.8, freq: hz(base + (i % 8 >= 4 ? 12 : 0)), duty: 0.25, vol: 0.075, decay: 12 });
  }

  // Барабаны.
  for (let b = 0; b < 4; b++) {
    const tb = t0 + b * BEAT;
    if (b % 2 === 0) kick(tb);
    else noiseHit(tb, 0.14, 0.32, false);
    noiseHit(tb, 0.04, 0.09, true);
    noiseHit(tb + E8, 0.03, 0.06, true);
  }
  if (bar % 4 === 3) { // подводка в конце четвёрки
    noiseHit(t0 + 3 * BEAT + E8, 0.08, 0.28, false);
    noiseHit(t0 + 3 * BEAT + E8 + S16, 0.08, 0.28, false);
  }

  // Лид: случайное блуждание по гамме, сильные доли притягиваем к тонам аккорда.
  if (bar >= LEAD_FROM) {
    const notes = scaleNotes(name);
    const isChordTone = (m) => ch.pcs.includes(m % 12);
    if (leadIdx === null) leadIdx = notes.findIndex((m) => m >= 76);
    leadIdx = Math.min(notes.length - 1, Math.max(0, leadIdx));
    const rhythm = bar % 4 === 3 ? [1, 1, 1, 1, 1, 1, 0, 1] : [1, 0, 1, 1, 1, 0, 1, 1];
    for (let i = 0; i < 8; i++) {
      if (!rhythm[i]) continue;
      const step = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)];
      let idx = Math.min(notes.length - 1, Math.max(0, leadIdx + step));
      if (i % 2 === 0) { // сильная доля: ближайший тон аккорда
        for (let d = 0; d < 4; d++) {
          if (notes[idx + d] !== undefined && isChordTone(notes[idx + d])) { idx += d; break; }
          if (notes[idx - d] !== undefined && isChordTone(notes[idx - d])) { idx -= d; break; }
        }
      }
      // к концу такта возвращаем к середине диапазона, чтобы не уползала
      if (notes[idx] > 83) idx -= 3;
      if (notes[idx] < 71) idx += 3;
      leadIdx = idx;
      const long = i === 7 || i === 3 ? 1 : 0.9;
      note({ start: t0 + i * E8, dur: E8 * long, freq: hz(notes[idx]), duty: 0.125, vol: 0.14, vib: 0.006, decay: 2.5 });
    }
  }
}

// Нормализация с небольшим запасом и мягкий клип.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mix[i]));
const g = 0.85 / peak;
const buf = Buffer.alloc(44 + N * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) buf.writeInt16LE(Math.round(Math.tanh(mix[i] * g * 1.1) * 32000), 44 + i * 2);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`theme.wav ${totalSec.toFixed(1)} s, ${(buf.length / 1024 / 1024).toFixed(2)} MiB`);
