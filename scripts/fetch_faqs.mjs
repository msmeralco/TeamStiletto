// Meralco Help FAQs (meralco.com.ph/help/faqs/*) -> www/data/faqs.json. Run while online; the app never fetches.
// Keeps Meralco's answers verbatim, like the advisories: the chatbot quotes Meralco and links the exact question, never rewrites it.
import { writeFileSync } from 'node:fs';
import { SITE, get, text, blocks } from './html.mjs';

// 1. Topic pages: every /help/faqs/<topic> link on the help page (new topics are picked up by themselves).
const help = await get(`${SITE}/help`);
const topics = [...new Set([...help.matchAll(/href="(\/help\/faqs\/[a-z0-9-]+)"/g)].map(m => m[1]))];
if (!topics.length) throw new Error('No /help/faqs/<topic> links on /help: the page layout changed.');

// 2. Each question: <details class="faq-accordion-item" id=...> with a question span and an answer "prose" div.
// Sub-category headings (<p class="faq-accordion__category">) apply to the questions after them.
const faqs = [], log = [];
for (const path of topics) {
  const html = await get(SITE + path);
  const topic = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '') || path.split('/').pop().replace(/-/g, ' ');
  let category = null, n = 0;
  for (const [, cat, id, body] of html.matchAll(/faq-accordion__category">([^<]*)<|<details\s+class="faq-accordion-item"\s+id="([^"]+)"[\s\S]*?>([\s\S]*?)<\/details>/g)) {
    if (cat != null) { category = text(cat); continue; }
    const q = text(body.match(/faq-accordion-item__question">([\s\S]*?)<\/span>/)?.[1] ?? '');
    const prose = body.match(/faq-accordion-item__prose">([\s\S]*)<\/div>\s*<\/div>/)?.[1] ?? '';
    const answer = blocks(prose).map(([, t]) => t);
    if (!q || !answer.length) continue; // an answer that is only an image or a video: nothing to quote
    if (faqs.some(f => f.q === q)) continue; // the same question on two topic pages: keep the first
    faqs.push({ id, topic, category, q, answer, url: `${SITE}${path}#${id}` });
    n++;
  }
  if (!n) throw new Error(`${path}: no FAQ items found (faq-accordion-item); the page layout changed.`);
  log.push(`${topic}: ${n}`);
}
const ids = new Set(faqs.map(f => f.id));
if (ids.size !== faqs.length) throw new Error('Duplicate FAQ ids: the anchors are no longer unique, links would point to the wrong answer.');
writeFileSync('www/data/faqs.json', JSON.stringify({ retrieved: new Date().toISOString().slice(0, 10), faqs }, null, 1));
console.log(`${faqs.length} FAQs\n${log.join('\n')}`);
