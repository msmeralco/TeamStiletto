// Shared by the meralco.com.ph scrapers (fetch_advisories, fetch_faqs): polite GET and HTML -> plain text.
export const SITE = 'https://www.meralco.com.ph';

export async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'TANAW bill explainer' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', ntilde: 'ñ', Ntilde: 'Ñ', peso: '₱' };
export const text = h => h.replace(/<[^>]+>/g, '')
  .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => (e[0] !== '#' ? ENT[e] ?? m : String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1))))
  .replace(/\s+/g, ' ').trim();

// Readable blocks of an HTML fragment, in order: [tag, text]. <br> splits a paragraph into lines; table rows become "a | b".
export const blocks = h => [...h.replace(/<br\s*\/?>/gi, '</p><p>').matchAll(/<(h[2-4]|p|li|tr)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)]
  .map(([, tag, inner]) => [tag.toLowerCase(), tag.toLowerCase() === 'tr' ? [...inner.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => text(c[1])).filter(Boolean).join(' | ') : text(inner)])
  .filter(([, t]) => t);
