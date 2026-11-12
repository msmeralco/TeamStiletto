// Meralco "Monthly Rate Summary" (meralco.com.ph/residential/rates-and-charges) -> data/rates_pdfs/*.pdf + sources.json.
// Downloads each month's "Typical Consumption Level" PDF (what build_rates.mjs reads) and records every document's URL.
// Run while online, then `node scripts/build_rates.mjs`. The app never fetches.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const SITE = 'https://www.meralco.com.ph', PAGE = `${SITE}/residential/rates-and-charges`, DIR = 'data/rates_pdfs';
const get = async url => {
  const res = await fetch(url, { headers: { 'user-agent': 'TANAW bill explainer' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
};
// Link labels are "October 2026 Typical Consumption Level" or just "Typical Consumption Level"; the month comes from the section.
const KIND = [['typical', /typical consumption/i], ['rate_schedule', /schedule of rates/i], ['gc_table', /generation charge/i]];

const html = await (await get(PAGE)).text();
const sources = {};
for (const [, month, list] of html.matchAll(/data-rate-month="(\d{4}-\d{2})"[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/g)) {
  sources[month] = {};
  for (const [, href, name] of list.matchAll(/href="([^"]+)"[\s\S]*?__name">([^<]+)</g)) {
    const kind = KIND.find(([, re]) => re.test(name))?.[0];
    if (kind) sources[month][kind] = new URL(href.split('?')[0], SITE).href; // ?v= is a cache-buster, not part of the file
  }
  if (!sources[month].typical) throw new Error(`${month}: no "Typical Consumption Level" link; the page layout changed.`);
}
if (!Object.keys(sources).length) throw new Error('No "Monthly Rate Summary" months found (data-rate-month); the page layout changed.');

mkdirSync(DIR, { recursive: true });
const log = [];
for (const [month, s] of Object.entries(sources)) {
  const pdf = new Uint8Array(await (await get(s.typical)).arrayBuffer());
  if (String.fromCharCode(...pdf.slice(0, 5)) !== '%PDF-') throw new Error(`${month}: ${s.typical} is not a PDF`);
  const file = `${DIR}/${month}-residential-bills.pdf`;
  const old = existsSync(file) ? readFileSync(file) : null;
  const status = !old ? 'new' : Buffer.compare(old, pdf) ? 'CHANGED (Meralco revised it)' : 'same';
  if (status !== 'same') writeFileSync(file, pdf);
  log.push(`${month}: ${status}`);
}
const sorted = Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(`${DIR}/sources.json`, JSON.stringify(sorted, null, 1));
console.log(log.sort().join('\n'));
