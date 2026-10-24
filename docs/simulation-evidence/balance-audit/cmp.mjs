// Сводка гипотез против baseline: исходы, CI, уровни/личные взятия/остаток сборки по минутам.
import { readFileSync, existsSync } from 'node:fs';
import { audit } from '../../../tools/telemetry/audit.mjs';
import { COOP } from '../../../src/data/coop.js';
const SLOTS0 = { ...COOP.slots };
const names = process.argv.slice(2);
for (const name of names) {
  const f = `tools/out/audit/${name}.json`;
  if (!existsSync(f)) continue;
  const d = JSON.parse(readFileSync(f, 'utf8'));
  COOP.slots = d.experiment?.coop?.slots || SLOTS0;
  const a = audit(d.records).modes;
  console.log(`== ${name} ${JSON.stringify(d.experiment || {}).slice(0, 140)}`);
  for (const [k, s] of Object.entries(d.summary)) {
    const m = a[`${k.split('/')[0]}/${k.split('/')[1] === '1' ? 'solo' : 'duo'}`];
    const mm = [300, 600, 900].map((t) => { const x = m.minutes[t]; return x.players ?
      `${t / 60}m L${x.level} T${x.takes} left${x.levelsLeft} pool${x.pool} ex${x.exhausted}/${x.players}` : '-'; }).join(' | ');
    console.log(`${k.padEnd(18)} V${s.counts.victory} D${s.counts.defeat} T${s.counts.timeout} E${s.counts.error} death ${(s.deathRate * 100).toFixed(0)}% [${s.deathCI95.map((x) => (x * 100).toFixed(0)).join('-')}] | ${mm} | heal<900 ${m.autoHealAt.filter((x) => x < 900).length}`);
  }
}
