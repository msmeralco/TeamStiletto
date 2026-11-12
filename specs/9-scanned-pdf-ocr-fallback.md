# Spec: Route scanned (text-less) PDFs through the OCR path (Task 9 from PLAN.md)

## Goal
Stop failing on PDFs with no selectable text: detect it, render each page to an image, run the pages through the Task 8 OCR pipeline, tag the resulting bill, and document the shared fallback order (photo → PDF text → scanned-PDF image → manual entry).

## Inputs & Context
- **PLAN.md Task 9**: "Route scanned (text-less) PDFs through the OCR path (tech_spec §5.4)". Acceptance: (a) a scanned/image-only PDF no longer errors with the "not built" message and produces a parseable bill via OCR; (b) the shared fallback order (photo → PDF text → scanned-PDF image → manual entry) is honored and documented. Depends on Task 8.
- **The "not built" throw** — `www/lib/extract.js:18`:
  `if (!lines.length) throw new Error('This PDF has no selectable text (scanned image). The photo/OCR path is not built yet.');`
  `pdfLines(pdfjs, data, password)` (lines 2–19) returns the shared line model `[{ y, page, items: [{ str, x }] }]`, 1-based `page`, items sorted by `x`, `y` decreasing down the page. Line 1 comment: "An OCR engine (photo path) must return this same shape."
- **Sole call site** — `www/app.js:30-43` `scan()`: `bill = parseBill(await pdfLines(pdfjs, bytes.slice(), $('#pw').value || undefined));` inside a `try` whose `catch (e)` handles `e.name === 'PasswordException'` (shows `#pwbox`) and otherwise shows `msg('Couldn't read this PDF: ' + e.message)`. Also relevant: `markSynthetic()` (line 26 — banner triggers only on `bill?.source === 'synthetic'`) and the sources list line 134 (`bill.source === 'synthetic' ? 'SYNTHETIC sample …' : 'your PDF statement'`).
- **Parser source tag** — `www/lib/parse.js:76`: `source: texts.some(t => /SYNTHETIC/.test(t)) ? 'synthetic' : 'pdf_text'`. `tech_spec.md:160` already anticipates the new value: "add `photo_ocr` for the new path." This task adds **`scanned_pdf_ocr`** (Task 8 uses `photo_ocr` for camera/gallery photos).
- **Service worker + PWA test** — `www/sw.js:3-7`: `const CACHE = 'tanaw-v2';` and `const FILES = [… 'lib/extract.js', … , 'data/fixtures/SYNTHETIC_bill.pdf', 'data/fixtures/SYNTHETIC_weak_bill.pdf'];`. `tests/selfcheck.mjs:173-179` parses `FILES` from `sw.js`, asserts each listed file exists under `www/`, and asserts **every file in `www/lib/` is listed in `FILES`**. ⇒ a new `lib/` module not added to `FILES` makes `npm test` red.
- **OCR interface (Task 8 dependency — contract pinned by this spec).** `www/lib/ocr.js` does not exist yet in this checkout (see `docs/update.md:40`); Task 8 must export:
  `ocrImage(blob, page) → Promise<Array<{ y, page, items: [{ str, x }], confidence? }>>`
  — one rendered page image (PNG `Blob`) + 1-based page number → that page's slice of the shared line model, with per-line confidence (tech_spec §5.2 step 8, FR-X-5). Task 9 only *consumes* this; it never implements the OCR engine.
- **Fixture tooling** — `scripts/make_synthetic.mjs` already builds the committed text fixtures `www/data/fixtures/SYNTHETIC_bill.pdf` + `tests/SYNTHETIC_truth.json` from seeded synthetic data using `pdf-lib` (dep, pure JS). `pdfjs-dist@4.10.38` (dep) renders the same PDF in the browser (vendor copy at `www/vendor/pdf.min.mjs`). No real bill data may be committed.
- **Test harness** — `npm test` = `node tests/selfcheck.mjs` (plain Node, no DOM, no Web Workers). Real OCR (onnxruntime-web in a worker) **cannot run in this harness**; routing logic is therefore tested with injected stubs, and real OCR quality is a manual browser check + Gate 0 corpus (PLAN.md OQ6).

## Changes
Execution order: 1–2 extraction/routing modules, 3 UI wiring, 4 precache, 5 fixture, 6 test, 7 docs.

