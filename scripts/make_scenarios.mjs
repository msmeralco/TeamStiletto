// SYNTHETIC scenario bills: one invented household per scenario in the My Meralco statement layout (page 1 summary and, for
// most, page 2 "How your bill was computed" + "What you've paid"), priced at the REAL rates.json and driven by the REAL weather.json.
// Every scenario names the part of the system it exercises, is read back through the real pipeline, and must match its `expect`.
// Run: npm run scenarios   (after rates and weather are built).
// Writes www/data/fixtures/scenarios/*.pdf, www/data/fixtures/SYNTHETIC_scenarios.json (catalogue + observed results),
// www/data/fixtures/SYNTHETIC_scenario_packets.json (dispute files for the dashboard).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { trackerPeriods, DAY, temps } from '../www/lib/model.js';
import { lookup } from '../www/lib/explain.js';
import { disputePacket } from '../www/lib/flags.js';
import { rates, spec, analyse, analyseBill, readPdf } from './scenario_lib.mjs';

let seed = 1;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const r2 = v => Math.round((v + Math.sign(v) * 1e-9) * 100) / 100, r4 = v => Math.round(v * 1e4) / 1e4, sum = a => a.reduce((s, x) => s + x, 0);
const money = v => (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const human = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const short = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const groupOf = key => spec.groups.find(g => g.key === key);

// ---------------------------------------------------------------- itemise: the bill as Meralco prints it on page 2
const KWH = [ // [group, line key, column in rates.json]
  ['generation', 'generation_charge', 'generation'], ['transmission', 'transmission_charge', 'transmission'], ['transmission', 'ancillary_service', 'ancillary'],
  ['system_loss', 'system_loss_charge', 'system_loss'], ['distribution', 'distribution_charge', 'distribution'], ['distribution', 'metering_per_kwh', 'metering'],
  ['distribution', 'supply_per_kwh', 'supply'], ['distribution', 'awat_1', 'awat_1'], ['distribution', 'awat_2', 'awat_2'], ['distribution', 'reg_reset_fee_adj', 'reg_reset'],
  ['senior_citizen', 'lifeline_rate_adj', 'lifeline_rate_adj'], ['senior_citizen', 'senior_subsidy', 'senior_subsidy'],
];
const NON_GEN = ['transmission', 'ancillary', 'system_loss', 'distribution', 'supply', 'metering'];
const UNIVERSAL = [['missionary_npc_spug', 0.62], ['missionary_redci', 0.04], ['environmental_fund', 0.01], ['npc_stranded_debts', 0.33]];
const VAT_ON = ['generation', 'transmission', 'system_loss', 'distribution', 'senior_citizen'];

function itemise(q, month, o = {}) {
  const fx = rates[month].fixed;
  const row = o.lifeline ? { ...Object.entries(rates[month].lifeline).find(([k]) => +k >= q)?.[1] ?? rates[month].lifeline[100] } : lookup(rates, month, q);
  const px = c => (row[c] === undefined ? undefined : row[c] * (o.scaleNonGen && NON_GEN.includes(c) ? o.scaleNonGen : 1) * (o.scaleGen && c === 'generation' ? o.scaleGen : 1));
  const G = new Map(spec.groups.map(g => [g.key, { key: g.key, label: g.label, lines: [] }]));
  const label = (gk, k) => groupOf(gk).lines.find(l => l.key === k).label;
  const add = (gk, k, kind, v, extra = {}) => { // kind: kwh | mo | amt
    const l = { key: k, label: extra.label ?? label(gk, k), kind, ...extra };
    if (kind === 'kwh') Object.assign(l, { base: q, price: r4(v), amount: r2(q * r4(v)) });
    else if (kind === 'mo') Object.assign(l, { base: 1, price: v, amount: r2(v) });
    else l.amount = r2(v);
    G.get(gk).lines.push(l);
    return l;
  };
  for (const [gk, k, col] of KWH) {
    if (px(col) === undefined) continue;
    if (k === 'distribution_charge') { add(gk, k, 'kwh', px(col)); add(gk, 'metering_fixed', 'mo', fx.metering_cust); add(gk, 'supply_fixed', 'mo', fx.supply_cust); continue; }
    if (gk === 'senior_citizen' && o.seniorZero) { add(gk, k, 'kwh', 0); continue; }
    if (k === 'senior_subsidy' && o.senior) { add(gk, k, 'kwh', -o.senior / q); continue; }
    add(gk, k, 'kwh', px(col));
  }
  if (row.power_act_reduction) add('generation', 'power_act_reduction', 'amt', row.power_act_reduction * q);
  const amt = gk => r2(sum(G.get(gk).lines.map(l => l.amount))), line = (gk, k) => G.get(gk).lines.find(l => l.key === k);
  const vatBase = r2(sum(VAT_ON.map(amt)));
  // taxes: RPT, LFT (percent of VAT-sales base + RPT), energy tax above 650 kWh, then one VAT line per taxed group or line
  const T = G.get('taxes');
  if (px('rpt') !== undefined) add('taxes', 'rpt', 'kwh', px('rpt'));
  if (px('rpt_adj') !== undefined) add('taxes', 'rpt_adj', 'kwh', px('rpt_adj'));
  const lftBase = r2(vatBase + (line('taxes', 'rpt')?.amount ?? 0) + (line('taxes', 'rpt_adj')?.amount ?? 0)), lftPct = o.lft ?? 0.5;
  T.lines.push({ key: 'lft', label: label('taxes', 'lft'), kind: 'pct', base: lftBase, price: lftPct, amount: r2(lftBase * lftPct / 100) });
  if (px('lft_adj') !== undefined) add('taxes', 'lft_adj', 'kwh', px('lft_adj'));
  if (q > 650) { const b = Math.min(q, 1000) - 650; T.lines.push({ key: 'energy_tax', label: 'FIRST', header: 'ENERGY TAX', kind: 'kwh', base: b, price: 0.1, amount: r2(b * 0.1) }); }
  const vatLines = [['vat_generation', 'generation', () => amt('generation')], ['vat_transmission', 'transmission', () => line('transmission', 'transmission_charge').amount],
    ['vat_ancillary', 'transmission', () => line('transmission', 'ancillary_service')?.amount], ['vat_system_loss', 'system_loss', () => amt('system_loss')],
    ['vat_distribution', 'distribution', () => amt('distribution')], ['vat_senior', 'senior_citizen', () => (amt('senior_citizen') ? amt('senior_citizen') : undefined)]]
    .map(([k, , b]) => [k, b()]).filter(([, b]) => b !== undefined);
  const pct = r4(100 * row.vat * q / sum(vatLines.map(([, b]) => b)));
  vatLines.forEach(([k, b], i) => T.lines.push({ key: k, label: label('taxes', k).replace(/^VALUE ADDED TAX: /, ''), header: i ? undefined : 'VALUE ADDED TAX', kind: 'pct', base: b, price: pct, amount: r2(b * pct / 100), vat: true }));
  UNIVERSAL.forEach(([k, share]) => add('universal', k, 'kwh', row.universal * share));
  add('fit_all', 'fit_all', 'kwh', row.fit_all);
  add('gea_all', 'gea_all', 'amt', row.gea_all * q);
  if (o.lifeline) add('lifeline', 'lifeline_discount', 'kwh', row.lifeline_discount, { label: 'Lifeline Discount' });
  add('lifeline', 'lifeline_subsidy', 'kwh', row.lifeline_subsidy);
  const groups = [...G.values()].map(g => ({ ...g, amount: amt(g.key) }));
  const vatSum = r2(sum(T.lines.filter(l => l.vat).map(l => l.amount)));
  const total = r2(sum(groups.map(g => g.amount)));
  groups.forEach(g => (g.pct = r2(100 * g.amount / total)));
  const E = { vat_sales_base: r2(sum(groups.filter(g => VAT_ON.includes(g.key)).map(g => g.amount))), vat_sales_vat: vatSum,
    non_vat: r2(sum(groups.filter(g => !VAT_ON.includes(g.key)).map(g => g.amount)) - vatSum), total };
  return { groups, E };
}

// ---------------------------------------------------------------- compose: what the statement prints (and what a doctor may break)
const DEFAULT_PER_DAY = (scale, noise) => t => Math.max(0.5, scale * (6 + 1.5 * Math.max(t - 27, 0)) + noise * gauss());

const tOr = d => { try { return T(d); } catch { return 27; } }; // dates past the saved weather: only the d06 scenario, which must fail later in the app
async function compose(sc, T, idx) {
  seed = [...sc.id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 2147483647, 7);
  const end = sc.end ?? '2026-10-14', [Y, M, D] = end.split('-').map(Number), rateMonth = sc.rateMonth ?? end.slice(0, 7), from = sc.from ?? '2025-01';
  const months = []; for (let y = +from.slice(0, 4), m = +from.slice(5); y < Y || (y === Y && m <= M); m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
  const perDay = sc.perDay ?? DEFAULT_PER_DAY(sc.scale ?? 1, (sc.noise ?? 0.3) * (sc.scale ?? 1));
  const periods = trackerPeriods(months.map(month => ({ month, kwh: 1 })), end);
  const tracker = periods.map(p => { let k = 0; for (let d = p.start; d <= p.end; d += DAY) k += perDay(tOr(d)); return { month: p.month, kwh: Math.round(k) }; });
  sc.tweakTracker?.(tracker);
  const last = periods.at(-1), q = sc.kwh ?? tracker.at(-1).kwh;
  tracker.at(-1).kwh = q;
  const days = sc.days ?? last.days, endMs = last.end, startMs = endMs - (days - 1) * DAY;
  const I = itemise(q, rateMonth, sc.price ?? {});
  const credits = sc.credits ?? [], applied = r2(sum(credits.map(c => c.amount)));
  const extra = sc.extraCharges ?? [];
  const charges = [...I.groups.map(g => ({ label: g.label, amount: g.amount })), ...(credits.length ? [{ label: 'Applied Credits', amount: applied }] : []), ...extra];
  const chargesTotal = r2(sum(charges.map(c => c.amount))), remaining = sc.remaining ?? 0, installment = sc.installment ?? 0;
  const mult = sc.mult ?? 1, prev = sc.prev ?? 10000;
  const cur = sc.cur ?? Math.round(prev + q / mult);
  const prevKwh = tracker.at(-2)?.kwh, ly = tracker.find(t => t.month === `${Y - 1}-${String(M).padStart(2, '0')}`)?.kwh;
  const past12 = tracker.slice(-12).map(t => t.kwh).filter(k => k != null);
  const P = {
    can: String(5500000100 + idx), start: iso(startMs), end, startMs, endMs, days, kwh: q, prev, cur, mult, tracker,
    groups: I.groups, E: I.E, credits, applied, charges, chargesTotal, remaining, installment, total: r2(remaining + chargesTotal + installment),
    rate: r2(I.E.total / q),
    vsPrev: prevKwh ? { kwh: q - prevKwh, pct: Math.round(100 * Math.abs(q - prevKwh) / prevKwh) } : null,
    vsLY: ly ? { kwh: q - ly, pct: Math.round(100 * Math.abs(q - ly) / ly) } : null,
    avgMonthly: Math.round(sum(past12) / past12.length), avgDaily: r2(q / days), avgCost: r2(I.E.total / days), ghg: r4(q * 0.0006935),
    payments: [], ly,
    ln: k => P.groups.flatMap(g => g.lines).find(l => l.key === k), g: k => P.groups.find(x => x.key === k),
    periodOf: i => periods.at(i),
  };
  return P;
}

// ---------------------------------------------------------------- render
async function render(P, sc) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), p1 = doc.addPage([612, 842]);
  const put = (pg, s, x, y, size = 8) => pg.drawText(String(s), { x, y, size, font });
  const A = (s, x, y) => put(p1, s, x, y);
  if (sc.blank) return doc.save(); // a page with no text at all
  if (sc.notABill) { ['Quarterly newsletter', 'Dear member, thank you for joining the book club.', 'Next meeting: 12 December at the library.'].forEach((t, i) => A(t, 36, 780 - i * 14)); return doc.save(); }
  put(p1, 'SYNTHETIC - NOT A REAL MERALCO BILL - FOR TESTING ONLY', 36, 815, 10);
  A(`Scenario: ${sc.id}`, 36, 802);
  A('Customer Account Number (CAN)', 313, 721); A(P.can, 313, 702);
  A('Billing Period', 36, 707); A(`${human(P.startMs)} to ${human(P.endMs)}`, 36, 694);
  if (!sc.noReadings) {
    A('Current Reading', 198, 647); A(P.cur.toLocaleString('en-US'), 198, 633);
    A('Previous Reading', 198, 621); A('-', 188, 617); A(P.prev.toLocaleString('en-US'), 198, 608);
  }
  if (P.mult !== 1) { A('Multiplier', 36, 640); A(P.mult, 90, 640); }
  if (!sc.noKwh) { A('Actual Consumption', 198, 597); A(`${P.kwh.toLocaleString('en-US')} kWh`, 198, 585); }
  A('Bill Computation Summary', 302, 597); A('Your rate this month', 36, 585);
  A('Remaining Balance from previous bill', 302, 580); A(money(P.remaining), 543, 580);
  if (P.installment) { A('Installment Due', 302, 564); A(money(P.installment), 543, 564); }
  A('Charges for this billing period', 302, 548); A(money(P.chargesTotal), 520, 548);
  P.charges.forEach((c, i) => { A(c.label, 313, 534 - i * 11); A(money(c.amount), 520, 534 - i * 11); });
  A('Your monthly consumption 29.2 C', 36, 534 - 6 * 11); // left-column text on a summary line, as on the real bill
  A('Total Amount Due', 302, 376); A(money(P.total), 507, 376);
  A('kWh', 57, 336);
  for (let m = 0; m < 12; m++) {
    const cell = yr => { const t = P.tracker.find(x => x.month === `${yr}-${String(m + 1).padStart(2, '0')}`); return t?.kwh == null ? '-' : t.kwh.toLocaleString('en-US'); };
    const [Y] = P.end.split('-').map(Number);
    A(cell(Y), 84 + m * 17, 336);
    A(sc.lyCellWrong && m + 1 === +P.end.slice(5, 7) ? cell(Y) : cell(Y - 1), 84 + m * 17, 327);
  }
  A(`${P.rate.toFixed(2)} per kWh`, 36, 300);
  const vs = (v, which) => v && [`This bill is ${v.pct}% ${v.kwh >= 0 ? 'higher' : 'lower'} (${v.kwh >= 0 ? '+' : '-'}${Math.abs(v.kwh)}kWh) vs`, which];
  [vs(P.vsPrev, 'previous billing period'), vs(P.vsLY, 'same period last year')].filter(Boolean).forEach(([a, b], i) => { A(a, 36, 285 - i * 22); A(b, 36, 275 - i * 22); });
  A(`${P.avgMonthly} kWh`, 36, 235); A(`${P.avgDaily.toFixed(2)} kWh`, 120, 235); A('PHP', 200, 235); A(money(P.avgCost), 222, 235); // the currency sign is its own printed item, as on the real statement
  A(`${P.ghg.toFixed(4)} tCO2e`, 36, 220);

  if (sc.detail) {
    const p2 = doc.addPage([612, 842]), B = (s, x, y) => put(p2, s, x, y);
    if (P.payments.length) {
      B("What you've paid", 36, 800);
      P.payments.forEach((p, i) => { B(p.period, 36, 788 - i * 10); B(`${p.posted} Meralco Online`, 105, 788 - i * 10); B('P', 259, 788 - i * 10); B(money(p.amount), 265, 788 - i * 10); });
    }
    B('Multiplier', 36, 730); B(P.mult, 100, 730);
    B('How your bill was computed', 36, 700);
    const rows = [];
    for (const g of P.groups) {
      if (g.amount !== 0) rows.push([`${g.label} ${g.pct.toFixed(2)}%`, [money(g.amount)]]); // a group that nets to 0.00 is printed without its header
      for (const l of g.lines) {
        if (l.header) rows.push([l.header, []]);
        const base = l.kind === 'kwh' ? `${l.base.toLocaleString('en-US')} kWh` : l.kind === 'mo' ? `${l.base.toFixed(2)} mo` : money(l.base);
        const price = l.kind === 'pct' ? `${l.price.toFixed(4)}%` : l.kind === 'mo' ? l.price.toFixed(2) : l.price?.toFixed(4);
        rows.push([l.label, l.kind === 'amt' ? [money(l.amount)] : [base, price, money(l.amount)]]);
      }
    }
    const step = 8.5, Lx = { label: 36, v: [170, 215, 262] }, Rx = { label: 306, v: [440, 485, 538] };
    const row = (x, y, label, vals) => { B(label, x.label, y); vals.forEach((v, i) => B(v, x.v[i + (vals.length === 1 ? 2 : 0)], y - (sc.valueOffset ?? 0))); };
    B('Rate Components', 36, 690); B('Base', 177, 690); B('Price', 227, 690); B('Amount', 268, 690);
    const nLeft = Math.min(rows.length, sc.leftRows ?? 52);
    rows.slice(0, nLeft).forEach(([l, v], i) => row(Lx, 680 - i * step, l, v));
    let y = 700;
    if (nLeft < rows.length) {
      B('Continued', 306, y); y -= 10; B('Rate Components', 306, y); y -= 10;
      rows.slice(nLeft).forEach(([l, v]) => { row(Rx, y, l, v); y -= step; });
      y -= 6;
    }
    const E = P.E, R = (l, v, dy = 9) => { row(Rx, y, l, v); y -= dy; };
    R('Energy Bill Amount', []);
    B(money(E.vat_sales_base), 440, y); B('VAT Sales', 306, y); B(money(E.vat_sales_vat), 538, y); y -= 9;
    if (E.vat_zero_rated != null) R('VAT Zero Rated', [money(E.vat_zero_rated)]);
    R('Non-VAT', [money(E.non_vat)]);
    R('Total Energy Amount', [money(E.total)]);
    if (P.credits.length) { R('Applied Credits', [money(P.applied)]); P.credits.forEach(c => R(c.label, [money(c.amount)])); }
    R('Charges for this billing period', [money(P.chargesTotal)], 14);
    R('Additional Bill Information', [money(999)]);
    B('Reminders when paying', 36, 60);
  }
  return doc.save();
}

