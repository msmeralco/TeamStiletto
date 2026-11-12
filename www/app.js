import * as pdfjs from './vendor/pdf.min.mjs';
import { pdfLines } from './lib/extract.js';
import { parseBill } from './lib/parse.js';
import { runChecks } from './lib/checks.js';
import { temps, trackerPeriods, fit, cdd, project } from './lib/model.js';
import { explain, validateRates } from './lib/explain.js';
import { ocrLines } from './lib/ocr.js';
import { billingFlags, disputeMessage, disputePacket, unexplainedIncrease, householdExplains, STRENGTH_TEXT } from './lib/flags.js';
import { startChat, step, answersOf, needsModel, fromModel, isQuestion, fromModelPick, fromModelTopic, advisoryParas, billFacts } from './lib/chat.js';
import { daysSince, ercMessage, ercPacket, caseKey, CHANNELS, FOLLOW_UP_DAYS } from './lib/disputes.js';

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
    bill = parseBill(await pdfLines(pdfjs, bytes.slice(), $('#pw').value || undefined), billSpec);
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
$('#file').onchange = async e => { bytes = new Uint8Array(await e.target.files[0].arrayBuffer()); e.target.value = ''; scan(); };
$('#pwgo').onclick = scan;
const loadSample = name => async () => { bytes = new Uint8Array(await (await fetch(`data/fixtures/${name}.pdf`)).arrayBuffer()); scan(); };
$('#sample').onclick = loadSample('SYNTHETIC_bill');
$('#weak').onclick = loadSample('SYNTHETIC_weak_bill');

// Photo of a paper bill: read by PaddleOCR on the TANAW laptop (npm start + scripts/ocr.py). The button shows only if that is running.
// shortcut: the photo leaves the phone for the laptop; on-device OCR (ONNX in the browser) is the upgrade for a public release.
fetch('api/health').then(r => r.json()).then(h => $('#scanbtn').toggleAttribute('hidden', !h.ocr)).catch(() => {});
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
       <input data-k="${k}" class="${low(bill[k]) ? 'low' : ''}" value="${esc(bill[k] ?? '')}"></label>`).join('')}</div>
     <h3>Charges</h3><table>${bill.charges.map((c, i) => row(c.label, `data-c="${i}" inputmode="decimal"`, c.amount_php)).join('')}</table>
     <h3>Monthly Consumption Tracker (${bill.tracker.length} months, kWh)</h3>
     <div id="bars" class="bars" aria-hidden="true"></div>
     <div class="axis"><span>${esc(bill.tracker[0]?.month ?? '')}</span><span>${esc(bill.tracker.at(-1)?.month ?? '')}</span></div>
     <details><summary>Edit tracker months</summary>
       <table>${bill.tracker.map((t, i) => row(t.month, `data-t="${i}" inputmode="decimal"`, t.kwh)).join('')}</table></details>`;
  renderChecks();
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

const CAUSE = { usage: '#1e88e5', rates: '#26a69a' };

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

  // fit chart: kWh/day vs CDD/day
  const { x, y } = f.points, W = 320, H = 200, mx = Math.max(...x, 0.1) * 1.1, my = Math.max(...y) * 1.1;
  const X = v => 30 + v / mx * (W - 40), Y = v => H - 20 - v / my * (H - 30);
  $('#chart').innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily usage against cooling degree days">
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
  ].map(s => `<li>${esc(s)}</li>`).join('');
}