1. **`www/lib/extract.js` — typed "no selectable text" error.**
   - Add above `pdfLines`:
     ```js
     // Thrown when a PDF has no selectable text; the caller (app.js) routes it to the scanned-PDF OCR path (tech_spec §5.4).
     export class NoTextError extends Error {
       constructor() { super('This PDF has no selectable text (scanned image).'); this.name = 'NoTextError'; }
     }
     ```
   - Replace line 18's `throw new Error(…)` with `throw new NoTextError();`
   - Update the line-1 comment to: `// PDF bytes -> text lines [{y, page, items:[{str, x}]}]. OCR (photo path and scanned-PDF path) must return this same shape.`
   - Keep the `pdfLines(pdfjs, data, password)` signature unchanged (called at `tests/selfcheck.mjs:6,28`).

2. **New file `www/lib/scanned.js` — render a text-less PDF's pages to PNGs and run them through OCR.**
   Full intended content:
   ```js
   // Scanned (text-less) PDFs, tech_spec §5.4: render each page to a PNG and run it through the
   // same on-device OCR pipeline as bill photos. Shared fallback order:
   //   photo → PDF text → scanned-PDF image → manual entry on the confirmation screen.
   const PAGE_SCALE = 2; // ≈150–160 DPI for A4: legible for PP-OCR without huge canvases

   // Default page→PNG render (browser only: uses document/HTMLCanvasElement).
   async function renderPageToPng(page) {
     const vp = page.getViewport({ scale: PAGE_SCALE });
     const canvas = document.createElement('canvas');
     canvas.width = Math.floor(vp.width);
     canvas.height = Math.floor(vp.height);
     await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
     return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Failed to render a PDF page to an image.')), 'image/png'));
   }

   // renderPage/pageToLines are injectable for the Node test suite (no DOM there); defaults are
   // the browser render and Task 8's ocr.js. PasswordException from getDocument propagates to the
   // caller's password prompt.
   export async function scannedPdfToLines(pdfjs, data, password, onProgress, renderPage, pageToLines) {
     const doc = await pdfjs.getDocument({ data, password }).promise;
     const render = renderPage ?? renderPageToPng;
     const ocr = pageToLines ?? (async (blob, p) => (await import('./ocr.js')).ocrImage(blob, p)); // dynamic: keep onnxruntime off the PDF-text path
     const lines = [];
     for (let p = 1; p <= doc.numPages; p++) {
       onProgress?.(p, doc.numPages);
       const blob = await render(await doc.getPage(p));
       for (const l of await ocr(blob, p)) lines.push({ ...l, page: p }); // re-assert page in case the engine omits it
     }
     if (!lines.length) throw new Error('OCR could not find any text in this scanned PDF. Try a sharper photo of the bill, or enter the numbers manually.');
     return lines;
   }
   ```
   Notes:
   - All pages are rendered and concatenated (Meralco statements are 1–2 pages; no page cap in v1).
   - OCR engine errors and render errors propagate; `app.js` maps them to a clear message (change 3). The old "not built" string must not reappear anywhere.

3. **`www/app.js` — wire the fallback into `scan()`; tag the source; fix the sources panel.**
   - Import (after line 2): `import { pdfLines, NoTextError } from './lib/extract.js';` (replace the existing line-2 import) and `import { scannedPdfToLines } from './lib/scanned.js';`
   - In `scan()` (line 30), replace the single `pdfLines` line (line 33) with the fallback-order logic, keeping everything else in the `try` block:
     ```js
     // Fallback order (tech_spec §5.4): PDF text → scanned-PDF image (OCR) → manual entry.
     let lines, viaOcr = false;
     try {
       lines = await pdfLines(pdfjs, bytes.slice(), $('#pw').value || undefined);
     } catch (e) {
       if (!(e instanceof NoTextError)) throw e; // PasswordException etc. fall through to the outer catch
       viaOcr = true;
       lines = await scannedPdfToLines(pdfjs, bytes.slice(), $('#pw').value || undefined,
         (p, n) => msg(`Reading scanned page ${p} of ${n}…`));
     }
     bill = parseBill(lines);
     if (viaOcr && bill.source === 'pdf_text') bill.source = 'scanned_pdf_ocr';
     ```
     (The `synthetic` tag is never overwritten: a scanned fixture containing the word "SYNTHETIC" must stay `'synthetic'`.)
   - Extend the existing `catch (e)` (lines 39–42): keep the `PasswordException` branch; change the generic branch to `else msg('Couldn't read this PDF: ' + e.message + '. If it is a scanned (image-only) statement, try a sharper photo, or enter the numbers manually on the next screen.');`
   - Line 134 sources entry: replace the `Bill: …` template with a 4-way source label:
     ```js
     `Bill: ${bill.source === 'synthetic' ? 'SYNTHETIC sample (invented household, priced at real Meralco rates)'
       : bill.source === 'scanned_pdf_ocr' ? 'your scanned PDF statement, read on-device by OCR'
       : bill.source === 'photo_ocr' ? 'your bill photo, read on-device by OCR'
       : 'your PDF statement'}.`,
     ```
   - Leave `markSynthetic()` (line 26) untouched — `scanned_pdf_ocr`/`photo_ocr` must NOT trigger the synthetic banner.
   - After line 48 (`$('#weak').onclick = …`), add the scanned sample loader using the existing pattern:
     `$('#scanned').onclick = loadSample('SYNTHETIC_scanned_bill');`