// ---------------------------------------------------------------- doctors: what a wrong bill looks like on paper
const bump = (P, k, d) => { const l = P.ln(k); l.amount = r2(l.amount + d); };
const refit = P => { P.chargesTotal = r2(sum(P.charges.map(c => c.amount))); P.total = r2(P.remaining + P.chargesTotal + P.installment); }; // page 1 stays consistent with itself

// ---------------------------------------------------------------- the catalogue
const GOOD = { scale: 1, noise: 0.3 };
const weakPerDay = () => Math.max(1, 9 + 3 * gauss());
const SC = []; // { id, group, covers, ...params, expect }
const S = (id, group, covers, p = {}) => SC.push({ id, group, covers, ...p });

// A. model tiers and history length
S('a01_clean_tier_a', 'Model tiers and history', 'Weather explains usage: tier A (3-parameter change-point), no flags, clean bill.', { detail: true, expect: { tier: 'A_3pc', flags: [], route: 'chatbot' } });
S('a02_short_history_tier_b', 'Model tiers and history', 'New customer, 10 months printed: tier B (fixed 24 C base).', { from: '2026-01', noise: 0.15, expect: { tier: 'B_fixed24', flags: [] } });
S('a03_noisy_tier_c', 'Model tiers and history', 'Usage does not track temperature: tier C, model refuses, usage-only explanation.', { perDay: weakPerDay, expect: { tier: 'C_refused', flags: [] } });
S('a04_short_and_noisy_c', 'Model tiers and history', 'Tier C with fewer than 15 months: next bill cannot be projected.', { perDay: weakPerDay, from: '2026-03', expect: { tier: 'C_refused' } });
S('a05_two_months_only', 'Model tiers and history', 'Only two tracker months printed (smallest bill the explainer accepts).', { from: '2026-09', expect: { stage: 'result' } });
S('a06_one_month_only', 'Model tiers and history', 'One tracker month: the explainer must stop with a plain error.', { from: '2026-10', expect: { stage: 'analysis', error: /at least two tracker months/ } });
S('a07_old_zero_month', 'Model tiers and history', 'A 0 kWh month long ago (missed reading) is left out of the fit and raises no flag.', { tweakTracker: t => { t[3].kwh = 0; }, expect: { tier: 'A_3pc', flags: [] } });
S('a08_tracker_gap', 'Model tiers and history', 'Last month shows "-" (no reading at all): missed-reading flag, medium.', { tweakTracker: t => { t.at(-2).kwh = null; }, expect: { flags: ['missed_reading:medium'], route: 'meralco' } });
S('a09_hot_household', 'Model tiers and history', 'Heavy aircon household (about 3x usage): tier A, large peso swings, bracket 700+.', { scale: 3, detail: true, expect: { tier: 'A_3pc', flags: [] } });