// ---------- "what changed at home?" chat (lib/chat.js) ----------
let chat;
const say = (who, t) => { $('#chatlog').insertAdjacentHTML('beforeend', `<p class="${who}">${esc(t)}</p>`); $('#chatlog').scrollTop = 1e9; };
const chatCtx = () => ({ sentence: analysis.r.sentence, reason: analysis.r.reason, facts: billFacts(bill, analysis).map(x => x.text), days: bill.days, unexplained_kwh: unexplainedIncrease(bill, analysis.r).kwh });
function startChatUI() {
  chat = startChat();
  $('#chatlog').innerHTML = '';
  const { php, kwh } = unexplainedIncrease(bill, analysis.r);
  say('bot', `Hi! ${analysis.r.bill_change_php >= 0 ? 'Tumaas' : 'Bumaba'} ng ${peso(Math.abs(analysis.r.bill_change_php))} ang bill mo.` +
    (php > 0 ? ` Mga ${Math.round(kwh)} kWh (${peso(php)}) dito ang hindi maipaliwanag ng init ng panahon o haba ng billing period.` : '') +
    '\nMay nagbago ba sa bahay? Halimbawa: "bumili kami ng aircon", "nag-WFH ako", "umuwi kami ng probinsya", o "wala".' +
    '\nPuwede ka ring magtanong, hal. "bakit tumaas ang generation charge?"');
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
// A question: the model may only name its topic (mapped here to one of our own bill facts) and/or pick a paragraph of this
// month's Meralco advisory; we show our own text for both. Only the question is sent, never the bill.
// Returns {} when the model is not used (keyword fallback).
async function modelPick(text, model) {
  const reason = analysis.r.reason;
  if (modelOff || !isQuestion(chat, text, model)) return {};
  try {
    const res = await fetch('api/answer', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, month: analysis.r.rate_month }), signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(res.status);
    const { result } = await res.json();
    const pick = fromModelPick(result, advisoryParas(reason).length), fact = fromModelTopic(result, billFacts(bill, analysis), text);
    // One side unusable while the other is fine: treat the unusable side as "not there", never as a guess.
    return pick === undefined && fact === undefined ? {} : { pick: pick ?? null, fact: fact ?? null };
  } catch { modelOff = true; return {}; }
}
$('#chatform').onsubmit = async e => {
  e.preventDefault();
  const t = $('#chatin').value;
  if (!t.trim() || !analysis || $('#chatin').disabled) return;
  $('#chatin').value = '';
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
  const packet = flags.length && disputePacket({ bill, checks, flags, answers: a, r: analysis.r, rates });
  const explained = u.php > 0 && householdExplains(u, a)
    ? `<p class="note">Your answers may explain the ${peso(u.php)} rise in usage, so a dispute is less likely to help.</p>` : '';
  $('#flags').innerHTML = explained + (!flags.length ? '<p>No signs of a billing error in the numbers we can check.</p>'
    : `<p><b>Evidence strength: ${esc(STRENGTH_TEXT[packet.strength])}</b></p>
       ${flags.map(f => `<div class="card flag"><span class="badge ${esc(f.strength)}">${esc(f.strength)}</span><span>${esc(f.text)}</span></div>`).join('')}
       <p>This is worth asking Meralco to recheck. Review the message below, then send it. If it is not resolved, contact the ERC: consumer@erc.ph, 8687-5577.</p>
       <textarea id="dispute" rows="12" aria-label="Message to Meralco">${esc(disputeMessage(bill, flags, a))}</textarea>
       <button id="send" class="primary">Send dispute to Meralco</button>
       <p class="hint">Sends this message and an evidence file (your account number, readings, charges and answers) to the TANAW case dashboard,
       a demo that is not connected to a real Meralco system, and saves it in My disputes.
       <button id="share" class="link">Send it yourself instead</button> · <button id="copy" class="link">Copy the message only</button></p>
       <details id="track"><summary>Sent it yourself? Record how, and Meralco's reference number</summary>
         <label>How did you send it? <select id="channel">${CHANNELS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
         <label>Date sent <input id="sent" type="date" value="${today()}"></label>
         <label>Meralco reference number, if they gave one <input id="ref" type="text" autocomplete="off"></label>
         <button id="trackbtn">Save in My disputes</button>
       </details>
       <p id="tracked" class="hint" role="status"></p>`);
  if (!packet) return;
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
        <span>${n >= FOLLOW_UP_DAYS ? 'Time to follow up, or escalate to the ERC' : `Follow up in ${FOLLOW_UP_DAYS - n} day${FOLLOW_UP_DAYS - n === 1 ? '' : 's'}`}</span></div>
        <div class="progress"><i style="width:${Math.min(100, 100 * n / FOLLOW_UP_DAYS)}%"></i></div>`}
      <p class="hint">Sent ${esc(x.sent)} via ${esc(x.channel)}${x.ref ? `, reference ${esc(x.ref)}` : ''}.</p>
      ${x.reply ? `<p class="note"><b>Meralco replied:</b> ${esc(x.reply)}</p>` : ''}
      <div class="row"><button data-act="send">Share file</button>
      ${done ? '' : '<button data-act="erc">Escalate to ERC</button> <button data-act="resolve">Mark resolved</button>'}
      <button data-act="delete">Delete</button></div><div class="erc"></div></li>`;
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
  if (changed && !document.querySelector('#minelist textarea') && saveDisputes(list)) renderMine();
}
setInterval(() => !$('#upload').hidden && !document.hidden && syncMine(), 10000);

$('#minelist').onclick = e => {
  const act = e.target.dataset.act, li = e.target.closest('li');
  if (!act || !li) return;
  const list = loadDisputes(), x = list.find(y => y.id === li.dataset.id);
  if (act === 'send') return sendDispute(`tanaw-dispute-${x.packet.bill.period_end}.json`, x.packet, x.packet.message);
  if (act === 'erc') {
    const box = li.querySelector('.erc');
    box.innerHTML = `<p>Send this to the ERC at consumer@erc.ph (or call 8687-5577) with the evidence file.</p>
      <textarea rows="12" aria-label="Message to the ERC">${esc(ercMessage(x))}</textarea>
      <button data-erc="post">Send to the case dashboard</button> <button data-erc="send">Share with the ERC yourself</button> <button data-erc="copy">Copy message only</button>`;
    box.querySelector('[data-erc=copy]').onclick = ev => copyText(box.querySelector('textarea'), ev.target);
    box.querySelector('[data-erc=post]').onclick = async ev => {
      if (!await postCase({ ...ercPacket(x), message: box.querySelector('textarea').value })) return;
      x.posted = true;
      saveDisputes(list);
      Object.assign(ev.target, { textContent: 'Sent to the case dashboard', disabled: true });
    };
    box.querySelector('[data-erc=send]').onclick = () =>
      sendDispute(`tanaw-erc-${x.packet.bill.period_end}.json`, ercPacket(x), box.querySelector('textarea').value);
    return;
  }
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

$('#again').onclick = () => { bill = analysis = ocr = null; markSynthetic(); show('upload'); };
