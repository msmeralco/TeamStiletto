// Plan section 6 tests. Run: npm test
// SYNTHETIC bills always; the real golden bill too if data/private/golden_bill.pdf exists (gitignored: it has personal data).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLines } from '../www/lib/extract.js';
import { parseBill } from '../www/lib/parse.js';
import { runChecks } from '../www/lib/checks.js';
import { temps, trackerPeriods, fit, cdd, project } from '../www/lib/model.js';
import { explain, validateRates } from '../www/lib/explain.js';
import { solar } from '../www/lib/solar.js';
import { billingFlags, disputeMessage, disputePacket } from '../www/lib/flags.js';

// test_feedback: "nothing changed" + a big unexplained rise flags; an answer that explains it does not
{
  const bill = { period_end: '2026-05-26', kwh: 300, days: 30, charges_this_period: 4500, tracker: [200, 210, 205, 300].map((kwh, i) => ({ month: `2026-0${i + 2}`, kwh })) };
  const r = { est_prev_bill: 3000, breakdown: [{ key: 'usage', php: 1400 }] };
  const keys = a => billingFlags(bill, [], r, a).map(f => f.key);
  assert.ok(keys({ keys: ['nothing'] }).includes('unexplained_increase'));
  assert.ok(!keys({ keys: ['nothing', 'aircon'] }).includes('unexplained_increase'));
  assert.ok(!keys({ keys: [] }).includes('unexplained_increase'), 'no answers, no claim');
  assert.match(disputeMessage(bill, [], { keys: ['away'], note: 'house empty 2 weeks' }), /my answers\):\n- We were away or home less\n- house empty 2 weeks/);
}

const json = p => JSON.parse(readFileSync(p, 'utf8'));
const rates = json('www/data/rates.json'), T = temps(json('www/data/weather.json')), truth = json('tests/SYNTHETIC_truth.json');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const readBill = async f => parseBill(await pdfLines(pdfjs, new Uint8Array(readFileSync(f))));
const FIELDS = ['can', 'period_start', 'period_end', 'days', 'kwh', 'previous_reading', 'current_reading', 'multiplier', 'charges_this_period', 'remaining_balance', 'installment_due', 'total_amount_due'];

// test_rates
assert.deepEqual(validateRates(rates), []);
assert.equal(rates['2026-09'].non_lifeline[200].total, 14.7424); // plan's known value
assert.equal(rates['2026-10'].non_lifeline[200].total, 15.0615);
assert.equal(rates['2026-05'].non_lifeline[200].generation, 8.7942); // = May 2026 generation-charge breakdown PDF

function analyse(name, bill) {
  // test_checks
  assert.ok(runChecks(bill).every(c => c.passed), `${name} checks green`);
  const bad = runChecks({ ...bill, kwh: bill.kwh + 50 }).filter(c => !c.passed).map(c => c.name);
  assert.deepEqual(bad, ['readings', 'tracker_latest']);
  const per = trackerPeriods(bill.tracker, bill.period_end), f = fit(per, T);
  const r = explain(bill, per, f, T, cdd, rates);
  // test_explain
  near(r.breakdown.reduce((s, i) => s + i.php, 0), r.bill_change_php, 1, `${name} breakdown sums to change`);
  const pr = project(per, T, f, r.R1, r.F1), sol = solar(bill, bill.tracker);
  assert.ok(sol.every(s => s.payback > 0 && isFinite(s.payback)));
  // test_flags: a clean bill raises none; a doctored one raises each kind
  assert.deepEqual(billingFlags(bill, runChecks(bill), r), [], `${name} clean bill has no flags`);
  const prevMonth = bill.tracker.at(-2).month;
  const doctored = { ...bill, kwh: bill.kwh * 3, days: 40, tracker: bill.tracker.map(t => ({ ...t, kwh: t.month === prevMonth ? 0 : t.kwh })) };
  const keys = billingFlags(doctored, runChecks(doctored), { ...r, warn_residual: true }).map(x => x.key);
  assert.deepEqual(keys, ['readings', 'tracker_latest', 'missed_reading', 'spike', 'long_period', 'rate_mismatch']);
  assert.match(disputeMessage(doctored, billingFlags(doctored, runChecks(doctored), r)), /Customer Account Number \d+/);
  // test_packet: strongest flag sets the strength; packet survives JSON and carries the evidence
  const dChecks = runChecks(doctored), dFlags = billingFlags(doctored, dChecks, r, { keys: ['nothing'] });
  const p = JSON.parse(JSON.stringify(disputePacket({ bill: doctored, checks: dChecks, flags: dFlags, answers: { keys: ['nothing'], note: ' ' }, r, rates })));
  assert.equal(p.strength, 'strong');
  assert.equal(p.customer_account_number, bill.can);
  assert.deepEqual(p.checks.filter(c => !c.passed).map(c => c.name), ['readings', 'tracker_latest']);
  assert.deepEqual(p.household_answers, { changes: ['Nothing changed at home'], note: null, gadgets: [], added_kwh: null });
  assert.ok(p.rates.sources.every(s => s.startsWith('https://www.meralco.com.ph/')));
  const weakOnly = billingFlags({ ...bill, days: 40 }, runChecks(bill), r);
  assert.equal(disputePacket({ bill, checks: runChecks(bill), flags: weakOnly, answers: { keys: [] }, r, rates }).strength, 'weak');
  console.log(`${name}: tier ${f.tier} (${f.reason}) rates ${r.prev_rate_month}->${r.rate_month}${r.warn_residual ? ' RESIDUAL>3%' : ''}\n  ${r.sentence}\n  next: ${pr.mid ? Math.round(pr.mid) : pr.label}  payback ${sol.map(s => s.payback.toFixed(1)).join(' / ')} yrs`);
  return { f, r };
}