// B. page-1 arithmetic and pattern flags
S('b01_readings_mismatch', 'Flags: the bill does not add up', 'Meter readings differ from the kWh billed: strong flag, goes to a Meralco ticket.', { cur: 10393, expect: { checks_has: ['readings'], flags: ['readings:strong'], route: 'meralco' } });
S('b02_tracker_mismatch', 'Flags: the bill does not add up', "This month's tracker bar differs from the kWh billed.", { doctor: P => { P.tracker.at(-1).kwh += 40; }, expect: { checks_has: ['tracker_latest'], flags: ['tracker_latest:strong'] } });
S('b03_charges_dont_sum', 'Flags: the bill does not add up', 'Page-1 charge lines do not add up to "Charges for this billing period".', { doctor: P => { P.charges[6].amount = r2(P.charges[6].amount + 250); }, expect: { checks_has: ['line_sum'], flags: ['line_sum:strong'] } });
S('b04_total_wrong', 'Flags: the bill does not add up', 'Total Amount Due is P480 above balance + charges + installment.', { doctor: P => { P.total = r2(P.total + 480); }, expect: { checks_has: ['total'], flags: ['total:strong'] } });
S('b05_rate_mismatch', 'Flags: the bill does not add up', 'Bill adds up but is about 8% above Meralco\'s published rates for the month: rate_mismatch, strong.', { price: { scaleNonGen: 1.3 }, expect: { warn_residual: true, flags: ['rate_mismatch:strong'], route: 'meralco' } });
S('b06_missed_reading_zero', 'Flags: usage pattern', 'Last month printed as 0 kWh (missed reading): this bill may carry both months.', { tweakTracker: t => { t.at(-2).kwh = 0; }, expect: { flags: ['missed_reading:medium'], route: 'meralco' } });
S('b07_spike', 'Flags: usage pattern', 'Usage jumps to 2.3x the household\'s median, everything adds up: spike (weak), chatbot handles it.', { kwh: 560, expect: { flags: ['spike:weak'], route: 'chatbot' } });
S('b08_long_period', 'Flags: usage pattern', 'A 40-day billing period: long_period (weak).', { days: 40, kwh: 330, expect: { flags: ['long_period:weak'], route: 'chatbot' } });
S('b09_short_period', 'Flags: usage pattern', 'A 25-day period is fine: no flag, billing-days effect shown in the explanation.', { days: 25, expect: { flags: [] } });
S('b10_everything_wrong', 'Flags: usage pattern', 'Worst case: readings, tracker, total, missed reading, spike and long period together.', { kwh: 560, days: 40, cur: 10900, tweakTracker: t => { t.at(-2).kwh = 0; }, doctor: P => { P.total = r2(P.total + 300); }, expect: { flags: ['readings:strong', 'total:strong', 'missed_reading:medium', 'spike:weak', 'long_period:weak'], route: 'meralco' } });
S('b11_big_unexplained_rise', 'Flags: usage pattern', 'Usage rises far beyond what weather explains. No flag until the household says "nothing changed" in the chat (then unexplained_increase, medium).', { kwh: 330, expect: { nothing_has: ['unexplained_increase:medium'] } });

