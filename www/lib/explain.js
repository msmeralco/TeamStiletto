// Rate lookup (rates.json, from Meralco's published tables) + a peso breakdown that adds up exactly.
const months = rates => Object.keys(rates).sort();
const LABEL = {
  generation: 'the generation charge', transmission: 'the transmission charge', ancillary: 'the ancillary service charge',
  system_loss: 'the system loss charge', distribution: 'the distribution charge', supply: 'the supply charge', metering: 'the metering charge',
  awat_1: 'AWAT refund 1', awat_2: 'AWAT refund 2', reg_reset: 'regulatory reset fees', lifeline_rate_adj: 'the lifeline rate adjustment',
  senior_subsidy: 'the senior citizen subsidy', rpt: 'the RPT charge', rpt_adj: 'the RPT adjustment', lft: 'local franchise tax',
  lft_adj: 'the LFT adjustment', vat: 'VAT', energy_tax: 'energy tax', universal: 'universal charges', fit_all: 'FIT-All',
  gea_all: 'GEA-All', lifeline_discount: 'the lifeline discount', lifeline_subsidy: 'the lifeline subsidy',
  power_act_reduction: 'the Power Act reduction',
};

// Meralco prices all of a month's kWh at its bracket's rate (distribution steps at 200/300/400 kWh) and the table has a row at
// each bracket's top, so take the first row at or above the kWh; never interpolate across a bracket. VAT, LFT and energy tax
// per kWh in that row are computed at the row's kWh; the small difference lands in "local tax and rounding".
// shortcut: lifeline rows (<=100 kWh, registered households only) are not used; add them when a lifeline bill is in the corpus.
export function lookup(rates, month, kwh) {
  const rows = rates[month].non_lifeline, ks = Object.keys(rows).map(Number).sort((a, b) => a - b);
  return { ...rows[ks.find(k => k >= kwh) ?? ks.at(-1)] };
}

// Every row: per-kWh components + fixed ₱/month spread over its kWh = printed total.
export const validateRates = rates => months(rates).flatMap(m => ['non_lifeline', 'lifeline'].flatMap(t =>
  Object.entries(rates[m][t] ?? {}).flatMap(([kwh, r]) => {
    const s = Object.entries(r).reduce((a, [k, v]) => (k === 'total' ? a : a + v), fixedSum(rates, m) / kwh);
    return r.total && Math.abs(s - r.total) > 0.0005 ? [`${m} ${t} @ ${kwh} kWh: components ${s.toFixed(4)} != total ${r.total}`] : [];
  })));

export function detectRateMonth(rates, bill) {
  const g = bill.charges.find(c => c.key === 'generation');
  if (!g) throw new Error('No generation charge found on the bill, so the rate month cannot be detected.');
  const perKwh = g.amount_php / bill.kwh, gap = m => Math.abs(lookup(rates, m, bill.kwh).generation - perKwh);
  const month = months(rates).sort((a, b) => gap(a) - gap(b))[0];
  if (gap(month) > 0.01) throw new Error(`No Meralco rate table matches this bill (generation ₱${perKwh.toFixed(4)}/kWh). ` +
    `rates.json has ${months(rates)[0]} to ${months(rates).at(-1)}; add this month's "Residential Bills at Typical Consumption Levels" PDF.`);
  return { month, matchesDates: month === bill.period_end?.slice(0, 7) };
}

export function usableReason(x) {
  try { return x?.text && x.date && /(^|\.)meralco\.com\.ph$/.test(new URL(x.url).hostname) ? x : null; } catch { return null; }
}

const fixedSum = (rates, m) => Object.values(rates[m].fixed ?? {}).reduce((a, v) => a + v, 0);

export function explain(bill, per, f, T, cdd, rates, reasons = {}) {
  const { month: m1, matchesDates } = detectRateMonth(rates, bill);
  const m0 = months(rates)[months(rates).indexOf(m1) - 1];
  if (!m0) throw new Error(`rates.json has no month before ${m1}. Add last month's Meralco rate PDF.`);
  const prev = per.at(-2);
  if (!prev) throw new Error('The bill needs at least two tracker months.');
  const q0 = prev.kwh, d0 = prev.days, q1 = bill.kwh, d1 = bill.days;
  const r0 = lookup(rates, m0, q0), r1 = lookup(rates, m1, q1), F0 = fixedSum(rates, m0), F1 = fixedSum(rates, m1);
  // Meralco adds/splits columns between months (e.g. ancillary split from transmission in Sep 2026): missing = 0.
  const comps = [...new Set([...Object.keys(r0), ...Object.keys(r1)])].filter(k => k !== 'total');
  comps.forEach(k => { r0[k] ??= 0; r1[k] ??= 0; });
  const estPrev = comps.reduce((s, k) => s + r0[k] * q0, 0) + F0;
  const change = bill.charges_this_period - estPrev, R0 = r0.total, usage = (q1 - q0) * R0;
  const src0 = `rates.json ${m0} @ ${Math.round(q0)} kWh`, src1 = `rates.json ${m1} vs ${m0} @ ${Math.round(q1)} kWh`;
  const items = [];
  if (f.tier === 'C_refused') {
    items.push({ key: 'usage', label: "a change in your usage (we can't separate weather reliably for this household)", php: usage, source: src0 });
  } else {
    const cur = { start: Date.parse(bill.period_start), end: Date.parse(bill.period_end) };
    const dCdd = cdd(cur, f.balance_point_c, T) - cdd(prev, f.balance_point_c, T);
    const days = f.baseload_kwh_per_day * (d1 - d0) * R0, weather = f.cooling_slope_kwh_per_cdd * dCdd * R0;
    const src = `model tier ${f.tier[0]}, ${src0}`;
    items.push(
      { key: 'weather', label: dCdd >= 0 ? 'a hotter month' : 'a cooler month', php: weather, source: src },
      { key: 'billing_days', label: d1 >= d0 ? 'a longer billing period' : 'a shorter billing period', php: days, source: src },
      { key: 'you', label: 'your own usage', php: usage - days - weather, source: src });
  }
  // Refund lines (AWAT) are rate columns, so each shows as its own item here.
  for (const k of comps) items.push({ key: k, label: LABEL[k] ?? k, php: (r1[k] - r0[k]) * q1, source: src1 });
  items.push({ key: 'fixed', label: 'fixed monthly charges', php: F1 - F0, source: src1 });
  const residual = change - items.reduce((s, i) => s + i.php, 0);
  items.push({ key: 'local_tax_rounding', label: 'local tax and rounding', php: residual, source: 'bill minus rates.json' });

  const peso = v => `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
  const top = [...items].sort((a, b) => Math.abs(b.php) - Math.abs(a.php)).slice(0, 3);
  const rest = change - top.reduce((s, i) => s + i.php, 0);
  let sentence = `Your bill ${change >= 0 ? 'rose' : 'fell'} ${peso(Math.abs(change))}. ` +
    top.map(i => `${peso(i.php)} was ${i.label}`).join(', ') + `, and ${peso(rest)} was everything else.`;
  // Spec 4.5 gate: quote Meralco only with text, date and a meralco.com.ph link. Shown beside the sentence, not inside it.
  const reason = usableReason(reasons[m1]);

  return {
    bill_change_php: change, est_prev_bill: estPrev, breakdown: items, sentence, reason,
    rate_month: m1, prev_rate_month: m0, rate_month_matches_dates: matchesDates,
    R0, R1: r1.total, F1, warn_residual: Math.abs(residual) > 0.03 * bill.charges_this_period,
  };
}
