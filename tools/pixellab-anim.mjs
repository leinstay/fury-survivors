// PixelLab animate-with-text-v3 (pixellab.ai): первый кадр + действие -> кадры <out>_0..N.png, GIF и лента для просмотра.
// PL_KEY=<ключ> PL_ACTION="walking to the right in place, ..." node tools/pixellab-anim.mjs <first.png> <outPrefix> [frames=8]
//   ключ только в переменной окружения, в репозиторий и файлы не пишем. Пробный тариф: одна задача за раз,
//   холст 192×256 стоит 6 генераций. Кадр 0 ответа — сам первый кадр. В игру: tools/hd-frames.mjs <out.png> 0.4 кадры...
import sharp from 'sharp';
const [first, out, n = '8'] = process.argv.slice(2);
const KEY = process.env.PL_KEY;
const API = 'https://api.pixellab.ai/v2';
const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const b64 = (await sharp(first).png().toBuffer()).toString('base64');
const body = {
  first_frame: { type: 'base64', base64: b64 },
  action: process.env.PL_ACTION,
  frame_count: +n, no_background: true,
};
const r = await fetch(`${API}/animate-with-text-v3`, { method: 'POST', headers: h, body: JSON.stringify(body) });
let j = await r.json();
if (!r.ok) { console.log(r.status, JSON.stringify(j).slice(0, 600)); process.exit(1); }
const id = j.background_job_id; console.log(out, 'job', id);
for (;;) {
  await new Promise((res) => setTimeout(res, 4000));
  j = await (await fetch(`${API}/background-jobs/${id}`, { headers: h })).json();
  if (j.status === 'completed') break;
  if (j.status === 'failed') { console.log('failed', JSON.stringify(j).slice(0, 600)); process.exit(1); }
}
const imgs = j.last_response.images;
console.log(out, 'frames', imgs.length, 'usage', JSON.stringify(j.usage));
const bufs = [];
for (let i = 0; i < imgs.length; i++) {
  const im = imgs[i];
  const buf = Buffer.from(im.base64 || im, 'base64');
  await sharp(buf).png().toFile(`${out}_${i}.png`); bufs.push(buf);
}
const m = await sharp(bufs[0]).metadata();
const k = Math.max(1, Math.floor(256 / m.height));
const big = await Promise.all(bufs.map((b) => sharp(b).resize(m.width * k, m.height * k, { kernel: 'nearest' }).flatten({ background: '#3f6b35' }).png().toBuffer()));
await sharp(big, { join: { animated: true } }).gif({ delay: Array(big.length).fill(110), loop: 0 }).toFile(`${out}.gif`);
await sharp({ create: { width: big.length * (m.width * k + 6), height: m.height * k, channels: 4, background: '#111' } })
  .composite(big.map((b, i) => ({ input: b, left: i * (m.width * k + 6), top: 0 }))).png().toFile(`${out}_strip.png`);
console.log(out, 'size', m.width, m.height);