// C. what is printed on a statement
S('c01_unpaid_and_installment', 'Billing fields', 'Remaining balance and an installment on top of this period\'s charges.', { remaining: 1240.55, installment: 500, expect: { flags: [], checks_failed: [] } });
S('c02_multiplier', 'Billing fields', 'Meter multiplier of 20 (CT-metered): (current - previous) x multiplier = kWh.', { mult: 20, prev: 2000, kwh: 240, expect: { flags: [] } });
S('c03_deposit_refund_credit', 'Billing fields', 'Applied Credits (bill deposit refund) on page 1: energy is compared without the credit.', { credits: [{ label: 'Bill Deposit Refund', amount: -250 }], expect: { flags: [], checks_failed: [] } });
S('c04_senior_citizen', 'Billing fields', 'Senior citizen discount line (about -P65).', { price: { senior: 65 }, expect: { flags: [] } });
S('c05_refund_and_other_charges', 'Billing fields', 'Page-1 "Refund" and "Other Charges" lines that rates.json cannot price (small, so under the 3% line).', { extraCharges: [{ label: 'Refund', amount: -45 }, { label: 'Other Charges', amount: 30 }], expect: { checks_failed: [] } });
S('c06_lifeline_household', 'Billing fields', 'KNOWN GAP: lifeline (<=100 kWh, registered) rates are not used by the explainer; a correct lifeline bill is flagged as off the published rates.', { kwh: 70, scale: 0.4, price: { lifeline: true }, expect: { warn_residual: true } });
S('c07_meter_rollover', 'Billing fields', 'KNOWN GAP: the meter wraps past 99,999 (99,850 to 120 = 270 kWh). The readings check cannot know, so it raises a false strong flag.', { kwh: 270, prev: 99850, cur: 120, expect: { checks_has: ['readings'] } });
S('c08_four_digit_numbers', 'Billing fields', 'Thousand separators everywhere (1,450 kWh, P22,000+), energy tax above 650 kWh.', { kwh: 1450, scale: 5.5, detail: true, expect: { flags: [], checks_failed: [] } });

