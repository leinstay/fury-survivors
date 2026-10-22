// Общая раскладка экранов GameOver / Victory: итоги, очки, ввод ника и отправка в таблицу.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { FocusNav, addButton } from './focus.js';
import { textStyle, COLORS, FONT } from './style.js';
import { formatTime } from './hud.js';
import { displayName, addIcon, iconKeyFor } from './icons.js';
import { addPanel } from './panel.js';
import { NICK } from '../data/leaderboard.js';
import { validateNick } from '../core/nick.js';
import { computeScore, submitScore, fetchTop10, rankOf } from '../services/leaderboard.js';
import { readNick, writeNick } from '../services/nick-store.js';

const CONFETTI = [0xffd84a, 0xff7a3d, 0x4fc3ff, 0xff6fb0, 0x8cff6a, 0xffffff];
const NICK_Y = 240;

function addConfetti(scene) {
  for (let i = 0; i < 44; i++) {
    const w = 3 + Math.floor(Math.random() * 3);
    const r = scene.add.rectangle(Math.random() * GAME_WIDTH, -10, w, w + 2,
        CONFETTI[i % CONFETTI.length]);
    scene.tweens.add({
      targets: r,
      y: GAME_HEIGHT + 10,
      x: r.x + (Math.random() - 0.5) * 60,
      angle: 360 * (Math.random() < 0.5 ? -1 : 1),
      duration: 2500 + Math.random() * 2500,
      delay: Math.random() * 3000,
      repeat: -1,
    });
  }
}

// DOM <input> поверх холста (нужен для мобильной клавиатуры). Позиция по getBoundingClientRect холста.
function createNickInput(scene, { x, y, w, h }) {
  const el = document.createElement('input');
  el.type = 'text';
  el.maxLength = NICK.max;
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.setAttribute('autocapitalize', 'characters');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('enterkeyhint', 'send');
  el.placeholder = t('result.nick_hint');
  Object.assign(el.style, {
    position: 'fixed', zIndex: '10', boxSizing: 'border-box', margin: '0', padding: '0',
    background: 'transparent', border: 'none', outline: 'none', color: '#ffffff',
    textAlign: 'center', fontFamily: FONT,
  });
  document.body.appendChild(el);

  const place = () => {
    const canvas = scene.game.canvas;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const k = r.width / GAME_WIDTH;
    el.style.left = `${Math.round(r.left + (x - w / 2) * k)}px`;
    el.style.top = `${Math.round(r.top + (y - h / 2) * k)}px`;
    el.style.width = `${Math.round(w * k)}px`;
    el.style.height = `${Math.round(h * k)}px`;
    el.style.fontSize = `${Math.max(16, Math.round(14 * k))}px`;
  };
  place();
  window.addEventListener('resize', place);

  // Клавиши не доходят до Phaser (он слушает window): WASD, стрелки, Space не двигают меню
  // и не глотаются capture игровой сцены. Enter отправляет, Esc снимает фокус.
  el.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); el.dispatchEvent(new CustomEvent('nick-enter')); }
    else if (ev.key === 'Escape') el.blur();
  });
  el.addEventListener('keyup', (ev) => ev.stopPropagation());
  el.addEventListener('input', () => {
    const clean = el.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, NICK.max);
    if (clean !== el.value) el.value = clean;
  });

  return {
    el,
    place,
    destroy() {
      window.removeEventListener('resize', place);
      el.remove();
    },
  };
}

