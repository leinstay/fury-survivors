// Копирование текста в буфер обмена. Звать прямо из обработчика жеста пользователя (клик, тап): иначе
// телефоны не дают доступ к буферу.

/**
 * @param {string} text
 * @return {boolean} получилось ли (Clipboard API асинхронный: true значит, что запись запущена)
 */
export function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    return true;
  }
  return legacyCopy(text);
}

// Запасной путь для старых браузеров и http: скрытое поле, выделить, execCommand('copy').
function legacyCopy(text) {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    el.style.left = '-1000px';
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch (e) {
    return false;
  }
}
