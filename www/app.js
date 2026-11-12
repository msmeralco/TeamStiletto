import * as pdfjs from './vendor/pdf.min.mjs';
import { pdfLines } from './lib/extract.js';
import { parseBill } from './lib/parse.js';
import { runChecks, billProblems } from './lib/checks.js';
import { temps, trackerPeriods, fit, cdd, project, heatSplit } from './lib/model.js';
import { explain, validateRates } from './lib/explain.js';
import { ocrLines } from './lib/ocr.js';
import { billingFlags, disputeMessage, disputePacket, unexplainedIncrease, householdExplains, STRENGTH_TEXT } from './lib/flags.js';
import { startChat, isReset, step, answersOf, needsModel, fromModel, isQuestion, fromModelPick, fromModelTopic, fromModelFaq, advisoryParas, billFacts } from './lib/chat.js';
import { faqIndex, faqSearch } from './lib/faq.js';
import { daysSince, caseKey, route, CHANNELS, FOLLOW_UP_DAYS } from './lib/disputes.js';
import { solar, solarLead, cleanLead, SOLAR } from './lib/solar.js';

pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
// Offline web app; the native iOS/Android apps already bundle every file.
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) navigator.serviceWorker.register('sw.js').catch(() => {});
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); // PDF text is untrusted
const peso = (v, d = 0) => `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const HEAD = { upload: ['', 'TANAW', 'Why did my Meralco bill change?'], confirm: ['Step 2 of 3', 'Check the numbers we read', ''], results: ['Step 3 of 3', 'Why your bill changed', ''] };
function show(id) {
  for (const s of Object.keys(HEAD)) $('#' + s).hidden = s !== id;
  [$('#step').textContent, $('#title').textContent, $('#sub').textContent] = HEAD[id];
  for (const el of [$('#step'), $('#sub')]) el.hidden = !el.textContent;
  $('#back').toggleAttribute('hidden', id === 'upload');
  $('#logo').toggleAttribute('hidden', id !== 'upload');
  scrollTo(0, 0);
}
$('#back').onclick = () => show($('#results').hidden ? 'upload' : 'confirm');
const msg = t => ($('#msg').textContent = t ?? '');
const today = () => new Date().toLocaleDateString('en-CA');

const [rates, weather, reasons, billSpec] = await Promise.all(['rates', 'weather', 'reasons', 'bill_spec'].map(n => fetch(`data/${n}.json`).then(r => r.json())));
// Meralco FAQs for the chat (scripts/fetch_faqs.mjs). Optional: without the file the chat answers from the bill and advisory only.
const faqs = faqIndex(await fetch('data/faqs.json').then(r => (r.ok ? r.json() : null)).catch(() => null));
const T = temps(weather);
const rateErrors = validateRates(rates);
if (rateErrors.length) msg('rates.json failed validation: ' + rateErrors.join('; '));
let bill, bytes, analysis, ocr = null; // ocr: { low, clear, total } when the bill was read from a photo
const markSynthetic = () => ($('#synthetic').hidden = !(weather.synthetic || Object.values(rates).some(r => r.synthetic) || bill?.source === 'synthetic'));
markSynthetic();

// ---------- 1. upload ----------
async function scan() {
  msg();
  try {
    const b = parseBill(await pdfLines(pdfjs, bytes.slice(), $('#pw').value || undefined), billSpec);
    // Same test as the photo path: a PDF with text but no billing period or charges is some other document.
    if (!b.period_end || b.charges_this_period == null) throw new Error('this does not look like a Meralco bill. Use the PDF statement from the My Meralco app or your e-bill email.');
    bill = b;
    ocr = null;
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
$('#file').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return; // the file picker was cancelled
  bytes = new Uint8Array(await f.arrayBuffer());
  e.target.value = '';
  scan();
};
$('#pwgo').onclick = scan;
const loadSample = name => async () => { bytes = new Uint8Array(await (await fetch(`data/fixtures/${name}.pdf`)).arrayBuffer()); scan(); };
$('#sample').onclick = loadSample('SYNTHETIC_bill');
$('#weak').onclick = loadSample('SYNTHETIC_weak_bill');
// SYNTHETIC scenario bills (scripts/make_scenarios.mjs): one per situation, grouped, each with what it is meant to show.
fetch('data/fixtures/SYNTHETIC_scenarios.json').then(r => r.json()).then(({ scenarios }) => {
  const groups = [...new Set(scenarios.map(s => s.group))];
  $('#scenario').innerHTML = groups.map(g => `<optgroup label="${esc(g)}">${scenarios.filter(s => s.group === g).map(s => `<option value="${esc(s.id)}">${esc(s.id)}</option>`).join('')}</optgroup>`).join('');
  const covers = () => { $('#scenariocovers').textContent = scenarios.find(s => s.id === $('#scenario').value)?.covers ?? ''; };
  $('#scenario').onchange = covers;
  $('#scenariogo').onclick = () => loadSample(`scenarios/${$('#scenario').value}`)();
  covers();
  $('#scenarios').hidden = false;
}).catch(() => {}); // the list is optional: no manifest, no picker

// Photo of a paper bill: read by PaddleOCR on the TANAW laptop (npm start + scripts/ocr.py). The button shows only if that is running.
// shortcut: the photo leaves the phone for the laptop; on-device OCR (ONNX in the browser) is the upgrade for a public release.
// The solar lead form needs the laptop server too (POST /api/leads): shown only when the server answers.
fetch('api/health').then(r => r.json()).then(h => { $('#scanbtn').toggleAttribute('hidden', !h.ocr); $('#lead').hidden = false; }).catch(() => {});
$('#photo').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  msg('Reading the photo. This can take up to a minute…');
  try {
    const res = await fetch('api/ocr', { method: 'POST', headers: { 'content-type': f.type || 'image/jpeg' }, body: f, signal: AbortSignal.timeout(180000) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    if (!out.words?.length) throw new Error('no text found. Retake it flat, in good light, with the whole page in the frame.');
    const o = ocrLines(out.words, out.width), b = parseBill(o.lines, billSpec);
    if (!b.period_end || b.charges_this_period == null) throw new Error('this does not look like a Meralco bill, or it is too blurry. Retake it flat, in good light, with the whole page in the frame.');
    bill = { ...b, source: b.source === 'synthetic' ? 'synthetic' : 'photo_ocr' };
    ocr = o;
    msg();
    markSynthetic();
    renderConfirm();
    show('confirm');
  } catch (e) { msg(`Couldn't read this photo: ${e.message}`); }
};