4. **`www/index.html` — add the scanned sample link** in the upload section, extending the line-28 paragraph:
   `… or <button id="weak" class="link">the weak-fit sample</button> or <button id="scanned" class="link">the scanned (image-only) sample</button></p>`
   (Same PDF `#file` input is used — no new intake control; photo intake is Task 7.)

5. **Fixture: a committed, synthetic, text-less PDF.** Two files under `www/data/fixtures/`:
   - **`SYNTHETIC_scanned_bill.png`** (committed binary, ~1–2 MB): page 1 of the existing `SYNTHETIC_bill.pdf` rasterized at scale 2 (1224×1684 px). Generated **once** via a browser one-shot (Node has no canvas; no new native dependency in v1). Exact snippet, run in the console on `http://localhost:8000` (`npm start`), then save the downloaded PNG over `www/data/fixtures/SYNTHETIC_scanned_bill.png`:
     ```js
     (async () => {
       const pdfjs = await import('/vendor/pdf.min.mjs');
       pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
       const data = new Uint8Array(await (await fetch('/data/fixtures/SYNTHETIC_bill.pdf')).arrayBuffer());
       const doc = await pdfjs.getDocument({ data }).promise;
       const page = await doc.getPage(1);
       const vp = page.getViewport({ scale: 2 });
       const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
       await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
       const a = Object.assign(document.createElement('a'), { href: c.toDataURL('image/png'), download: 'SYNTHETIC_scanned_bill.png' });
       a.click();
     })();
     ```
   - **`scripts/make_scanned_fixture.mjs`** (new, deterministic, pure-JS `pdf-lib` — the documented regeneration step that turns the committed PNG into the text-less PDF):
     ```js
     // Wrap the committed scanned PNG in a text-less PDF (no text layer). The PNG itself is a
     // one-time browser rasterization of www/data/fixtures/SYNTHETIC_bill.pdf at scale 2
     // (see specs/9-scanned-pdf-ocr-fallback.md for the console snippet). SYNTHETIC content only.
     import { readFileSync, writeFileSync } from 'node:fs';
     import { PDFDocument } from 'pdf-lib';
     const png = readFileSync('www/data/fixtures/SYNTHETIC_scanned_bill.png');
     const doc = await PDFDocument.create();
     const img = await doc.embedPng(png);
     const page = doc.addPage([img.width, img.height]);
     page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
     writeFileSync('www/data/fixtures/SYNTHETIC_scanned_bill.pdf', await doc.save());
     console.log('scanned fixture written');
     ```
   - `package.json`: add script `"scanned-fixture": "node scripts/make_scanned_fixture.mjs"` (next to `"synthetic"`).
   - Regenerate now and commit both `SYNTHETIC_scanned_bill.png` and `SYNTHETIC_scanned_bill.pdf`. The PDF must contain no text layer (guaranteed: it embeds only the PNG). No real bill data anywhere.

6. **`www/sw.js` — precache + cache bump.**
   - `FILES`: add `'lib/scanned.js'` to the `lib/*` run (line 5) and `'data/fixtures/SYNTHETIC_scanned_bill.pdf'` to the fixtures run (line 7). (Do not precache the PNG — the app never fetches it. If Task 8's `lib/ocr.js`/`lib/ocr-worker.js` exist by then, the PWA test already forces them into `FILES`; `www/models/*` precaching stays Task 8/11's.)
   - `const CACHE = 'tanaw-v2'` → `'tanaw-v3'`.

