// Export-aware rooftop solar payback. Every constant is shown on screen with its source.
// Challenge 1 crossover (compare solar options), added on request next to the Challenge 2 bill explanation.
export const SOLAR = { Y: 1402.1, C: 60000, fees: 1500 + 3000 };

const yearKwh = tracker => { const last12 = tracker.slice(-12); return last12.reduce((t, m) => t + m.kwh, 0) * 12 / last12.length; }; // annualised if fewer than 12 months printed
const genRate = bill => (bill.charges.find(c => c.key === 'generation')?.amount_php ?? 0) / bill.kwh; // export credit = bill's generation ₱/kWh

// This bill again, as if the household had a kWp system: home use saves the full ₱/kWh, exports are credited at the generation charge.
// shortcut: average-year sun (no rainy-season dip) and the retail ₱/kWh includes fixed charges, so savings run slightly high; use monthly yield if it matters.
export function withSolar(bill, kWp, s = 0.4) {
  const E = kWp * SOLAR.Y * bill.days / 365, self = Math.min(E, bill.kwh * s), exported = E - self;
  const after = bill.charges_this_period - self * (bill.charges_this_period / bill.kwh) - exported * genRate(bill);
  return { generated: E, self, exported, bill: Math.max(after, 0), credit: Math.max(-after, 0) }; // credit: carried to the next bill
}

export function solar(bill, tracker, s = 0.4) {
  const A = yearKwh(tracker), retail = bill.charges_this_period / bill.kwh, G = genRate(bill);
  const row = (name, kWp, exportAware) => {
    const E = kWp * SOLAR.Y, self = exportAware ? Math.min(E, A * s) : E, save = self * retail + (E - self) * G;
    return { name, kWp, save, payback: (kWp * SOLAR.C + SOLAR.fees) / save, quote: withSolar(bill, kWp, s) };
  };
  return [
    row('Offset all usage, valued at retail (how it is usually sold)', A / SOLAR.Y, false),
    row('Offset all usage, export-aware', A / SOLAR.Y, true),
    row('Right-sized for self-consumption', A * s / SOLAR.Y, true),
  ];
}

// Opt-in lead for MSpectrum (Meralco's solar company). Only what an installer needs for a first call:
// never the account number, the bill PDF or the readings.
export const LEAD_FORMAT = 'tanaw-solar-lead/1';
const MOBILE = /^(?:\+?63|0)9\d{9}$/; // Philippine mobile: 09XXXXXXXXX or +639XXXXXXXXX
export function solarLead(bill, rows, s, { name = '', mobile = '', area = '' }, consent) {
  return { format: LEAD_FORMAT, consent: consent === true, name, mobile, area, synthetic: bill.source === 'synthetic', daytime_share: s,
    kwh_per_year: Math.round(yearKwh(bill.tracker)), monthly_kwh: bill.tracker.slice(-12).map(m => m.kwh), bill_php: bill.charges_this_period,
    options: rows.map(r => ({ name: r.name, kWp: +r.kWp.toFixed(2), bill_with_solar_php: Math.round(r.quote.bill), save_per_year_php: Math.round(r.save), payback_years: +r.payback.toFixed(1) })) };
}

// Trust boundary (the server and the browser both run it): a lead without consent or a valid mobile is dropped, unknown fields are dropped.
export function cleanLead(p) {
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : ''), fin = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const mobile = str(p?.mobile, 30).replace(/[\s-]/g, '');
  if (p?.format !== LEAD_FORMAT || p.consent !== true || !MOBILE.test(mobile) || !fin(p.kwh_per_year) || !fin(p.bill_php) || !fin(p.daytime_share)) return null;
  const options = Array.isArray(p.options) ? p.options.slice(0, 3) : [];
  if (!options.length || !options.every(o => ['kWp', 'bill_with_solar_php', 'save_per_year_php', 'payback_years'].every(k => fin(o?.[k])))) return null;
  return { format: LEAD_FORMAT, consent: true, name: str(p.name, 80), mobile, area: str(p.area, 80), synthetic: p.synthetic === true, daytime_share: p.daytime_share,
    kwh_per_year: p.kwh_per_year, monthly_kwh: (Array.isArray(p.monthly_kwh) ? p.monthly_kwh : []).slice(-12).filter(fin), bill_php: p.bill_php,
    options: options.map(o => ({ name: str(o.name, 80), kWp: o.kWp, bill_with_solar_php: o.bill_with_solar_php, save_per_year_php: o.save_per_year_php, payback_years: o.payback_years })) };
}
