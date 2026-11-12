// Does the bill's own arithmetic add up? Only numbers printed on the bill: no rate table, no weather, no model.
// Summary checks (page 1) always run. Detail checks (page 2, listed in data/bill_spec.json) run when the PDF had page 2
// and the spec is passed; each one that cannot run (a number was not read) is left out, never guessed.
const check = (name, expected, found, fields) => ({ name, expected, found, passed: Math.abs(expected - found) <= 1, fields });
const r2 = x => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100, sum = a => a.reduce((s, x) => s + x, 0), has = (...v) => v.every(x => typeof x === 'number' && isFinite(x));

// What stops the analysis before it starts: plain sentences for the customer, empty when the confirmed numbers can be analysed.
// A field the customer cleared or mistyped is NaN; without this it reaches the result as "₱NaN" or a misleading rate-table error.
const OPTIONAL = [['previous_reading', 'Previous Reading'], ['current_reading', 'Current Reading'], ['multiplier', 'Multiplier'],
  ['remaining_balance', 'Remaining Balance'], ['installment_due', 'Installment Due'], ['total_amount_due', 'Total Amount Due']];
export function billProblems(b) {
  const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)), out = [];
  if (!date(b.period_start) || !date(b.period_end)) out.push('Enter the billing period start and end dates.');
  else if (Date.parse(b.period_end) < Date.parse(b.period_start)) out.push('The billing period ends before it starts: check the two dates.');
  if (!(has(b.kwh) && b.kwh > 0)) out.push('Enter the kWh used (more than 0).');
  if (!(has(b.charges_this_period) && b.charges_this_period > 0)) out.push('Enter "Charges for this billing period" (more than 0).');
  const blank = [...OPTIONAL.filter(([k]) => b[k] != null && !has(b[k])).map(([, l]) => l), ...(b.charges ?? []).filter(c => !has(c.amount_php)).map(c => c.label)];
  if (blank.length) out.push(`Enter a number (0 if none) for: ${blank.join(', ')}.`);
  return out;
}

export function runChecks(b, spec = null) {
  const s = b.charges.reduce((s, c) => s + c.amount_php, 0);
  return [
    check('readings', (b.current_reading - b.previous_reading) * b.multiplier, b.kwh, ['previous_reading', 'current_reading', 'multiplier', 'kwh']),
    check('tracker_latest', b.tracker.at(-1)?.kwh ?? NaN, b.kwh, ['tracker', 'kwh']),
    check('line_sum', s, b.charges_this_period, ['charges', 'charges_this_period']),
    check('total', b.remaining_balance + b.charges_this_period + b.installment_due, b.total_amount_due,
      ['remaining_balance', 'charges_this_period', 'installment_due', 'total_amount_due']),
    ...(spec && b.detail ? detailChecks(b, spec) : []),
  ];
}

