// Concept triage view for Meralco staff: TANAW dispute files (format tanaw-dispute/1), strongest evidence first.
// Disputes sent from the app arrive by themselves: the inbox on the TANAW server (npm start) is polled every few seconds.
import { caseKey, route, ROUTES } from './lib/disputes.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); // dispute files are untrusted
const num = v => Number(v).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const peso = v => `${Number(v) < 0 ? '−' : ''}₱${Math.abs(Number(v)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const RANK = { strong: 3, medium: 2, weak: 1 };
const ACTION = {
  strong: "Recheck the meter reading and the bill computation: the bill does not add up on its own numbers, or against Meralco's published rates.",
  medium: 'Check for a missed or estimated reading, and consider a re-read: usage rose without a household reason.',
  weak: 'Likely correct. Explain the bill to the customer; no recomputation indicated.',
};
const POLL_MS = 4000, NEAR_DAYS = 11; // shortcut: polling, fine for one demo laptop; many staff screens would want server push
const packets = new Map(); // case key -> newest file
const fresh = new Set(); // keys that arrived from the inbox since the last render: flashed once
let filter = 'open', lane = 'meralco', selected = null, inboxSeen = false;
const LANE_HINT = {
  meralco: 'Needs a person at Meralco: strong or medium evidence, or a question the chatbot could not answer.',
  chatbot: 'The chatbot already answered these: no sign of a billing error, or weak evidence only. Move one to Meralco tickets if it needs a person.',
};

// Days the customer has waited since the case first arrived.
const waiting = p => Math.max(0, Math.floor((Date.now() - Date.parse(p.first_received ?? p.received ?? p.created)) / 864e5) || 0);
const status = p => p.status ?? 'open';

function add(list, from, live = false) {
  let skipped = 0, changed = false;
  for (let p of [].concat(list)) {
    const obj = x => x !== null && typeof x === 'object';
    const ok = p?.format === 'tanaw-dispute/1' && RANK[p.strength] && obj(p.bill) && Array.isArray(p.flags) && p.flags.every(obj) && Array.isArray(p.checks) && p.checks.every(obj);
    if (!ok) { skipped++; continue; }
    // A file loaded by hand comes from a customer: it can't pick its own lane (route_override is staff-only, like on the server).
    const { route_override, ...q } = p;
    p = { ...(live ? p : q), unanswered_questions: Array.isArray(p.unanswered_questions) ? p.unanswered_questions.map(String) : [] };
    const key = caseKey(p), old = packets.get(key);
    if (old && JSON.stringify(old) === JSON.stringify(p)) continue;
    if (live || !old || old.created < p.created) { packets.set(key, p); changed = true; if (live && inboxSeen && (!old || old.created !== p.created)) fresh.add(key); }
  }
  if (skipped) $('#msg').textContent = `${skipped} item(s) in ${from} skipped: not a TANAW dispute file.`;
  if (changed) render();
}

$('#files').onchange = async e => {
  $('#msg').textContent = '';
  for (const f of e.target.files) {
    try { add(JSON.parse(await f.text()), f.name); } catch { $('#msg').textContent = `${f.name} is not valid JSON.`; }
  }
  e.target.value = '';
};
$('#samples').onclick = async () => add([...await (await fetch('data/fixtures/SYNTHETIC_packets.json')).json(), ...await (await fetch('data/fixtures/SYNTHETIC_scenario_packets.json')).json()], 'the samples');

async function poll() {
  try {
    const res = await fetch('api/cases', { cache: 'no-store' });
    if (!res.ok) throw 0;
    add(await res.json(), 'the case inbox', true);
    inboxSeen = true;
    $('#live').className = 'on';
    $('#livetext').textContent = 'Live: new disputes appear by themselves';
  } catch {
    $('#live').className = '';
    $('#livetext').textContent = 'Inbox offline (needs npm start). Load files by hand.';
  }
}
poll();
setInterval(() => !document.hidden && poll(), POLL_MS);

const FILTERS = [
  ['open', 'Open', p => status(p) !== 'resolved'], ['strong', 'Strong', p => p.strength === 'strong' && status(p) !== 'resolved'],
  ['medium', 'Medium', p => p.strength === 'medium' && status(p) !== 'resolved'], ['weak', 'Weak', p => p.strength === 'weak' && status(p) !== 'resolved'],
  ['resolved', 'Resolved', p => status(p) === 'resolved'],
];
const said = p => { const h = p.household_answers ?? {}; return h.note || (h.changes ?? []).join('; '); };
const topFlag = p => p.flags.find(x => x.strength === p.strength) ?? p.flags[0];
// What the row leads with: the strongest flag, else the first question the chatbot could not answer.
const lead = p => topFlag(p)?.text ?? (p.unanswered_questions[0] ? `Question: “${p.unanswered_questions[0]}”` : 'No flags');
const strengthBadge = p => p.flags.length ? `<span class="badge ${p.strength}">${p.strength}</span>` : '<span class="badge">question</span>';

function render() {
  const every = [...packets.values()], inLane = l => every.filter(p => route(p).to === l);
  $('#lanes').innerHTML = Object.entries(ROUTES).map(([k, l]) =>
    `<button data-lane="${k}" aria-pressed="${k === lane}">${l === ROUTES.meralco ? 'Meralco tickets' : l} ${inLane(k).filter(FILTERS[0][2]).length}</button>`).join('');
  $('#lanehint').textContent = LANE_HINT[lane];
  const all = inLane(lane), open = all.filter(FILTERS[0][2]);
  $('#tiles').innerHTML = [['Open cases', open.length, ''], ['Strong evidence', open.filter(p => p.strength === 'strong').length, 'var(--bad)'],
    [`Waiting ${NEAR_DAYS}+ days`, open.filter(p => waiting(p) >= NEAR_DAYS).length, 'var(--brand-ink)'], ['Resolved', all.length - open.length, 'var(--ok)']]
    .map(([l, n, c]) => `<div class="tile"><span>${l}</span><b style="color:${c || 'inherit'}">${n}</b></div>`).join('');
  $('#chips').innerHTML = FILTERS.map(([k, l, f]) => `<button data-f="${k}" aria-pressed="${k === filter}">${l} ${all.filter(f).length}</button>`).join('');
  const q = $('#q').value.trim().toLowerCase();
  const list = all.filter(FILTERS.find(f => f[0] === filter)[2])
    .filter(p => !q || [p.customer_account_number, said(p), ...p.flags.map(f => f.text), ...p.unanswered_questions].join(' ').toLowerCase().includes(q))
    .sort((a, b) => RANK[b.strength] - RANK[a.strength] || waiting(b) - waiting(a) || b.bill.charges_this_period - a.bill.charges_this_period);
  $('#queue').innerHTML = !list.length ? '' : `<thead><tr><th>Strength</th><th>Case</th><th>Top flag</th><th>The household says</th><th class="n">Bill</th><th class="n">Waiting</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(p => { const k = caseKey(p), w = waiting(p); return `<tr data-k="${esc(k)}" class="${k === selected ? 'sel' : ''} ${fresh.has(k) ? 'new' : ''}">
      <td>${strengthBadge(p)}${p.bill.source === 'synthetic' ? '<br><span class="badge">synthetic</span>' : ''}</td>
      <td><b>CAN ${esc(p.customer_account_number ?? 'not given')}</b><br><span class="hint">${esc(p.bill.period_start)} to ${esc(p.bill.period_end)}</span></td>
      <td>${esc(lead(p))}</td>
      <td class="hint">${said(p) ? `“${esc(said(p))}”` : 'No answers given'}</td>
      <td class="n"><b>${peso(p.bill.charges_this_period)}</b><br><span class="hint">${num(p.bill.kwh)} kWh</span></td>
      <td class="n" style="${w >= NEAR_DAYS ? 'color:var(--bad);font-weight:700' : ''}">${num(w)} d</td>
      <td><span class="badge ${status(p)}">${status(p)}</span></td>
      <td><button data-open>Open case</button></td></tr>`; }).join('')}</tbody>`;
  $('#empty').hidden = list.length > 0;
  $('#empty').textContent = all.length ? 'No cases match this view.' : lane === 'meralco'
    ? 'No Meralco tickets yet. When a customer taps “Send ticket to Meralco” in the app, it appears here by itself.'
    : 'Nothing handled by the chatbot yet. Cases a customer sends with “Send anyway” appear here.';
  fresh.clear();
  if (selected && !document.activeElement?.matches('#reply')) renderCase(); // don't wipe a reply being typed
}

$('#chips').onclick = e => { const f = e.target.dataset.f; if (f) { filter = f; render(); } };
$('#lanes').onclick = e => { const l = e.target.closest('[data-lane]')?.dataset.lane; if (l) { lane = l; selected = null; $('#case').hidden = true; render(); } };
$('#q').oninput = render;
$('#queue').onclick = e => {
  const tr = e.target.closest('tr[data-k]');
  if (!tr) return;
  selected = tr.dataset.k;
  render();
  $('#case').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
};

function renderCase() {
  const p = packets.get(selected);
  $('#case').hidden = !p;
  if (!p) return;
  const b = p.bill, u = p.usage ?? {}, h = p.household_answers ?? { changes: [] };
  const way = route(p), other = way.to === 'meralco' ? 'chatbot' : 'meralco', asked = p.unanswered_questions;
  const action = p.flags.some(x => x.strength !== 'weak') || !asked.length ? ACTION[p.strength] : "Answer the customer's question below: the chatbot found no answer in the bill or Meralco's advisory.";
  $('#case').innerHTML = `
    <div class="head">
      <div><div class="row"><h2>CAN ${esc(p.customer_account_number ?? 'not given')}</h2>${strengthBadge(p)}
        <span class="badge ${status(p)}">${status(p)}</span><span class="hint">waiting ${num(waiting(p))} days</span></div>
        <span class="hint">Bill ${esc(b.period_start)} to ${esc(b.period_end)} · ${peso(b.charges_this_period)} · ${num(b.kwh)} kWh${b.source === 'photo_ocr' ? ' · read from a photo (OCR), confirmed by the customer' : ''}</span></div>
      <button id="close">Close</button>
    </div>
    <p class="note"><b>${ROUTES[way.to]}.</b> ${esc(way.why)}
      <button id="move" class="link">Move to ${other === 'meralco' ? 'Meralco tickets' : ROUTES.chatbot.toLowerCase()}</button></p>
    <p class="note"><b>Suggested action:</b> ${esc(action)}</p>
    <div class="cols">
      ${asked.length ? `<div><h3>Questions the chatbot could not answer</h3><ul>${asked.map(x => `<li>“${esc(x)}”</li>`).join('')}</ul></div>` : ''}
      <div><h3>Evidence</h3>${p.flags.length ? `<ul>${p.flags.map(x => `<li><span class="badge ${RANK[x.strength] ? x.strength : ''}">${esc(x.strength)}</span> ${esc(x.text)}</li>`).join('')}</ul>` : '<p>No billing-error flags.</p>'}</div>
      <div><h3>The bill's own arithmetic</h3>
        <table>${p.checks.map(c => `<tr><td>${c.passed ? '✓' : '✗'} ${esc(c.name)}</td><td class="n">expected ${num(c.expected)}</td><td class="n">shows ${num(c.found)}</td></tr>`).join('')}</table>
        <p>Against Meralco's published rates (${esc(p.rates?.last_month)}, ${esc(p.rates?.this_month)}): bill minus published ${peso(p.rates?.bill_minus_published_php)}.</p></div>
      <div><h3>Usage</h3>
        <p>Not explained by weather or billing days: ${peso(u.unexplained_change_php)} (${num(100 * u.share_of_last_bill)}% of last month's estimated ${peso(u.estimated_last_bill_php)}).</p>
        <p>Recent months: ${(p.tracker ?? []).slice(-6).map(t => `${esc(t.month)} ${num(t.kwh)} kWh`).join(', ')}.</p></div>
      <div><h3>The household says${h.parser && h.parser !== 'rules' ? ` (answers read by ${esc(h.parser)})` : ''}</h3>
        <p>${h.changes.length ? esc(h.changes.join('; ')) : 'No answers given.'}${h.note ? ` Note: “${esc(h.note)}”` : ''}</p>
        ${(h.gadgets ?? []).filter(g => g.new).length ? `<p>New appliances (customer's estimate): ${h.gadgets.filter(g => g.new).map(g =>
          `${esc(g.name)}${g.count > 1 ? ` × ${num(g.count)}` : ''}, ${num(g.hours ?? g.typical_hours)} h/day, about ${num(g.kwh)} kWh`).join('; ')}.
          Total about ${num(h.added_kwh ?? 0)} kWh vs ${num(u.unexplained_kwh)} kWh unexplained.</p>` : ''}</div>
      ${p.meralco_advisory ? `<div><h3>Meralco's advisory for this rate month</h3><p>${esc(p.meralco_advisory.date)}: “${esc(p.meralco_advisory.text)}”
        ${/^https:\/\/(www\.)?meralco\.com\.ph\//.test(p.meralco_advisory.url) ? `<a href="${esc(p.meralco_advisory.url)}" target="_blank" rel="noopener">source</a>` : ''}</p></div>` : ''}
      <div><h3>Customer's message</h3><pre>${esc(p.message)}</pre></div>
    </div>
    <h3 style="margin-top:18px"><label for="reply">Reply to the customer (shown in their “My disputes”)</label></h3>
    <textarea id="reply" rows="3" placeholder="e.g. We scheduled a meter re-read for Friday.">${esc(p.reply)}</textarea>
    <div class="row"><button id="sendreply" class="primary" style="width:auto;min-height:44px;font-size:14px">Send reply</button>
      <button id="resolve">${status(p) === 'resolved' ? 'Reopen case' : 'Mark resolved'}</button><span id="saved" class="hint" role="status"></span></div>`;
  $('#close').onclick = () => { selected = null; render(); $('#case').hidden = true; };
  $('#sendreply').onclick = () => setStatus(p, 'replied');
  $('#resolve').onclick = () => setStatus(p, status(p) === 'resolved' ? 'open' : 'resolved');
  $('#move').onclick = async () => {
    if (await setStatus(p, status(p), other) === false) return;
    selected = null; $('#case').hidden = true; render();
    $('#msg').textContent = `Moved CAN ${p.customer_account_number ?? ''} to ${other === 'meralco' ? 'Meralco tickets' : ROUTES.chatbot}.`;
  };
}

async function setStatus(p, s, to) {
  const reply = $('#reply').value.trim();
  if (s === 'replied' && !reply) { $('#saved').textContent = 'Write the reply first.'; return false; }
  try { // files loaded by hand are not in the inbox: the status then stays on this screen only
    await fetch('api/cases/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: caseKey(p), status: s, reply, route: to }) });
  } catch { /* inbox offline */ }
  Object.assign(p, { status: s, reply }, to ? { route_override: to } : {});
  $('#reply').blur();
  render();
  $('#saved').textContent = s === 'replied' ? 'Reply sent.' : s === 'resolved' ? 'Marked resolved.' : 'Reopened.';
}
render();
