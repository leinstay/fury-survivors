// Cloudflare Worker: выдаёт игре временные учётные данные TURN (Cloudflare Realtime). Ключ TURN живёт только
// здесь, в секретах воркера; игра получает от воркера готовый список iceServers на несколько часов.
// Не часть игры и не запускается в Node. Как развернуть: docs/COOP.md, «TURN через Cloudflare».
// Секреты воркера (Settings → Variables and Secrets, тип Secret):
//   TURN_KEY_ID         — Turn Token ID из Cloudflare Realtime → TURN Server
//   TURN_KEY_API_TOKEN  — API Token того же TURN-ключа

// Откуда можно спрашивать (заголовок Origin). Защита от чужих сайтов, не от curl.
const ALLOWED = ['https://leinstay.github.io', 'http://localhost:8125', 'http://127.0.0.1:8125'];
const TTL = 4 * 60 * 60; // с: дольше самого длинного забега

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!ALLOWED.includes(origin)) return new Response('forbidden', { status: 403, headers: cors });
    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!r.ok) return new Response(`turn error ${r.status}`, { status: 502, headers: cors });
    const data = await r.json();
    // порт 53 браузеры блокируют, без trickle ICE он только тянет время: убираем
    const iceServers = (data.iceServers || [])
        .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }))
        .filter((s) => s.urls.length);
    return Response.json({ iceServers }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  },
};
