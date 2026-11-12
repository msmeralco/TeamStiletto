// Label-anchored parser over extract.js lines, fitted to the My Meralco PDF statement (2026 layout).
const NUM = /\(?-?\d[\d,]*(?:\.\d+)?\)?/;
const toNum = s => (/^[(-]/.test(s) ? -1 : 1) * parseFloat(s.replace(/[(),-]/g, ''));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Page-1 "Bill Computation Summary" categories; they add up to "Charges for this billing period".
export const CHARGES = [
  ['generation', /\bgeneration\b/i], ['transmission', /\btransmission\b/i], ['system_loss', /system loss/i],
  ['distribution', /\bdistribution\b/i], ['senior_subsidy', /senior citizen/i], ['taxes', /government taxes/i],
  ['universal', /universal charge/i], ['fit_all', /fit-all/i], ['gea_all', /gea-all/i], ['lifeline', /\blifeline\b/i],
  ['refund', /refund/i], ['other', /other charges/i],
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

export function parseBill(lines) {
  const texts = lines.map(l => l.items.map(i => i.str).join('  '));
  const field = re => {
    for (let i = 0; i < lines.length; i++) {
      const m = texts[i].match(re);
      if (!m) continue;
      const n = texts[i].slice(m.index + m[0].length).match(NUM);
      if (n) return toNum(n[0]);
      // The statement prints many values on the line(s) under their label, in the same column.
      const x = lines[i].items.find(it => re.test(it.str))?.x;
      for (const l of x == null ? [] : lines.slice(i + 1, i + 4)) {
        const it = l.items.find(it => Math.abs(it.x - x) < 15 && NUM.test(it.str));
        if (it) return toNum(it.str.match(NUM)[0]);
      }
    }
    return null;
  };
  const d = texts.join('\n').match(/(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}) to (\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/);
  const iso = (dd, mon, yyyy) => `${yyyy}-${String(MONTHS.indexOf(mon.toLowerCase()) + 1).padStart(2, '0')}-${dd.padStart(2, '0')}`;
  const ps = d && iso(d[1], d[2], d[3]), pe = d && iso(d[4], d[5], d[6]);
  const prev = field(/previous reading/i), cur = field(/current reading/i), mult = field(/^multi(plier)?\b/i) ?? 1;
  const from = texts.findIndex(t => /charges for this billing period/i.test(t)), to = texts.findIndex(t => /total amount due/i.test(t));
  return {
    period_start: ps,
    period_end: pe,
    days: ps && pe ? (Date.parse(pe) - Date.parse(ps)) / 864e5 + 1 : null,
    kwh: field(/actual consumption|kwh used/i) ?? (cur - prev) * mult,
    previous_reading: prev,
    current_reading: cur,
    multiplier: mult,
    tracker: parseTracker(lines, pe),
    charges: from >= 0 && to > from ? texts.slice(from + 1, to).flatMap(chargesOnLine) : [],
    charges_this_period: field(/charges for this billing period/i),
    remaining_balance: field(/remaining balance/i) ?? 0,
    installment_due: field(/installment due/i) ?? 0,
    total_amount_due: field(/total amount due/i),
    source: texts.some(t => /SYNTHETIC/.test(t)) ? 'synthetic' : 'pdf_text',
  };
}
