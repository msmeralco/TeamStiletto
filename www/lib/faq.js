// Meralco FAQ search (www/data/faqs.json, scraped by scripts/fetch_faqs.mjs). Used by the chat in the browser and by the
// server to shortlist candidates for the local model. Cosine similarity over words weighted by rarity (IDF); Taglish words
// are mapped to the English the FAQs use. Answers are always shown verbatim with the link to that exact question.
const SYN = {
  bayad: 'pay', magbayad: 'pay', pagbabayad: 'pay', babayaran: 'pay', bayaran: 'pay', binayaran: 'pay', payment: 'pay', paying: 'pay', paid: 'pay',
  bayarin: 'bill', singil: 'charge', presyo: 'rate', buwis: 'tax', kuryente: 'electricity', kontador: 'meter', metro: 'meter',
  basa: 'read', basahin: 'read', pagbasa: 'read', binasa: 'read', reading: 'read', reader: 'read',
  putol: 'disconnection', naputol: 'disconnection', puputulan: 'disconnection', disconnect: 'disconnection', disconnected: 'disconnection',
  brownout: 'outage', blackout: 'outage', interruption: 'outage', resibo: 'receipt', deposito: 'deposit', hulugan: 'installment',
  reklamo: 'complaint', lipat: 'transfer', ilipat: 'transfer', pangalan: 'name', ibinalik: 'refund', bawas: 'refund', linya: 'line',
  kabit: 'connection', magpakabit: 'connection', nagpakabit: 'connection', pakabit: 'connection', utang: 'balance', balanse: 'balance',
  taas: 'increase', tumaas: 'increase', mataas: 'increase', increased: 'increase', baba: 'decrease', bumaba: 'decrease', mababa: 'decrease',
  konsumo: 'usage', konsumpsyon: 'usage', consumption: 'usage', pareho: 'same', parehas: 'same',
  saan: 'where', kailan: 'when', makikita: 'find', makita: 'find', hanapin: 'find', mahanap: 'find', see: 'find',
};
const STOP = new Set(('a an the is are am was were be been my me i you your we our us they their it its this that these those to of in on at for from by with and or ' +
  'not no yes can could do does did how what why when which who whom will would should shall may might must have has had there here about into than then ' +
  'so if as get got also just any all some more most other such only own same too very ko ng sa ang ba po mga na at ano paano bakit magkano kung yung si ni ' +
  'kami namin natin ako mo ka nyo niyo ito iyan iyon din rin lang naman pa pala ba nga dito diyan doon may meron wala ay para nang mag hindi di ' +
  'pwede puwede pede maaari gusto amin atin inyo nila sila siya ngayon alam please know tell want need help question').split(' '));
// "CAN" in capitals is the Customer Account Number, not the verb. Plural s is dropped so "charges" finds "charge".
const terms = s => (s.replace(/\bCAN\b/g, ' accountno ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? [])
  .map(w => SYN[w] ?? (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).filter(w => w.length > 1 && !STOP.has(w));

// A FAQ about one month ("Why did my bill increase this April?") only answers a bill for that month. month = 'YYYY-MM'.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NAMED = new RegExp(`\\b(${MONTHS.filter(m => m !== 'may').join('|')}|may(?= \\d{4}| billing|\\?|$))\\b`, 'gi'); // "may" is also Tagalog/English
const otherMonth = (q, month) => {
  const named = [...q.matchAll(NAMED)].map(m => MONTHS.indexOf(m[1].toLowerCase()) + 1);
  return named.length > 0 && !(month && named.includes(+month.slice(5, 7)) && (!/\b20\d\d\b/.test(q) || q.includes(month.slice(0, 4))));
};

// Build once per faqs.json: each FAQ's question terms and answer terms, and how rare each term is.
export function faqIndex(data) {
  const docs = (data?.faqs ?? []).map(f => ({ f, q: new Set(terms(f.q)), a: new Set(terms(`${f.category ?? ''} ${f.answer.join(' ')}`)) }));
  const df = new Map();
  for (const d of docs) for (const t of new Set([...d.q, ...d.a])) df.set(t, (df.get(t) ?? 0) + 1);
  return { docs, idf: t => Math.log(1 + docs.length / (df.get(t) ?? 0.5)) };
}

// Best FAQs for a question: [{ f, score, cover, inQ }]. score: similarity to the FAQ's question, plus half its similarity to the
// answer, so a short exact question beats a long one that merely mentions the word. cover: share of the question's words found.
export function faqSearch(index, text, month = null, k = 8) {
  const qt = [...new Set(terms(text))];
  if (!index?.docs.length || !qt.length) return [];
  const w = t => index.idf(t) ** 2, norm = set => Math.sqrt([...set].reduce((s, t) => s + w(t), 0)) || 1, sum = list => list.reduce((s, t) => s + w(t), 0);
  const nq = norm(qt), total = qt.reduce((s, t) => s + index.idf(t), 0);
  return index.docs.filter(d => !otherMonth(d.f.q, month)).map(d => {
    const inQ = qt.filter(t => d.q.has(t)), inA = qt.filter(t => d.a.has(t));
    const cover = qt.filter(t => d.q.has(t) || d.a.has(t)).reduce((s, t) => s + index.idf(t), 0) / total;
    return { f: d.f, score: sum(inQ) / (nq * norm(d.q)) + 0.5 * sum(inA) / (nq * norm(d.a)), cover, inQ: inQ.length > 0 };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

// Without the model: trust the top FAQ only when it is close to the question and contains most of its words.
// shortcut: 0.5 score / 0.7 cover are tuned on a handful of Taglish questions (tests/selfcheck.mjs); tune on real chat logs.
export function faqBest(index, text, month = null) {
  const top = faqSearch(index, text, month, 1)[0];
  return top && top.inQ && top.score >= 0.5 && top.cover >= 0.7 ? top.f : null;
}

// The FAQ as the chat shows it: Meralco's question, its answer verbatim (cut at a paragraph boundary if long), and the link.
export function faqQuote(f, max = 600) {
  const out = [];
  for (const p of f.answer) { if (out.length && out.join(' ').length + p.length > max) break; out.push(p); }
  return `Meralco FAQ: "${f.q}"\n${out.join('\n')}${out.length < f.answer.length ? '\n…' : ''}\n${f.url}`;
}
