import * as pdfjs from './vendor/pdf.min.mjs';
import { pdfLines } from './lib/extract.js';
import { parseBill } from './lib/parse.js';
import { runChecks } from './lib/checks.js';
import { temps, trackerPeriods, fit, cdd, project } from './lib/model.js';
import { explain, validateRates } from './lib/explain.js';
import { solar, SOLAR } from './lib/solar.js';

pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); // PDF text is untrusted
const peso = v => `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const show = id => ['upload', 'confirm', 'results'].forEach(s => ($('#' + s).hidden = s !== id));
const msg = t => ($('#msg').textContent = t ?? '');

const [rates, weather, reasons] = await Promise.all(['rates', 'weather', 'reasons'].map(n => fetch(`data/${n}.json`).then(r => r.json())));
const T = temps(weather);
const rateErrors = validateRates(rates);
if (rateErrors.length) msg('rates.json failed validation: ' + rateErrors.join('; '));
let bill, bytes, analysis;
const markSynthetic = () => ($('#synthetic').hidden = !(weather.synthetic || Object.values(rates).some(r => r.synthetic) || bill?.source === 'synthetic'));
markSynthetic();

// ---------- 1. upload ----------
async function scan() {
  msg();
  try {
    bill = parseBill(await pdfLines(pdfjs, bytes.slice(), $('#pw').value || undefined));
    $('#pwbox').hidden = true;
    $('#pw').value = '';
    markSynthetic();
    renderConfirm();
    show('confirm');
  } catch (e) {
    if (e.name === 'PasswordException') { $('#pwbox').hidden = false; msg($('#pw').value ? 'Wrong password, try again.' : ''); }
    else msg(`Couldn't read this PDF: ${e.message}`);
  }
}
$('#file').onchange = async e => { bytes = new Uint8Array(await e.target.files[0].arrayBuffer()); e.target.value = ''; scan(); };
$('#pwgo').onclick = scan;
const loadSample = name => async () => { bytes = new Uint8Array(await (await fetch(`data/fixtures/${name}.pdf`)).arrayBuffer()); scan(); };
$('#sample').onclick = loadSample('SYNTHETIC_bill');
$('#weak').onclick = loadSample('SYNTHETIC_weak_bill');

// ---------- 2. confirm ----------
const SCALARS = [['period_start', 'Billing period start'], ['period_end', 'Billing period end'], ['previous_reading', 'Previous Reading'],
  ['current_reading', 'Current Reading'], ['multiplier', 'Multiplier'], ['kwh', 'kWh used'], ['charges_this_period', 'Charges for this billing period'],
  ['remaining_balance', 'Remaining Balance'], ['installment_due', 'Installment Due'], ['total_amount_due', 'Total Amount Due']];

function renderConfirm() {
  const row = (label, attr, v) => `<tr><td>${esc(label)}</td><td><input ${attr} value="${esc(v ?? '')}"></td></tr>`;
  $('#fields').innerHTML =
    `<table>${SCALARS.map(([k, l]) => row(l, `data-k="${k}"`, bill[k])).join('')}</table>
     <h3>Charges</h3><table>${bill.charges.map((c, i) => row(c.label, `data-c="${i}" inputmode="decimal"`, c.amount_php)).join('')}</table>
     <h3>Monthly Consumption Tracker (${bill.tracker.length} months)</h3>
     <table>${bill.tracker.map((t, i) => row(t.month, `data-t="${i}" inputmode="decimal"`, t.kwh)).join('')}</table>`;
  renderChecks();
}

function renderChecks() {
  const checks = runChecks(bill), bad = new Set(checks.filter(c => !c.passed).flatMap(c => c.fields));
  $('#checks').innerHTML = checks.map(c => `<li class="${c.passed ? 'ok' : 'fail'}">${c.name}: expected ${c.expected.toFixed(2)}, found ${Number(c.found).toFixed(2)}</li>`).join('');
  document.querySelectorAll('#fields input').forEach(el => el.classList.toggle('bad',
    bad.has(el.dataset.k) || (el.dataset.c && bad.has('charges')) || (el.dataset.t == bill.tracker.length - 1 && bad.has('tracker'))));
}

$('#fields').oninput = e => {
  const { k, c, t } = e.target.dataset, v = e.target.value, n = parseFloat(v.replace(/,/g, ''));
  if (k) bill[k] = k.startsWith('period') ? v : n;
  if (c) bill.charges[c].amount_php = n;
  if (t) bill.tracker[t].kwh = n;
  if (k?.startsWith('period')) bill.days = (Date.parse(bill.period_end) - Date.parse(bill.period_start)) / 864e5 + 1;
  renderChecks();
};

// ---------- 3. results ----------
$('#go').onclick = () => {
  msg();
  try {
    const per = trackerPeriods(bill.tracker, bill.period_end);
    const f = fit(per, T);
    const r = explain(bill, per, f, T, cdd, rates, reasons);
    analysis = { per, f, r, proj: project(per, T, f, r.R1, r.F1) };
    renderResults();
    show('results');
  } catch (e) { msg(e.message); }
};

const COLORS = { weather: '#e65c00', billing_days: '#8d6e63', you: '#1e88e5', usage: '#1e88e5', generation: '#43a047', local_tax_rounding: '#9e9e9e', refund: '#8e24aa' };

