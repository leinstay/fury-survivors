// Лента кадров из готовой анимации (PixelLab) без снятия сетки: каждый кадр целиком плавно уменьшается
// в одном масштабе, пропорции и смещения между кадрами сохраняются. Показ 1:1 на холсте (density 2 в manifest).
// node tools/hd-frames.mjs <out.png> <scale> <frame0.png> <frame1.png> ...
//   печатает размер кадра для manifest (frameWidth, frameHeight).
import sharp from 'sharp';

const [out, scaleArg, ...frames] = process.argv.slice(2);
const k = Number(scaleArg);
if (!out || !(k > 0) || !frames.length) {
  console.error('usage: node tools/hd-frames.mjs <out.png> <scale> <frame0.png> ...');
  process.exit(2);
}

const meta = await sharp(frames[0]).metadata();
const fw = Math.round(meta.width * k), fh = Math.round(meta.height * k);
// lanczos3 держит контур чётким; альфа после уменьшения порогуется, чтобы края не просвечивали
const imgs = await Promise.all(frames.map(async (f) => {
  const { data } = await sharp(f).resize(fw, fh, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 110 ? 255 : 0;
  return sharp(data, { raw: { width: fw, height: fh, channels: 4 } }).png().toBuffer();
}));
await sharp({ create: { width: fw * imgs.length, height: fh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(imgs.map((input, i) => ({ input, left: i * fw, top: 0 }))).png().toFile(out);
console.log(`${out}: ${imgs.length} frames ${fw}x${fh}`);
