import * as pdfjs from './vendor/pdf.min.mjs';
import { pdfLines } from './lib/extract.js';
import { parseBill } from './lib/parse.js';
import { runChecks } from './lib/checks.js';
import { temps, trackerPeriods, fit, cdd, project } from './lib/model.js';
import { explain, validateRates } from './lib/explain.js';
import { solar, SOLAR } from './lib/solar.js';
import { billingFlags, disputeMessage, disputePacket, unexplainedIncrease, householdExplains, STRENGTH_TEXT } from './lib/flags.js';
import { startChat, step, answersOf } from './lib/chat.js';
import { daysSince, ercMessage, ercPacket, CHANNELS, FOLLOW_UP_DAYS } from './lib/disputes.js';

pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
// Offline web app; the native iOS/Android apps already bundle every file.
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) navigator.serviceWorker.register('sw.js').catch(() => {});
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

  const why = r.reason;
  $('#reason').hidden = !why;
  if (why) $('#reason').innerHTML = `<b>Meralco's advisory for this rate month (${esc(why.date)}):</b> “${esc(why.text)}”
    <a href="${esc(why.url)}" target="_blank" rel="noopener">${esc(why.title ?? 'Source')}</a>`;
  startChatUI();
  renderFlags();

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
    `Bill: ${bill.source === 'synthetic' ? 'SYNTHETIC sample (invented household, priced at real Meralco rates)' : 'your PDF statement'}.`,
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

// ---------- "what changed at home?" chat (lib/chat.js) ----------
let chat;
const say = (who, t) => { $('#chatlog').insertAdjacentHTML('beforeend', `<p class="${who}">${esc(t)}</p>`); $('#chatlog').scrollTop = 1e9; };
const chatCtx = () => ({ sentence: analysis.r.sentence, reason: analysis.r.reason, days: bill.days, unexplained_kwh: unexplainedIncrease(bill, analysis.r).kwh });
function startChatUI() {
  chat = startChat();
  $('#chatlog').innerHTML = '';
  const { php, kwh } = unexplainedIncrease(bill, analysis.r);
  say('bot', `Hi! ${analysis.r.bill_change_php >= 0 ? 'Tumaas' : 'Bumaba'} ng ${peso(Math.abs(analysis.r.bill_change_php))} ang bill mo.` +
    (php > 0 ? ` Mga ${Math.round(kwh)} kWh (${peso(php)}) dito ang hindi maipaliwanag ng init ng panahon o haba ng billing period.` : '') +
    '\nMay nagbago ba sa bahay? Halimbawa: "bumili kami ng aircon", "nag-WFH ako", "umuwi kami ng probinsya", o "wala".' +
    '\nPuwede ka ring magtanong, hal. "bakit tumaas ang generation charge?"');
}
$('#chatform').onsubmit = e => {
  e.preventDefault();
  const t = $('#chatin').value;
  if (!t.trim() || !analysis) return;
  $('#chatin').value = '';
  say('me', t);
  const r = step(chat, t, chatCtx());
  chat = r.state;
  if (r.reply) say('bot', r.reply);
  renderFlags();
};
const answers = () => answersOf(chat, bill.days);