// ---------- 2. confirm ----------
const SCALARS = [['period_start', 'Billing period start'], ['period_end', 'Billing period end'], ['previous_reading', 'Previous Reading'],
  ['current_reading', 'Current Reading'], ['multiplier', 'Multiplier'], ['kwh', 'kWh used'], ['charges_this_period', 'Charges for this billing period'],
  ['remaining_balance', 'Remaining Balance'], ['installment_due', 'Installment Due'], ['total_amount_due', 'Total Amount Due']];

const CHECK_NAMES = { readings: 'Meter readings match kWh', tracker_latest: 'Tracker matches kWh', line_sum: 'Charges add up', total: 'Total adds up' };

function renderConfirm() {
  const low = v => !!ocr?.low.has(v);
  const row = (label, attr, v) => `<tr><td>${esc(label)}</td><td><input ${attr} class="${low(v) ? 'low' : ''}" aria-label="${esc(label)}" value="${esc(v ?? '')}"></td></tr>`;
  $('#ocrnote').hidden = !ocr;
  if (ocr) $('#ocrnote').textContent = `Read from your photo by PaddleOCR: ${ocr.clear} of ${ocr.total} pieces of text were clear. Yellow fields were blurry: please check them against your paper bill.`;
  $('#fields').innerHTML =
    `<div class="grid2">${SCALARS.map(([k, l]) => `<label class="f"><span>${esc(l)}${low(bill[k]) ? ' <em>· please check</em>' : ''}</span>
       <input data-k="${k}" ${k.startsWith('period') ? 'type="date"' : 'inputmode="decimal"'} class="${low(bill[k]) ? 'low' : ''}" value="${esc(bill[k] ?? '')}"></label>`).join('')}</div>
     <h3>Charges</h3><table>${bill.charges.map((c, i) => row(c.label, `data-c="${i}" inputmode="decimal"`, c.amount_php)).join('')}</table>
     <h3>Monthly Consumption Tracker (${bill.tracker.length} months, kWh)</h3>
     <div id="bars" class="bars" aria-hidden="true"></div>
     <div class="axis"><span>${esc(bill.tracker[0]?.month ?? '')}</span><span>${esc(bill.tracker.at(-1)?.month ?? '')}</span></div>
     <details><summary>Edit tracker months</summary>
       <table>${bill.tracker.map((t, i) => row(t.month, `data-t="${i}" inputmode="decimal"`, t.kwh)).join('')}</table></details>`;
  // All checks pass on a PDF: the numbers stay one tap away. A failed check or a photo opens them, since those need a look.
  $('#editbox').open = renderChecks() > 0 || !!ocr;
}

