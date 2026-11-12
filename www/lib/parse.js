// Label-anchored parser over extract.js lines. Number follows its label on the same line.
const NUM = /\(?-?\d[\d,]*(?:\.\d+)?\)?/;
const toNum = s => (/^[(-]/.test(s) ? -1 : 1) * parseFloat(s.replace(/[(),-]/g, ''));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?(\d{4}|\d{2})$/i;

// shortcut: labels guessed until a real Meralco PDF is in hand (Gate 0, Q 0.2.3); fix the regexes then.
export const CHARGES = [
  ['generation', /generation charge/i], ['transmission', /transmission charge/i],
  ['system_loss', /system loss charge/i], ['distribution', /distribution charge/i],
  ['supply', /supply charge/i], ['metering', /metering charge/i],
  ['subsidies', /lifeline|senior citizen/i], ['tax_recovery_adj', /tax recovery adj/i],
  ['universal', /universal charge/i], ['fit_all', /fit-all/i], ['gea_all', /gea-all/i],
  ['vat', /value added tax|\bvat\b/i], ['franchise_tax', /franchise tax/i], ['refund', /refund/i],
];

// Several labels may share a line (subsidies + TRAC): each takes the first number before the next label.
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

function parseTracker(lines) {
  const i = lines.findIndex(l => l.items.filter(it => MON.test(it.str)).length >= 3);
  if (i < 0) return [];
  const months = lines[i].items.filter(it => MON.test(it.str));
  const isNum = it => /^[\d,]+(\.\d+)?$/.test(it.str);
  // shortcut: expects kWh printed as text on the line just below/above the month labels; image-only charts need OCR.
  const row = [lines[i + 1], lines[i - 1]].find(l => l && l.items.filter(isNum).length >= months.length);
  if (!row) return [];
  const nums = row.items.filter(isNum);
  return months.map(m => {
    const [, mon, yr] = m.str.match(MON);
    const n = nums.reduce((a, b) => (Math.abs(b.x - m.x) < Math.abs(a.x - m.x) ? b : a));
    return { month: `${yr.length === 2 ? '20' + yr : yr}-${String(MONTHS.indexOf(mon.toLowerCase()) + 1).padStart(2, '0')}`, kwh: toNum(n.str) };
  }).sort((a, b) => a.month.localeCompare(b.month));
}

export function parseBill(lines) {
  const texts = lines.map(l => l.items.map(i => i.str).join('  '));
  const field = re => {
    for (const t of texts) {
      const m = t.match(re);
      const n = m && t.slice(m.index + m[0].length).match(NUM);
      if (n) return toNum(n[0]);
    }
    return null;
  };
  // shortcut: assumes MM/DD/YYYY billing dates; adjust to the real bill's format.
  const dates = [...(texts.find(t => /billing period/i.test(t)) ?? '').matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)]
    .map(m => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  const [ps, pe] = dates;
  const prev = field(/previous reading/i), cur = field(/current reading/i), mult = field(/multiplier/i) ?? 1;
  return {
    period_start: ps ?? null,
    period_end: pe ?? null,
    days: ps && pe ? (Date.parse(pe) - Date.parse(ps)) / 864e5 + 1 : null,
    kwh: field(/kwh used/i) ?? (cur - prev) * mult,
    previous_reading: prev,
    current_reading: cur,
    multiplier: mult,
    tracker: parseTracker(lines),
    charges: texts.flatMap(chargesOnLine),
    charges_this_period: field(/charges for this billing period/i),
    remaining_balance: field(/remaining balance/i) ?? 0,
    installment_due: field(/installment due/i) ?? 0,
    total_amount_due: field(/total amount due/i),
    city: texts.join('\n').match(/service address:?\s*(.+)/i)?.[1].split(',').at(-1).trim() ?? null,
    source: texts.some(t => /SYNTHETIC/.test(t)) ? 'synthetic' : 'pdf_text',
  };
}