// Demo case inbox on the dev server (npm start), read by dashboard.html. Only on the user's tap, after a confirm.
async function postCase(packet, button) {
  if (!confirm('Send this evidence file (account number, meter readings, charges and your answers) to the TANAW case dashboard for ERC review?')) return;
  try {
    const res = await fetch('api/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    button.textContent = 'Sent to the case dashboard';
    button.disabled = true;
  } catch (e) { msg(`Couldn't reach the case dashboard (${e.message}). Use "Send dispute" to send the file yourself.`); }
}

function renderFlags() {
  const a = answers(), checks = runChecks(bill), flags = billingFlags(bill, checks, analysis.r, a);
  const u = unexplainedIncrease(bill, analysis.r);
  const packet = flags.length && disputePacket({ bill, checks, flags, answers: a, r: analysis.r, rates });
  const explained = u.php > 0 && householdExplains(u, a)
    ? `<p class="note">Your answers may explain the ${peso(u.php)} rise in usage, so a dispute is less likely to help.</p>` : '';
  $('#flags').innerHTML = explained + (!flags.length ? '<p>No signs of a billing error in the numbers we can check.</p>'
    : `<p><b>Evidence strength: ${esc(STRENGTH_TEXT[packet.strength])}</b></p>
       <ul>${flags.map(f => `<li>${esc(f.text)}</li>`).join('')}</ul>
       <p>This is worth asking Meralco to recheck. Review the message below, then send it yourself through the My Meralco app or
       Meralco's Facebook Messenger, or call 16211. If it is not resolved, contact the ERC: consumer@erc.ph, 8687-5577.</p>
       <textarea id="dispute" rows="14" aria-label="Message to Meralco">${esc(disputeMessage(bill, flags, a))}</textarea>
       <button id="send" class="primary">Send dispute</button> <button id="escalate">Escalate to the case dashboard (ERC)</button>
       <p class="hint">Sends this message and an evidence file (your account number, readings, charges and answers) through the app you pick:
       the My Meralco app, Messenger or email. Nothing is sent until you choose. <button id="copy" class="link">Copy the message only</button></p>
       <details id="track"><summary>How you sent it, and Meralco's reference number</summary>
         <label>How did you send it? <select id="channel">${CHANNELS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
         <label>Date sent <input id="sent" type="date" value="${new Date().toLocaleDateString('en-CA')}"></label>
         <label>Meralco reference number, if they gave one <input id="ref" type="text" autocomplete="off"></label>
         <button id="trackbtn">Save in My disputes</button>
       </details>
       <p id="tracked" class="hint"></p>`);
  if (!packet) return;
  const edited = () => ({ ...packet, message: $('#dispute').value }); // keep the user's edits to the message
  const track = () => {
    if (!$('#sent').value) return msg('Enter the date you sent it.');
    const same = x => x.packet.customer_account_number === packet.customer_account_number && x.packet.bill.period_end === packet.bill.period_end;
    const list = loadDisputes().filter(x => !same(x)); // one record per bill
    list.unshift({ id: Date.now().toString(36), sent: $('#sent').value, channel: $('#channel').value, ref: $('#ref').value.trim(), status: 'waiting', packet: edited() });
    if (!saveDisputes(list)) return msg("Couldn't save on this phone. Keep the evidence file instead.");
    $('#tracked').textContent = 'Saved in "My disputes" on the start screen.';
    renderMine();
  };
  $('#copy').onclick = () => copyText($('#dispute'), $('#copy'));
  $('#send').onclick = async () => { if (await sendDispute(`tanaw-dispute-${bill.period_end}.json`, edited(), $('#dispute').value)) track(); };
  $('#trackbtn').onclick = track;
  $('#escalate').onclick = e => postCase(edited(), e.target);
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
    const n = daysSince(x.sent), b = x.packet.bill;
    const status = x.status === 'resolved' ? 'Resolved.'
      : `Waiting ${n} day${n === 1 ? '' : 's'}.${n >= FOLLOW_UP_DAYS ? ' Time to follow up, or escalate to the ERC.' : ''}`;
    return `<li data-id="${esc(x.id)}"><b>Bill ${esc(b.period_start)} to ${esc(b.period_end)}</b>, ${esc(x.packet.strength)} evidence.<br>
      Sent ${esc(x.sent)} via ${esc(x.channel)}${x.ref ? `, reference ${esc(x.ref)}` : ''}. ${status}<br>
      <button data-act="send">Send dispute</button>
      ${x.status === 'resolved' ? '' : '<button data-act="erc">Escalate to ERC</button> <button data-act="resolve">Mark resolved</button>'}
      <button data-act="delete">Delete</button><div class="erc"></div></li>`;
  }).join('');
}

$('#minelist').onclick = e => {
  const act = e.target.dataset.act, li = e.target.closest('li');
  if (!act || !li) return;
  const list = loadDisputes(), x = list.find(y => y.id === li.dataset.id);
  if (act === 'send') return sendDispute(`tanaw-dispute-${x.packet.bill.period_end}.json`, x.packet, x.packet.message);
  if (act === 'erc') {
    const box = li.querySelector('.erc');
    box.innerHTML = `<p>Send this to the ERC at consumer@erc.ph (or call 8687-5577) with the evidence file.</p>
      <textarea rows="12" aria-label="Message to the ERC">${esc(ercMessage(x))}</textarea>
      <button data-erc="send">Send to ERC</button> <button data-erc="post">Send to the case dashboard</button> <button data-erc="copy">Copy message only</button>`;
    box.querySelector('[data-erc=copy]').onclick = ev => copyText(box.querySelector('textarea'), ev.target);
    box.querySelector('[data-erc=post]').onclick = ev => postCase({ ...ercPacket(x), message: box.querySelector('textarea').value }, ev.target);
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

function renderSolar() {
  $('#solar').innerHTML = '<tr><th>Scenario</th><th class="n">Payback</th><th class="n">kWp</th><th class="n">Saves/yr</th></tr>' +
    solar(bill, bill.tracker, +$('#selfuse').value).map(s =>
      `<tr><td>${esc(s.name)}</td><td class="n"><b>${s.payback.toFixed(1)} yrs</b></td><td class="n">${s.kWp.toFixed(1)}</td><td class="n">${peso(s.save)}</td></tr>`).join('');
}
$('#selfuse').onchange = () => analysis && renderSolar();
$('#again').onclick = () => { bill = analysis = null; markSynthetic(); show('upload'); };