// D. rate brackets and rate months
for (const k of [45, 195, 295, 395, 695, 1450, 3200]) S(`d01_bracket_${String(k).padStart(4, '0')}_kwh`, 'Rate brackets', `${k} kWh: priced at its distribution bracket${k > 650 ? ' (energy tax applies)' : ''}${k > 1000 ? '; the rates table is flat above 1,000 kWh in energy tax' : ''}.`,
  { kwh: k, scale: k / 243, expect: { stage: 'result' } });
for (let m = 2; m <= 10; m++) { const mm = String(m).padStart(2, '0'); S(`d02_rate_month_2026_${mm}`, 'Rate months', `Priced at the ${mm}/2026 published table (verdict vs the month before; ${m === 9 ? 'ancillary charge split from transmission' : m === 8 ? 'first month with AWAT 2 and ancillary' : 'regular month'}).`,
  { end: `2026-${mm}-14`, detail: m % 3 === 0, expect: { stage: 'result', rate_month: `2026-${mm}`, rate_month_matches_dates: true } }); }
S('d03_first_table_month', 'Rate months', 'January 2026 is the first table: there is no month before it to compare with, so the explainer stops with a plain error.', { end: '2026-01-14', expect: { stage: 'analysis', error: /no month before 2026-01/ } });
S('d04_rates_lag_dates', 'Rate months', 'Dated Oct 2026 but priced with the September table: the app notes the rate month differs from the billing dates.', { rateMonth: '2026-09', expect: { rate_month: '2026-09', rate_month_matches_dates: false } });
S('d05_unknown_rates', 'Rate months', 'Generation price matches no published table: "No Meralco rate table matches".', { price: { genOverride: true }, expect: { stage: 'analysis', error: /No Meralco rate table matches/ } });
S('d06_no_weather_for_dates', 'Rate months', 'Billing dates beyond the saved weather: plain error naming the range.', { end: '2026-12-14', rateMonth: '2026-10', perDay: () => 8, expect: { stage: 'analysis', error: /No temperature data/ } });

