// Meralco monthly rate advisories (meralco.com.ph/media/advisories) -> www/data/reasons.json. Run while online; the app never fetches.
// Keeps Meralco's own words verbatim (spec 4.5): the app quotes Meralco, it never writes a cause itself.
import { writeFileSync } from 'node:fs';
import { SITE, get, text, blocks } from './html.mjs';

const BASE = `${SITE}/media/advisories`;
const MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// The rate tables start in 2026; one year earlier is kept so last month's advisory exists for every bill. Older ones are not crawled.
const SINCE = '2025-01';
// Two title styles: "Higher Rates this October [2026]" / "Lower Residential Rates for May 2026" (2025 on), "December 2024 Rates Updates" (before).
const monthOf = (title, date) => {
  let m = title.match(/rates? (?:this|for) (\w+)(?: (\d{4}))?/i), mi, year;
  if (m) { mi = MON.indexOf(m[1].toLowerCase()); year = m[2]; } else if ((m = title.match(/^(\w+) (\d{4}) rates? updates?/i))) { mi = MON.indexOf(m[1].toLowerCase()); year = m[2]; }
  if (!(mi >= 0)) return null;
  year = +(year ?? date.slice(0, 4));
  if (!m[2] && mi < +date.slice(5, 7) - 6) year++; // e.g. a January advisory published in late December
  return `${year}-${String(mi + 1).padStart(2, '0')}`;
};

// 1. Listing pages, newest first, until a whole page is older than SINCE.
const cards = [];
for (let mp = 1; mp <= 20; mp++) {
  const html = await get(`${BASE}?mp=${mp}`);
  const found = [...html.matchAll(/<a class="article-card__link" href="([^"]+)"[\s\S]*?datetime="(\d{4}-\d{2}-\d{2})"[\s\S]*?article-card__title">([^<]+)</g)]
    .map(([, url, date, title]) => ({ url, date, title: text(title) })).filter(c => !cards.some(x => x.url === c.url));
  cards.push(...found);
  if (!found.length || found.every(c => c.date < SINCE)) break;
}
if (!cards.length) throw new Error('No advisory cards found: the listing layout changed, update the card regex.');

// 2. Each rate advisory: verbatim paragraphs, grouped under their headings (<h2> on some months, <h3> on others).
const reasons = {};
for (const c of cards) {
  const month = monthOf(c.title, c.date);
  if (!month || month < SINCE || reasons[month]) continue; // not a rate advisory, too old, or a newer card already has it
  const html = await get(c.url), start = html.indexOf('class="article-content__body');
  const body = start < 0 ? '' : html.slice(start, html.indexOf('</article>', start) >>> 0).split('Download Press Release')[0];
  if (body.length < 100) throw new Error(`${c.url}: article body not found (no "article-content__body"); update the body marker.`);
  const sections = [{ heading: null, paragraphs: [] }];
  for (const [tag, s] of blocks(body)) {
    if (/^h/.test(tag)) sections.push({ heading: s, paragraphs: [] });
    else if (tag !== 'tr') sections.at(-1).paragraphs.push(s);
  }
  // The quote shown on the bill explanation: the lead paragraph + the first later one about the generation charge (the usual driver).
  const all = sections.flatMap(s => s.paragraphs), lead = all[0];
  const quote = [lead, all.slice(1).find(p => /generation charge/i.test(p))].filter(Boolean).join(' ');
  // Off-topic sections (typhoon crews, El Niño tips, electrical safety, programs) are dropped; the chatbot answers from the rest.
  const kept = sections.filter(s => (!s.heading || /charge|rate|refund|tax|generation|transmission|supply|bill|subsid|allowance|tariff|fee|cost|price|discount|lifeline|adjust/i.test(s.heading)) && s.paragraphs.length);
  reasons[month] = { date: c.date, title: c.title, text: quote, url: c.url, retrieved: new Date().toISOString().slice(0, 10), sections: kept };
}
if (!Object.keys(reasons).length) throw new Error('No rate advisories matched; check the titles.');
const sorted = Object.fromEntries(Object.entries(reasons).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('www/data/reasons.json', JSON.stringify(sorted, null, 1));
console.log(Object.entries(sorted).map(([m, r]) => `${m}: ${r.title} (${r.date}), ${r.sections.length} sections: ${r.sections.map(s => s.heading ?? '(lead)').join(' | ')}`).join('\n'));
