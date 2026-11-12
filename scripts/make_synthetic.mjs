// SYNTHETIC sample bills (invented households) in the My Meralco statement layout, priced at the REAL rates.json and
// driven by the REAL weather.json. Run build_rates and fetch_weather first.
// Writes www/data/fixtures/SYNTHETIC_*.pdf and SYNTHETIC_packets.json, tests/SYNTHETIC_truth.json
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { trackerPeriods, temps, fit, cdd, DAY } from '../www/lib/model.js';
import { lookup, explain } from '../www/lib/explain.js';
import { runChecks } from '../www/lib/checks.js';
import { billingFlags, disputePacket } from '../www/lib/flags.js';
import { ercPacket } from '../www/lib/disputes.js';

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const r2 = v => Math.round(v * 100) / 100;
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const rates = json('www/data/rates.json'), T = temps(json('www/data/weather.json'));
const RATE_MONTH = '2026-10', END = '2026-10-14';

// Page-1 summary categories = sums of rate-table columns (as on the real statement).
const GROUPS = {
  generation: ['Generation', ['generation', 'power_act_reduction']],
  transmission: ['Transmission', ['transmission', 'ancillary']],
  system_loss: ['System Loss', ['system_loss']],
  distribution: ['Distribution (Meralco)', ['distribution', 'supply', 'supply_cust', 'metering', 'metering_cust', 'awat_1', 'awat_2', 'reg_reset']],
  senior_subsidy: ['Senior Citizen', ['senior_subsidy']],
  taxes: ['Government Taxes', ['rpt', 'rpt_adj', 'lft', 'lft_adj', 'vat', 'energy_tax']],
  universal: ['Universal Charges', ['universal']],
  fit_all: ['FiT-All (Renewable)', ['fit_all']],
  gea_all: ['GEA-All (Renewable)', ['gea_all']],
  lifeline: ['Lifeline', ['lifeline_subsidy', 'lifeline_rate_adj']],
};

async function makeBill(name, perDay) {
  const months = Array.from({ length: 22 }, (_, i) => `${2025 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`); // Jan 2025..Oct 2026
  const tracker = trackerPeriods(months.map(month => ({ month, kwh: 1 })), END).map(p => {
    let k = 0;
    for (let d = p.start; d <= p.end; d += DAY) k += perDay(T(d));
    return { month: p.month, kwh: Math.round(k) };
  });
  const q1 = tracker.at(-1).kwh, r1 = lookup(rates, RATE_MONTH, q1), fx = rates[RATE_MONTH].fixed;
  const charges = Object.entries(GROUPS).map(([key, [label, cols]]) => ({
    key, label,
    amount_php: r2(cols.reduce((s, c) => s + (r1[c] ?? 0) * q1 * (c === 'lft' ? 1.5 : 1) + (fx[c] ?? 0), 0)), // this LGU's LFT 0.75% vs table 0.5%
  }));
  const cp = r2(charges.reduce((s, c) => s + c.amount_php, 0));
  const bill = {
    can: '0000000000', period_start: '2026-09-15', period_end: END, days: 30, kwh: q1, previous_reading: 10000, current_reading: 10000 + q1, multiplier: 1,
    tracker, charges, charges_this_period: cp, remaining_balance: 0, installment_due: 0, total_amount_due: cp, source: 'synthetic',
  };

  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), page = doc.addPage([612, 842]);
  const put = (s, x, y, size = 8) => page.drawText(String(s), { x, y, size, font });
  const money = v => (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
  put('SYNTHETIC - NOT A REAL MERALCO BILL - FOR TESTING ONLY', 36, 815, 10);
  put('Customer Account Number (CAN)', 313, 721); put(bill.can, 313, 702);
  put('Billing Period', 36, 707); put('15 Sep 2026 to 14 Oct 2026', 36, 694);
  put('Current Reading', 198, 647); put(bill.current_reading.toLocaleString('en-US'), 198, 633);
  put('Previous Reading', 198, 621); put('-', 188, 617); put(bill.previous_reading.toLocaleString('en-US'), 198, 608);
  put('Actual Consumption', 198, 597); put('Bill Computation Summary', 302, 597);
  put('Your rate this month', 36, 585); put(`${q1} kWh`, 198, 585);
  put('Remaining Balance from previous bill', 302, 580); put('0.00', 543, 580);
  put('Charges for this billing period', 302, 548); put(money(cp), 520, 548);
  charges.forEach((c, i) => { put(c.label, 313, 534 - i * 11); put(money(c.amount_php), 520, 534 - i * 11); });
  put('Your monthly consumption 29.2 C', 36, 534 - 6 * 11); // left-column text on a summary line, as on the real bill
  put('Total Amount Due', 302, 376); put(money(cp), 507, 376);
  put('kWh', 57, 336);
  for (let m = 0; m < 12; m++) {
    const cell = yr => tracker.find(t => t.month === `${yr}-${String(m + 1).padStart(2, '0')}`)?.kwh ?? '-';
    put(cell(2026), 84 + m * 17, 336); put(cell(2025), 84 + m * 17, 327);
  }
  writeFileSync(`www/data/fixtures/${name}.pdf`, await doc.save());
  return bill;
}

const good = await makeBill('SYNTHETIC_bill', t => 6 + 1.5 * Math.max(t - 27, 0) + 0.3 * gauss());
const weak = await makeBill('SYNTHETIC_weak_bill', () => 9 + 3 * gauss());
// SYNTHETIC dispute files for the triage dashboard concept: doctored copies of the sample bills, run through the real pipeline.
function packetFor(bill, answers) {
  const checks = runChecks(bill), per = trackerPeriods(bill.tracker, bill.period_end), f = fit(per, T);
  const r = explain(bill, per, f, T, cdd, rates), flags = billingFlags(bill, checks, r, answers);
  if (!flags.length) throw new Error(`sample dispute ${bill.can} raised no flags`);
  return { ...disputePacket({ bill, checks, flags, answers, r, rates }), created: '2026-11-01T00:00:00.000Z' };
}
const lastMonthZero = b => ({ ...b, tracker: b.tracker.map((t, i, a) => (i === a.length - 2 ? { ...t, kwh: 0 } : t)) });
const packets = [
  packetFor({ ...good, can: '0000000001', current_reading: good.current_reading + 150 }, { keys: ['nothing'] }),
  packetFor({ ...lastMonthZero(good), can: '0000000002' }, { keys: ['nothing'] }),
  packetFor({ ...weak, can: '0000000003', days: 36 }, { keys: ['people'], note: 'Relatives stayed for two weeks.' }),
  ercPacket({ sent: '2026-10-20', channel: 'My Meralco app', ref: 'SYN-0004',
    packet: packetFor({ ...weak, can: '0000000004', total_amount_due: weak.total_amount_due + 480 }, { keys: ['away'] }) }, new Date(2026, 10, 12)),
];
writeFileSync('www/data/fixtures/SYNTHETIC_packets.json', JSON.stringify(packets, null, 1));
writeFileSync('tests/SYNTHETIC_truth.json', JSON.stringify({ params: { b0: 6, b1: 1.5, bp: 27 }, good, weak }, null, 1));
console.log('SYNTHETIC bills written. good kWh', good.kwh, 'weak kWh', weak.kwh);