// E. page 2: "How your bill was computed", "What you've paid"
S('e01_detail_two_columns', 'Page 2 (how your bill was computed)', 'Full page 2 across two printed columns (VAT lines continue in the right column), last month paid in full: exact previous bill.', { detail: true, paid: 'exact', expect: { prev_exact: true, flags: [], checks_failed: [] } });
S('e02_detail_one_column', 'Page 2 (how your bill was computed)', 'Page 2 entirely in the left column; Energy Bill Amount in the right.', { detail: true, leftRows: 999, expect: { flags: [], checks_failed: [] } });
S('e03_detail_credits', 'Page 2 (how your bill was computed)', 'Applied Credits with two deposit-refund lines after Total Energy Amount.', { detail: true, credits: [{ label: 'Bill Deposit Refund', amount: -120 }, { label: 'Interest Refund', amount: -30.5 }], expect: { flags: [], checks_failed: [] } });
S('e04_detail_energy_tax', 'Page 2 (how your bill was computed)', 'Energy tax on kWh above 650 (780 kWh) and a printed VAT Zero Rated row.', { detail: true, kwh: 780, scale: 3.2, zeroRated: true, expect: { flags: [], checks_failed: [] } });
S('e05_detail_gea_and_april', 'Page 2 (how your bill was computed)', 'April 2026: GEA-All is non-zero (a printed group header) and there is no ancillary or AWAT 2 column yet.', { end: '2026-04-14', detail: true, expect: { flags: [], checks_failed: [], rate_month: '2026-04' } });
S('e06_detail_values_offset', 'Page 2 (how your bill was computed)', 'Numbers printed 4 points below their labels, as on some real statements: the parser joins them.', { detail: true, valueOffset: 4, expect: { flags: [], checks_failed: [] } });
S('e07_part_payment', 'Page 2 (how your bill was computed)', 'Last month only part-paid: the "what you\'ve paid" amount is not taken as last month\'s bill (estimated from rates instead).', { detail: true, paid: 'part', expect: { prev_exact: false, flags: [] } });
S('e08_last_year_cell_wrong', 'Page 2 (how your bill was computed)', "The tracker's last-year cell for this month holds this year's value (seen on real bills): corrected from the printed % vs last year.", { detail: true, lyCellWrong: true, expect: { flags: [] } });
S('e09_senior_zero_group', 'Page 2 (how your bill was computed)', 'Senior Citizen group nets to 0.00 and is printed without its header.', { detail: true, price: { seniorZero: true }, expect: { flags: [] } });

