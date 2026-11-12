// Label-anchored parser over extract.js lines, fitted to the My Meralco PDF statement (2026 layout).
// Page 1 always; page 2 ("How your bill was computed") when present and a bill spec (data/bill_spec.json) is given.
const NUM = /\(?-?\d[\d,]*(?:\.\d+)?\)?/;
export const toNum = s => (/^[(-]/.test(s) ? -1 : 1) * parseFloat(s.replace(/[(),-]/g, ''));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (dd, mon, yyyy) => `${yyyy}-${String(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}-${dd.padStart(2, '0')}`;

// Page-1 "Bill Computation Summary" categories; they add up to "Charges for this billing period".
export const CHARGES = [
  ['generation', /\bgeneration\b/i], ['transmission', /\btransmission\b/i], ['system_loss', /system loss/i],
  ['distribution', /\bdistribution\b/i], ['senior_subsidy', /senior citizen/i], ['taxes', /government taxes/i],
  ['universal', /universal charge/i], ['fit_all', /fit-all/i], ['gea_all', /gea-all/i], ['lifeline', /\blifeline\b/i],
  ['refund', /refund/i], ['credits', /applied credits/i], ['other', /other charges/i],
];

// Several labels may share a printed line: each takes the first number before the next label.
function chargesOnLine(t) {
  const hits = CHARGES.flatMap(([key, re]) => {
    const m = t.match(re);
    return m ? [{ key, i: m.index, end: m.index + m[0].length }] : [];
  }).sort((a, b) => a.i - b.i);
  return hits.flatMap((h, j) => {
    const m = t.slice(h.end, hits[j + 1]?.i ?? t.length).match(NUM);
    return m ? [{ key: h.key, label: t.slice(h.i, h.end + m.index).trim(), amount_php: toNum(m[0]) }] : [];
  });
}

// Tracker: two rows of 12 cells (Jan..Dec), no month labels in the text. Upper row = the bill's year
// ('-' for months not billed yet), lower row = the year before.
function parseTracker(lines, periodEnd) {
  const cells = l => l.items.filter(it => /^(\d[\d,]*|-)$/.test(it.str)).sort((a, b) => a.x - b.x);
  const i = lines.findIndex((l, j) => cells(l).length === 12 && lines[j + 1] && cells(lines[j + 1]).length === 12);
  if (i < 0 || !periodEnd) return [];
  const y = +periodEnd.slice(0, 4);
  return [[lines[i + 1], y - 1], [lines[i], y]]
    .flatMap(([l, yr]) => cells(l).map((c, m) => ({ month: `${yr}-${String(m + 1).padStart(2, '0')}`, s: c.str })))
    .filter(c => c.s !== '-' && c.month <= periodEnd.slice(0, 7))
    .map(c => ({ month: c.month, kwh: toNum(c.s) }));
}

// ---------- page 2: "How your bill was computed", "Energy Bill Amount", "What you've paid" ----------
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const VAL = /^(\(?-?\d[\d,]*(?:\.\d+)?\)?)\s*(kwh|mo|%)?$/i; // "857 kWh", "1.00 mo", "11.9900%", "-0.43"

// One printed column (left: x < 300, right: x >= 300) as rows { y, label, vals: [{ n, unit }] }, top to bottom.
// A label and its numbers are sometimes printed a few points apart, so a numbers-only row joins the nearest label-only row.
function columnRows(lines, page, right) {
  const rows = lines.filter(l => l.page === page).map(l => {
    const items = l.items.filter(it => (it.x >= 300) === right);
    const vals = items.flatMap(it => { const m = it.str.match(VAL); return m ? [{ n: toNum(m[1]), unit: (m[2] ?? '').toLowerCase() }] : []; });
    return { y: l.y, label: items.filter(it => !VAL.test(it.str)).map(it => it.str).join(' ').trim(), vals };
  }).filter(r => r.label || r.vals.length);
  for (const o of rows.filter(r => !r.label)) {
    const near = rows.filter(r => r.label && !r.vals.length && Math.abs(r.y - o.y) <= 6).sort((a, b) => Math.abs(a.y - o.y) - Math.abs(b.y - o.y))[0];
    if (near) { near.vals = o.vals; o.vals = []; }
  }
  return rows.filter(r => r.label);
}

function parseDetail(lines, spec) {
  const page = lines.find(l => l.items.some(it => /how your bill was computed/i.test(it.str)))?.page;
  if (!page || !spec) return null;
  const L = columnRows(lines, page, false), R = columnRows(lines, page, true);
  // Reading order: the left column below its "Rate Components" header, then the right column below "Continued".
  const head = L.findIndex(r => /^rate components/i.test(r.label)), foot = L.findIndex((r, i) => i > head && /^reminders when paying/i.test(r.label));
  const cont = R.findIndex(r => /^continued/i.test(r.label)), rHead = R.findIndex((r, i) => i > cont && /^rate components/i.test(r.label));
  const eba = R.findIndex(r => /^energy bill amount/i.test(r.label));
  if (head < 0) return null;
  const rows = [...L.slice(head + 1, foot < 0 ? undefined : foot), ...(cont >= 0 ? R.slice((rHead < 0 ? cont : rHead) + 1) : eba >= 0 ? R.slice(eba) : [])];

  const out = { groups: [], energy: {}, applied_credits: null, adjustments: [] };
  let mode = 'groups', group = null, ctx = null;
  for (const r of rows) {
    const last = r.vals.at(-1)?.n;
    if (/^charges for this billing period/i.test(r.label)) break;
    if (/^energy bill amount/i.test(r.label)) { mode = 'energy'; continue; }
    if (mode === 'energy') {
      if (/^vat sales/i.test(r.label)) Object.assign(out.energy, { vat_sales_base: r.vals[0]?.n, vat_sales_vat: r.vals[1]?.n });
      else if (/^vat zero rated/i.test(r.label)) out.energy.vat_zero_rated = last;
      else if (/^non-?vat/i.test(r.label)) out.energy.non_vat = last;
      else if (/^total energy amount/i.test(r.label)) { out.energy.total_energy_amount = last; mode = 'credits'; }
      continue;
    }
    if (mode === 'credits') { // lines between Total Energy Amount and Charges for this billing period
      if (/^applied credits/i.test(r.label)) out.applied_credits = last;
      else if (r.vals.length) out.adjustments.push({ label: r.label, amount: last });
      continue;
    }
    const h = r.label.match(/^(.*?)\s+(-?\d+(?:\.\d+)?)%$/);
    if (h && r.vals.length === 1) {
      const g = spec.groups.find(g => norm(g.label) === norm(h[1]));
      out.groups.push(group = { key: g?.key ?? slug(h[1]), label: h[1], pct: +h[2], amount: last, lines: [] });
      ctx = null;
    } else if (!group) continue;
    else if (!r.vals.length) ctx = /^value added tax/i.test(r.label) ? 'vat' : /^energy tax/i.test(r.label) ? 'energy_tax' : ctx;
    else {
      const full = ctx === 'vat' ? `VALUE ADDED TAX: ${r.label}` : ctx === 'energy_tax' ? `ENERGY TAX / ${r.label}` : r.label;
      const lineIn = g => g?.lines.find(l => [l.label, ...(l.alt ?? [])].some(x => norm(x) === norm(full)));
      let known = lineIn(spec.groups.find(g => g.key === group.key));
      // A group that nets to 0.00 is printed without its header (seen: Senior Citizen): its lines open the group themselves.
      const home = !known && spec.groups.find(g => g.key !== group.key && lineIn(g));
      if (home && !out.groups.some(g => g.key === home.key)) {
        out.groups.push(group = { key: home.key, label: home.label, pct: null, amount: null, lines: [] });
        known = lineIn(home);
      }
      let key = known?.key ?? slug(full);
      while (group.lines.some(l => l.key === key)) key += '_';
      const [b, p] = r.vals;
      group.lines.push({ key, label: full, basis: known?.basis ?? null,
        ...(r.vals.length >= 3 ? { base: b.n, price: p.n, percent: p.unit === '%' } : {}), amount: last });
    }
  }
  for (const g of out.groups) if (g.amount == null) g.amount = Math.round(g.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  return out.groups.length ? out : null;
}

// "What you've paid": payments already applied, newest first as printed.
function parsePayments(lines) {
  const page = lines.find(l => l.items.some(it => /what you've paid/i.test(it.str)))?.page;
  if (!page) return [];
  return lines.filter(l => l.page === page).flatMap(l => {
    const t = l.items.filter(it => it.x < 300).map(it => it.str).join(' ');
    const m = t.match(/^(\d{1,2}) ([A-Za-z]{3})-(\d{1,2}) ([A-Za-z]{3}) (\d{4})\s+(\d{1,2}) ([A-Za-z]{3}) (\d{4})\s+(.+?)\s+\S?\s*([\d,]+\.\d{2})$/);
    return m ? [{ billing_period: `${m[1]} ${m[2]}-${m[3]} ${m[4]} ${m[5]}`, period_end: iso(m[3], m[4], m[5]), posting_date: iso(m[6], m[7], m[8]), channel: m[9].trim(), amount_php: toNum(m[10]) }] : [];
  });
}

export function parseBill(lines, spec = null) {
  const texts = lines.map(l => l.items.map(i => i.str).join('  '));
  const field = (re, as = toNum) => {
    for (let i = 0; i < lines.length; i++) {
      const m = texts[i].match(re);
      if (!m) continue;
      const n = texts[i].slice(m.index + m[0].length).match(NUM);
      if (n) return as(n[0]);
      // The statement prints many values on the line(s) under their label, in the same column.
      const x = lines[i].items.find(it => re.test(it.str))?.x;
      for (const l of x == null ? [] : lines.slice(i + 1, i + 4)) {
        const it = l.items.find(it => Math.abs(it.x - x) < 15 && NUM.test(it.str));
        if (it) return as(it.str.match(NUM)[0]);
      }
    }
    return null;
  };
  const first = (re, as = m => toNum(m[1])) => { for (const t of texts) { const m = t.match(re); if (m) return as(m); } return null; };
  const d = texts.join('\n').match(/(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}) to (\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/);
  const ps = d && iso(d[1], d[2], d[3]), pe = d && iso(d[4], d[5], d[6]);
  const prev = field(/previous reading/i), cur = field(/current reading/i), mult = field(/^multi(plier)?\b/i) ?? 1;
  const from = texts.findIndex(t => /charges for this billing period/i.test(t)), to = texts.findIndex(t => /total amount due/i.test(t));
  const kwh = field(/actual consumption|kwh used/i) ?? (cur - prev) * mult;

  // "This bill is 71% higher (+355kWh) vs" + "previous billing period" / "same period last year" on a line just below.
  const vs = {};
  texts.forEach((t, i) => {
    const m = t.match(/this bill is (\d+)% (higher|lower) \(([+-]?[\d,]+)\s*kwh\) vs/i);
    const which = m && texts.slice(i, i + 4).map(x => (/previous billing period/i.test(x) ? 'previous' : /same period last year/i.test(x) ? 'last_year' : null)).find(Boolean);
    if (which && !vs[which]) vs[which] = { kwh: (m[2] === 'lower' ? -1 : 1) * Math.abs(toNum(m[3])), pct: (m[2] === 'lower' ? -1 : 1) * +m[1] };
  });
  const avg = first(/(?:^|\s)(\d[\d,]*)\s+kWh\s+(\d+(?:\.\d+)?)\s+kWh\s+\S*\s*(\d[\d,]*(?:\.\d+)?)\s*$/, m => m.slice(1, 4).map(toNum));

  const tracker = parseTracker(lines, pe);
  // The bill's own "vs same period last year" line is the reliable figure for last year's same month: the tracker cell for
  // that month has been seen holding this year's value instead (real statements, Aug-Sep 2026).
  const lastYear = pe && tracker.find(t => t.month === `${+pe.slice(0, 4) - 1}${pe.slice(4, 7)}`);
  if (lastYear && vs.last_year && kwh != null) lastYear.kwh = kwh - vs.last_year.kwh;

  return {
    can: field(/customer account number/i, s => s), // kept as text: an account number, not a quantity
    period_start: ps,
    period_end: pe,
    days: ps && pe ? (Date.parse(pe) - Date.parse(ps)) / 864e5 + 1 : null,
    kwh,
    previous_reading: prev,
    current_reading: cur,
    multiplier: mult,
    tracker,
    charges: from >= 0 && to > from ? texts.slice(from + 1, to).flatMap(chargesOnLine) : [],
    charges_this_period: field(/charges for this billing period/i),
    remaining_balance: field(/remaining balance/i) ?? 0,
    installment_due: field(/installment due/i) ?? 0,
    total_amount_due: field(/total amount due/i),
    rate_this_month: first(/(\d+(?:\.\d+)?) per kWh/i),
    avg_monthly_kwh: avg?.[0] ?? null, avg_daily_kwh: avg?.[1] ?? null, avg_daily_cost: avg?.[2] ?? null,
    ghg_tco2: first(/(\d+\.\d+)\s+tCO/),
    vs_previous_kwh: vs.previous?.kwh ?? null, vs_previous_pct: vs.previous?.pct ?? null,
    vs_last_year_kwh: vs.last_year?.kwh ?? null, vs_last_year_pct: vs.last_year?.pct ?? null,
    detail: parseDetail(lines, spec),
    payments: parsePayments(lines),
    source: texts.some(t => /SYNTHETIC/.test(t)) ? 'synthetic' : 'pdf_text',
  };
}
