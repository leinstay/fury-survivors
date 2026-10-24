// SVG для docs/BALANCE_AUDIT.md: оставшиеся личные уровни улучшений по минутам (медиана живых)
// в четырёх режимах: люди, боты на текущем балансе, боты с кандидатом.
// node tools/telemetry/audit-chart.mjs <human.json> <bots.json> <candidate.json> <out.svg> [candidate slots json]
import { readFileSync, writeFileSync } from 'node:fs';
import { audit } from './audit.mjs';
import { COOP } from '../../src/data/coop.js';

const [humanF, botsF, candF, out] = process.argv.slice(2);
const load = (f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return Array.isArray(d) ? d : d.records; };
const slots0 = { ...COOP.slots };
const series = [
  { name: 'Люди (телеметрия)', color: '#2a78d6', dash: '', data: audit(load(humanF)).modes },
  { name: 'Боты, текущий баланс', color: '#eb6834', dash: '6 4', data: audit(load(botsF)).modes },
];
const cand = JSON.parse(readFileSync(candF, 'utf8'));
COOP.slots = cand.experiment?.coop?.slots || slots0;
series.push({ name: 'Боты, кандидат C4', color: '#1baf7a', dash: '2 3', data: audit(cand.records).modes });
COOP.slots = slots0;

const modes = ['normal/solo', 'cursed/solo', 'normal/duo', 'cursed/duo'];
const T = [60, 180, 300, 600, 900];
const W = 300; const H = 200; const PAD = { l: 40, r: 12, t: 28, b: 30 };
const x = (t) => PAD.l + (t / 900) * (W - PAD.l - PAD.r);
const y = (v) => H - PAD.b - (v / 70) * (H - PAD.t - PAD.b);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 2} ${H * 2 + 40}" font-family="sans-serif" font-size="11">`;
svg += '<rect width="100%" height="100%" fill="#ffffff"/>';
modes.forEach((m, i) => {
  const ox = (i % 2) * W;
  const oy = Math.floor(i / 2) * H;
  svg += `<g transform="translate(${ox},${oy})"><text x="${PAD.l}" y="16" font-weight="600" fill="#1f1f1d">${m}</text>`;
  for (const v of [0, 20, 40, 60]) {
    svg += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e3dd" stroke-width="1"/>`;
    svg += `<text x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end" fill="#6b6a64">${v}</text>`;
  }
  for (const t of T) svg += `<text x="${x(t)}" y="${H - 12}" text-anchor="middle" fill="#6b6a64">${t / 60}м</text>`;
  for (const s of series) {
    const pts = T.map((t) => [t, s.data[m]?.minutes[t]])
      .filter(([, v]) => v && v.players > 0 && v.levelsLeft !== null);
    if (!pts.length) continue;
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash}" points="${pts.map(([t, v]) => `${x(t)},${y(v.levelsLeft)}`).join(' ')}"/>`;
    for (const [t, v] of pts) svg += `<circle cx="${x(t)}" cy="${y(v.levelsLeft)}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"><title>${s.name}, ${t / 60} мин: ${v.levelsLeft} (n=${v.players})</title></circle>`;
  }
  svg += '</g>';
});
series.forEach((s, i) => {
  const lx = 20 + i * 200;
  svg += `<line x1="${lx}" x2="${lx + 24}" y1="${H * 2 + 22}" y2="${H * 2 + 22}" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash}"/>`;
  svg += `<text x="${lx + 30}" y="${H * 2 + 26}" fill="#1f1f1d">${s.name}</text>`;
});
svg += `<text x="${W * 2 - 8}" y="${H * 2 + 38}" text-anchor="end" fill="#6b6a64">ось Y: оставшиеся личные уровни улучшений (медиана живых)</text></svg>\n`;
writeFileSync(out, svg);