7. **`tests/selfcheck.mjs` — `test_scanned_fallback` block.** Insert after the `for (const name of ['good', 'weak'])` loop (after line 85), before the golden-bill block. Uses only Node-safe operations (no DOM, no real OCR):
   ```js
   // test_scanned_fallback: text-less PDF → typed NoTextError; the scanned-PDF route renders pages
   // (stubbed in Node) and feeds the OCR fn with correct page tags; failures stay clear, never "not built".
   {
     const { NoTextError } = await import('../www/lib/extract.js');
     const { scannedPdfToLines } = await import('../www/lib/scanned.js');
     const scanned = new Uint8Array(readFileSync('www/data/fixtures/SYNTHETIC_scanned_bill.pdf'));
     // 1) the fixture really has no selectable text (guards a regressed generator that re-embeds text)
     await assert.rejects(() => pdfLines(pdfjs, scanned.slice()), NoTextError);
     // 2) routing: every page is rendered + OCR'd in order, page tags are re-asserted
     const prog = [];
     const fakeBlob = new Blob(['png']); // Node 18+ global
     const lines = await scannedPdfToLines(pdfjs, scanned.slice(), undefined,
       (p, n) => prog.push([p, n]),
       async () => fakeBlob,
       async (b, p) => [{ y: 100, page: p, items: [{ str: 'SYNTHETIC', x: 10 }], confidence: 0.99 }]);
     assert.deepEqual(prog, [[1, 1]]);
     assert.deepEqual(lines, [{ y: 100, page: 1, items: [{ str: 'SYNTHETIC', x: 10 }], confidence: 0.99 }]);
     // 3) the routed line model still parses through the real parser
     const bill = parseBill(lines);
     assert.equal(bill.source, 'synthetic'); // the line carries the SYNTHETIC marker
     // 4) OCR engine failure surfaces its own message; empty OCR output is a clear, honest error
     await assert.rejects(() => scannedPdfToLines(pdfjs, scanned.slice(), undefined, undefined,
       async () => fakeBlob, async () => { throw new Error('OCR worker crashed'); }), /OCR worker crashed/);
     await assert.rejects(() => scannedPdfToLines(pdfjs, scanned.slice(), undefined, undefined,
       async () => fakeBlob, async () => []), /could not find any text/);
   }
   console.log('scanned fallback OK');
   ```
   The existing `test_pwa` block (lines 173–179) needs **no edit** — it will automatically enforce `lib/scanned.js` and the new fixture PDF being precached, and `lib/scanned.js` must exist.
   Real-OCR accuracy (does the Task 8 engine actually read this fixture into a correct bill?) is **out of Node scope** — it is the manual browser check below and the Gate 0 corpus (OQ6). Do not add a `shortcut:` marker for it; if the real OCR misreads the fixture, that is Task 8's calibration work, not a test carve-out here.

8. **`docs/tech_spec.md` — document the fallback order (acceptance criterion 2).**
   - §5.4 "Fallback order" (lines 282–288): replace the 3-item list + trailing sentence with:
     ```
     1. Photo → OCR → parser → checks → confirmation.
     2. PDF → embedded text → parser → checks → confirmation.
     3. PDF with no selectable text → render pages to images → the same OCR path as step 1 → parser → checks → confirmation.
     4. Any failure → manual entry on the confirmation screen (fields still editable), or a clear error.
     ```
     followed by: "Scanned (image-only) PDFs are detected by `www/lib/extract.js` throwing `NoTextError` and routed by `www/lib/scanned.js` (`scannedPdfToLines`) through the shared OCR pipeline; the parsed bill's `source` is tagged `scanned_pdf_ocr` (photos are `photo_ocr`). The PDF path remains the permanent fallback per PLAN.md."
   - §2 status table, "Photo OCR" row (line 69): update the Current cell. If `www/lib/ocr.js` is **absent** at execution time: `Not built (Task 8); scanned PDFs are wired to the OCR route via www/lib/scanned.js and degrade to a clear error until it ships`. If it exists: `Implemented; scanned PDFs route through the same path (www/lib/scanned.js)`. Never claim photo OCR is implemented while `www/lib/ocr.js` is missing.

