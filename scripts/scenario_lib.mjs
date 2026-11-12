// Runs a bill PDF through exactly what the app does (extract -> parse -> confirm-screen checks -> explain -> flags -> routing)
// and returns a small, JSON-safe summary. Used by make_scenarios.mjs (to write expected results) and by tests/selfcheck.mjs.
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLines } from '../www/lib/extract.js';
import { parseBill } from '../www/lib/parse.js';
import { runChecks, billProblems } from '../www/lib/checks.js';
import { temps, trackerPeriods, fit, cdd, project } from '../www/lib/model.js';
import { explain } from '../www/lib/explain.js';
import { solar } from '../www/lib/solar.js';
import { billingFlags } from '../www/lib/flags.js';
import { route } from '../www/lib/disputes.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
export const rates = json('www/data/rates.json'), spec = json('www/data/bill_spec.json'), T = temps(json('www/data/weather.json'));

// pdf.js prints font warnings through console.warn / console.log
const quiet = async fn => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = (...a) => { if (!String(a[0]).startsWith('Warning:')) l(...a); }; try { return await fn(); } finally { console.warn = w; console.log = l; } };

export const readPdf = bytes => quiet(async () => parseBill(await pdfLines(pdfjs, new Uint8Array(bytes), undefined), spec));

// The analysis the result screen runs. Throws what the app would show as an error.
export function analyseBill(bill, answers = { keys: [] }) {
  const checks = runChecks(bill, spec), per = trackerPeriods(bill.tracker, bill.period_end), f = fit(per, T);
  const r = explain(bill, per, f, T, cdd, rates), proj = project(per, T, f, r.R1, r.F1);
  return { checks, per, f, r, proj, flags: billingFlags(bill, checks, r, answers) };
}

const brief = fl => fl.map(f => `${f.key}:${f.strength}`);
const round = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export async function analyse(bytes) {
  const out = {};
  let bill;
  try { bill = await readPdf(bytes); } catch (e) { return { stage: 'pdf', error: e.message }; }
  if (!bill.period_end || bill.charges_this_period == null) return { stage: 'not_a_bill', error: 'does not look like a Meralco bill' };
  out.read = { can: bill.can, period: `${bill.period_start}..${bill.period_end}`, days: bill.days, kwh: bill.kwh, charges: bill.charges_this_period, total_due: bill.total_amount_due,
    tracker_months: bill.tracker.length, page2: !!bill.detail, payments: bill.payments.length, source: bill.source };
  const problems = billProblems(bill);
  if (problems.length) return { ...out, stage: 'confirm', problems };
  const checks = runChecks(bill, spec);
  out.checks = { run: checks.length, failed: checks.filter(c => !c.passed).map(c => c.name) };
  let a;
  try { a = analyseBill(bill); } catch (e) { return { ...out, stage: 'analysis', error: e.message }; }
  const { f, r, proj } = a, nothing = analyseBill(bill, { keys: ['nothing'] }).flags;
  return { ...out, stage: 'result',
    tier: f.tier, n_periods: f.n_periods, rate_month: r.rate_month, rate_month_matches_dates: r.rate_month_matches_dates,
    change_php: round(r.bill_change_php), rates_verdict: r.summary.rates.verdict, prev_exact: r.summary.prev_exact, warn_residual: r.warn_residual,
    flags: brief(a.flags), flags_if_nothing_changed: brief(nothing),
    route: a.flags.length ? route({ flags: a.flags }).to : 'chatbot',
    next_bill: proj.mid != null ? Math.round(proj.mid) : proj.label,
    solar_payback_years: solar(bill, bill.tracker).map(s => round(s.payback, 1)) };
}