// One result per spec check: { name, formula, passed, n (comparisons made), fails: [{ what, expected, found }], expected, found }.
export function detailChecks(b, spec) {
  const D = b.detail, E = D.energy, TOL = spec.tolerance_php, g = k => D.groups.find(x => x.key === k), ln = (gk, k) => g(gk)?.lines.find(l => l.key === k);
  const all = D.groups.flatMap(x => x.lines.map(l => ({ ...l, group: x.key }))), vat = all.filter(l => l.key.startsWith('vat_'));
  const k = b.tracker.map(t => t.kwh), credits = D.applied_credits ?? 0;
  let rows;
  const eq = (what, expected, found, tol = TOL) => { if (has(expected, found)) rows.push({ what, expected, found, ok: Math.abs(expected - found) <= tol + 1e-9 }); };
  const taxed = { vat_generation: () => g('generation')?.amount, vat_transmission: () => ln('transmission', 'transmission_charge')?.amount,
    vat_ancillary: () => ln('transmission', 'ancillary_service')?.amount, vat_system_loss: () => g('system_loss')?.amount,
    vat_distribution: () => g('distribution')?.amount, vat_senior: () => g('senior_citizen')?.amount };
  const CODE = {
    line_amounts: () => all.forEach(l => eq(`${l.label}: ${l.base} x ${l.price}${l.percent ? '%' : ''}`, r2(l.base * l.price / (l.percent ? 100 : 1)), l.amount)),
    kwh_bases: () => all.filter(l => l.basis === 'kwh').forEach(l => eq(`${l.label} kWh`, b.kwh, l.base, 0)),
    percent_bases: () => vat.forEach(l => eq(`${l.label} base`, taxed[l.key]?.(), l.base)),
    lft_base: () => eq('LFT base', r2(E.vat_sales_base + (ln('taxes', 'rpt')?.amount ?? 0) + (ln('taxes', 'rpt_adj')?.amount ?? 0)), ln('taxes', 'lft')?.base),
    energy_tax_base: () => eq('energy tax kWh', Math.min(b.kwh, 1000) - 650, ln('taxes', 'energy_tax')?.base, 0),
    group_sums: () => D.groups.forEach(x => eq(x.label, r2(sum(x.lines.map(l => l.amount))), x.amount)),
    summary_matches_detail: () => D.groups.forEach(x => eq(x.label, x.amount, b.charges.find(c => norm(c.label) === norm(x.label))?.amount_php, 0)),
    group_percents: () => D.groups.forEach(x => eq(`${x.label} %`, r2(100 * x.amount / E.total_energy_amount), x.pct, 0.01)),
    vat_sales_base: () => eq('VAT Sales base', r2(sum(['generation', 'transmission', 'system_loss', 'distribution', 'senior_citizen'].map(x => g(x)?.amount ?? 0))), E.vat_sales_base),
    vat_total: () => eq('VAT', r2(sum(vat.map(l => l.amount))), E.vat_sales_vat),
    non_vat: () => eq('Non-VAT', r2(sum(D.groups.filter(x => !['generation', 'transmission', 'system_loss', 'distribution', 'senior_citizen'].includes(x.key)).map(x => x.amount)) - sum(vat.map(l => l.amount))), E.non_vat),
    total_energy_amount: () => { eq('Total Energy Amount', r2(E.vat_sales_base + E.vat_sales_vat + (E.vat_zero_rated ?? 0) + E.non_vat), E.total_energy_amount);
      eq('sum of the groups', r2(sum(D.groups.map(x => x.amount))), E.total_energy_amount); },
    credits: () => { if (D.adjustments.length || D.applied_credits != null) eq('Applied Credits', r2(sum(D.adjustments.map(a => a.amount))), credits); },
    charges_total: () => eq('Charges for this billing period', r2(E.total_energy_amount + credits), b.charges_this_period),
    rate_this_month: () => eq('PhP per kWh', E.total_energy_amount / b.kwh, b.rate_this_month, 0.005),
    vs_previous: () => eq('kWh vs previous period', b.kwh - k.at(-2), b.vs_previous_kwh, 0),
    vs_last_year_pct: () => eq('% vs same period last year', Math.round(100 * b.vs_last_year_kwh / (b.kwh - b.vs_last_year_kwh)), b.vs_last_year_pct, 1),
    avg_daily: () => { eq(`kWh a day over ${b.days} days`, b.kwh / b.days, b.avg_daily_kwh, 0.06); eq('PhP a day', E.total_energy_amount / b.days, b.avg_daily_cost, 0.6); },
    ghg: () => eq('tCO2', b.kwh * 0.0006935, b.ghg_tco2, 0.00006),
  };
  return spec.checks.filter(c => c.in === 'detail').flatMap(c => {
    if (!CODE[c.name]) throw new Error(`bill_spec.json check "${c.name}" has no code in checks.js`);
    rows = [];
    CODE[c.name]();
    const fails = rows.filter(r => !r.ok).map(({ what, expected, found }) => ({ what, expected, found }));
    return rows.length ? [{ name: c.name, formula: c.formula, detail: true, passed: !fails.length, n: rows.length, fails,
      expected: fails[0]?.expected ?? 0, found: fails[0]?.found ?? 0, fields: [] }] : [];
  });
}
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
