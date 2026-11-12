// OCR words (PaddleOCR on the TANAW laptop, via /api/ocr) -> the same text lines extract.js makes from a PDF, so parse.js is unchanged.
// words: [{str, x, y, w, h, conf}] in image pixels: x = left edge, y = vertical centre, w/h = size of the piece of text.
import { toNum } from './parse.js';

export const LOW = 0.85; // below this PaddleOCR score, the numbers in that piece of text are shown as "please check"

// A run of numbers read as one piece of text (the tracker row) -> one part per number, or null if str is not such a run.
// PaddleOCR often drops the spaces ("194199 210 298 329304"), so a tracker row's glued numbers are cut back to the width its
// other numbers have. shortcut: a household whose months mix 2-, 3- and 4-digit kWh can still glue wrongly; the tracker check
// then fails on the confirm screen and the user fixes the months by hand.
function numberRun(str) {
  if (!/^[\d,.\-\s]+$/.test(str) || !/\s/.test(str)) return null;
  const parts = [...str.matchAll(/-?\d[\d,.]*|-/g)].map(m => ({ s: m[0], i: m.index }));
  if (!/^[\d\-\s]+$/.test(str)) return parts;
  const lens = parts.filter(p => /^\d{1,4}$/.test(p.s)).map(p => p.s.length);
  const d = lens.sort((a, b) => lens.filter(v => v === b).length - lens.filter(v => v === a).length)[0] ?? 3;
  const cut = parts.flatMap(p => /^\d{5,}$/.test(p.s) && p.s.length % d === 0
    ? Array.from({ length: p.s.length / d }, (_, j) => ({ s: p.s.slice(j * d, j * d + d), i: p.i + j * d })) : [p]);
  return cut.length >= 10 && cut.length <= 12 ? cut : parts;
}

export function ocrLines(words, width) {
  // shortcut: assumes the photo shows the full page width, so x lands near PDF points (parse.js matches columns within 15 pt);
  // a photo with wide margins around the bill needs page-edge detection first.
  const k = 612 / width, rows = [], read = words.filter(w => String(w.str ?? '').trim());
  for (const w of [...read].sort((a, b) => a.y - b.y)) {
    const str = String(w.str).trim();
    let row = rows.find(r => Math.abs(r.py - w.y) < w.h * 0.5);
    if (!row) rows.push(row = { py: w.y, y: -w.y * k, page: 1, items: [] });
    for (const p of numberRun(str) ?? [{ s: str, i: 0 }]) row.items.push({ str: p.s, x: (w.x + (w.w ?? 0) * p.i / str.length) * k });
  }
  for (const r of rows) { r.items.sort((a, b) => a.x - b.x); delete r.py; }
  // Tracker: this year's row ends in "-" for months not billed yet, and OCR tends to drop those faint dashes. parse.js needs
  // 12 cells in both rows, so a nearly full row next to a full one gets its missing trailing "-" back, in the full row's columns.
  const cells = r => r.items.filter(it => /^(\d[\d,]*|-)$/.test(it.str));
  rows.forEach((r, i) => {
    const full = [rows[i - 1], rows[i + 1]].find(n => n && cells(n).length === 12), n = cells(r).length;
    if (full && n >= 6 && n < 12) r.items.push(...cells(full).slice(n).map(c => ({ str: '-', x: c.x })));
  });
  const low = new Set(read.filter(w => w.conf < LOW).flatMap(w => (String(w.str).match(/\(?-?\d[\d,]*(?:\.\d+)?\)?/g) ?? []).map(toNum)));
  return { lines: rows, low, clear: read.filter(w => w.conf >= LOW).length, total: read.length };
}