function renderChecks() {
  const checks = runChecks(bill, billSpec), failed = checks.filter(c => !c.passed), bad = new Set(failed.flatMap(c => c.fields));
  $('#checksbox').classList.toggle('fail', failed.length > 0);
  $('#checkshead').textContent = failed.length ? `${failed.length} of ${checks.length} self-checks failed. Fix the red fields.` : `${checks.length} self-checks passed`;
  // Page 1 checks one per line; page 2 ("How your bill was computed") as one line, plus a line for each check that fails.
  const page2 = checks.filter(c => c.detail), li = (ok, t) => `<li class="${ok ? 'ok' : 'fail'}">${esc(t)}</li>`;
  $('#checks').innerHTML = checks.filter(c => !c.detail).map(c => li(c.passed, `${CHECK_NAMES[c.name] ?? c.name}${c.passed ? '' : `: expected ${c.expected.toFixed(2)}, found ${Number(c.found).toFixed(2)}`}`)).join('') +
    (page2.length ? li(page2.every(c => c.passed), `Page 2 computation: ${page2.filter(c => c.passed).length} of ${page2.length} checks add up (${page2.reduce((s, c) => s + c.n, 0)} numbers compared)`) : '') +
    page2.filter(c => !c.passed).map(c => li(false, `${c.formula}. ${c.fails[0].what}: computed ${c.fails[0].expected.toFixed(2)}, the bill shows ${Number(c.fails[0].found).toFixed(2)}`)).join('');
  document.querySelectorAll('#fields input').forEach(el => el.classList.toggle('bad',
    bad.has(el.dataset.k) || (el.dataset.c && bad.has('charges')) || (el.dataset.t == bill.tracker.length - 1 && bad.has('tracker'))));
  const max = Math.max(1, ...bill.tracker.map(t => t.kwh || 0));
  $('#bars').innerHTML = bill.tracker.map(t => `<i style="height:${100 * (t.kwh || 0) / max}%"></i>`).join('');
  const num = v => (Number.isFinite(v) ? v : '?'), nw = v => `<span class="nw">${esc(v || '?')}</span>`; // a date must not break at its hyphen
  $('#readsum').innerHTML = [['Billing period', `${nw(bill.period_start)} to ${nw(bill.period_end)}`], ['Electricity used', esc(`${num(bill.kwh)} kWh`)],
    ['Charges this period', esc(Number.isFinite(bill.charges_this_period) ? peso(bill.charges_this_period, 2) : '?')]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  return failed.length;
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
  // An empty or mistyped field stops here with a plain message, instead of reaching the result as "₱NaN".
  const problems = billProblems(bill);
  if (problems.length) { $('#editbox').open = true; return msg(problems.join(' ')); }
  try {
    const per = trackerPeriods(bill.tracker, bill.period_end);
    const f = fit(per, T);
    const r = explain(bill, per, f, T, cdd, rates, reasons);
    analysis = { per, f, r, proj: project(per, T, f, r.R1, r.F1) };
    renderResults();
    show('results');
  } catch (e) { msg(e.message); }
};

const CAUSE = { usage: '#1e88e5', rates: '#26a69a' };

// ---------- hot vs cool months chart: tap a bar for that month, or a card for the months in that group ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HOT = '#F26522', COOL = '#7C8A99', k1 = v => v.toFixed(1);
const monthName = m => `${MONTH_FULL[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
let heat; // { h: heatSplit(...), sel: null | { i: bar index } | { g: 'hot' | 'cool' } }

function heatDetail() {
  const { h, sel } = heat;
  if (!h.rows.length) return '';
  const avg = h.rows.reduce((s, r) => s + r.kwh, 0) / h.rows.reduce((s, r) => s + r.days, 0);
  const vs = (v, base, what) => { const p = Math.round((v / base - 1) * 100); return p === 0 ? `the same as ${what}` : `${Math.abs(p)}% ${p > 0 ? 'above' : 'below'} ${what}`; };
  if (sel?.i != null) {
    const r = h.rows[sel.i], grp = r.hot ? h.hot_kwh_per_day : h.cool_kwh_per_day;
    return `<b><i class="dot" style="background:${r.hot ? HOT : COOL}"></i>${esc(monthName(r.month))}: ${r.hot ? 'a hotter month' : 'a cooler month'}</b>
      <br>${k1(r.kwh_per_day)} kWh a day (${Math.round(r.kwh)} kWh over ${r.days} days), average ${k1(r.temp_c)} °C.
      <br>That is ${vs(r.kwh_per_day, avg, 'your average month')}, and ${vs(r.kwh_per_day, grp, `the average ${r.hot ? 'hotter' : 'cooler'} month`)}.`;
  }
  if (sel?.g) {
    const hot = sel.g === 'hot', list = h.rows.map((r, i) => ({ r, i })).filter(x => x.r.hot === hot);
    return `<b><i class="dot" style="background:${hot ? HOT : COOL}"></i>${hot ? 'Hotter' : 'Cooler'} months (average ${hot ? 'above' : 'at or below'} ${k1(h.median_c)} °C)</b>
      <ul class="heatlist">${list.map(({ r, i }) => `<li><button type="button" class="link" data-i="${i}">${esc(monthName(r.month))}</button>
        <span>${k1(r.kwh_per_day)} kWh a day, ${k1(r.temp_c)} °C</span></li>`).join('')}</ul>`;
  }
  return '<span class="hint">Tap a bar to see that month, or a card to list the hotter or cooler months.</span>';
}

function drawHeat() {
  const { h, sel } = heat, W = 320, H = 190, n = h.rows.length, my = Math.max(...h.rows.map(x => x.kwh_per_day)) * 1.1 || 1;
  const bw = (W - 34) / (n || 1), Y = v => H - 22 - v / my * (H - 36);
  const lit = (r, i) => !sel || (sel.i != null ? sel.i === i : sel.g === (r.hot ? 'hot' : 'cool'));
  $('#chart').innerHTML = `<div class="heatnums">${[['hot', 'Hotter months', HOT, h.hot_kwh_per_day], ['cool', 'Cooler months', COOL, h.cool_kwh_per_day]].map(([g, label, c, v]) =>
    `<button type="button" class="heatcard" data-g="${g}" aria-pressed="${sel?.g === g}"><span><i class="dot" style="background:${c}"></i>${label}</span><b>${v == null ? 'n/a' : k1(v) + ' kWh a day'}</b></button>`).join('')}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Electricity used per day in each past billing month, hotter months in orange and cooler months in grey">
    <text x="0" y="10" font-size="10" fill="currentColor">Electricity used per day (kWh)</text>
    <line x1="30" y1="${H - 22}" x2="${W}" y2="${H - 22}" stroke="currentColor"/>
    <text x="26" y="${Y(my / 1.1) + 3}" font-size="9" fill="currentColor" text-anchor="end">${Math.round(my / 1.1)}</text><text x="26" y="${H - 19}" font-size="9" fill="currentColor" text-anchor="end">0</text>
    ${h.rows.map((x, i) => `<g class="hbar" data-i="${i}" tabindex="0" role="button" aria-pressed="${sel?.i === i}" opacity="${lit(x, i) ? 1 : .3}"
      aria-label="${esc(monthName(x.month))}: ${k1(x.kwh_per_day)} kWh a day, ${x.hot ? 'hotter' : 'cooler'} month">
      <rect x="${32 + i * bw}" y="14" width="${bw}" height="${H - 36}" fill="transparent"/>
      <rect x="${32 + i * bw + bw * .12}" y="${Y(x.kwh_per_day)}" width="${bw * .76}" height="${H - 22 - Y(x.kwh_per_day)}" rx="2" fill="${x.hot ? HOT : COOL}" stroke="${sel?.i === i ? 'currentColor' : 'none'}" stroke-width="2"/>
      <text x="${32 + i * bw + bw / 2}" y="${H - 10}" font-size="9" fill="currentColor" text-anchor="middle">${MON[+x.month.slice(5) - 1].slice(0, n > 12 ? 1 : 3)}</text></g>`).join('')}
  </svg>
  <div class="heatdetail" role="status" aria-live="polite">${heatDetail()}</div>`;
  const back = sel?.i != null ? `[data-i="${sel.i}"]` : sel?.g ? `[data-g="${sel.g}"]` : null; // a redraw would drop keyboard focus
  if (back && $('#chart').contains(document.activeElement) === false) $(`#chart ${back}`)?.focus({ preventScroll: true });
}
$('#chart').onclick = e => {
  const t = e.target.closest('[data-i],[data-g]');
  if (!t) return;
  const next = t.dataset.i != null ? { i: +t.dataset.i } : { g: t.dataset.g };
  heat.sel = JSON.stringify(next) === JSON.stringify(heat.sel) ? null : next; // tap the same one again to close it
  drawHeat();
};
$('#chart').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.hbar')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } };

