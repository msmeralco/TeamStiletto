// Meralco monthly rate advisories (meralco.com.ph/media/advisories) -> www/data/reasons.json. Run while online; the app never fetches.
// Keeps Meralco's own words verbatim (spec 4.5): the app quotes Meralco, it never writes a cause itself.
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.meralco.com.ph/media/advisories';
const MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const get = async url => {
  const res = await fetch(url, { headers: { 'user-agent': 'TANAW bill explainer' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
};
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };
const text = h => h.replace(/<[^>]+>/g, '').replace(/&(#\d+|\w+);/g, (m, e) => (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : ENT[e] ?? m))
  .replace(/\s+/g, ' ').trim();

// 1. Listing pages: card link, date and title. Only "Higher/Lower ... Rates this <Month> [year]" cards are rate advisories.
const cards = [];
for (let mp = 1; mp <= 5; mp++) {
  const html = await get(`${BASE}?mp=${mp}`);
  const found = [...html.matchAll(/<a class="article-card__link" href="([^"]+)"[\s\S]*?datetime="(\d{4}-\d{2}-\d{2})"[\s\S]*?article-card__title">([^<]+)</g)]
    .map(([, url, date, title]) => ({ url, date, title: text(title) }));
  const fresh = found.filter(c => !cards.some(x => x.url === c.url));
  if (!fresh.length) break;
  cards.push(...fresh);
}
if (!cards.length) throw new Error('No advisory cards found: the listing layout changed, update the card regex.');

// 2. Each rate advisory: verbatim paragraphs, grouped under their <h2> headings.
const reasons = {};
for (const c of cards) {
  const t = c.title.match(/rates? (?:this|for) (\w+)(?: (\d{4}))?/i), mi = t ? MON.indexOf(t[1].toLowerCase()) : -1;
  if (mi < 0) continue;
  let year = +(t[2] ?? c.date.slice(0, 4));
  if (!t[2] && mi < +c.date.slice(5, 7) - 6) year++; // e.g. a January advisory published in late December
  const month = `${year}-${String(mi + 1).padStart(2, '0')}`;
  if (reasons[month]) continue; // newest card first; keep it
  const html = await get(c.url), start = html.indexOf('class="article-content__body');
  const body = start < 0 ? '' : html.slice(start, html.indexOf('</article>', start) >>> 0).split('Download Press Release')[0];
  if (body.length < 100) throw new Error(`${c.url}: article body not found (no "article-content__body"); update the body marker.`);
  const sections = [{ heading: null, paragraphs: [] }];
  for (const [, tag, inner] of body.matchAll(/<(h2|p|li)>([\s\S]*?)<\/\1>/g)) {
    const s = text(inner);
    if (tag === 'h2') sections.push({ heading: s, paragraphs: [] });
    else if (s) sections.at(-1).paragraphs.push(s);
  }
  // The quote shown on the bill explanation: the lead paragraph + the first later one about the generation charge (the usual driver).
  const all = sections.flatMap(s => s.paragraphs), lead = all[0];
  const quote = [lead, all.slice(1).find(p => /generation charge/i.test(p))].filter(Boolean).join(' ');
  // Off-topic sections (typhoon crews, El Niño tips) are dropped; the chatbot answers from the rest.
  const kept = sections.filter(s => !s.heading || /charge|rate|refund|tax|generation|transmission|supply|bill/i.test(s.heading));
  reasons[month] = { date: c.date, title: c.title, text: quote, url: c.url, retrieved: new Date().toISOString().slice(0, 10), sections: kept };
}
if (!Object.keys(reasons).length) throw new Error('No rate advisories matched "Rates this <Month>"; check the titles.');
const sorted = Object.fromEntries(Object.entries(reasons).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('www/data/reasons.json', JSON.stringify(sorted, null, 1));
console.log(Object.entries(sorted).map(([m, r]) => `${m}: ${r.title} (${r.date}), ${r.sections.length} sections`).join('\n'));
