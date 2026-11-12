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

const json = p => JSON.parse(readFileSync(p, 'utf8'));
const rates = json('www/data/rates.json'), T = temps(json('www/data/weather.json')), truth = json('tests/SYNTHETIC_truth.json');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const readBill = async f => parseBill(await pdfLines(pdfjs, new Uint8Array(readFileSync(f))));
const FIELDS = ['period_start', 'period_end', 'days', 'kwh', 'previous_reading', 'current_reading', 'multiplier', 'charges_this_period', 'remaining_balance', 'installment_due', 'total_amount_due'];

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