function renderResults() {
  const { per, f, r, proj } = analysis, s = r.summary, signed = (v, d = 0) => (v >= 0 ? '+' : '') + peso(v, d);
  // One total, two causes that add up to it (how much you used, Meralco's rates). Everything else is behind "details".
  $('#headline').textContent = `Your bill ${s.change >= 0 ? 'rose' : 'fell'} ${peso(Math.abs(s.change))}`;
  $('#fromto').textContent = `${peso(s.prev_bill)} last bill${s.prev_exact ? '' : ' (estimated)'} → ${peso(s.this_bill)} this bill` +
    (s.credits_php ? ` (before ${peso(Math.abs(s.credits_php))} of applied credits)` : '');
  const dq = s.usage.kwh_now - s.usage.kwh_before;
  const cause = (key, title, amount, lines) => `<div class="cause"><div><b><i class="dot" style="background:${CAUSE[key]}"></i>${esc(title)}</b>
    ${lines.filter(Boolean).map(l => `<span class="hint">${esc(l)}</span>`).join('')}</div><b class="amt">${signed(amount)}</b></div>`;
  $('#causes').innerHTML =
    cause('usage', dq > 0 ? 'You used more electricity' : dq < 0 ? 'You used less electricity' : 'You used the same electricity', s.usage.php, [
      `${s.usage.kwh_now} kWh this period vs ${s.usage.kwh_before} kWh last period${dq ? ` (${Math.abs(Math.round(dq))} kWh ${dq > 0 ? 'more' : 'less'})` : ''}`,
      ...s.usage.parts.map(p => `${p.label}: ${signed(p.php)}`), s.usage.note]) +
    cause('rates', "Meralco's rates", s.rates.php, [`${s.rates.verdict}: ${peso(s.rates.per_kwh_now, 2)} per kWh now vs ${peso(s.rates.per_kwh_before, 2)} before`]);
  const span = Math.abs(s.usage.php) + Math.abs(s.rates.php) || 1;
  $('#bar').innerHTML = [['usage', s.usage.php], ['rates', s.rates.php]].map(([k, v]) =>
    `<div style="flex:${Math.abs(v) / span};background:${CAUSE[k]};opacity:${v < 0 ? 0.5 : 1}"></div>`).join('');
  $('#ratelines').innerHTML = s.rates.lines.map(l => `<tr><td>${esc(l.label)}</td><td class="n">${signed(l.php)}</td></tr>`).join('') +
    `<tr><th>Meralco's rates, all together</th><th class="n">${signed(s.rates.php)}</th></tr>`;
  $('#items').innerHTML = r.breakdown.filter(i => Math.abs(i.php) >= 0.5).map(i =>
    `<tr><td>${esc(i.label)}<br><small class="hint">${esc(i.source)}</small></td><td class="n">${peso(i.php)}</td></tr>`).join('') +
    `<tr><th>Change vs last bill (${s.prev_exact ? '' : 'est. '}${peso(s.prev_bill)})</th><th class="n">${peso(r.bill_change_php)}</th></tr>` +
    (r.warn_residual ? `<tr><td colspan="2" class="note">Local tax and rounding is over 3% of the bill: the rate table and the bill disagree.</td></tr>` : '');

  const why = r.reason;
  $('#reason').hidden = !why;
  if (why) $('#reason').innerHTML = `<b>Meralco's advisory for this rate month (${esc(why.date)}):</b> “${esc(why.text)}”
    <a href="${esc(why.url)}" target="_blank" rel="noopener">${esc(why.title ?? 'Source')}</a>`;
  startChatUI();
  renderFlags();

  // Hot months vs cool months: one bar per past billing month, coloured by that month's heat. Reads fine even when usage doesn't follow the weather.
  heat = { h: heatSplit(per, T), sel: null };
  drawHeat();
  const h = heat.h, d = h.diff_share;
  $('#fitinfo').innerHTML = `<b>What it means:</b> ` + (d == null ? 'There are not enough past months on this bill to compare hot and cool months.'
    : Math.abs(d) < 0.05 ? 'You use about the same electricity in hot and cool months, so heat is not what drives your bill. Something else (appliances, people at home) matters more.'
    : d > 0 ? `You use about ${Math.round(d * 100)}% more electricity in your hotter months, mostly aircon and fans. A higher bill in a hot month is likely the heat, not a billing mistake.`
    : `You use about ${Math.round(-d * 100)}% less electricity in your hotter months, so heat is not what pushes your bill up. Something else (appliances, people at home) matters more.`) +
    `<br><b>How to read this:</b> each bar is one past billing month. Orange bars are the hotter half of your months (average above ${k1(h.median_c)} °C), grey bars the cooler half. Tap a bar for that month, or a card to list those months.`;

  $('#proj').textContent = proj.mid == null ? proj.label
    : `${proj.low != null ? `${peso(proj.low)} to ${peso(proj.high)} (middle ${peso(proj.mid)})` : `About ${peso(proj.mid)}`}, about ${Math.round(proj.kwh)} kWh. ${proj.label}` +
      (proj.backtest_mape != null ? ` Backtest on your last 3 months: off by ${(proj.backtest_mape * 100).toFixed(0)}% on average.` : '');
  renderSolar();

  const rm = m => `Meralco rate table ${m}: ${rates[m].source_url}`;
  $('#sources').innerHTML = [
    `Bill: ${bill.source === 'synthetic' ? 'SYNTHETIC sample (invented household, priced at real Meralco rates)' : bill.source === 'photo_ocr' ? 'a photo of your paper bill, read by PaddleOCR and confirmed by you' : 'your PDF statement'}.`,
    rm(r.rate_month), rm(r.prev_rate_month),
    `Rate month detected from your generation ₱/kWh: ${r.rate_month}${r.rate_month_matches_dates ? '' : ' (does not match the billing dates; closest match used)'}.`,
    r.summary.prev_exact ? `Last month's bill (${peso(r.summary.prev_bill, 2)}) is the payment this bill lists for the previous billing period.`
      : `Last month's bill is reconstructed from Meralco's table at ${per.at(-2).kwh} kWh, not read from last month's bill.`,
    `Daily temperatures: ${weather.synthetic ? 'SYNTHETIC' : 'Open-Meteo archive (CC BY 4.0)'}, ${weather.city}.`,
    `Tracker months are assumed to end on day ${new Date(bill.period_end).getUTCDate()} of each month, like this bill.`,
    `Weather split: variable-base degree-day change-point regression (ASHRAE Guideline 14 3PC / CalTRACK billing method), fitted to your bill only.`,
    `Solar yield ${SOLAR.Y} kWh/kWp/yr (Philippine DOE, Global Solar Atlas, Metro Manila), as a yearly average; cost ₱${SOLAR.C.toLocaleString()}/kWp (Ember, May 2026); fees ₱${SOLAR.fees.toLocaleString()} (ERC certificate + meter difference).`,
    'Solar bill estimate: power the panels make and you use at home saves this bill\'s full ₱/kWh; power sent to the grid is credited at the generation charge per kWh on your bill. Daytime share is your own estimate.',
  ].map(s => `<li>${esc(s)}</li>`).join('');
}

