// SYNTHETIC data so the skeleton runs before Gate 0. Every number here is invented; replace with real Meralco/Open-Meteo data.
// Writes www/data/{rates,weather,reasons}.json, www/data/fixtures/SYNTHETIC_*.pdf, tests/SYNTHETIC_truth.json
import { writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { trackerPeriods, DAY } from '../www/lib/model.js';
import { lookup } from '../www/lib/explain.js';

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const r2 = v => Math.round(v * 100) / 100, r4 = v => Math.round(v * 1e4) / 1e4;

// --- rates (invented, shaped like Meralco's typical-consumption table) ---
function rateRow(m, q) {
  const late = m === '2026-10';
  const r = {
    generation: late ? 8.3044 : 7.9012, transmission: late ? 1.0533 : 1.1021, system_loss: late ? 0.8034 : 0.7512,
    distribution: (q <= 200 ? 1.3567 : q <= 300 ? 1.689 : 1.9123) + (late ? 0.01 : 0),
    supply: 0.5402, metering: 0.3201, subsidies: 0.0102, tax_recovery_adj: 0.0021, universal: 0.207, fit_all: 0.0838, gea_all: 0.0371,
  };
  r.vat = r4(0.12 * (r.generation + r.transmission + r.system_loss + r.distribution + r.supply + r.metering));
  r.franchise_tax = r4(0.005 * Object.values(r).reduce((a, v) => a + v, 0));
  r.total = r4(Object.values(r).reduce((a, v) => a + v, 0));
  return r;
}
const rates = Object.fromEntries(['2026-09', '2026-10'].map(m => [m, {
  synthetic: true, source_url: 'SYNTHETIC - replace with Meralco residential-bills PDF', lft_assumed: 0.005,
  fixed: { supply: 16.38, metering: 5.0 },
  non_lifeline: Object.fromEntries([100, 200, 300, 400, 500, 600].map(q => [q, rateRow(m, q)])),
}]));

// --- weather: 2016-01-01..2026-12-31 daily mean, Manila-like ---
const start = Date.UTC(2016, 0, 1), t = [];
for (let d = start; d <= Date.UTC(2026, 11, 31); d += DAY) {
  const doy = (d - Date.UTC(new Date(d).getUTCFullYear(), 0, 1)) / DAY;
  t.push(r2(27.5 + 2 * Math.sin(2 * Math.PI * (doy - 39) / 365) + gauss()));
}
const weather = { synthetic: true, city: 'Manila', lat: 14.5995, lon: 120.9842, start: '2016-01-01', t };
const T = ms => t[Math.round((ms - start) / DAY)];

// --- bills ---
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABELS = {
  generation: 'Generation Charge', transmission: 'Transmission Charge', system_loss: 'System Loss Charge',
  distribution: 'Distribution Charge', supply: 'Supply Charge', metering: 'Metering Charge',
  subsidies: 'Lifeline/Senior Citizen Subsidy', tax_recovery_adj: 'Tax Recovery Adj. Charge', universal: 'Universal Charges',
  fit_all: 'FIT-All', gea_all: 'GEA-All', vat: 'Value Added Tax', franchise_tax: 'Local Franchise Tax',
};

async function makeBill(name, perDay, refund) {
  const months = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.UTC(2025, 8 + i, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; });
  const per = trackerPeriods(months.map(month => ({ month, kwh: 0 })), '2026-10-14');
  const tracker = per.map(p => { let k = 0; for (let d = p.start; d <= p.end; d += DAY) k += perDay(T(d)); return { month: p.month, kwh: Math.round(k) }; });
  const q1 = tracker.at(-1).kwh, r1 = lookup(rates, '2026-10', q1), fx = rates['2026-10'].fixed;
  const charges = Object.keys(LABELS).map(key => ({
    key, label: LABELS[key],
    amount_php: r2(r1[key] * q1 * (key === 'franchise_tax' ? 1.5 : 1) + (fx[key] ?? 0)), // local tax 0.75% vs table 0.5%
  }));
  if (refund) charges.push({ key: 'refund', label: 'AWAT Refund', amount_php: -25 });
  const cp = r2(charges.reduce((s, c) => s + c.amount_php, 0));
  const bill = {
    period_start: '2026-09-15', period_end: '2026-10-14', days: 30, kwh: q1,
    previous_reading: 10000, current_reading: 10000 + q1, multiplier: 1, tracker, charges,
    charges_this_period: cp, remaining_balance: 0, installment_due: 0, total_amount_due: cp, city: 'Manila', source: 'synthetic',
  };

  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), page = doc.addPage([612, 1008]);
  let y = 970;
  const put = (s, x, yy = y, size = 10) => page.drawText(String(s), { x, y: yy, size, font });
  const line = (label, value, x2 = 330) => { put(label, 40); if (value != null) put(value, x2); y -= 18; };
  const money = v => (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
  line('SYNTHETIC - NOT A REAL MERALCO BILL - FOR TESTING ONLY');
  line('Service Address: 123 Sample St, Sampaloc, Manila');
  line('Billing Period', '09/15/2026 - 10/14/2026');
  line('Previous Reading', bill.previous_reading);
  line('Current Reading', bill.current_reading);
  line('Multiplier', 1);
  line('kWh Used', q1);
  y -= 10;
  for (const c of charges) {
    if (c.key === 'tax_recovery_adj') continue;
    if (c.key === 'subsidies') { // the trap: subsidies and TRAC share one printed line
      const trac = charges.find(x => x.key === 'tax_recovery_adj');
      put(c.label, 40); put(money(c.amount_php), 220); put(trac.label, 300); put(money(trac.amount_php), 470); y -= 18;
      continue;
    }
    line(c.label, money(c.amount_php), 470);
  }
  y -= 10;
  line('Charges for this Billing Period', money(cp), 470);
  line('Remaining Balance', money(0), 470);
  line('Installment Due', money(0), 470);
  line('Total Amount Due', money(cp), 470);
  y -= 20;
  line('Monthly Consumption Tracker (kWh)');
  tracker.forEach((m, i) => { const [yr, mo] = m.month.split('-'); put(`${MON[mo - 1]} ${yr.slice(2)}`, 40 + i * 39, y, 7); put(m.kwh, 40 + i * 39, y - 14, 7); });
  writeFileSync(`www/data/fixtures/${name}.pdf`, await doc.save());
  return bill;
}

const good = await makeBill('SYNTHETIC_bill', T => 6 + 1.5 * Math.max(T - 26.5, 0) + 0.3 * gauss(), true);
const weak = await makeBill('SYNTHETIC_weak_bill', () => 9 + 3 * gauss(), false);
writeFileSync('www/data/rates.json', JSON.stringify(rates, null, 1));
writeFileSync('www/data/weather.json', JSON.stringify(weather));
writeFileSync('www/data/reasons.json', '{}\n'); // only months where Meralco itself states a reason
writeFileSync('tests/SYNTHETIC_truth.json', JSON.stringify({ params: { b0: 6, b1: 1.5, bp: 26.5 }, good, weak }, null, 1));
console.log('SYNTHETIC data written. good kWh', good.kwh, 'weak kWh', weak.kwh);
