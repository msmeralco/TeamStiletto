// Evidence-only signs that a bill may be wrong. Each flag cites numbers from the bill or rates.json; none is a verdict.
// There is no Meralco API: the user reviews the message and sends it through Meralco's own channels.
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const peso = v => `₱${Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CHECK_TEXT = {
  readings: 'Meter readings do not match the kWh billed (current − previous reading × multiplier)',
  tracker_latest: "This month's bar in the consumption tracker does not match the kWh billed",
  line_sum: 'The charges do not add up to "Charges for this billing period"',
  total: 'Remaining balance + this period + installment do not add up to "Total Amount Due"',
};
// Strong = the bill's own arithmetic or Meralco's published rates disagree; medium = usage evidence; weak = pattern only.
const STRENGTH = { readings: 'strong', tracker_latest: 'strong', line_sum: 'strong', total: 'strong', rate_mismatch: 'strong',
  unexplained_increase: 'medium', missed_reading: 'medium', spike: 'weak', long_period: 'weak' };
const RANK = { weak: 1, medium: 2, strong: 3 };
export const STRENGTH_TEXT = {
  strong: "Strong: the bill's own numbers, or Meralco's published rates, do not add up.",
  medium: 'Medium: your usage evidence points to the reading, not your household.',
  weak: 'Weak: an unusual pattern only. Meralco may find the bill correct.',
};

// "What changed at home?" answers: [key, label, raisesUsage]. Answers go into the message so Meralco sees the household's side.
export const CHANGES = [
  ['nothing', 'Nothing changed at home', false],
  ['away', 'We were away or home less', false],
  ['appliance', 'New or extra appliance (aircon, ref, freezer, etc.)', true],
  ['aircon', 'Used the aircon or fans more', true],
  ['people', 'More people at home (guests, new member, work or school from home)', true],
  ['business', 'Started a home business, or charging an e-bike or EV', true],
];

// Usage change not explained by weather or billing days, as a share of last month's bill, vs this household's own normal swing.
export function unexplainedIncrease(bill, r) {
  const item = r.breakdown.find(i => i.key === 'you' || i.key === 'usage');
  const k = bill.tracker.map(t => t.kwh).slice(-13);
  const swings = k.slice(1).flatMap((v, i) => (k[i] > 0 && v > 0 ? [Math.abs(v - k[i]) / k[i]] : []));
  return { php: item.php, kwh: r.R0 ? item.php / r.R0 : null, share: item.php / r.est_prev_bill,
    limit: Math.max(0.1, 2 * (swings.length ? median(swings) : 0.05)) };
}

// Do the household's answers explain the unexplained rise? With a priced gadget list (chat), it must cover at least half the kWh.
// shortcut: "half" is a judgment call, not a Meralco or ERC rule; tune it against real disputes.
export function householdExplains(u, a) {
  if (!a.keys.some(k => CHANGES.find(c => c[0] === k)?.[2])) return false;
  return a.added_kwh == null || u.kwh == null || a.added_kwh >= 0.5 * u.kwh;
}

export function billingFlags(bill, checks, r, answers = { keys: [] }) {
  // Page-2 checks (checks.js detailChecks) carry their own formula text and the first number that disagrees.
  const flags = checks.filter(c => !c.passed).map(c => (c.detail
    ? { key: c.name, strength: 'strong', text: `The bill's own computation does not add up (${c.formula}). ${c.fails[0].what}: computed ${c.fails[0].expected.toFixed(2)}, the bill shows ${Number(c.fails[0].found).toFixed(2)}.` }
    : { key: c.name, text: `${CHECK_TEXT[c.name]}: expected ${c.expected.toFixed(2)}, the bill shows ${Number(c.found).toFixed(2)}.` }));
  const [y, m] = bill.period_end.split('-').map(Number);
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const prev = bill.tracker.find(t => t.month === prevMonth);
  if (!prev || !prev.kwh) flags.push({ key: 'missed_reading',
    text: `Last month (${prevMonth}) shows ${prev ? '0 kWh' : 'no reading'}. This bill may include usage carried over from a missed or estimated reading.` });
  const past = bill.tracker.slice(-13, -1).map(t => t.kwh).filter(k => k > 0);
  if (past.length >= 6 && bill.kwh > 1.5 * median(past)) flags.push({ key: 'spike',
    text: `${bill.kwh} kWh is ${(bill.kwh / median(past)).toFixed(1)}× your usual ${median(past)} kWh (median of your last ${past.length} months).` });
  if (bill.days > 33) flags.push({ key: 'long_period', text: `This billing period is ${bill.days} days long; Meralco normally bills about every 30 days.` });
  if (r?.warn_residual) {
    const gap = r.breakdown.find(i => i.key === 'local_tax_rounding').php;
    flags.push({ key: 'rate_mismatch', text: `Your charges differ from Meralco's published ${r.rate_month} rates by ${peso(gap)} ` +
      `(${(100 * Math.abs(gap) / bill.charges_this_period).toFixed(1)}%). Local franchise tax explains a little of this; over 3% is worth asking about.` });
  }
  const u = r && unexplainedIncrease(bill, r);
  if (u && answers.keys.length && !householdExplains(u, answers) && u.share > u.limit) flags.push({ key: 'unexplained_increase',
    text: `${peso(u.php)} of the increase (${(100 * u.share).toFixed(0)}% of last month's bill) is not explained by weather, billing days or changes at home ` +
      `(you said: ${answers.keys.map(k => CHANGES.find(c => c[0] === k)[1].toLowerCase()).join('; ')}` +
      (answers.added_kwh != null ? `; new appliances add about ${answers.added_kwh} kWh of the ${Math.round(u.kwh)} kWh rise` : '') +
      `). Your usual month-to-month change is under ${(50 * u.limit).toFixed(0)}%.` });
  // shortcut: an "estimated reading" marker is not detected; add it once a real bill with an estimated reading is seen.
  return flags.map(f => ({ ...f, strength: f.strength ?? STRENGTH[f.key] }));
}

