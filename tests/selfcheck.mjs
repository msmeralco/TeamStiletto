// Plan section 6 tests, against SYNTHETIC fixtures until real bills arrive. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// test_rates
assert.deepEqual(validateRates(rates), []);

for (const name of ['good', 'weak']) {
  // test_parse: PDF extraction matches the known values exactly
  const file = name === 'good' ? 'SYNTHETIC_bill' : 'SYNTHETIC_weak_bill';
  const bill = parseBill(await pdfLines(pdfjs, new Uint8Array(readFileSync(`www/data/fixtures/${file}.pdf`))));
  const t = truth[name];
  for (const k of ['period_start', 'period_end', 'days', 'kwh', 'previous_reading', 'current_reading', 'charges_this_period', 'total_amount_due', 'city', 'source'])
    assert.equal(bill[k], t[k], `${name}.${k}`);
  assert.deepEqual(bill.tracker, t.tracker, `${name}.tracker`);
  assert.deepEqual(bill.charges.map(c => [c.key, c.amount_php]), t.charges.map(c => [c.key, c.amount_php]), `${name}.charges`);

  // test_checks
  assert.ok(runChecks(bill).every(c => c.passed), `${name} checks green`);
  const bad = runChecks({ ...bill, kwh: bill.kwh + 50 }).filter(c => !c.passed).map(c => c.name);
  assert.deepEqual(bad, ['readings', 'tracker_latest']);

  // test_model + test_explain
  const per = trackerPeriods(bill.tracker, bill.period_end);
  const f = fit(per, T);
  if (name === 'good') {
    assert.equal(f.tier, 'A_3pc', f.reason);
    const p = truth.params;
    near(f.baseload_kwh_per_day, p.b0, p.b0 * 0.1, 'baseload');
    near(f.cooling_slope_kwh_per_cdd, p.b1, p.b1 * 0.1, 'slope');
    near(f.balance_point_c, p.bp, p.bp * 0.1, 'balance point');
  } else assert.equal(f.tier, 'C_refused', `pure noise should refuse: ${f.reason}`);
  const r = explain(bill, per, f, T, cdd, rates);
  near(r.breakdown.reduce((s, i) => s + i.php, 0), r.bill_change_php, 1, `${name} breakdown sums to change`);
  assert.ok(!r.warn_residual, `${name} residual under 3%`);
  const pr = project(per, T, f, r.R1, r.F1);
  const sol = solar(bill, bill.tracker);
  assert.ok(sol.every(s => s.payback > 0 && isFinite(s.payback)));
  console.log(`${name}: tier ${f.tier}, ${r.sentence}\n  projection ${JSON.stringify(pr)}\n  payback ${sol.map(s => s.payback.toFixed(1)).join(' / ')} yrs`);
}
console.log('selfcheck OK');