// ---------- "If you had solar panels" (lib/solar.js) + opt-in MSpectrum lead ----------
let solarRows = [];
function renderSolar() {
  solarRows = solar(bill, bill.tracker, +$('#selfuse').value);
  $('#solar').innerHTML = '<tr><th>Option</th><th class="n">Size</th><th class="n">This bill with it</th><th class="n">Saves/yr</th><th class="n">Payback</th></tr>' +
    solarRows.map(s => `<tr><td>${esc(s.name)}</td><td class="n">${s.kWp.toFixed(1)} kWp</td>
      <td class="n"><b>${peso(s.quote.bill)}</b>${s.quote.credit >= 1 ? `<br><small class="hint">+ ${peso(s.quote.credit)} credit</small>` : ''}</td>
      <td class="n">${peso(s.save)}</td><td class="n">${s.payback.toFixed(1)} yrs</td></tr>`).join('');
  $('#solarnote').textContent = `This bill: ${peso(bill.charges_this_period)} for ${bill.kwh} kWh over ${bill.days} days. ` +
    'The first row is how solar is often sold: every kWh counted at the full price, so its payback looks shorter than the export-aware row below it.';
  $('#leadmsg').textContent = '';
}
$('#selfuse').onchange = () => analysis && renderSolar();
$('#leadgo').onclick = async () => {
  const leadNote = t => ($('#leadmsg').textContent = t);
  if (!$('#leadok').checked) return leadNote('Tick the box first: nothing is sent without your OK.');
  const lead = cleanLead(solarLead(bill, solarRows, +$('#selfuse').value,
    { name: $('#leadname').value, mobile: $('#leadmobile').value, area: $('#leadarea').value }, true));
  if (!lead) return leadNote('Enter a mobile number like 0917 123 4567.');
  $('#leadgo').disabled = true;
  try {
    const res = await fetch('api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lead) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    leadNote(`Sent. MSpectrum may contact you at ${lead.mobile}. (Concept demo: it went to the TANAW laptop.)`);
  } catch (e) { leadNote(`Couldn't reach the TANAW laptop (${e.message}). Nothing was sent.`); }
  finally { $('#leadgo').disabled = false; }
};

// ---------- "what changed at home?" chat (lib/chat.js) ----------
let chat;
// Meralco links (FAQ and advisory sources) are tappable; escaped first, and only meralco.com.ph links become <a>.
const linked = h => h.replace(/https:\/\/www\.meralco\.com\.ph\/[\w\-./#%?=]+/g, u => `<a href="${u}" target="_blank" rel="noopener">Basahin sa Meralco ↗</a>`);
const say = (who, t) => { $('#chatlog').insertAdjacentHTML('beforeend', `<p class="${who}">${linked(esc(t))}</p>`); $('#chatlog').scrollTop = 1e9; };
const chatCtx = () => ({ sentence: analysis.r.sentence, reason: analysis.r.reason, facts: billFacts(bill, analysis).map(x => x.text), days: bill.days, unexplained_kwh: unexplainedIncrease(bill, analysis.r).kwh,
  faqIndex: faqs, month: analysis.r.rate_month });
function startChatUI() {
  chat = startChat();
  $('#chatlog').innerHTML = '';
  const { php, kwh } = unexplainedIncrease(bill, analysis.r);
  say('bot', `Hi! ${analysis.r.bill_change_php >= 0 ? 'Tumaas' : 'Bumaba'} ng ${peso(Math.abs(analysis.r.bill_change_php))} ang bill mo.` +
    (php > 0 ? ` Mga ${Math.round(kwh)} kWh (${peso(php)}) dito ang hindi maipaliwanag ng init ng panahon o haba ng billing period.` : '') +
    '\nMay nagbago ba sa bahay? Halimbawa: "bumili kami ng aircon", "nag-WFH ako", "umuwi kami ng probinsya", o "wala".' +
    '\nPuwede ka ring magtanong, hal. "bakit tumaas ang generation charge?" o "saan makikita ang CAN ko?"' +
    '\nGusto mong magsimula ulit? I-type ang "restart".');
}
// Local model (Ollama behind npm start) only for messages the rules can't read. One failure = rules only for this session.
let modelOff = !!window.Capacitor?.isNativePlatform?.();
async function modelRead(text) {
  if (modelOff || !needsModel(chat, text)) return null;
  try {
    const res = await fetch('api/understand', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(res.status);
    const { model, result } = await res.json();
    return fromModel(result, model);
  } catch { modelOff = true; return null; }
}
// A question: the model may only name its topic (mapped here to one of our own bill facts), pick a paragraph of this month's
// Meralco advisory and pick a Meralco FAQ from a shortlist; we show our own copy of all three. Only the question is sent, never the bill.
// Returns {} when the model is not used (keyword fallback).
async function modelPick(text, model) {
  const reason = analysis.r.reason;
  if (modelOff || !isQuestion(chat, text, model)) return {};
  try {
    const res = await fetch('api/answer', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, month: analysis.r.rate_month }), signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(res.status);
    const { result } = await res.json();
    const pick = fromModelPick(result, advisoryParas(reason).length), fact = fromModelTopic(result, billFacts(bill, analysis), text);
    const faq = fromModelFaq(result?.faq ?? null, faqSearch(faqs, text, analysis.r.rate_month)); // must be on our own shortlist
    // One side unusable while the others are fine: treat the unusable side as "not there", never as a guess.
    return pick === undefined && fact === undefined && faq === undefined ? {} : { pick: pick ?? null, fact: fact ?? null, faq: faq ?? null };
  } catch { modelOff = true; return {}; }
}
$('#chatform').onsubmit = async e => {
  e.preventDefault();
  const t = $('#chatin').value;
  if (!t.trim() || !analysis || $('#chatin').disabled) return;
  $('#chatin').value = '';
  if (isReset(t)) { startChatUI(); renderFlags(); return; } // back to the first question; the dispute section follows the empty answers
  say('me', t);
  $('#chatin').disabled = true;
  say('bot typing', '…');
  const ctx = chatCtx(), model = await modelRead(t), picks = await modelPick(t, model);
  $('#chatlog .typing')?.remove();
  $('#chatin').disabled = false;
  $('#chatin').focus();
  const r = step(chat, t, { ...ctx, ...picks }, model);
  chat = r.state;
  if (r.reply) say('bot', r.reply);
  renderFlags();
};
const answers = () => answersOf(chat, bill.days);

// "Send dispute" posts the evidence file to the demo case inbox on the TANAW server (npm start); dashboard.html shows it within seconds.
// No confirm box: the button's own text says what is sent and where. shortcut: no login or HTTPS, a demo inbox only.
async function postCase(packet) {
  try {
    const res = await fetch('api/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) { msg(`Couldn't reach the case dashboard (${e.message}). Use "Send it yourself instead".`); return false; }
}
const DASH = 'the TANAW case dashboard';

function renderFlags() {
  const a = answers(), checks = runChecks(bill, billSpec), flags = billingFlags(bill, checks, analysis.r, a);
  const u = unexplainedIncrease(bill, analysis.r);
  const packet = disputePacket({ bill, checks, flags, answers: a, r: analysis.r, rates }); // always offered: the customer decides whether to escalate
  const explained = u.php > 0 && householdExplains(u, a)
    ? `<p class="note">Your answers may explain the ${peso(u.php)} rise in usage, so a dispute is less likely to help.</p>` : '';
  const way = route(packet), ticket = way.to === 'meralco';
  // No ticket needed: the message and send options sit one tap away (still always offered). Keep it open across chat re-renders.
  const open = ticket || $('#escalate')?.open;
  $('#flags').innerHTML = explained + (`${flags.length ? `<p><b>Evidence strength: ${esc(STRENGTH_TEXT[packet.strength])}</b></p>` : ''}
       ${flags.map(f => `<div class="card flag"><span class="badge ${esc(f.strength)}">${esc(f.strength)}</span><span>${esc(f.text)}</span></div>`).join('')}
       <p class="note">${ticket
         ? `<b>This needs Meralco.</b> ${esc(way.why)} Review the message below, then send it as a ticket.`
         : `<b>No Meralco ticket needed.</b> ${esc(way.why)}`}</p>
       <details id="escalate" ${open ? 'open' : ''}><summary>${ticket ? 'Message to Meralco' : 'Still want Meralco to review it?'}</summary>
       ${ticket ? '' : '<p class="hint">You can still send it: it is filed as handled by the chatbot, and Meralco staff can move it to a ticket.</p>'}
       <textarea id="dispute" rows="10" aria-label="Message to Meralco">${esc(disputeMessage(bill, flags, a))}</textarea>
       <button id="send" class="${ticket ? 'primary' : 'wide'}">${ticket ? 'Send ticket to Meralco' : 'Send anyway'}</button>
       <p class="hint">Sends this message and an evidence file (your account number, readings, charges and answers) to the TANAW case dashboard,
       a demo that is not connected to a real Meralco system, and saves it in My disputes.</p>
       <div class="samples"><button id="share">Send it yourself</button><button id="copy">Copy message</button></div>
       </details>
       <details id="track"><summary>Sent it yourself? Record how, and Meralco's reference number</summary>
         <label>How did you send it? <select id="channel">${CHANNELS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
         <label>Date sent <input id="sent" type="date" value="${today()}"></label>
         <label>Meralco reference number, if they gave one <input id="ref" type="text" autocomplete="off"></label>
         <button id="trackbtn">Save in My disputes</button>
       </details>
       <p id="tracked" class="hint" role="status"></p>`);
  const edited = () => ({ ...packet, message: $('#dispute').value }); // keep the user's edits to the message
  const track = (channel = $('#channel').value, sent = $('#sent').value, ref = $('#ref').value.trim()) => {
    if (!sent) return msg('Enter the date you sent it.');
    const list = loadDisputes().filter(x => caseKey(x.packet) !== caseKey(packet)); // one record per bill
    list.unshift({ id: Date.now().toString(36), sent, channel, ref, status: 'waiting', posted: channel === DASH, packet: edited() });
    if (!saveDisputes(list)) return msg("Couldn't save on this phone. Keep the evidence file instead.");
    $('#tracked').textContent = channel === DASH ? 'Sent to the case dashboard. Follow it in "My disputes" on the start screen.' : 'Saved in "My disputes" on the start screen.';
    renderMine();
  };
  $('#copy').onclick = () => copyText($('#dispute'), $('#copy'));
  $('#send').onclick = async e => {
    msg();
    e.target.disabled = true;
    if (await postCase(edited())) { track(DASH, today(), ''); e.target.textContent = 'Sent'; } else e.target.disabled = false;
  };
  $('#share').onclick = async () => { if (await sendDispute(`tanaw-dispute-${bill.period_end}.json`, edited(), $('#dispute').value)) track(); };
  $('#trackbtn').onclick = () => track();
}

async function copyText(area, button) {
  try { await navigator.clipboard.writeText(area.value); button.textContent = 'Copied'; }
  catch { area.select(); } // clipboard blocked: leave it selected for a manual copy
}

// ---------- my disputes (this device only) ----------
const STORE = 'tanaw.disputes';
const loadDisputes = () => { try { return JSON.parse(localStorage.getItem(STORE)) ?? []; } catch { return []; } };
const saveDisputes = list => { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { return false; } };

function renderMine() {
  const list = loadDisputes();
  $('#mine').hidden = !list.length;
  $('#minelist').innerHTML = list.map(x => {
    const n = Math.max(0, daysSince(x.sent)), b = x.packet.bill, done = x.status === 'resolved', badge = done ? 'resolved' : x.reply ? 'replied' : 'waiting';
    return `<li class="card ${done ? '' : 'hot'}" data-id="${esc(x.id)}">
      <div class="row between"><div><b>Bill ${esc(b.period_start)} to ${esc(b.period_end)}</b><br>
        <span class="hint">${peso(b.charges_this_period)} · ${esc(x.packet.strength)} evidence</span></div><span class="badge ${badge}">${badge}</span></div>
      ${done ? '' : `<div class="row between hint"><span>Day ${n} of ${FOLLOW_UP_DAYS}</span>
        <span>${n >= FOLLOW_UP_DAYS ? 'Time to follow up with Meralco' : `Follow up in ${FOLLOW_UP_DAYS - n} day${FOLLOW_UP_DAYS - n === 1 ? '' : 's'}`}</span></div>
        <div class="progress"><i style="width:${Math.min(100, 100 * n / FOLLOW_UP_DAYS)}%"></i></div>`}
      <p class="hint">Sent ${esc(x.sent)} via ${esc(x.channel)}${x.ref ? `, reference ${esc(x.ref)}` : ''}.</p>
      ${x.reply ? `<p class="note"><b>Meralco replied:</b> ${esc(x.reply)}</p>` : ''}
      <div class="row"><button data-act="send">Share file</button>
      ${done ? '' : '<button data-act="resolve">Mark resolved</button>'}
      <button data-act="delete">Delete</button></div></li>`;
  }).join('');
}

// Replies and "resolved" from the staff dashboard, for disputes this phone sent there. Asks by case key only: no list of other customers.
async function syncMine() {
  const list = loadDisputes();
  let changed = false;
  for (const x of list.filter(x => x.posted)) {
    try {
      const res = await fetch(`api/cases/status?key=${encodeURIComponent(caseKey(x.packet))}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const s = await res.json(), status = s.status === 'resolved' ? 'resolved' : x.status;
      if ((s.reply ?? '') !== (x.reply ?? '') || status !== x.status) { Object.assign(x, { reply: s.reply ?? '', status }); changed = true; }
    } catch { return; } // no TANAW server (static host or offline): nothing to sync
  }
  if (changed && saveDisputes(list)) renderMine();
}
setInterval(() => !$('#upload').hidden && !document.hidden && syncMine(), 10000);

$('#minelist').onclick = e => {
  const act = e.target.dataset.act, li = e.target.closest('li');
  if (!act || !li) return;
  const list = loadDisputes(), x = list.find(y => y.id === li.dataset.id);
  if (act === 'send') return sendDispute(`tanaw-dispute-${x.packet.bill.period_end}.json`, x.packet, x.packet.message);
  if (act === 'delete' && !confirm('Delete this dispute record from this phone?')) return;
  if (act === 'delete') list.splice(list.indexOf(x), 1);
  if (act === 'resolve') x.status = 'resolved';
  if (!saveDisputes(list)) msg("Couldn't save on this phone.");
  renderMine();
};
renderMine();
syncMine();

// Share sheet with the message and the evidence file (Messenger, Mail, Files...), else download the file and copy the message.
// Returns false only if the user cancelled.
async function sendDispute(name, packet, text) {
  const json = JSON.stringify(packet, null, 2);
  // In the iOS/Android app the WebView has no web share sheet or downloads, so use Capacitor's native Share + Filesystem.
  // shortcut: native path untested on devices; check it on one iPhone and one Android phone before the demo.
  if (window.Capacitor?.isNativePlatform?.()) {
    const { Filesystem, Share } = window.Capacitor.Plugins;
    try {
      const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: 'Bill dispute', text, files: [uri], dialogTitle: 'Send dispute' });
      return true;
    } catch (e) {
      if (/cancel/i.test(e?.message)) return false;
      try { await navigator.clipboard.writeText(text); } catch { /* still show the message below */ }
      msg(`Couldn't open sharing (${e?.message ?? e}). The message may be on your clipboard; you can also send it from "My disputes".`);
      return false;
    }
  }
  const file = new File([json], name, { type: 'application/json' });
  const data = { files: [file], text, title: 'Bill dispute' };
  if (navigator.canShare?.(data)) {
    try { await navigator.share(data); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  let copied = true;
  try { await navigator.clipboard.writeText(text); } catch { copied = false; }
  msg(`Evidence file saved${copied ? ' and message copied' : ''}. Paste the message into the My Meralco app or Meralco's Facebook Messenger, and attach the file.`);
  return true;
}

$('#again').onclick = () => { bill = analysis = ocr = null; $('#leadok').checked = false; markSynthetic(); show('upload'); };