// F. page 2 that does not add up (each breaks one thing the bill spec checks)
const F = (id, covers, doctor, expect, p = {}) => S(id, 'Page 2: wrong numbers', covers, { detail: true, doctor, expect: { route: 'meralco', ...expect }, ...p });
F('f01_line_amount_wrong', 'Generation Charge amount is P10 off base x price (line_amounts, group_sums).', P => bump(P, 'generation_charge', 10), { checks_has: ['line_amounts', 'group_sums'] });
F('f02_kwh_base_wrong', 'System Loss is billed on 10% more kWh than Actual Consumption (kwh_bases).', P => { const l = P.ln('system_loss_charge'); l.base = Math.round(l.base * 1.1); l.amount = r2(l.base * l.price); P.g('system_loss').amount = l.amount; }, { checks_has: ['kwh_bases'] });
F('f03_vat_base_wrong', 'VAT on Distribution is charged on a base P60 above the Distribution group (percent_bases).', P => { const l = P.ln('vat_distribution'); l.base = r2(l.base + 60); l.amount = r2(l.base * l.price / 100); }, { checks_has: ['percent_bases'] });
F('f04_lft_base_wrong', 'Local franchise tax base differs from VAT Sales + RPT (lft_base).', P => { const l = P.ln('lft'); l.base = r2(l.base + 80); l.amount = r2(l.base * l.price / 100); }, { checks_has: ['lft_base'] });
F('f05_energy_tax_base_wrong', 'Energy tax charged on all kWh above 0 instead of above 650 (energy_tax_base).', P => { const l = P.ln('energy_tax'); l.base = 780; l.amount = r2(l.base * l.price); }, { checks_has: ['energy_tax_base'] }, { kwh: 780, scale: 3.2 });
F('f06_summary_vs_detail', 'Page 1 shows a different Distribution amount than page 2 (summary_matches_detail).', P => { P.charges[3].amount = r2(P.charges[3].amount + 35); refit(P); }, { checks_has: ['summary_matches_detail'] });
F('f07_percent_wrong', 'A group\'s printed percent of the energy amount is wrong (group_percents).', P => { P.g('generation').pct = r2(P.g('generation').pct - 3); }, { checks_has: ['group_percents'] });
F('f08_total_energy_wrong', 'Total Energy Amount and the charges line are both P75 too high, page 1 agrees with itself (total_energy_amount, charges_total).', P => { P.E.total = r2(P.E.total + 75); }, { checks_has: ['total_energy_amount', 'rate_this_month', 'charges_total'] });
F('f09_vat_total_wrong', 'The VAT lines add up to P20 less than the printed VAT Sales VAT (vat_total).', P => { P.E.vat_sales_vat = r2(P.E.vat_sales_vat + 20); }, { checks_has: ['vat_total'] });
F('f10_stats_wrong', 'Printed kWh vs previous period, % vs last year, daily average, rate and CO2 are all off (vs_previous, vs_last_year_pct, avg_daily, rate_this_month, ghg).', P => { P.vsPrev.kwh += 30; P.vsLY.pct += 15; P.avgDaily += 2; P.avgCost += 9; P.rate += 0.4; P.ghg += 0.01; }, { checks_has: ['rate_this_month', 'vs_previous', 'vs_last_year_pct', 'avg_daily', 'ghg'] });

F('f11_credit_lines_wrong', 'The credit lines add up to P15 more than the printed Applied Credits (credits).', P => { P.credits[0].amount = r2(P.credits[0].amount - 15); }, { checks_has: ['credits'] }, { credits: [{ label: 'Bill Deposit Refund', amount: -120 }, { label: 'Interest Refund', amount: -30.5 }] });

// G. a file the app must refuse politely
S('g01_scanned_no_text', 'Bad inputs', 'A PDF with no selectable text (scanned image): "Use Scan a paper bill instead".', { blank: true, expect: { stage: 'pdf', error: /no selectable text/ } });
S('g02_not_a_bill', 'Bad inputs', 'A PDF with text that is not a Meralco bill.', { notABill: true, expect: { stage: 'not_a_bill' } });
S('g03_missing_kwh', 'Bad inputs', 'No readings and no Actual Consumption: the confirm screen asks for the kWh instead of analysing.', { noKwh: true, noReadings: true, expect: { stage: 'confirm' } });

// ---------------------------------------------------------------- run
const T = temps(JSON.parse(readFileSync('www/data/weather.json', 'utf8')));
mkdirSync('www/data/fixtures/scenarios', { recursive: true });

const HAS = { checks_has: 'checks_failed', flags_has: 'flags', nothing_has: 'flags_if_nothing_changed' }; // "includes", for expectations that name only what matters
const deepIncludes = (obs, exp) => Object.entries(exp).flatMap(([k, v]) => {
  if (HAS[k]) { const miss = v.filter(x => !(obs[HAS[k]] ?? []).includes(x)); return miss.length ? [`${HAS[k]} lacks ${miss.join(', ')}: ${JSON.stringify(obs[HAS[k]])}`] : []; }
  const o = obs[k];
  if (v instanceof RegExp) return v.test(o ?? '') ? [] : [`${k}: ${o} !~ ${v}`];
  if (Array.isArray(v)) return JSON.stringify(o) === JSON.stringify(v) ? [] : [`${k}: ${JSON.stringify(o)} != ${JSON.stringify(v)}`];
  return o === v ? [] : [`${k}: ${JSON.stringify(o)} != ${JSON.stringify(v)}`];
});
const flat = o => ({ ...o, ...(o.checks ? { checks_failed: o.checks.failed } : {}) });

