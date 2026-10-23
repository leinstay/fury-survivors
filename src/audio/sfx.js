// Звук: эффекты, музыка, маппинг событий sim на звуки. Громкости берутся из ui/settings.js.
import { getVolume } from '../ui/settings.js';
import { AUDIO } from '../data/constants.js';

export const SFX_NAMES = [
  'hit', 'crit', 'kill', 'kill_elite', 'player_hurt', 'pickup_xp', 'pickup_food', 'levelup', 'chest',
  'ui_move', 'ui_select', 'ui_back', 'boss_spawn', 'gameover', 'victory', 'weapon_fire',
];
export const MUSIC_KEY = 'music_theme';

const PER_SOUND_LIMIT = 4;   // одновременно одного звука
const TOTAL_LIMIT = 16;      // одновременно всего
const MIN_GAP = { hit: 40, weapon_fire: 70, pickup_xp: 30, kill: 30 }; // мс между запусками
const DETUNE = 120;          // центы, случайный разброс +-
const NO_DETUNE = new Set(['levelup', 'chest', 'gameover', 'victory', 'boss_spawn', 'ui_move', 'ui_select', 'ui_back']);

let game = null;
let music = null;
const active = [];           // { name, end } для лимитов
const lastPlay = {};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function initAudio(g) {
  if (game) return;
  game = g;
}

// Подключить звуки в preload Boot.
export function preloadAudio(scene) {
  for (const n of SFX_NAMES) scene.load.audio(`sfx_${n}`, `assets/audio/sfx/${n}.wav`);
  scene.load.audio(MUSIC_KEY, 'assets/audio/music/theme.mp3');
}

export function playSfx(scene, name, opts = {}) {
  const mgr = (scene && scene.sound) || (game && game.sound);
  if (!mgr) return;
  const key = `sfx_${name}`;
  if (scene && scene.cache && !scene.cache.audio.exists(key)) return;
  const t = now();
  if (MIN_GAP[name] && t - (lastPlay[name] || 0) < MIN_GAP[name]) return;
  for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= t) active.splice(i, 1);
  if (active.length >= TOTAL_LIMIT) return;
  let same = 0;
  for (const a of active) if (a.name === name) same++;
  if (same >= PER_SOUND_LIMIT) return;
  lastPlay[name] = t;

  const vol = (opts.volume ?? 1) * getVolume('sfx') * AUDIO.gain;
  if (vol <= 0) return;
  const detune = opts.detune ?? (NO_DETUNE.has(name) ? 0 : (Math.random() * 2 - 1) * DETUNE);
  const sound = mgr.add(key, { volume: vol, detune });
  sound.once('complete', () => sound.destroy());
  sound.play();
  active.push({ name, end: t + 1200 });
}

// Маппинг событий sim.events на звуки. Звать раз за кадр после sim.step.
export function handleSimEvents(scene, events) {
  for (const e of events) {
    switch (e.type) {
      case 'hit': playSfx(scene, e.crit ? 'crit' : 'hit', { volume: e.crit ? 0.9 : 0.6 }); break;
      case 'kill': playSfx(scene, e.elite || e.boss ? 'kill_elite' : 'kill', { volume: 0.7 }); break;
      case 'playerHurt': playSfx(scene, 'player_hurt'); break;
      case 'pickup': if (e.kind !== 'chest') playSfx(scene, e.kind === 'xp' ? 'pickup_xp' : 'pickup_food', { volume: e.kind === 'xp' ? 0.6 : 0.9 }); break; // звук сундука даёт событие chest
      case 'levelup': playSfx(scene, 'levelup'); break;
      case 'chest': playSfx(scene, 'chest'); break;
      case 'bossSpawn': playSfx(scene, 'boss_spawn'); break;
      case 'bossRage': playSfx(scene, 'boss_spawn', { detune: -300 }); break;
      case 'gameover': playSfx(scene, 'gameover'); break;
      case 'victory': playSfx(scene, 'victory'); break;
      case 'overtime': playSfx(scene, 'boss_spawn'); break;
      case 'weaponFire': playSfx(scene, 'weapon_fire', { volume: 0.5 }); break;
      default: break;
    }
  }
}

// Музыка играет только в забеге: старт с начала трека с плавным нарастанием, в конце забега плавное затухание.
// Затухание идёт по таймеру страницы, а не твину сцены: сцена Game на экране итогов стоит на паузе.
// fade: 0..1, множитель громкости поверх ползунка и AUDIO.musicGain.
let fade = 1;
let fadeTimer = null;

function musicVolume() {
  return getVolume('music') * AUDIO.musicGain * fade;
}

function fadeTo(target, seconds, done) {
  clearInterval(fadeTimer);
  const from = fade;
  const start = Date.now();
  const ms = Math.max(1, seconds * 1000);
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - start) / ms);
    fade = from + (target - from) * k;
    applyVolumes();
    if (k >= 1) { clearInterval(fadeTimer); fadeTimer = null; if (done) done(); }
  }, 50);
}

export function startMusic(scene) {
  const mgr = (scene && scene.sound) || (game && game.sound);
  if (!mgr) return;
  stopMusic();
  if (scene.cache && !scene.cache.audio.exists(MUSIC_KEY)) return;
  fade = 0;
  music = mgr.add(MUSIC_KEY, { loop: true, volume: 0 });
  music.play();
  fadeTo(1, AUDIO.fadeIn);
}

export function fadeOutMusic() {
  if (!music) return;
  fadeTo(0, AUDIO.fadeOut, stopMusic);
}

export function stopMusic() {
  clearInterval(fadeTimer);
  fadeTimer = null;
  if (music) { music.stop(); music.destroy(); music = null; }
}

// Применить текущие громкости (вызывается слайдером и затуханием).
export function applyVolumes() {
  if (music && music.manager) music.setVolume(musicVolume());
}