for (const name of ['good', 'weak']) {
  // test_parse
  const bill = await readBill(`www/data/fixtures/${name === 'good' ? 'SYNTHETIC_bill' : 'SYNTHETIC_weak_bill'}.pdf`), t = truth[name];
  for (const k of [...FIELDS, 'source']) assert.equal(bill[k], t[k], `${name}.${k}`);
  assert.deepEqual(bill.tracker, t.tracker, `${name}.tracker`);
  assert.deepEqual(bill.charges.map(c => [c.key, c.amount_php]), t.charges.map(c => [c.key, c.amount_php]), `${name}.charges`);
  const { f, r } = analyse(name, bill);
  assert.ok(!r.warn_residual, `${name} residual under 3%`);
  // test_model
  if (name === 'good') {
    assert.equal(f.tier, 'A_3pc', f.reason);
    const p = truth.params;
    near(f.baseload_kwh_per_day, p.b0, p.b0 * 0.1, 'baseload');
    near(f.cooling_slope_kwh_per_cdd, p.b1, p.b1 * 0.1, 'slope');
    near(f.balance_point_c, p.bp, p.bp * 0.1, 'balance point');
  } else assert.equal(f.tier, 'C_refused', `pure noise should refuse: ${f.reason}`);
}

if (existsSync('data/private/golden_bill.pdf')) {
  const bill = await readBill('data/private/golden_bill.pdf'), g = json('data/private/golden_expected.json');
  for (const k of FIELDS) assert.equal(bill[k], g[k], `golden.${k}`);
  assert.deepEqual(bill.tracker.map(t => t.kwh), g.tracker, 'golden.tracker');
  assert.deepEqual(bill.charges.map(c => c.amount_php), g.charges, 'golden.charges');
  analyse('golden (real bill)', bill);
} else console.log('golden bill not present (data/private/golden_bill.pdf); skipped');
console.log('selfcheck OK');

// test_disputes: follow-up math and the ERC escalation carry the Meralco reference and the evidence
{
  const { daysSince, ercMessage, ercPacket } = await import('../www/lib/disputes.js');
  const now = new Date(2026, 5, 20);
  assert.equal(daysSince('2026-06-06', now), 14);
  const x = { sent: '2026-06-06', channel: 'My Meralco app', ref: 'REF-123', packet: {
    customer_account_number: '0012345678', bill: { period_start: '2026-04-27', period_end: '2026-05-26' },
    flags: [{ key: 'readings', text: 'Meter readings do not match.' }], household_answers: { changes: ['Nothing changed at home'], note: null } } };
  const m = ercMessage(x, now);
  for (const s of ['0012345678', 'REF-123', 'After 14 days', '- Meter readings do not match.', 'Nothing changed at home']) assert.ok(m.includes(s), s);
  assert.deepEqual(ercPacket(x, now).meralco_follow_up, { sent: '2026-06-06', channel: 'My Meralco app', reference: 'REF-123', days_waiting: 14 });
}
console.log('disputes OK');

// test_dashboard_samples: the sample dispute files cover every strength and an ERC escalation
{
  const p = json('www/data/fixtures/SYNTHETIC_packets.json');
  assert.ok(p.every(x => x.format === 'tanaw-dispute/1' && x.bill.source === 'synthetic'));
  assert.deepEqual([...new Set(p.map(x => x.strength))].sort(), ['medium', 'strong', 'weak']);
  assert.ok(p.some(x => x.meralco_follow_up?.reference));
}
console.log('dashboard samples OK');

