// Лента кадров из готовой анимации (PixelLab) без снятия сетки: каждый кадр целиком плавно уменьшается
// в одном масштабе, пропорции и смещения между кадрами сохраняются. Показ 1:1 на холсте (density 2 в manifest).
// node tools/hd-frames.mjs <out.png> <scale> [--canvas WxH] <frame0.png> <frame1.png> ...
//   --canvas: кадр ленты WxH (у персонажей 110x110): уменьшенный кадр ставится ногами на нижнюю строку
//   по центру, без масштабирования. Печатает размер кадра для manifest (frameWidth, frameHeight).
import sharp from 'sharp';

const args = process.argv.slice(2);
const ci = args.indexOf('--canvas');
const canvas = ci >= 0 ? args.splice(ci, 2)[1].split('x').map(Number) : null;
const [out, scaleArg, ...frames] = args;
const k = Number(scaleArg);
if (!out || !(k > 0) || !frames.length) {
  console.error('usage: node tools/hd-frames.mjs <out.png> <scale> [--canvas WxH] <frame0.png> ...');
  process.exit(2);
}

const meta = await sharp(frames[0]).metadata();
const sw = Math.round(meta.width * k);
const sh = Math.round(meta.height * k);
const [fw, fh] = canvas || [sw, sh];
if (fw < sw || fh < sh) {
  console.error(`canvas ${fw}x${fh} is smaller than the scaled frame ${sw}x${sh}`);
  process.exit(2);
}
const dx = Math.floor((fw - sw) / 2);
const dy = fh - sh;
// lanczos3 держит контур чётким; альфа после уменьшения порогуется, чтобы края не просвечивали
const imgs = await Promise.all(frames.map(async (f) => {
  const { data } = await sharp(f).resize(sw, sh, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 110 ? 255 : 0;
  return sharp(data, { raw: { width: sw, height: sh, channels: 4 } }).png().toBuffer();
}));
await sharp({
  create: {
    width: fw * imgs.length, height: fh, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(imgs.map((input, i) => ({ input, left: i * fw + dx, top: dy }))).png().toFile(out);
console.log(`${out}: ${imgs.length} frames ${fw}x${fh}`);