const catalogue = [], bills = {};
let bad = 0;
for (const [idx, sc] of SC.entries()) {
  if (sc.price?.genOverride) sc.price = { ...sc.price, scaleGen: 1.5 };
  const P = await compose(sc, T, idx);
  if (sc.zeroRated) P.E.vat_zero_rated = 0;
  sc.doctor?.(P);
  let bytes = await render(P, sc);
  if (sc.paid) { // size the payment from the estimate the explainer will make, then print the page again
    const first = await readPdfSafe(bytes);
    const est = first?.est ?? P.chargesTotal * 0.97, prev = P.periodOf(-2);
    P.payments = [{ period: `${short(prev.start)}-${short(prev.end)} ${new Date(prev.end).getUTCFullYear()}`, posted: human(prev.end + 4 * DAY), amount: r2(sc.paid === 'exact' ? est : est * 0.5) }];
    bytes = await render(P, sc);
  }
  writeFileSync(`www/data/fixtures/scenarios/${sc.id}.pdf`, bytes);
  const observed = await analyse(bytes);
  const problems = sc.expect ? deepIncludes(flat(observed), sc.expect) : [];
  if (problems.length) { bad++; console.error(`MISMATCH ${sc.id}:\n  ${problems.join('\n  ')}\n  observed: ${JSON.stringify(observed)}`); }
  const { doctor, tweakTracker, perDay, expect, ...rest } = sc;
  catalogue.push({ id: sc.id, group: sc.group, covers: sc.covers, file: `scenarios/${sc.id}.pdf`, expect: Object.fromEntries(Object.entries(expect ?? {}).map(([k, v]) => [k, v instanceof RegExp ? { regex: v.source } : v])), observed });
  bills[sc.id] = { P, bytes, observed };
}

// An estimate of last month's bill, as the explainer makes it, for sizing the "what you've paid" row.
async function readPdfSafe(bytes) {
  try { const bill = await readPdf(bytes); return { est: analyseBill(bill).r.est_prev_bill }; } catch { return null; }
}

// ---------------------------------------------------------------- dispute files for the dashboard
const packets = [];
const base = async id => { const bill = await readPdf(bills[id].bytes); return { bill, a: analyseBill(bill) }; };
async function packet(id, answers, extra = {}, i = packets.length) {
  const { bill, a } = await base(id), flags = analyseBill(bill, answers).flags;
  packets.push({ ...disputePacket({ bill, checks: a.checks, flags, answers, r: a.r, rates }), created: new Date(Date.UTC(2026, 10, 2, 8 + i)).toISOString(), ...extra });
}
for (const sc of SC) { // every scenario that raises a flag becomes a case (the household said "nothing changed")
  const o = bills[sc.id].observed;
  if (o.stage === 'result' && o.flags.length) await packet(sc.id, { keys: ['nothing'] });
}
await packet('b11_big_unexplained_rise', { keys: ['nothing'] });
await packet('b11_big_unexplained_rise', { keys: ['appliance', 'aircon'], note: 'Bought a 2 hp inverter aircon in September.', gadgets: [{ name: 'aircon', count: 1, watts: 1500, hours: 8, new: true, kwh: 360 }], added_kwh: 360, parser: 'rules' }, {}); // explained: no unexplained flag
await packet('a01_clean_tier_a', { keys: [], unanswered: ['paano magbayad sa GCash?'] });
await packet('a01_clean_tier_a', { keys: [] }, { status: 'resolved', reply: 'Thank you. The chatbot answer was correct; no meter check needed.' });
await packet('b07_spike', { keys: ['people'], note: 'Relatives stayed for two weeks.' }, { route_override: 'meralco' });
packets.forEach((p, i) => (p.bill.source = 'synthetic', p.created = new Date(Date.UTC(2026, 10, 2, 8 + (i % 14), i)).toISOString()));
// one case per bill: later duplicates (same CAN and period) would replace earlier ones on the dashboard
const seen = new Set(), uniq = packets.filter(p => { const k = `${p.customer_account_number}|${p.bill.period_end}`; return seen.has(k) ? false : (seen.add(k), true); });
// the extra answer variants use their own CANs so every variant is a separate case
[...packets.filter(p => !uniq.includes(p))].forEach((p, i) => { p.customer_account_number = String(5500009000 + i); uniq.push(p); });

writeFileSync('www/data/fixtures/SYNTHETIC_scenarios.json', JSON.stringify({ note: 'SYNTHETIC scenario bills: invented households, real Meralco rates and weather. `observed` is what the app does with the PDF (see scripts/scenario_lib.mjs).', scenarios: catalogue }, null, 1));
writeFileSync('www/data/fixtures/SYNTHETIC_scenario_packets.json', JSON.stringify(uniq, null, 1));
console.log(`${SC.length} scenario bills written (${bad} unexpected results); ${uniq.length} dispute files`);
process.exit(bad ? 1 : 0);