## Acceptance Criteria
1. `npm test` passes and prints the new `scanned fallback OK`, with the existing `pwa OK` (which now enforces `lib/scanned.js` + the scanned fixture in the `sw.js` precache). *(Pre-existing caveat: the suite currently fails earlier at `test_reasons` because `reasons.json` is empty — that is Task 1's red, not this task's. Verify the scanned block independently if Task 1 has not landed.)*
2. `grep -r "not built" www/` returns no matches.
3. `www/data/fixtures/SYNTHETIC_scanned_bill.pdf` is committed, generated solely from the SYNTHETIC bill (no real data), and `pdfLines` rejects it with `NoTextError`.
4. Fallback order honored in `www/app.js scan()`: text PDF → `pdfLines` directly (OCR import never triggered); text-less PDF → `scannedPdfToLines` (per-page progress message) → `parseBill` → confirmation screen with `bill.source === 'scanned_pdf_ocr'`; OCR/render failure → clear error message offering retry/manual entry, never a silent proceed, never the old message.
5. Password-locked PDF behavior unchanged: `PasswordException` from either extraction path still shows `#pwbox`.
6. The results "Sources and assumptions" panel shows the per-source `Bill:` label (`scanned_pdf_ocr` → "your scanned PDF statement, read on-device by OCR"); `markSynthetic()` still only fires for `source === 'synthetic'`.
7. The 4-step fallback order is written in `docs/tech_spec.md` §5.4 and the §2 status table is consistent with the actual state of `www/lib/ocr.js`.

## Verification
1. `node scripts/make_scanned_fixture.mjs` (after the PNG is in place) → prints `scanned fixture written`; `git status` shows the two committed fixture files + `package.json` change only.
2. `npm test` → expect `… scanned fallback OK … pwa OK selfcheck OK` (with the Task 1 caveat above).
3. `grep -rn "not built" www/` → no output.
4. Manual browser check (requires Task 8's models for the happy path; before that, step 4b verifies graceful degradation):
   - 4a. `npm start` → click "the scanned (image-only) sample" → observe "Reading scanned page 1 of 1…" then the confirmation screen populated from OCR, with low-confidence fields flagged per Task 8; run "explain my bill" → results panel Sources shows "your scanned PDF statement, read on-device by OCR".
   - 4b. If `www/lib/ocr.js` is not yet present: the same upload shows a clear `Couldn't read this PDF: …` error (from the failed dynamic import / worker) with the manual-entry pointer — **no** "not built" text.
   - 4c. Regression: "Try the SYNTHETIC sample" → confirmation appears with **no** "Reading scanned page" message; Sources shows the SYNTHETIC sample wording.

## Edge Cases & Non-Goals
- **Task 8 may not be merged yet.** This spec pins the `ocrImage(blob, page)` contract it must provide. If `www/lib/ocr.js` is absent when Task 9 executes, the runtime dynamic import fails and the user gets the clear error path (acceptance 4b) — graceful degradation per tech_spec §11 — while `npm test` stays green because the Node tests inject stubs. **Do not implement the OCR engine, models, or worker in this task.**
- **Real OCR quality on the scanned fixture is Task 8 / Gate 0 (OQ6) territory.** If the engine misreads the rasterized fixture, that is OCR calibration (thresholds, scale, model choice), not a Task 9 defect; the routing, page tagging, error handling, and `source` tag are what this task owns.
- **Hybrid PDFs** (some pages text, some scanned): `pdfLines` only throws when *no* page has text, so a hybrid statement currently drops its scanned pages silently. Out of scope for v1 (Meralco statements are all-text or all-scanned); if the Gate 0 corpus shows real hybrid bills, open a follow-up.
- **Pre-existing red baseline:** `npm test` fails at `test_reasons` (empty `reasons.json`) until Task 1 lands; the new block sits before `test_pwa` but the file aborts at the first assertion failure — re-verify the scanned block after Task 1.
- **No new runtime dependencies.** The fixture PNG is a committed one-time browser rasterization; `scripts/make_scanned_fixture.mjs` uses only the existing `pdf-lib` dep. Adding npm `canvas` (native) is a non-goal.
- **Non-goals (other tasks):** photo intake control (Task 7), the OCR engine/worker/models + their precache (Task 8), confidence-flag UI (Task 8), privacy/scope-guard tests (Task 10), PWA offline re-verification + final cache bump (Task 11), `requirements.md` status-column reconciliation (Task 12). `docs/requirements.md` FR-X-4's "Not built (photo)" cell is intentionally not edited here.
- **PLAN.md wording note:** the plan's fallback order lists *photo* first, but `photo →` is Task 7/8's path; this task implements and documents the PDF half (steps 2–4) plus the shared OCR entry point. The §5.4 edit records all four steps so the documented order matches PLAN.md exactly.
