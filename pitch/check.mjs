// Pre-flight checks for the pitch site. Run: node pitch/check.mjs
// Exits non-zero when a hard check fails. Open items are warnings only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const html = read('index.html');
const errors = [];
const warnings = [];

/* ---------- 1. leftover placeholder text ---------- */
const placeholderPatterns = [
  [/\[NEEDS SOURCE\]/g, '[NEEDS ' + 'SOURCE] marker'],
  [new RegExp('\\bTO' + 'DO\\b', 'g'), 'TO' + 'DO marker'],
  [new RegExp('\\bT' + 'BD\\b', 'g'), 'T' + 'BD marker'],
  [/lorem/gi, 'lorem placeholder text']
];
for (const f of ['index.html', 'pitch.css', 'pitch.js', 'serve.mjs']) {
  const text = read(f);
  for (const [re, label] of placeholderPatterns) {
    const n = (text.match(re) || []).length;
    if (n) errors.push(`${f}: ${n} ${label}(s) remain`);
  }
}

/* ---------- 2. external URLs ---------- */
const ALLOWED = new Set(['http://localhost:8000', 'http://localhost:8000/dashboard.html']);
for (const m of html.matchAll(/(?:src|href|data-src)\s*=\s*"([^"]+)"/g)) {
  const url = m[1];
  if (/^https?:\/\//i.test(url) && !ALLOWED.has(url)) {
    errors.push(`index.html: external URL not allowed: ${url}`);
  }
}

/* ---------- 3. referenced assets exist ---------- */
const assetRefs = new Set([...html.matchAll(/assets\/[A-Za-z0-9_.\/-]+/g)].map((m) => m[0]));
for (const ref of assetRefs) {
  if (!fs.existsSync(path.join(ROOT, ref))) {
    if (ref === 'assets/demo.mp4') {
      warnings.push('OPEN ITEM: assets/demo.mp4 (backup demo video) is not recorded yet. ' +
        'The V key shows a "backup video not recorded yet" caption until it exists.');
    } else {
      errors.push(`index.html references missing file: ${ref}`);
    }
  }
}

/* ---------- 4. slides: ids, data-time, layouts ---------- */
const sections = [];
const secRe = /<section\b([^>]*)>([\s\S]*?)<\/section>/g;
for (const m of html.matchAll(secRe)) {
  const attrs = {};
  for (const a of m[1].matchAll(/([\w-]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
  const inner = m[2];
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(inner) || /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(inner);
  const headline = (h ? h[1] : '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  sections.push({
    id: attrs.id || '(no id)',
    layout: attrs['data-layout'] || '',
    time: attrs['data-time'] !== undefined ? Number(attrs['data-time']) : null,
    speaker: attrs['data-speaker'] || '',
    backup: 'data-backup' in attrs,
    headline
  });
}
if (sections.length === 0) errors.push('index.html: no <section> slides found');

const seen = new Map();
for (const s of sections) {
  if (seen.has(s.id)) errors.push(`duplicate slide id: ${s.id}`);
  seen.set(s.id, true);
  if (!s.backup && (s.time === null || Number.isNaN(s.time))) {
    errors.push(`main slide "${s.id}" has no data-time`);
  }
}

/* ---------- 5. total time vs limit ---------- */
const limitM = /<meta\s+name="pitch-limit"\s+content="(\d+)"/.exec(html);
const limit = limitM ? Number(limitM[1]) : 300;
const mains = sections.filter((s) => !s.backup);
const total = mains.reduce((t, s) => t + (s.time || 0), 0);
if (total > limit) errors.push(`total data-time ${total}s exceeds the pitch-limit ${limit}s`);

/* ---------- table ---------- */
const pad = (v, n) => String(v ?? '').padEnd(n).slice(0, n);
console.log('');
console.log(pad('#', 4) + pad('id', 24) + pad('layout', 12) + pad('time', 6) + pad('speaker', 14) + 'headline (first 50 chars)');
console.log('-'.repeat(110));
let n = 0;
for (const s of sections) {
  const num = s.backup ? 'B' : String(++n);
  console.log(
    pad(num, 4) + pad(s.id, 24) + pad(s.layout, 12) + pad(s.time === null ? '—' : s.time, 6) +
    pad(s.speaker, 14) + s.headline.slice(0, 50)
  );
}
console.log('-'.repeat(110));
console.log(`Main slides: ${mains.length}  Backup slides: ${sections.length - mains.length}`);
console.log(`Total main-slide time: ${total}s of ${limit}s limit (${limit - total}s slack)`);

/* ---------- results ---------- */
console.log('');
for (const w of warnings) console.log('WARN  ' + w);
if (errors.length) {
  for (const e of errors) console.log('FAIL  ' + e);
  console.log(`\n${errors.length} problem(s). Fix before presenting.`);
  process.exit(1);
} else {
  console.log(`All hard checks passed${warnings.length ? ` (${warnings.length} open item(s) above)` : ''}.`);
}
