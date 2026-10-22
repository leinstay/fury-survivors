// Генератор звуковых эффектов: sfxr-подобный синтез без зависимостей, пишет wav 22050 Гц моно 16 бит.
// node tools/make-sfx.mjs [имя...]   (без аргументов: все)
// Детерминирован: шум берётся из собственного сидируемого RNG.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio', 'sfx');

// Поля пресета:
//  wave: 'square' | 'saw' | 'sine' | 'noise'; freq: старт, Гц; slide: свип, октав в секунду (может быть <0)
//  duty: скважность квадрата 0..1; vibDepth (доля частоты), vibRate (Гц)
//  attack/sustain/decay: секунды огибающей; vol: 0..1
//  steps: [{ t, mult }] смена высоты в момент t (арпеджио); lp: сглаживание шума/лоу-пасс 0..1 (1 = нет)
//  noiseMix: подмешать шум 0..1
const PRESETS = {
  hit:         { wave: 'noise', freq: 900, slide: -2, attack: 0, sustain: 0.01, decay: 0.07, vol: 0.5, lp: 0.5 },
  crit:        { wave: 'square', freq: 520, slide: 1.2, duty: 0.4, attack: 0, sustain: 0.04, decay: 0.12, vol: 0.5, noiseMix: 0.35 },
  kill:        { wave: 'noise', freq: 600, slide: -2.5, attack: 0, sustain: 0.03, decay: 0.14, vol: 0.5, lp: 0.35 },
  kill_elite:  { wave: 'saw', freq: 220, slide: -1.5, attack: 0, sustain: 0.08, decay: 0.28, vol: 0.55, noiseMix: 0.5, vibDepth: 0.05, vibRate: 30 },
  player_hurt: { wave: 'saw', freq: 300, slide: -2.2, attack: 0, sustain: 0.05, decay: 0.2, vol: 0.55, noiseMix: 0.3, vibDepth: 0.08, vibRate: 40 },
  pickup_xp:   { wave: 'square', freq: 880, slide: 1.8, duty: 0.5, attack: 0, sustain: 0.01, decay: 0.07, vol: 0.28 },
  pickup_food: { wave: 'square', freq: 392, duty: 0.5, attack: 0, sustain: 0.1, decay: 0.12, vol: 0.38,
                 steps: [{ t: 0.07, mult: 1.25 }, { t: 0.14, mult: 1.5 }] },
  levelup:     { wave: 'square', freq: 392, duty: 0.25, attack: 0, sustain: 0.36, decay: 0.28, vol: 0.4,
                 steps: [{ t: 0.08, mult: 1.26 }, { t: 0.16, mult: 1.5 },
                   { t: 0.24, mult: 2 }, { t: 0.36, mult: 2.52 }] },
  chest:       { wave: 'square', freq: 330, duty: 0.5, attack: 0, sustain: 0.3, decay: 0.3, vol: 0.4, vibDepth: 0.01, vibRate: 12,
                 steps: [{ t: 0.1, mult: 1.5 }, { t: 0.2, mult: 2 }, { t: 0.3, mult: 3 }] },
  ui_move:     { wave: 'square', freq: 660, duty: 0.5, attack: 0, sustain: 0.005, decay: 0.035, vol: 0.2 },
  ui_select:   { wave: 'square', freq: 520, slide: 1.5, duty: 0.5, attack: 0, sustain: 0.04, decay: 0.09, vol: 0.32 },
  ui_back:     { wave: 'square', freq: 520, slide: -1.5, duty: 0.5, attack: 0, sustain: 0.03, decay: 0.09, vol: 0.28 },
  boss_spawn:  { wave: 'saw', freq: 110, slide: -0.3, attack: 0.02, sustain: 0.7, decay: 0.7, vol: 0.55, vibDepth: 0.04, vibRate: 7, noiseMix: 0.2,
                 steps: [{ t: 0.5, mult: 0.84 }] },
  gameover:    { wave: 'square', freq: 392, duty: 0.5, attack: 0, sustain: 0.55, decay: 0.55, vol: 0.4, vibDepth: 0.015, vibRate: 6,
                 steps: [{ t: 0.22, mult: 0.84 }, { t: 0.44, mult: 0.67 }, { t: 0.7, mult: 0.5 }] },
  victory:     { wave: 'square', freq: 392, duty: 0.25, attack: 0, sustain: 0.8, decay: 0.45, vol: 0.4,
                 steps: [{ t: 0.12, mult: 392 / 392 }, { t: 0.18, mult: 1.26 },
                   { t: 0.3, mult: 1.5 }, { t: 0.42, mult: 2 }, { t: 0.54, mult: 1.5 },
                   { t: 0.66, mult: 2 }, { t: 0.78, mult: 2.52 }] },
  weapon_fire: { wave: 'noise', freq: 1500, slide: -1.2, attack: 0.01, sustain: 0.015, decay: 0.07, vol: 0.14, lp: 0.25 },
};

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

function osc(wave, phase, duty) {
  switch (wave) {
    case 'square': return phase < duty ? 1 : -1;
    case 'saw': return 1 - 2 * phase;
    case 'sine': return Math.sin(phase * Math.PI * 2);
    default: return 0;
  }
}

export function synth(p, seed = 1) {
  const rng = makeRng(seed);
  const total = p.attack + p.sustain + p.decay;
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  const duty = p.duty ?? 0.5;
  const lp = p.lp ?? 1;
  let phase = 0;
  let noiseVal = 0;
  let noiseAcc = 0;
  let filt = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let mult = 1;
    if (p.steps) for (const s of p.steps) if (t >= s.t) mult = s.mult;
    let f = p.freq * mult * Math.pow(2, (p.slide || 0) * t);
    if (p.vibDepth) f *= 1 + p.vibDepth * Math.sin(2 * Math.PI * p.vibRate * t);
    f = Math.max(20, Math.min(f, RATE / 2.2));
    phase = (phase + f / RATE) % 1;
    let v;
    if (p.wave === 'noise') {
      // шум с частотой обновления, зависящей от высоты: низкая высота даёт глухой шум
      noiseAcc += f / RATE;
      if (noiseAcc >= 1) { noiseAcc -= 1; noiseVal = rng() * 2 - 1; }
      v = noiseVal;
    } else {
      v = osc(p.wave, phase, duty);
      if (p.noiseMix) v = v * (1 - p.noiseMix) + (rng() * 2 - 1) * p.noiseMix;
    }
    filt += (v - filt) * lp;
    v = filt;
    let env;
    if (t < p.attack) env = t / p.attack;
    else if (t < p.attack + p.sustain) env = 1;
    else env = Math.max(0, 1 - (t - p.attack - p.sustain) / p.decay);
    out[i] = v * env * env * p.vol;
  }
  return out;
}

export function encodeWav(samples, rate = RATE) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}

if (process.argv[1]?.endsWith('make-sfx.mjs')) {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  let bytes = 0;
  let i = 0;
  for (const [name, p] of Object.entries(PRESETS)) {
    i++;
    if (only.length && !only.includes(name)) continue;
    const wav = encodeWav(synth(p, 1000 + i));
    writeFileSync(join(OUT, `${name}.wav`), wav);
    bytes += wav.length;
    console.log(`${name}.wav ${wav.length} B`);
  }
  console.log(`total ${(bytes / 1024).toFixed(1)} KiB`);
}
