// Meralco "Residential Bills at Typical Consumption Levels" PDFs (data/rates_pdfs/*.pdf) -> www/data/rates.json.
// Reads the per-kWh table (rows after the 2nd "For Lifeline Customers"). Fails loudly on an unknown layout or a row that doesn't add up.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLines } from '../www/lib/extract.js';
import { validateRates } from '../www/lib/explain.js';

// Meralco changes the columns between months; each header row is mapped by position once, by hand.
const BASE = ['generation', 'transmission', 'system_loss', 'distribution', 'supply', 'supply_cust', 'metering', 'metering_cust', 'awat_1', 'reg_reset'];
const LAYOUTS = {
  // Jan 2026
  'kWh Generation Power Act Transmission Loss Distribution Supply Supply Cust Metering Metering AWAT Reg Reset Lifeline Rate Snr. Citizen Current Franchise Energy Universal FIT-All GEA-All Total':
    ['generation', 'power_act_reduction', ...BASE.slice(1), 'lifeline_discount', 'lifeline_subsidy', 'senior_subsidy', 'rpt', 'lft', 'vat', 'energy_tax', 'universal', 'fit_all', 'gea_all', 'total'],
  // Feb-Mar 2026
  'kWh Generation Transmission Loss Distribution Supply Supply Cust Metering Metering AWAT Reg Reset Lifeline Rate Snr. Citizen Current Franchise Energy Universal FIT-All GEA-All Total':
    [...BASE, 'lifeline_discount', 'lifeline_subsidy', 'senior_subsidy', 'rpt', 'lft', 'vat', 'energy_tax', 'universal', 'fit_all', 'gea_all', 'total'],
  // Apr-Jun 2026
  'kWh Generation Transmission Loss Distribution Supply Supply Cust Metering Metering AWAT Reg Reset Snr. Citizen Current Franchise Energy Universal FIT-All GEA-All Lifeline Rate Total':
    [...BASE, 'senior_subsidy', 'rpt', 'lft', 'vat', 'energy_tax', 'universal', 'fit_all', 'gea_all', 'lifeline_discount', 'lifeline_subsidy', 'total'],
  // Sep-Oct 2026 (transmission split into transmission + ancillary; two AWAT refunds)
  'kWh Generation Transmission Service Loss Distribution Supply Supply Cust Metering Metering AWAT AWAT Reg Reset Rate Snr. Citizen RPT RPT LFT LFT Energy Universal FIT-All GEA-All Lifeline Rate Total':
    ['generation', 'transmission', 'ancillary', 'system_loss', 'distribution', 'supply', 'supply_cust', 'metering', 'metering_cust', 'awat_1', 'awat_2',
      'reg_reset', 'lifeline_rate_adj', 'senior_subsidy', 'rpt', 'rpt_adj', 'lft', 'lft_adj', 'vat', 'energy_tax', 'universal', 'fit_all', 'gea_all',
      'lifeline_discount', 'lifeline_subsidy', 'total'],
};
const FIXED = ['supply_cust', 'metering_cust']; // ₱ per customer per month, printed spread over kWh
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const num = s => (s === '-' ? 0 : (s.startsWith('(') ? -1 : 1) * parseFloat(s.replace(/[(),]/g, '')));
const URLS = { // where each PDF came from; Jan-Jun and Oct use random file names on meralco.com.ph/residential/rates-and-charges
  '2026-01': 'https://www.meralco.com.ph/uploads/documents/legacy-documents/v2/unclassified/79/meralco-doc-793d5eaae26cee22.pdf',
  '2026-02': 'https://www.meralco.com.ph/uploads/documents/legacy-documents/v2/unclassified/be/meralco-doc-beb8598407e3501a.pdf',
  '2026-03': 'https://www.meralco.com.ph/uploads/documents/legacy-documents/v2/unclassified/69/meralco-doc-69f1b65b2efc9062.pdf',
  '2026-04': 'https://www.meralco.com.ph/uploads/documents/legacy-documents/v2/unclassified/6e/meralco-doc-6e2793d83fb71be4.pdf',
  '2026-05': 'https://www.meralco.com.ph/uploads/documents/legacy-documents/v2/unclassified/03/meralco-doc-03585bf9910a16cd.pdf',
  '2026-06': 'https://www.meralco.com.ph/uploads/documents/legacy-documents/v2/unclassified/d4/meralco-doc-d405a608726a2569.pdf',
  '2026-10': 'https://www.meralco.com.ph/uploads/documents/source-delta/2026-10-25/5afca4c86acee54e324a937c7481894500ae62aa0a92140d65f6a0e6ea943f79.pdf',
};

const rates = {};
for (const f of readdirSync('data/rates_pdfs').filter(f => f.endsWith('.pdf')).sort()) {
  const lines = (await pdfLines(pdfjs, new Uint8Array(readFileSync(`data/rates_pdfs/${f}`)))).map(l => l.items.map(i => i.str));
  const title = lines.flat().map(s => s.match(/^([A-Za-z]{3})[a-z]*[ -](\d{4}|\d{2})$/)).find(Boolean);
  if (!title) throw new Error(`${f}: month title not found`);
  const month = `${title[2].length === 2 ? '20' + title[2] : title[2]}-${String(MON.indexOf(title[1].toLowerCase()) + 1).padStart(2, '0')}`;
  const header = lines.find(l => l[0] === 'kWh' && l[1] === 'Generation')?.join(' ');
  const cols = LAYOUTS[header];
  if (!cols) throw new Error(`${f}: unknown column layout, add it to LAYOUTS:\n${header}`);
  const out = { source_url: URLS[month] ?? `https://www.meralco.com.ph/uploads/documents/regulatory/rates/${month}/${month.slice(5)}-${month.slice(0, 4)}-residential-bills.pdf`,
    lft_assumed: 0.005, fixed: {}, non_lifeline: {}, lifeline: {} };
  let section = null, lifelineSeen = 0;
  for (const l of lines) {
    if (/^For Lifeline/.test(l[0])) section = ++lifelineSeen === 2 ? 'lifeline' : null; // 1st block is pesos, 2nd is per kWh
    else if (/^For Non-Lifeline/.test(l[0])) section = lifelineSeen === 2 ? 'non_lifeline' : null;
    else if (section && /^\d+$/.test(l[0])) {
      if (l.length !== cols.length + 1) throw new Error(`${f}: row ${l[0]} has ${l.length} cells, expected ${cols.length + 1}`);
      const kwh = +l[0], row = Object.fromEntries(cols.map((c, i) => [c, num(l[i + 1])]));
      for (const k of FIXED) { out.fixed[k] ??= Math.round(row[k] * kwh * 100) / 100; delete row[k]; }
      out[section][kwh] = row;
    }
  }
  if (!out.non_lifeline[200]) throw new Error(`${f}: no per-kWh rows found`);
  rates[month] = out;
}
const errors = validateRates(rates);
if (errors.length) throw new Error('Rate rows do not add up:\n' + errors.join('\n'));
writeFileSync('www/data/rates.json', JSON.stringify(rates, null, 1));
console.log(Object.keys(rates).map(m => `${m}: gen ${rates[m].non_lifeline[200].generation}, 200 kWh total ${rates[m].non_lifeline[200].total}`).join('\n'));
