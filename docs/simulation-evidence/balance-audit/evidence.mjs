import { readFileSync, writeFileSync } from 'node:fs';
import { audit } from '../../../tools/telemetry/audit.mjs';
import { COOP } from '../../../src/data/coop.js';
const S0 = { ...COOP.slots };
const names = ['bots-baseline', 'H1-smoothA', 'H2-A-cursed08', 'H3-A-scale15', 'H4-A-scale2', 'H5-A-scale2-xp1',
  'H6-regen03', 'C1', 'C2', 'C3', 'C4', 'V-baseline', 'V-C4', 'V-C4-noevo', 'V-baseline-noevo', 'W1', 'W2', 'W3', 'W4', 'W5', 'C4W4', 'C4W5', 'R1', 'R2', 'V-R2', 'bots-shots', 'R3', 'R3D', 'R3DS', 'R3DSX', 'F1', 'F2', 'F3', 'V-F3'];
const out = { generated: new Date().toISOString(), cohorts: {} };
for (const n of names) {
  const d = JSON.parse(readFileSync(`tools/out/audit/${n}.json`, 'utf8'));
  COOP.slots = d.experiment?.coop?.slots || S0;
  const a = audit(d.records).modes;
  COOP.slots = S0;
  out.cohorts[n] = { source: d.source, model: d.model, profiles: d.profiles, split: d.split, n: d.n,
    experiment: d.experiment, outcomes: Object.fromEntries(Object.entries(d.summary).map(([k, s]) =>
      [k, { n: s.n, counts: s.counts, deathCI95: s.deathCI95, winUpper95: s.winUpper95 }])),
    progression: a };
}
out.human = audit(JSON.parse(readFileSync('tools/out/telemetry-all/runs.json', 'utf8')));
writeFileSync('docs/simulation-evidence/balance-audit/results.json', JSON.stringify(out));
