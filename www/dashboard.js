// Concept triage view for Meralco staff: loads TANAW dispute files (format tanaw-dispute/1), strongest evidence first.
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
const packets = new Map(); // account|period -> newest file

function add(list, from) {
  let skipped = 0;
  for (const p of [].concat(list)) {
    const ok = p?.format === 'tanaw-dispute/1' && RANK[p.strength] && p.bill && Array.isArray(p.flags) && Array.isArray(p.checks);
    if (!ok) { skipped++; continue; }
    const key = `${p.customer_account_number}|${p.bill.period_end}`;
    if (!packets.has(key) || packets.get(key).created < p.created) packets.set(key, p);
  }
  if (skipped) $('#msg').textContent = `${skipped} item(s) in ${from} skipped: not a TANAW dispute file.`;
  render();
}

$('#files').onchange = async e => {
  $('#msg').textContent = '';
  for (const f of e.target.files) {
    try { add(JSON.parse(await f.text()), f.name); } catch { $('#msg').textContent = `${f.name} is not valid JSON.`; }
  }
  e.target.value = '';
};
$('#inbox').onclick = async () => {
  try { add(await (await fetch('api/cases', { cache: 'no-store' })).json(), 'the case inbox'); }
  catch { $('#msg').textContent = 'The case inbox needs the TANAW server (npm start).'; }
};
$('#samples').onclick = async () => add(await (await fetch('data/fixtures/SYNTHETIC_packets.json')).json(), 'the samples');

function render() {
  const waiting = p => p.meralco_follow_up?.days_waiting ?? -1;
  const list = [...packets.values()].sort((a, b) => RANK[b.strength] - RANK[a.strength] || waiting(b) - waiting(a)
    || b.bill.charges_this_period - a.bill.charges_this_period);
  const n = s => list.filter(p => p.strength === s).length;
  $('#summary').textContent = list.length ? `${list.length} dispute(s): ${n('strong')} strong, ${n('medium')} medium, ${n('weak')} weak.` : '';
  $('#list').innerHTML = list.map(card).join('');
}

function card(p) {
  const b = p.bill, f = p.meralco_follow_up, u = p.usage ?? {}, h = p.household_answers ?? { changes: [] };
  const top = p.flags.find(x => x.strength === p.strength) ?? p.flags[0];
  return `<details class="card"><summary>
      <span class="badge ${p.strength}">${p.strength.toUpperCase()}</span>
      ${b.source === 'synthetic' ? '<span class="badge syn">SYNTHETIC</span>' : ''}
      <b>CAN ${esc(p.customer_account_number ?? 'not given')}</b>, bill ${esc(b.period_start)} to ${esc(b.period_end)}, ${peso(b.charges_this_period)}, ${num(b.kwh)} kWh
      ${f ? `<br><b>Customer has waited ${num(f.days_waiting)} days since contacting Meralco (${esc(f.channel)}${f.reference ? `, reference ${esc(f.reference)}` : ''}). Escalated to the ERC.</b>` : ''}
      <br><small>${esc(top?.text)}</small></summary>
    <p class="note"><b>Suggested action:</b> ${ACTION[p.strength]}</p>
    <h3>Evidence</h3>
    <ul>${p.flags.map(x => `<li><span class="badge ${RANK[x.strength] ? x.strength : 'weak'}">${esc(x.strength)}</span> ${esc(x.text)}</li>`).join('')}</ul>
    <h3>The bill's own arithmetic</h3>
    <table>${p.checks.map(c => `<tr><td>${c.passed ? '✓' : '✗'} ${esc(c.name)}</td><td class="n">expected ${num(c.expected)}</td><td class="n">bill shows ${num(c.found)}</td></tr>`).join('')}</table>
    <h3>Against Meralco's published rates</h3>
    <p>Rate tables ${esc(p.rates?.last_month)} and ${esc(p.rates?.this_month)}. Bill minus published rates: ${peso(p.rates?.bill_minus_published_php)}.</p>
    <h3>Usage</h3>
    <p>Not explained by weather or billing days: ${peso(u.unexplained_change_php)} (${num(100 * u.share_of_last_bill)}% of last month's estimated ${peso(u.estimated_last_bill_php)}).
      Recent months: ${(p.tracker ?? []).slice(-6).map(t => `${esc(t.month)} ${num(t.kwh)} kWh`).join(', ')}.</p>
    <h3>The household says</h3>
    <p>${h.changes.length ? esc(h.changes.join('; ')) : 'No answers given.'}${h.note ? ` Note: "${esc(h.note)}"` : ''}</p>
    ${(h.gadgets ?? []).filter(g => g.new).length ? `<p>New appliances (customer's estimate): ${h.gadgets.filter(g => g.new).map(g =>
      `${esc(g.name)}${g.count > 1 ? ` × ${num(g.count)}` : ''}, ${num(g.hours ?? g.typical_hours)} h/day, about ${num(g.kwh)} kWh`).join('; ')}.
      Total about ${num(h.added_kwh ?? 0)} kWh vs ${num(u.unexplained_kwh)} kWh unexplained.</p>` : ''}
    ${p.meralco_advisory ? `<h3>Meralco's advisory for this rate month</h3><p>${esc(p.meralco_advisory.date)}: “${esc(p.meralco_advisory.text)}”
      ${/^https:\/\/(www\.)?meralco\.com\.ph\//.test(p.meralco_advisory.url) ? `<a href="${esc(p.meralco_advisory.url)}" target="_blank" rel="noopener">source</a>` : ''}</p>` : ''}
    <h3>Customer's message</h3>
    <pre>${esc(p.message)}</pre>
  </details>`;
}
