// PDF bytes -> text lines [{y, page, items:[{str, x}]}]. An OCR engine (photo path) must return this same shape.
export async function pdfLines(pdfjs, data, password) {
  const doc = await pdfjs.getDocument({ data, password }).promise; // throws PasswordException if locked
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    const rows = [];
    for (const it of items) {
      const str = it.str.trim();
      if (!str) continue;
      const [, , , , x, y] = it.transform;
      let row = rows.find(r => Math.abs(r.y - y) < 3);
      if (!row) rows.push(row = { y, page: p, items: [] });
      row.items.push({ str, x });
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => { r.items.sort((a, b) => a.x - b.x); lines.push(r); });
  }
  if (!lines.length) throw new Error('This PDF has no selectable text (scanned image). The photo/OCR path is not built yet.');
  return lines;
}
