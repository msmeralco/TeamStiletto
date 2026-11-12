# Spec: In-browser PaddleOCR pipeline with confidence flags (Task 8 from PLAN.md)

## Goal
Recover a bill's text from a photo entirely on-device (PP-OCR det + angle-cls + rec via onnxruntime-web in a Web Worker), emit the shared line model with per-line/per-item confidence, feed the existing `parseBill` → `runChecks` → confirmation flow, and visibly mark low-confidence fields for review — with the OCR models bundled + precached so repeat runs work offline.

## Inputs & Context
- **PLAN.md Task 8** (lines 87–95): "Build the in-browser PaddleOCR pipeline with confidence flags (FR-X-1..5, FR-V-4, FR-D-1)". Depends on Task 7 (photo intake).
- Requirements: `docs/requirements.md` — FR-X-1 (on-device PP-OCR via ONNX Runtime Web, FR line 133), FR-X-2 (English det/cls/rec, line 134), FR-X-3 (emit the existing line model, line 135), FR-X-4 (extract the full field set, line 136), FR-X-5 (per-field confidence signal, line 137), FR-X-6 (no PP-Structure, line 138), FR-V-4 (low-confidence fields visibly marked on confirmation, line 147), FR-D-1 (OCR models bundled, line 188), NFR-2 (OCR in a Worker, line 218), NFR-5 (models pinned/hashed, line 221), AC-1 (no network request carries the image, line 255).
- Design: `docs/tech_spec.md` §5 (Photo OCR pipeline, lines 248–288), §4.1 (line model shape, lines 121–134), §4.2 (`source` gains `photo_ocr`, line 160), §9 (privacy: no remote model fetch at runtime, self-host, lines 417–427), §10 (precache `models/*`, line 438), §12 (performance: Worker, ~15 s target, lines 467–476).