// test_bracket_lookup: 250 kWh is billed at the 201-300 bracket's distribution rate, not a blend of 200 and 300
{
  const { lookup } = await import('../www/lib/explain.js');
  assert.equal(lookup(rates, '2026-10', 250).distribution, rates['2026-10'].non_lifeline[300].distribution);
  assert.equal(lookup(rates, '2026-10', 200).distribution, rates['2026-10'].non_lifeline[200].distribution);
  assert.equal(lookup(rates, '2026-10', 9999).total, rates['2026-10'].non_lifeline[5000].total);
}
console.log('bracket lookup OK');

// test_chat: Taglish/English answers map to the same keys the checkboxes used; priced gadgets decide the unexplained-rise flag
{
  const { understand, step, startChat, answersOf } = await import('../www/lib/chat.js');
  const { householdExplains } = await import('../www/lib/flags.js');
  const k = t => understand(t).keys.join();
  assert.equal(k('bumili kami ng bagong aircon'), 'appliance');
  assert.equal(k('Nag-WFH ako tsaka may bisita kami'), 'people');
  assert.equal(k('wala kami sa bahay ng 2 weeks, umuwi kami ng probinsya'), 'away');
  assert.equal(k('wala'), 'nothing');
  assert.equal(k('Nothing changed'), 'nothing');
  assert.equal(k('mainit kasi kaya lagi naka aircon'), 'aircon');
  assert.equal(k('nagcha-charge ng e-bike gabi-gabi'), 'business');
  assert.equal(k('bakit may refund?'), '', '"refund" is not a ref(rigerator)');
  const ac = understand('dalawang bagong aircon 1.5 hp inverter').gadgets[0];
  assert.deepEqual([ac.count, ac.watts, ac.new], [2, 810, true]);

  const ctx = { sentence: 'Your bill rose ₱900.', reason: { date: '2026-10-13', text: 'Generation went up.', sections: [{ paragraphs: ['WESM charges went up due to tight supply.'] }] }, days: 30, unexplained_kwh: 300 };
  const chat = msgs => msgs.reduce(({ state }, t) => step(state, t, ctx), { state: startChat() });
  const q = chat(['ano ang WESM?']);
  assert.match(q.reply, /WESM charges went up/);
  assert.equal(q.state.keys.length, 0, 'a question is not an answer');
  const done = chat(['bumili kami ng ref', '24', 'wala']).state;
  assert.equal(done.ask, 'done');
  const a = answersOf(done, 30);
  assert.deepEqual([a.keys, a.added_kwh], [['appliance'], 43]); // 60 W × 24 h × 30 days
  assert.ok(!householdExplains({ kwh: 300 }, a), 'a new ref (43 kWh) does not explain a 300 kWh rise');
  assert.ok(householdExplains({ kwh: 60 }, a));
  assert.ok(householdExplains({ kwh: 300 }, answersOf(chat(['may bisita kami', 'wala']).state, 30)), 'unpriced answer keeps the old rule');
  assert.equal(chat(['wala kami sa bahay', 'wala']).state.keys.join(), 'away');
  assert.equal(answersOf(chat(['bumili kami ng aircon', '8', 'yung aircon pala 10 hours', 'wala']).state, 30).gadgets.length, 1, 'no double count');
}
console.log('chat OK');

// test_reasons: Meralco advisories are quoted only with text, date and a meralco.com.ph link
{
  const { usableReason } = await import('../www/lib/explain.js');
  const ok = { date: '2026-10-13', text: 'x', url: 'https://www.meralco.com.ph/media/articles/a' };
  assert.equal(usableReason(ok), ok);
  for (const bad of [{ ...ok, url: 'https://meralco.com.ph.evil.com/a' }, { ...ok, text: '' }, { ...ok, url: 'nope' }, undefined])
    assert.equal(usableReason(bad), null, JSON.stringify(bad));
  const reasons = json('www/data/reasons.json');
  for (const m of Object.keys(rates)) assert.ok(usableReason(reasons[m]), `reasons.json has no usable advisory for ${m}; run npm run advisories`);
}
console.log('reasons OK');

// test_pwa: every file the service worker precaches exists (one missing file breaks offline install), and the lib list is complete
{
  const sw = readFileSync('www/sw.js', 'utf8'), files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of files) assert.ok(existsSync(`www/${f}`), `sw.js precaches missing file ${f}`);
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync('www/lib')) assert.ok(files.includes(`lib/${f}`), `sw.js does not precache lib/${f}`);
}
console.log('pwa OK');