function renderResults() {
  const { per, f, r, proj } = analysis;
  $('#tierc').hidden = f.tier !== 'C_refused';
  $('#sentence').textContent = r.sentence;
  const total = r.breakdown.reduce((s, i) => s + Math.abs(i.php), 0) || 1;
  $('#bar').innerHTML = r.breakdown.map(i => `<div title="${esc(i.label)} ${peso(i.php)}" style="flex:${Math.abs(i.php) / total};background:${COLORS[i.key] ?? '#26a69a'};opacity:${i.php < 0 ? 0.5 : 1}"></div>`).join('');
  $('#items').innerHTML = r.breakdown.filter(i => Math.abs(i.php) >= 0.5).map(i =>
    `<tr><td>${esc(i.label)}<br><small class="hint">${esc(i.source)}</small></td><td class="n">${peso(i.php)}</td></tr>`).join('') +
    `<tr><th>Change vs last month (est. ${peso(r.est_prev_bill)})</th><th class="n">${peso(r.bill_change_php)}</th></tr>` +
    (r.warn_residual ? `<tr><td colspan="2" class="note">Local tax and rounding is over 3% of the bill: the rate table and the bill disagree.</td></tr>` : '');

  // fit chart: kWh/day vs CDD/day
  const { x, y } = f.points, W = 320, H = 200, mx = Math.max(...x, 0.1) * 1.1, my = Math.max(...y) * 1.1;
  const X = v => 30 + v / mx * (W - 40), Y = v => H - 20 - v / my * (H - 30);
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily usage against cooling degree days">
    <line x1="30" y1="${H - 20}" x2="${W - 10}" y2="${H - 20}" stroke="currentColor"/><line x1="30" y1="10" x2="30" y2="${H - 20}" stroke="currentColor"/>
    <text x="${W / 2}" y="${H - 4}" font-size="10" fill="currentColor" text-anchor="middle">cooling degree-days per day</text>
    <text x="4" y="12" font-size="10" fill="currentColor">kWh/day</text>
    ${x.map((v, i) => `<circle cx="${X(v)}" cy="${Y(y[i])}" r="3.5" fill="#1e88e5"/>`).join('')}
    ${f.baseload_kwh_per_day != null ? `<line x1="${X(0)}" y1="${Y(f.baseload_kwh_per_day)}" x2="${X(mx)}" y2="${Y(f.baseload_kwh_per_day + f.cooling_slope_kwh_per_cdd * mx)}" stroke="#e65c00" stroke-width="2"/>` : ''}
  </svg>`;
  $('#fitinfo').textContent = `Tier ${f.tier.replace('_', ' ')}${f.tier === 'B_fixed24' ? ' (simplified)' : ''}. ${f.reason}` +
    (f.baseload_kwh_per_day != null ? ` Baseload ${f.baseload_kwh_per_day.toFixed(1)} kWh/day, +${f.cooling_slope_kwh_per_cdd.toFixed(2)} kWh per degree-day above ${f.balance_point_c} °C.` : '');

  $('#proj').textContent = proj.mid == null ? proj.label
    : `${proj.low != null ? `${peso(proj.low)} to ${peso(proj.high)} (middle ${peso(proj.mid)})` : `About ${peso(proj.mid)}`}, about ${Math.round(proj.kwh)} kWh. ${proj.label}` +
      (proj.backtest_mape != null ? ` Backtest on your last 3 months: off by ${(proj.backtest_mape * 100).toFixed(0)}% on average.` : '');

  renderSolar();
  const rm = m => `Meralco rate table ${m}: ${rates[m].source_url}`;
  $('#sources').innerHTML = [
    rm(r.rate_month), rm(r.prev_rate_month),
    `Rate month detected from your generation ₱/kWh: ${r.rate_month}${r.rate_month_matches_dates ? '' : ' (does not match the billing dates; closest match used)'}.`,
    `Last month's bill is reconstructed from Meralco's table at ${per.at(-2).kwh} kWh, not read from last month's bill.`,
    `Daily temperatures: ${weather.synthetic ? 'SYNTHETIC' : 'Open-Meteo archive (CC BY 4.0)'}, ${weather.city}.`,
    `Tracker months are assumed to end on day ${new Date(bill.period_end).getUTCDate()} of each month, like this bill.`,
    `Weather split: variable-base degree-day change-point regression (ASHRAE Guideline 14 3PC / CalTRACK billing method), fitted to your bill only.`,
    `Solar yield ${SOLAR.Y} kWh/kWp/yr (Philippine DOE, Global Solar Atlas, Metro Manila); cost ₱${SOLAR.C.toLocaleString()}/kWp (Ember, May 2026); fees ₱${SOLAR.fees.toLocaleString()} (ERC certificate + meter difference).`,
    'Export credit = the generation charge per kWh on your bill. Home-use share is your own estimate.',
  ].map(s => `<li>${esc(s)}</li>`).join('');
}

function renderSolar() {
  $('#solar').innerHTML = '<tr><th>Scenario</th><th class="n">Payback</th><th class="n">kWp</th><th class="n">Saves/yr</th></tr>' +
    solar(bill, bill.tracker, +$('#selfuse').value).map(s =>
      `<tr><td>${esc(s.name)}</td><td class="n"><b>${s.payback.toFixed(1)} yrs</b></td><td class="n">${s.kWp.toFixed(1)}</td><td class="n">${peso(s.save)}</td></tr>`).join('');
}
$('#selfuse').onchange = () => analysis && renderSolar();
$('#again').onclick = () => { bill = analysis = null; markSynthetic(); show('upload'); };
