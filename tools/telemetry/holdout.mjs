// Внешняя проверка модели выбора на записях, которых не было в обучении (например, v2 дуо).
// node tools/telemetry/holdout.mjs <runs.json> [--v 2]
// Метрики на одинаковом весе забега: top-1 модели, «первая карта», равномерный выбор, logloss.
import { readFileSync } from 'node:fs';
import { normalizeRun, parseCard } from './data.mjs';
import { cardFeatures, linearScore, probabilities } from '../simulation/features.mjs';
import { MODEL } from '../simulation/model.mjs';

const args = process.argv.slice(2);
const minV = Number(args[args.indexOf('--v') + 1] || 2);
const d = JSON.parse(readFileSync(args[0], 'utf8'));
const per = [];
for (const [i, { run }] of d.entries()) {
  if ((run.v || 1) < minV) continue;
  const n = normalizeRun(run, i);
  let top = 0; let first = 0; let uni = 0; let ll = 0; let k = 0;
  for (const x of n.decisions) {
    if (x.act !== 'take' || x.offered.length < 2) continue;
    const cards = x.offered.map(parseCard);
    const chosen = cards.findIndex((c) => `${c.kind}:${c.id}:${c.level}` === x.chosen);
    if (chosen < 0) continue;
    const s = cards.map((c) => linearScore(cardFeatures(c, x.context, x.lastTake), MODEL.weights));
    const p = probabilities(s, 1);
    top += s.indexOf(Math.max(...s)) === chosen ? 1 : 0;
    first += chosen === 0 ? 1 : 0; uni += 1 / cards.length;
    ll -= Math.log(Math.max(1e-9, p[chosen])); k++;
  }
  if (k) {
    per.push({ run: n.id, mode: n.mode, hero: n.hero, n: k, top: top / k, first: first / k,
      uniform: uni / k, logloss: ll / k });
  }
}
const avg = (key) => per.reduce((s, r) => s + r[key], 0) / per.length;
console.log(JSON.stringify({ model: MODEL.version, runs: per.length,
  decisions: per.reduce((s, r) => s + r.n, 0),
  top1: +avg('top').toFixed(3), firstCard: +avg('first').toFixed(3), uniform: +avg('uniform').toFixed(3),
  logloss: +avg('logloss').toFixed(3), byHero: Object.fromEntries(['heroine', 'mage'].map((h) => {
    const r = per.filter((x) => x.hero === h);
    const top1 = r.length ? +(r.reduce((s, x) => s + x.top, 0) / r.length).toFixed(3) : null;
    return [h, { runs: r.length, top1 }];
  })) }, null, 1));
