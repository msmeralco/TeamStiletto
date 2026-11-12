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

// Items of the breakdown that are about how much electricity was used; every other item is a rate change.
const USAGE_KEYS = ['usage', 'weather', 'billing_days', 'you'];
// Plain names for the rate lines shown to the customer (the full list with sources keeps LABEL).
const PLAIN = { generation: 'generation charge', transmission: 'transmission charges', system_loss: 'system loss charge', distribution: 'distribution charge',
  supply: 'supply charge', metering: 'metering charge', awat_1: 'refund (AWAT 1)', awat_2: 'refund (AWAT 2)', vat: 'VAT', lft: 'local franchise tax',
  universal: 'universal charges', fit_all: 'FIT-All (renewable energy)', fixed: 'fixed monthly charges', local_tax_rounding: 'local tax and rounding' };

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
  let comps = [...new Set([...Object.keys(r0), ...Object.keys(r1)])].filter(k => k !== 'total');
  comps.forEach(k => { r0[k] ??= 0; r1[k] ??= 0; });
  // Ancillary is part of the bill's Transmission group and older tables print the two as one column, so compare them
  // together: otherwise the month the column splits reads as a new charge plus a fake transmission drop.
  if (comps.includes('ancillary')) {
    for (const r of [r0, r1]) { r.transmission = (r.transmission ?? 0) + r.ancillary; delete r.ancillary; }
    comps = comps.filter(k => k !== 'ancillary');
    if (!comps.includes('transmission')) comps.push('transmission');
  }
  const estPrev = comps.reduce((s, k) => s + r0[k] * q0, 0) + F0;
  // Applied Credits (deposit refunds etc.) are not electricity: compare the energy amount, before credits, with last month.
  const credits = bill.charges.find(c => c.key === 'credits')?.amount_php ?? 0, energy = bill.charges_this_period - credits;
  // Last month's real bill, when this bill's "What you've paid" shows it: payments for the period ending the day before this one,
  // accepted only within 1% of the rate-table estimate (a part payment is not the bill).
  const paid = (bill.payments ?? []).filter(p => Date.parse(p.period_end) + 864e5 === Date.parse(bill.period_start)).reduce((s, p) => s + p.amount_php, 0);
  const prevExact = paid > 0 && Math.abs(paid - estPrev) <= 0.01 * estPrev, prevBill = prevExact ? paid : estPrev;
  const change = energy - prevBill, R0 = r0.total, usage = (q1 - q0) * R0;
  const src0 = `rates.json ${m0} @ ${Math.round(q0)} kWh`, src1 = `rates.json ${m1} vs ${m0} @ ${Math.round(q1)} kWh`;
  const items = [];
  if (f.tier === 'C_refused') {
    items.push({ key: 'usage', label: "a change in your usage (we can't separate weather reliably for this household)", say: 'a change in your usage',
      note: " We can't separate weather reliably for this household.", php: usage, source: src0 });
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
  for (const k of comps) items.push({ key: k, label: LABEL[k] ?? k, php: (r1[k] - r0[k]) * q1, from: r0[k], to: r1[k], source: src1 });
  items.push({ key: 'fixed', label: 'fixed monthly charges', php: F1 - F0, source: src1 });
  const residual = change - items.reduce((s, i) => s + i.php, 0);
  items.push({ key: 'local_tax_rounding', label: 'local tax and rounding', php: residual, source: 'bill minus rates.json' });

  // ---------- what the customer sees: one total, two causes (how much they used, Meralco's rates), detail on request ----------
  const peso = (v, d = 0) => `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  const did = v => `${v >= 0 ? 'added' : 'took off'} ${peso(Math.abs(v))}`, cap = s => s[0].toUpperCase() + s.slice(1), total = a => a.reduce((s, i) => s + i.php, 0);
  const usageItems = items.filter(i => USAGE_KEYS.includes(i.key)), rateItems = items.filter(i => !USAGE_KEYS.includes(i.key));
  const usagePhp = total(usageItems), ratesPhp = change - usagePhp, dq = q1 - q0;
  // Per kWh "before" is chosen so that the two prices and the peso figure can never disagree in direction.
  const now = energy / q1, before = now - ratesPhp / q1;
  const verdict = Math.abs(ratesPhp) < 0.01 * energy ? 'About the same' : ratesPhp > 0 ? 'Higher' : 'Lower';
  const big = [...rateItems].sort((a, b) => Math.abs(b.php) - Math.abs(a.php)).filter(i => Math.abs(i.php) >= 50).slice(0, 4);
  const other = ratesPhp - total(big);
  const parts = f.tier === 'C_refused' ? [] : usageItems.filter(i => Math.abs(i.php) >= 0.5).map(i => ({ label: cap(i.label), php: i.php }));
  const summary = {
    prev_bill: prevBill, prev_exact: prevExact, this_bill: energy, credits_php: credits, change,
    usage: { php: usagePhp, kwh_now: q1, kwh_before: q0, parts, note: f.tier === 'C_refused' ? "We can't separate weather reliably for this household." : null },
    rates: { php: ratesPhp, per_kwh_now: now, per_kwh_before: before, verdict,
      lines: [...big.map(i => ({ label: (i.from === 0 && i.to ? 'New ' + (PLAIN[i.key] ?? i.label) : cap(PLAIN[i.key] ?? i.label.replace(/^the /, ''))), php: i.php })),
        ...(Math.abs(other) >= 0.5 ? [{ label: big.length ? 'Everything else' : 'All rate lines together', php: other }] : [])] },
  };
  const sentence = `Your bill ${change >= 0 ? 'rose' : 'fell'} ${peso(Math.abs(change))}, from ${peso(prevBill)} to ${peso(energy)}. ` +
    (dq ? `Using ${Math.abs(Math.round(dq))} kWh ${dq > 0 ? 'more' : 'less'} ${did(usagePhp)}` : 'You used the same kWh as last month') +
    (parts.length ? ` (${parts.map(p => `${p.label.toLowerCase()} ${did(p.php)}`).join(', ')})` : '') +
    `. Meralco's rates ${did(ratesPhp)} (${verdict.toLowerCase()}: ${peso(now, 2)} per kWh now, ${peso(before, 2)} before).` +
    (summary.usage.note ? ` ${summary.usage.note}` : '');
  // Spec 4.5 gate: quote Meralco only with text, date and a meralco.com.ph link. Shown beside the sentence, not inside it.
  const reason = usableReason(reasons[m1]);

  return {
    bill_change_php: change, est_prev_bill: estPrev, breakdown: items, summary, sentence, reason,
    rate_month: m1, prev_rate_month: m0, rate_month_matches_dates: matchesDates,
    R0, R1: r1.total, F1, warn_residual: Math.abs(residual) > 0.03 * energy,
  };
}
