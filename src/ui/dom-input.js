// DOM <input> поверх холста (нужен для мобильной клавиатуры): ник на итогах, ник и код лобби в меню.
// Позиция по getBoundingClientRect холста, пересчитывается в place() (вызывать из update сцены).
import { GAME_WIDTH } from '../data/constants.js';
import { FONT } from './style.js';

const CLEAN = /[^A-Za-z0-9]/g;

/**
 * @param {!Phaser.Scene} scene
 * @param {{x: number, y: number, w: number, h: number}} rect центр и размер в координатах экрана 640×360
 * @param {{maxLength: (number|undefined), placeholder: (string|undefined)}=} o
 *     ввод: только латинские буквы и цифры, регистр поднимается сам; Enter шлёт событие 'nick-enter',
 *     Esc снимает фокус, клавиши не доходят до Phaser
 * @return {{el: !HTMLInputElement, place: function(), destroy: function()}}
 */
export function createTextInput(scene, { x, y, w, h }, o = {}) {
  const el = document.createElement('input');
  el.type = 'text';
  if (o.maxLength) el.maxLength = o.maxLength;
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.setAttribute('autocapitalize', 'characters');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('enterkeyhint', 'send');
  el.placeholder = o.placeholder || '';
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

  el.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); el.dispatchEvent(new CustomEvent('nick-enter')); }
    else if (ev.key === 'Escape') el.blur();
  });
  el.addEventListener('keyup', (ev) => ev.stopPropagation());
  el.addEventListener('input', () => {
    let clean = el.value.replace(CLEAN, '').toUpperCase();
    if (o.maxLength) clean = clean.slice(0, o.maxLength);
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