export function buildResults(scene, sim,
    { titleKey, titleColor, confetti = false, victory = false }) {
  const cx = GAME_WIDTH / 2;
  scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setOrigin(0, 0);
  addPanel(scene, cx, 175, 370, 336);
  if (confetti) addConfetti(scene);
  scene.add.text(cx, 28, t(titleKey), textStyle(26, titleColor, { stroke: '#000000', strokeThickness: 5 })).setOrigin(0.5);

  const rows = [
    [t('result.time'), formatTime(sim.time)],
    [t('result.level'), String(sim.player.level)],
    [t('result.kills'), String(sim.kills)],
  ];
  rows.forEach(([k, v], i) => {
    scene.add.text(cx - 90, 56 + i * 17, k, textStyle(13, '#aaaaaa')).setOrigin(0, 0);
    scene.add.text(cx + 90, 56 + i * 17, v, textStyle(13)).setOrigin(1, 0);
  });
  const score = computeScore({ time: sim.time, kills: sim.kills, victory });
  scene.add.text(cx - 90, 111, t('result.score'), textStyle(16, COLORS.accent)).setOrigin(0, 0);
  scene.add.text(cx + 90, 111, String(score), textStyle(16, '#ffd84a')).setOrigin(1, 0);

  scene.add.text(cx, 138, t('result.damage'), textStyle(11, '#ffd84a')).setOrigin(0.5, 0);
  const dmg = Object.entries(sim.damageByWeapon || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = Math.max(1, ...dmg.map((d) => d[1]));
  dmg.forEach(([id, v], i) => {
    const y = 156 + i * 17;
    addIcon(scene, cx - 150, y + 7, iconKeyFor('weapon', id), 14, 'weapon', id);
    scene.add.text(cx - 138, y, displayName('weapon', id), textStyle(10)).setOrigin(0, 0);
    scene.add.rectangle(cx + 2, y + 7, Math.max(1, Math.round(80 * v / max)), 6, 0xff7a3d)
        .setOrigin(0, 0.5);
    scene.add.text(cx + 150, y, String(Math.round(v)), textStyle(10)).setOrigin(1, 0);
  });

  const nav = new FocusNav(scene, {});
  const status = scene.add.text(cx, 266, '', textStyle(11, '#aaaaaa')).setOrigin(0.5);

  // Ник и отправка: один submit на забег.
  const field = { x: cx - 60, y: NICK_Y, w: 120, h: 24 };
  const fieldPanel = addPanel(scene, field.x, field.y, field.w, field.h);
  const nick = createNickInput(scene, field);
  nick.el.value = readNick();
  let dead = false;
  let submitted = false;
  let busy = false;
  let submitBtn = null;

  const fieldItem = nav.add({
    x: field.x, y: field.y, w: field.w, h: field.h,
    setFocus: (f) => fieldPanel.setFocus(f),
    onSelect: () => { if (!submitted && !busy) nick.el.focus(); },
  });
  const say = (key, params, color = '#aaaaaa') => { if (!dead) status.setText(t(key, params)).setColor(color); };

  const submit = async () => {
    if (submitted || busy || dead || score <= 0) return;
    const v = validateNick(nick.el.value);
    if (!v.ok) { say('result.invalid', null, '#ff8080'); return; }
    busy = true;
    submitBtn.setDisabled(true);
    nick.el.blur();
    say('result.sending');
    writeNick(v.value);
    nick.el.value = v.value;
    try {
      await submitScore({
        name: v.value, score, time: sim.time, kills: sim.kills, level: sim.player.level, victory,
      });
    } catch (err) {
      busy = false;
      if (dead) return;
      submitBtn.setDisabled(false);
      const code = err && err.message;
      say(['offline', 'denied', 'invalid', 'cooldown'].includes(code) ? `result.${code}` : 'result.offline', null, '#ff8080');
      return;
    }
    submitted = true;
    busy = false;
    if (dead) return;
    nick.el.disabled = true;
    say('result.sent', null, '#8cff6a');
    try {
      const place = rankOf(await fetchTop10(), v.value);
      if (place > 0) say('result.sent_rank', { n: place }, '#8cff6a');
    } catch { /* место не показываем */ }
  };

  submitBtn = addButton(scene, nav, {
    x: cx + 75, y: NICK_Y, w: 100, h: 24, label: t('result.submit'), size: 13, onSelect: submit,
  });
  nick.el.addEventListener('nick-enter', submit);
  if (score <= 0) { submitBtn.setDisabled(true); nick.el.disabled = true; }

  addButton(scene, nav, {
    x: cx - 80, y: 316, w: 130, h: 28, label: t('result.retry'),
    onSelect: () => { scene.scene.stop('Game'); scene.scene.start('Game'); },
  });
  addButton(scene, nav, {
    x: cx + 80, y: 316, w: 130, h: 28, label: t('result.menu'),
    onSelect: () => { scene.scene.stop('Game'); scene.scene.start('Menu'); },
  });
  // С сохранённым ником сразу на Submit (геймпад: A), иначе на поле.
  if (score > 0 && validateNick(nick.el.value).ok) nav.focus(nav.items.indexOf(submitBtn));
  else nav.focus(nav.items.indexOf(fieldItem));

  const baseUpdate = nav.update.bind(nav);
  nav.update = (time) => { baseUpdate(time); nick.place(); };
  const cleanup = () => { dead = true; nick.destroy(); };
  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);
  return nav;
}