**Existing code this task touches (verified, real paths/symbols):**
- `www/lib/extract.js` — PDF path; `pdfLines` returns the **line model** `[{ y, page, items: [{ str, x }] }]`. Line ordering: `rows.sort((a,b)=>b.y-a.y)` → **top line first, `y` decreases down the page**; items sorted by `x` left→right. This is the contract OCR must emit. (Line 18's "not built yet" throw is **Task 9**, left untouched here.)
- `www/lib/parse.js` — `parseBill(lines)` (line 39). Uses `l.items.map(i=>i.str).join('  ')` per line and per-item `.x` for column alignment (the `field()` column fallback at lines 47–53, and the tracker `cells()` filter at line 29). This is why OCR must emit **word-level items**, not one blob per line.
- `www/lib/checks.js` — `runChecks(bill)` (line 3); unchanged by this task.
- `www/app.js` — flow: `scan()` (line 30), `renderConfirm()` (line 55, builds `#fields` from `SCALARS` + `bill.charges` + `bill.tracker` with `data-k`/`data-c`/`data-t` attributes), `renderChecks()` (line 65, toggles the red `bad` class), `show()` (line 18), `msg()` (line 19), `markSynthetic()` (line 26), `#file` handler (line 44). `source` is used at lines 26 and 134.
- `www/sw.js` — `CACHE = 'tanaw-v2'` (line 3) and `FILES = [...]` (lines 4–7). The SW precaches the app shell + `lib/*` + `vendor/*` + data.
- `tests/selfcheck.mjs` — `test_pwa` (lines 173–179): parses `const FILES = [...]` out of `sw.js`, asserts **every listed file exists** and **every file in `www/lib/` is listed**. `readBill`/`parseBill` used at lines 28/71; `FIELDS` list (line 29); the per-field comparisons at lines 71–74 compare only named fields (so adding a new `prov` field to the bill object is non-breaking).
- `package.json` — `postinstall` copies pdf.js into `www/vendor/` (line 7); `pdfjs-dist` pinned (line 23). `www/vendor/` is gitignored (`.gitignore` line 3); `www/data/` + fixtures are committed.
- `scripts/` — build-time (internet-allowed) pattern: `fetch_weather.mjs`, `build_rates.mjs` write into `www/data/`.
- **Absence confirmed (the gap):** no `www/lib/ocr.js`, no `www/lib/ocr-worker.js`, no `www/models/*`, no `onnxruntime-web` dependency, no `#ocrstatus`. `www/index.html` file input is `accept="application/pdf"` only (line 21) — the photo input itself is **Task 7's** deliverable.

**Assumption (dependency on Task 7):** Task 7 has landed a photo input (camera/gallery, `accept="image/*"`, `capture`) that normalizes the chosen image (EXIF orientation applied, long edge down-scaled) and then hands the normalized image to this task's entry point `scanPhoto(image)`. This spec defines and owns `scanPhoto` and everything downstream; it does **not** re-implement intake. If Task 7 is not yet merged, a temporary hidden `<input type=file accept=image/* capture=environment>` + a dev-only "load test photo" button may be added locally to exercise the path, but the permanent intake control stays Task 7's.

---

## Changes

### 1. `package.json` — add onnxruntime-web + vendor-copy script
- Add to `dependencies`: `"onnxruntime-web": "<pinned version>"` (e.g. `1.17.x` — pick the latest stable and pin the exact number; do **not** use a caret range). Run `npm install` and commit the updated `package-lock.json`.
- Replace the inline `postinstall` with: `"postinstall": "node scripts/copy_vendors.mjs"`.
- Add an npm script: `"models": "node scripts/fetch_models.mjs"`.

### 2. `scripts/copy_vendors.mjs` (NEW) — consolidate vendor copies
- Purpose: copy the runtime JS/WASM the app needs into `www/vendor/` (gitignored, reproduced from `node_modules`), matching the existing pdf.js pattern.
- Contents outline:
  - `mkdirSync('www/vendor', {recursive:true})`
  - Copy `node_modules/pdfjs-dist/legacy/build/pdf.min.mjs` and `pdf.worker.min.mjs` → `www/vendor/` (preserving the existing behavior from the old inline command).
  - `mkdirSync('www/vendor/onnxruntime-web', {recursive:true})`; copy from `node_modules/onnxruntime-web/dist/`: `ort.mjs` and every `*.wasm` and `*.mjs` (bounded, reproducible set — the worker loads `ort.mjs` which fetches the `.wasm`).
- Keep it dependency-free (Node built-ins only). Log the files copied.

### 3. `scripts/fetch_models.mjs` (NEW) — fetch + pin PP-OCR ONNX models (build-time, internet)
- Purpose: one-time download of the English PP-OCR model set into `www/models/`, verify hashes, and write a pin manifest. Mirrors `fetch_weather.mjs`.
- Top of file: a clearly-marked constant for the pinned mirror base URL + a comment. **Gate G-2 is the decision to make here** — the exact PP-OCR ONNX export/sizes must be validated on a mid-range phone; pick a starting variant (PP-OCRv4 mobile detection + PP-OCRv4 **English** recognition + direction classifier) and record the chosen files.
- Download (and verify sha256 against a hard-coded `const EXPECTED = { 'ch_ppocr_v3_det.onnx': {sha256, bytes}, ... }`) into `www/models/`:
  - `www/models/ch_ppocr_v3_det.onnx` — text detection (DBNet-family).
  - `www/models/ch_ppocr_v3_cls.onnx` — angle classification (0°/180°).
  - `www/models/en_ppocr_v4_rec.onnx` — **English** recognition (CRNN+CTC).
  - `www/models/en_dict.txt` — recognition dictionary (index→char).
- Write `www/models/models.json` pinning, per file: `name`, `sha256`, `bytes`, `source` (URL), `version`/export provenance, plus `variant` (the chosen PP-OCR export) and `retrieved` (date). This is the FR-D-1/NFR-5 pin.
- Throw (non-zero exit) on any hash mismatch or missing file.
- **These model files are committed** (they are bundled data, like `rates.json`), so CI `npm test` passes offline. Never commit anything personal.

### 4. `www/lib/ocr.js` (NEW) — pure core + main-thread worker wrapper
- This file must be **import-safe in Node** (no top-level `Worker`/`onnxruntime`/DOM). Exports:
  - `export const OCR_CONF_THRESHOLD = 0.60;` — default low-confidence line threshold (tech_spec §5.2; tunable, document changes).
  - `export const SCALAR_KEYS = ['period_start','period_end','previous_reading','current_reading','multiplier','kwh','charges_this_period','remaining_balance','installment_due','total_amount_due'];` — matches `SCALARS` in `app.js`.
  - `export function buildLineModel(recBoxes, imgH)` — **pure**, the line-model builder. `recBoxes` is `[{ text, conf, x0, y0, x1, y1 }]` (recognition results in image px, y-down from top). Returns the shared line model, **with confidence added**:
    - Split each `text` into **words** on whitespace (so items are word-level, preserving `parse.js` column alignment).
    - For each word, estimate an `x`-center by distributing words across the box width proportionally to cumulative character count (monospace approximation — a documented approximation, `shortcut:`-level, to be validated against Gate 0).
    - Group words into lines by box center-y within a tolerance (e.g. `0.6 * boxHeight`); each line's `y = imgH - (y0 + y1) / 2` so the **top line has the largest `y`** (matching `extract.js` ordering); items sorted by `x` ascending.
    - Each line: `{ y, page: 1, items: [{ str, x, conf }], conf }` where the line `conf` is the min (or mean — pick one and be consistent) of its items' `conf`, and each item carries the source box `conf`.
    - Sort lines by `y` descending (top first). **The core shape `[{ y, page, items: [{ str, x }] }]` is preserved; `conf` is additive** so `parse.js` stays engine-agnostic.
  - `export function lowConfFields(bill, lines, threshold = OCR_CONF_THRESHOLD)` — **pure**. Reads `bill.prov` (see change 6) and the per-line `conf` on `lines` (a line's `conf` is `line.conf ?? 1`, so PDF-style lines with no `conf` are never flagged). A provenance line index `j` is "low" when `lines[j].conf != null && lines[j].conf < threshold`. Returns a `Set` of:
    - each scalar key `k` (from `SCALAR_KEYS`) whose `bill.prov[k]` is a **non-empty** array of line indices containing a low line — an **empty** `prov[k]` (e.g. `kwh` derived from `cur − prev` rather than read, or a defaulted `multiplier`/`remaining_balance`) is **not** flagged;
    - `'charges:<i>'` for each `i` where `bill.prov.charges[i]` is a low line index;
    - `'tracker:<i>'` for each `i` where `bill.prov.tracker[i]` is a low line index.
    - Keys not present in `bill.prov` (or `bill.prov == null`, e.g. a PDF bill) yield nothing.
  - `export async function ocrLines(image, { onProgress } = {})` — **browser-only** wrapper. Lazily creates `new Worker(new URL('./ocr-worker.js', import.meta.url))` (created inside the function so Node import stays safe), normalizes `image` to RGBA `ImageData` via an offscreen canvas (intake already downscaled/EXIF-applied; just read pixels), posts `{ id, rgba, width, height }`, and resolves `{ lines }` on the matching result or rejects with the worker's `error`. Forward worker `{ progress, stage }` messages to `onProgress`.

### 5. `www/lib/ocr-worker.js` (NEW) — ONNX inference off the main thread
- Purpose: run PP-OCR det → cls → rec, emit `recBoxes`, call `buildLineModel`, and post the line model back. No DOM.
- Top: `import * as ort from '../vendor/onnxruntime-web/ort.mjs';` and `import { buildLineModel } from './ocr.js';`
- Configure ONNX for self-hosted, single-thread (avoids SharedArrayBuffer/COOP-COEP requirements on arbitrary static hosts):
  - `ort.env.wasm.wasmPaths = '../vendor/onnxruntime-web/';`
  - `ort.env.wasm.numThreads = 1;`
- Load the three sessions lazily on first run (so first `ocrLines` shows the download/load state): fetch `models/ch_ppocr_v3_det.onnx`, `models/ch_ppocr_v3_cls.onnx`, `models/en_ppocr_v4_rec.onnx` (same-origin; precached by the SW → offline after first load) and `ort.InferenceSession.create(buffer)` for each; load `models/en_dict.txt` into a char map.
- `self.onmessage = async (e) => { const { id, rgba, width, height } = e.data; try { …post progress at each stage…; const recBoxes = await runOcr(rgba, width, height); const lines = buildLineModel(recBoxes, height); self.postMessage({ id, lines }); } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); } }`
- `runOcr(rgba, width, height)` — standard PaddleOCR pipeline (document the constants as starting points, tunable against Gate 0):
  1. Preprocess: build a float tensor, scale long edge to ~960, normalize to `[0,1]`, NCHW.
  2. **Detect** (`det`): probability map → threshold ~0.3 → extract line polygons/boxes → filter tiny boxes (min area ~100 px²).
  3. **Classify** (`cls`) each crop: 0°/180°; rotate the crop if 180°.
  4. **Recognize** (`rec`) each (rotated) crop: CRNN output → CTC greedy decode against `en_dict.txt` → `text` + mean per-character confidence = box `conf`.
  5. Return `recBoxes` (`{ text, conf, x0, y0, x1, y1 }` in original image px).
  - Post `{ id, progress: 0..1, stage: 'det'|'cls'|'rec' }` between stages so the UI never looks frozen (NFR-2).
- **No network call carries the image** — the image arrives as a posted buffer; the only fetches are same-origin, precached model files (AC-1, FR-PR-1).

### 6. `www/lib/parse.js` — record line provenance (engine-agnostic, additive)
- Purpose: so FR-X-5/FR-V-4 can map each extracted field back to the source line(s) it came from, without duplicating the label-matching logic (DRY, and works identically for PDF and OCR).
- Inside `parseBill(lines)` (line 39), declare the accumulator **before** the `texts`/`field` setup: `const prov = { charges: [], tracker: [] }; for (const k of SCALAR_KEYS) prov[k] = [];` (import `SCALAR_KEYS` from `./ocr.js` — this is a pure re-export, no cycle: `ocr.js` does not import `parse.js`).
- Rework `field(re, as = toNum)` (line 41, a closure inside `parseBill` so it sees `prov`) to a third `key` param that records provenance:
  - Signature: `const field = (re, as = toNum, key) => { … }`.
  - Same-line number path: `if (n) { if (key) prov[key] = [i]; return as(n[0]); }`
  - Column-fallback path (number on a line below, loop `for (const l of …lines.slice(i+1, i+4))`): capture the fallback line's index `j` (e.g. `for (let j = i + 1; j < Math.min(i + 4, lines.length); j++)`) and `if (key) prov[key] = [i, j]; return as(it.str.match(NUM)[0]);`
  - When nothing matches: leave `prov[key] = []` (a defaulted field like `multiplier ?? 1` or `remaining_balance ?? 0` is not OCR-sourced → never flagged).
- Update every `field(...)` call site (lines 59–75) to pass its key: `field(/previous reading/i, toNum, 'previous_reading')`, `field(/current reading/i, toNum, 'current_reading')`, `field(/^multi(plier)?\b/i, toNum, 'multiplier')`, `field(/customer account number/i, s => s, 'can')` (record or skip `can` — it's not in `SCALAR_KEYS` so `prov.can` is optional; if you record it, `lowConfFields` ignores non-`SCALAR_KEYS` keys), `field(/actual consumption|kwh used/i, toNum, 'kwh')` (only sets `prov.kwh` on a direct match; the `?? (cur - prev) * mult` derived case leaves `prov.kwh = []`), `field(/charges for this billing period/i, toNum, 'charges_this_period')`, `field(/remaining balance/i, toNum, 'remaining_balance')`, `field(/installment due/i, toNum, 'installment_due')`, `field(/total amount due/i, toNum, 'total_amount_due')`.
- **Charges provenance** (line 71). Replace `charges: from >= 0 && to > from ? texts.slice(from + 1, to).flatMap(chargesOnLine) : []` with a loop that tags each produced charge with its source row, then strips the tag:
  ```js
  let charges = [];
  if (from >= 0 && to > from) {
    for (let row = from + 1; row < to; row++) {
      for (const c of chargesOnLine(texts[row])) charges.push({ ...c, _line: row });
    }
    prov.charges = charges.map(c => c._line);
    charges = charges.map(({ _line, ...rest }) => rest);
  }
  ```
  Then in the returned object use `charges,` (the cleaned array) and keep `prov.charges` aligned to it.
- **Tracker provenance.** Change `parseTracker(lines, periodEnd)` (line 28, a top-level function) to `parseTracker(lines, periodEnd, prov)`, threading a `_line` tag through the existing chain so it survives the `.filter` and final `.map` and stays aligned to the returned array. The current chain is:
  ```js
  return [[lines[i + 1], y - 1], [lines[i], y]]
    .flatMap(([l, yr]) => cells(l).map((c, m) => ({ month: `${yr}-${String(m + 1).padStart(2, '0')}`, s: c.str })))
    .filter(c => c.s !== '-' && c.month <= periodEnd.slice(0, 7))
    .map(c => ({ month: c.month, kwh: toNum(c.s) }));
  ```
  Replace it with (the third array element is the `lines` index of the source row):
  ```js
  const out = [[lines[i + 1], y - 1, i + 1], [lines[i], y, i]]
    .flatMap(([l, yr, lineIdx]) => cells(l).map((c, m) => ({ month: `${yr}-${String(m + 1).padStart(2, '0')}`, s: c.str, _line: lineIdx })))
    .filter(c => c.s !== '-' && c.month <= periodEnd.slice(0, 7))
    .map(c => ({ month: c.month, kwh: toNum(c.s), _line: c._line }));
  if (prov) prov.tracker = out.map(c => c._line);
  return out.map(({ _line, ...rest }) => rest);
  ```
  Update the single call site (line 70) to `tracker: parseTracker(lines, pe, prov)`.
- Add `prov` to the returned bill object (next to `source`, line 76): `prov,` — and keep `source` detection unchanged (`'synthetic'`/`'pdf_text'`; the OCR path overwrites it to `'photo_ocr'` in `app.js`).
- **Non-breaking:** `tests/selfcheck.mjs` compares only named fields (lines 71–74), not the whole object, so adding `prov` changes no existing assertion. Do **not** regenerate `www/data/fixtures/*` (`make_synthetic.mjs` builds bills directly, not via `parseBill`).

### 7. `www/sw.js` — precache the new assets + bump cache
- Bump `const CACHE = 'tanaw-v2';` → `const CACHE = 'tanaw-v3';` (tech_spec §10: bump on every model update; activate already prunes old caches, lines 10–11).
- Extend `FILES` (keep it a **flat array of single-quoted strings** — `test_pwa`'s regex `const FILES = (\[[\s\S]*?\]);` depends on this):
  - lib group: add `'lib/ocr.js', 'lib/ocr-worker.js'` (required — `test_pwa` globs `www/lib` and asserts each is listed).
  - vendor group: add `'vendor/onnxruntime-web/ort.mjs'` and the self-hosted WASM, e.g. `'vendor/onnxruntime-web/ort-wasm-simd.wasm'` (add any further `.mjs`/`.wasm` the pinned onnxruntime version actually loads — `test_pwa` + an offline load will catch a miss).
  - models group: add `'models/ch_ppocr_v3_det.onnx', 'models/ch_ppocr_v3_cls.onnx', 'models/en_ppocr_v4_rec.onnx', 'models/en_dict.txt', 'models/models.json'`.

### 8. `www/app.js` — photo branch, progress states, low-confidence marking
- Import the OCR helpers near the other imports (line 2): `import { ocrLines, lowConfFields, OCR_CONF_THRESHOLD } from './lib/ocr.js';`
- Add a module state var next to `let bill, bytes, analysis;` (line 25): `let lastOcr = null;` (the OCR line model for the current bill, or `null` on the PDF path).
- Add the photo entry point (the seam Task 7 calls with a normalized image):
  ```js
  async function scanPhoto(image) {
    showOcrStatus('load'); msg('Reading your bill…');
    try {
      const { lines } = await ocrLines(image, { onProgress: (stage, p) => showOcrStatus(stage, p) });
      lastOcr = lines;
      bill = parseBill(lines);
      bill.source = 'photo_ocr';
      markSynthetic();
      renderConfirm();
      show('confirm');
      showOcrStatus('');
      const low = lowConfFields(bill, lines, OCR_CONF_THRESHOLD);
      if (!bill.total_amount_due && !bill.kwh && !(bill.charges && bill.charges.length)) {
        msg('We could not read much of this photo. Correct or fill in the numbers below, or upload the PDF instead.');
      } else if (low.size) {
        msg('Some readings were low-confidence (amber). Please double-check them before continuing.');
      }
    } catch (e) {
      showOcrStatus('');
      msg(`Couldn't read this photo: ${e.message}. Try another photo, or upload the PDF instead.`);
    }
  }
  ```
- Add a small status helper (visible first-load download + processing states, NFR-2 / tech_spec §5.3):
  ```js
  function showOcrStatus(stage, p) {
    const el = $('#ocrstatus'); if (!el) return;
    const label = { load: 'Downloading OCR models…', det: 'Finding text…', cls: 'Straightening…', rec: `Reading your bill…${p != null ? ' ' + Math.round(p * 100) + '%' : ''}` }[stage] ?? '';
    el.hidden = !label; el.textContent = label;
  }
  ```
- In `renderConfirm()` (line 55), after the `#fields` `innerHTML` is set, mark low-confidence inputs (independent of the red `bad` self-check marking in `renderChecks`). Add:
  ```js
  const low = lastOcr ? lowConfFields(bill, lastOcr, OCR_CONF_THRESHOLD) : new Set();
  const mark = el => { const key = el.dataset.k ?? (el.dataset.c != null ? `charges:${el.dataset.c}` : el.dataset.t != null ? `tracker:${el.dataset.t}` : null); return key != null && low.has(key); };
  document.querySelectorAll('#fields input').forEach(el => el.classList.toggle('lowconf', mark(el)));
  $('#lowconf-legend').hidden = !low.size;
  ```
- Leave `renderChecks()` (red `bad`), the `#fields` `oninput` handler (line 72), and `scan()` (PDF path) unchanged. Editing a field does **not** clear its `lowconf` mark (the reading was OCR-uncertain regardless of later edits).
- The PDF path must be **unchanged and always available** as the fallback (PLAN constraint): `scan()` still works for `application/pdf`; `scanPhoto` is a separate branch.

### 9. `www/index.html` — status element + low-confidence legend
- In the `#confirm` section (after `<ul id="checks"></ul>`, line 38), add: `<p id="lowconf-legend" class="hint" hidden>Amber fields were read from your photo with low confidence — please verify them.</p>`.
- In the `#upload` section (near the existing `#msg` / hints), add: `<p id="ocrstatus" role="status" aria-live="polite" hidden></p>`.
- The photo file input itself is **Task 7's** deliverable (do not add the permanent intake here; see the assumption note). Its `onchange` (once Task 7 lands) normalizes the image and calls `scanPhoto(image)`.

### 10. `www/style.css` — low-confidence + status styling
- Add a distinct amber low-confidence style, visually separate from the existing red `input.bad` (line 24): `input.lowconf { outline: 2px solid #b26a00; outline-offset: -2px; background: #fff4e0; }` (choose a tone readable in the dark-scheme block at line 2).
- Add `#ocrstatus { color: var(--muted); font-size: 14px; min-height: 1em; }` and ensure `#lowconf-legend` inherits `.hint` (already defined, line 11).

### 11. `tests/selfcheck.mjs` — confidence + line-model tests (Node-runnable, no browser/photo)
- Add to the top imports: `import { buildLineModel, lowConfFields, OCR_CONF_THRESHOLD, SCALAR_KEYS } from '../www/lib/ocr.js';`
- Extend the existing per-fixture parse loop (after line 74) with a provenance-shape assertion: `assert.ok('prov' in bill && Array.isArray(bill.prov.tracker) && bill.prov.tracker.length === bill.tracker.length, `${name}.prov tracker aligned`)`.
- Add a new `// test_ocr` block (no real photo needed — synthetic rec boxes with known confidences):
  - `buildLineModel`: feed 2–3 boxes with distinct `y0` and `conf`; assert it returns one line per box; the **top** box (smaller `y0`) yields the line with the **larger `y`**; each line's `items` are the whitespace-split words in increasing `x`; every item's `x` is a number and `conf === box.conf`; the line carries a numeric `conf` equal to the box `conf`.
  - `lowConfFields`: build `lines` where line `0` has `conf: 0.4` (low) and line `1` has `conf: 0.9` (high). Then:
    - `lowConfFields({ prov: { total_amount_due: [0], charges_this_period: [1], kwh: [] } }, lines)` → `{'total_amount_due'}` (the low line's scalar is flagged; the high one and the empty-`prov` derived `kwh` are not).
    - `lowConfFields({ prov: { charges: [0, 1], tracker: [0] } }, lines)` → `{'charges:0', 'tracker:0'}` (only the low-indexed entries).
    - All-high prov (every index → a high line) → empty set.
    - **PDF-style lines (no `conf`)** with any prov → empty set (never flagged).
  - `SCALAR_KEYS` length is 10 and deep-equals the `SCALARS` keys used by `app.js` (guard against drift).
  - End with `console.log('ocr line model + confidence OK');`.
- `test_pwa` (unchanged) now additionally enforces that `lib/ocr.js`, `lib/ocr-worker.js`, `vendor/onnxruntime-web/*`, and `models/*` all exist and are precached.

---

## Acceptance Criteria
- **Green suite incl. models:** `npm install && npm run models && npm test` all pass — including the (now extended) `test_pwa` (every precached file exists, every `www/lib/*` listed) and the new `test_ocr` block. Committed `www/models/*` + updated `package-lock.json` are in the repo so offline CI is green.
- **On-device, no image upload (AC-1 / FR-X-1 / FR-PR-1):** With DevTools → Network open, uploading a bill photo makes **no request whose body/payload contains image bytes** (only same-origin fetches of precached `models/*` and `vendor/onnxruntime-web/*`, which are static assets, not the photo). Inference runs in `www/lib/ocr-worker.js` (a dedicated Worker), not on the main thread (NFR-2).
- **English models, correct line model (FR-X-2 / FR-X-3 / FR-X-6):** `www/models/` holds English det + cls + rec ONNX + dict (no PP-Structure); `buildLineModel` output is the shared `[{ y, page, items: [{ str, x }] }]` shape with additive `conf`, top-line-first ordering (verified by `test_ocr`).
- **End-to-end photo → parsed bill (FR-X-4 / AC-1):** A bill photo produces `bill` through the **existing** `parseBill` → `runChecks` → confirmation, with `bill.source === 'photo_ocr'`, reaching the same editable confirmation screen the PDF path uses.
- **Visible states (NFR-2 / tech_spec §5.3):** First OCR run shows `#ocrstatus` download-then-processing messages (and a percentage during `rec`); the UI never appears frozen.
- **Low-confidence flags (FR-X-5 / FR-V-4):** Fields whose source OCR line has `conf < 0.60` are marked amber (`input.lowconf`) on the confirmation screen and the `#lowconf-legend` is shown; the flag logic is covered by `test_ocr`.
- **Honest fallback (tech_spec §5.4 / §11):** On OCR failure (worker error, no text, or essentially nothing parsed) the app shows a clear `#msg` and the editable confirmation screen for manual entry — it does **not** proceed to results silently; the PDF path remains available.
- **Bundled + precached + offline-capable (FR-D-1):** `www/models/*` and the onnxruntime assets are in `sw.js` `FILES` (cache `tanaw-v3`); a second photo OCR run with the network disabled still completes (model files served from cache). Full offline verification is finalized in Task 11.

## Verification
1. `npm install` — postinstall now copies pdf.js **and** `onnxruntime-web` into `www/vendor/`; confirm `www/vendor/onnxruntime-web/ort.mjs` + the `.wasm` exist.
2. `npm run models` — downloads + hash-verifies the PP-OCR set into `www/models/` and writes `www/models/models.json`; re-run to confirm it is idempotent and that a tampered file fails the hash check.
3. `npm test` — all green. Specifically: `pwa OK` (precache complete, new `lib/ocr*.js` + `models/*` + onnxruntime vendor present), `ocr line model + confidence OK` (line-model shape/ordering + threshold flagging + PDF-no-conf case), and the extended per-fixture `prov` assertion.
4. **Manual (needs a device/browser + a photo):** `npm start` → use the Task-7 photo input on a real (or synthetic-rendered) Meralco bill photo → observe `#ocrstatus` progress → confirmation screen with `source: photo_ocr` and the 4 self-checks. DevTools → Network: confirm **no request carries the image** (only static `models/*`/`vendor/*` fetches). DevTools → Application → Service Worker: confirm `tanaw-v3` precached the model files.
5. **Offline (pre-Task-11 smoke):** after one loaded page, toggle DevTools offline and run a second photo OCR — it should complete from cache (full offline/mobile sign-off is Task 11).
6. **Gate G-2 spot check:** on a mid-range phone, time one-page OCR; target < ~15 s and a sane first-load model-download size (record numbers; if the chosen export is too big/slow, swap the pinned variant in `fetch_models.mjs` and re-pin).

## Edge Cases & Non-Goals
- **Dependency on Task 7 (photo intake):** This spec owns `scanPhoto` and everything after the normalized image; the permanent photo input + normalization is Task 7's. If Task 7 isn't merged, a temporary hidden image input may be added locally to test, but is not part of this task's deliverable. The seam is the single function `scanPhoto(image)`.
- **Scanned (text-less) PDFs are Task 9, NOT this task:** the `extract.js:18` "not built yet" throw is left as-is. This task does not render PDF pages to images or route them through OCR (that reuses `ocrLines` in Task 9).
- **Model export/sizes (Gate G-2 / OQ5) are a live decision:** the spec names a starting PP-OCRv4-English variant, but the final ONNX export + sizes must be validated on a mid-range phone and recorded in `www/models/models.json`. Accuracy/size targets are goals, not guarantees.
- **No real-bill accuracy claim (Gate 0 / OQ6):** OCR accuracy and any parser `shortcut:` fixes are gated on a consented real-bill corpus (`data/private/`, gitignored). This task ships the pipeline + confidence honesty, not a validated accuracy number. Real bills stay out of the repo.
- **No PP-Structure (FR-X-6):** recognition lines + the existing label-anchored `parseBill` + the confirmation screen reconstruct fields; no table-structure model.
- **Word-level item `x` is a proportional approximation** (monospace spread across the box), not a glyph-accurate position; it is a documented `shortcut:`-level approximation to validate against Gate 0. It exists so `parse.js` column alignment keeps working.
- **Privacy:** the image is never uploaded and never persisted to `localStorage`/IndexedDB (FR-PR-1/2); only static model/vendor assets are fetched (same-origin, precached). OCR text is untrusted and must go through the existing `esc()` before any HTML insertion (already the case in `renderConfirm`).
- **onnxruntime is single-threaded** (`numThreads = 1`) to avoid requiring cross-origin isolation (COOP/COEP) on arbitrary static hosts; a threaded build is a later optimization, not v1.
- **Doc status reconciliation is Task 12:** this task does not rewrite the `requirements.md` FR-X status column or the `tech_spec.md` current-vs-target table; it makes the code match. (A fresh `docs/update.md` regeneration in Task 12 will reflect FR-X-1..5/FR-V-4/FR-D-1 as built.)
- **iOS/Capacitor packaging is out of v1 scope** (requirements FR-Dep-4); nothing here targets native delivery.