// Machine-readable evidence for Meralco (or the ERC) to triage without re-reading the bill. Nothing is sent: the user shares it.
export function disputePacket({ bill, checks, flags, answers, r, rates }) {
  const u = unexplainedIncrease(bill, r);
  return {
    format: 'tanaw-dispute/1',
    created: new Date().toISOString(),
    strength: flags.reduce((s, f) => (RANK[f.strength] > RANK[s] ? f.strength : s), 'weak'),
    customer_account_number: bill.can,
    bill: Object.fromEntries(['period_start', 'period_end', 'days', 'kwh', 'previous_reading', 'current_reading', 'multiplier',
      'charges_this_period', 'remaining_balance', 'installment_due', 'total_amount_due', 'source'].map(k => [k, bill[k]])),
    charges: bill.charges.map(({ label, amount_php }) => ({ label, amount_php })),
    tracker: bill.tracker,
    checks: checks.map(({ name, passed, expected, found }) => ({ name, passed, expected, found })),
    flags,
    rates: {
      this_month: r.rate_month, last_month: r.prev_rate_month,
      sources: [rates[r.rate_month].source_url, rates[r.prev_rate_month].source_url],
      bill_minus_published_php: r.breakdown.find(i => i.key === 'local_tax_rounding').php,
    },
    usage: { estimated_last_bill_php: r.est_prev_bill, unexplained_change_php: u.php, unexplained_kwh: u.kwh, share_of_last_bill: u.share, household_flag_limit: u.limit },
    household_answers: { changes: answers.keys.map(k => CHANGES.find(c => c[0] === k)[1]), note: answers.note?.trim() || null,
      gadgets: (answers.gadgets ?? []).map(({ name, count, watts, hours, typical_hours, new: isNew, kwh }) => ({ name, count, watts, hours, typical_hours, new: isNew, kwh })),
      added_kwh: answers.added_kwh ?? null, parser: answers.parser ?? 'rules' },
    meralco_advisory: r.reason ? { date: r.reason.date, title: r.reason.title, text: r.reason.text, url: r.reason.url } : null,
    message: disputeMessage(bill, flags, answers),
  };
}

export function disputeMessage(bill, flags, answers = { keys: [] }) {
  const home = answers.keys.map(k => CHANGES.find(c => c[0] === k)[1])
    .concat((answers.gadgets ?? []).filter(g => g.new).map(g => `New: ${g.count > 1 ? g.count + ' × ' : ''}${g.name}, ${g.hours ?? g.typical_hours} h/day, about ${g.kwh} kWh`))
    .concat(answers.note?.trim() || []);
  return [
    'Good day, Meralco.',
    '',
    `I would like to request a review of my bill for ${bill.period_start} to ${bill.period_end}` +
      (bill.can ? ` (Customer Account Number ${bill.can}).` : '.'),
    `Charges for this billing period: ${peso(bill.charges_this_period)}. Consumption: ${bill.kwh} kWh ` +
      `(previous reading ${bill.previous_reading}, current reading ${bill.current_reading}).`,
    '',
    'What I noticed:',
    ...flags.map(f => `- ${f.text}`),
    ...(home.length ? ['', 'Changes at home this period (my answers):', ...home.map(h => `- ${h}`)] : []),
    '',
    'Please recheck the meter reading and the computation, and adjust the bill if there is an error. Thank you.',
  ].join('\n');
}
