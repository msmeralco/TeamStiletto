# Spec: Add photo upload and image intake (Task 7 from PLAN.md)

## Goal
Let the user upload a bill **photo** (camera or gallery) in addition to a PDF, and get it into the app as a **normalized image** (EXIF-oriented, long-edge down-scaled) with a clear "photo received / reader unavailable" UI state and an error-with-retry path — the on-ramp for the OCR pipeline (Task 8), independent of the OCR engine itself.

## Inputs & Context
- PLAN.md **Task 7** (FR-I-1). Satisfies FR-I-1 (`docs/requirements.md:123`), tech_spec §5.2 step 1 "Capture/normalize: accept `image/*`; downscale the long edge to a bounded size; apply EXIF orientation" (`docs/tech_spec.md:264`), and tech_spec §11 "Unreadable image → Show error; allow retry or manual entry" (`docs/tech_spec.md:451`).
- Current intake is PDF-only:
  - `www/index.html:21` — `<input id="file" type="file" accept="application/pdf" hidden>` (line 20 label "Upload your Meralco PDF statement", line 23 hint "In the My Meralco app…").
  - `www/app.js:44` — `$('#file').onchange = async e => { bytes = new Uint8Array(await e.target.files[0].arrayBuffer()); e.target.value = ''; scan(); };`
  - `www/app.js:30-43` — `scan()` runs the **PDF** path: `parseBill(await pdfLines(pdfjs, bytes.slice(), …))`, on failure `msg('Couldn't read this PDF: …')`.
  - `www/app.js:25` — top-level state `let bill, bytes, analysis;`.
  - `www/app.js:310` — "Start over": `$('#again').onclick = () => { bill = analysis = null; markSynthetic(); show('upload'); };`
- No image handling exists anywhere (no `createImageBitmap`/canvas/`toBlob`). OCR is absent; `www/lib/extract.js:18` still throws "…photo/OCR path is not built yet" for scanned PDFs (Task 8/9). This task does **not** add OCR — it only decodes + normalizes the image and surfaces honest states.
- Test harness is Node: `npm test` runs `node tests/selfcheck.mjs` (`package.json:12`). Browser-only APIs (`createImageBitmap`, canvas, `toBlob`, `URL.createObjectURL`) are **not** available in Node, so only the **pure** down-scale math and **static** HTML wiring are unit-testable; the decode/preview/error path is verified manually.
- `www/sw.js:5` precaches every `www/lib/*`; the PWA test (`tests/selfcheck.mjs:173-179`) asserts every file under `www/lib` is in the precache list — so a new `www/lib/intake.js` **must** be added to `FILES` or the suite fails.
- **Known pre-existing condition:** `npm test` is currently RED at `tests/selfcheck.mjs:169` (empty `reasons.json`, fixed by Task 1). The new `intake` block below is placed **before** the `reasons` block so it runs and passes on its own even while the suite is otherwise red.

## Changes

1. **NEW FILE `www/lib/intake.js`** — image intake/normalization. Pure down-scale math (Node-testable) + browser-only decode. Full contents:
   ```js
   // Photo intake: decode a bill photo (EXIF orientation applied), down-scale the long edge to a bounded
   // size, and re-encode for the OCR pipeline (Task 8). `downscaleSize` is pure and unit-tested in Node;
   // `normalizeImage` uses browser-only APIs (createImageBitmap/canvas) and is verified manually.
   export const MAX_EDGE = 1600;

   export function downscaleSize(width, height, maxEdge = MAX_EDGE) {
     const edge = Math.max(width, height);
     if (edge <= maxEdge) return { width, height };
     const s = maxEdge / edge;
     return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
   }

   export async function normalizeImage(file, maxEdge = MAX_EDGE) {
     // imageOrientation: 'from-image' applies the EXIF orientation tag so rotated phone photos come out upright.
     const src = await createImageBitmap(file, { imageOrientation: 'from-image' });
     const { width, height } = downscaleSize(src.width, src.height, maxEdge);
     const canvas = document.createElement('canvas');
     canvas.width = width; canvas.height = height;
     canvas.getContext('2d').drawImage(src, 0, 0, width, height);
     src.close?.();
     const blob = await new Promise((res, rej) =>
       canvas.toBlob(b => (b ? res(b) : rej(new Error('unreadable'))), 'image/jpeg', 0.9));
     return { blob, width, height };
   }
   ```
   No top-level browser globals (so `import` works in the Node test). Throws (rejects) on any undecodable input so the caller hits its error path.

2. **`www/index.html`** — accept images, reword the prompt, add the photo status/preview block.
   - Line 20 label text: `Upload your Meralco PDF statement` → `Upload your Meralco bill (photo or PDF)`.
   - Line 21: `accept="application/pdf"` → `accept="application/pdf,image/*"`. **Do NOT add a `capture=` attribute** — with no `capture`, the mobile file picker offers both camera *and* gallery (FR-I-1 "from camera or gallery"); `capture` would force camera-only.
   - Line 23 hint: `In the My Meralco app, open your bill and download the PDF statement.` → `Photograph your bill, or in the My Meralco app download the PDF statement.`
   - Immediately **after** line 23 (before the `<div id="pwbox" hidden>` on line 24), insert:
     ```html
     <div id="photobox" hidden>
       <img id="photoimg" alt="Bill photo" hidden>
       <p id="photostat" class="hint"></p>
     </div>
     ```

3. **`www/app.js`** — import the intake module, add photo state + helpers, branch the file handler, reset on new scans / start-over.
   - After the imports (after line 10, `import { daysSince, … } from './lib/disputes.js';`), add:
     `import { normalizeImage } from './lib/intake.js';`
   - Line 25 `let bill, bytes, analysis;` → `let bill, bytes, analysis, photo, photoUrl;`
   - Add these helpers just before `// ---------- 1. upload ----------` (before line 29):
     ```js
     // Photo intake state (FR-I-1). `photo` is the normalized image Task 8 (OCR) will consume.
     const photoPreview = url => { if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = url; $('#photoimg').src = url; $('#photoimg').hidden = false; };
     const photoStatus = t => { $('#photobox').hidden = false; $('#photostat').textContent = t; };
     const hidePhoto = () => { if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; } photo = null; $('#photoimg').hidden = true; $('#photobox').hidden = true; };
     async function handlePhoto(file) {
       msg();
       photoStatus('Reading your bill photo…');
       photoPreview(URL.createObjectURL(file)); // show the original immediately for feedback
       try {
         photo = await normalizeImage(file);   // EXIF-applied, long-edge ≤ MAX_EDGE
         photoPreview(URL.createObjectURL(photo.blob));
         photoStatus('Photo received. The photo reader isn't available yet — please upload the PDF statement instead (you can type the numbers in there).');
       } catch (e) {
         photo = null; $('#photoimg').hidden = true;
         photoStatus(`Couldn't read this photo${e?.message ? ': ' + e.message : ''}. Try another photo, or upload the PDF statement instead (you can type the numbers in there).`);
       }
     }
     ```
   - Replace line 44 `$('#file').onchange = …` with a branch on type (keeps the PDF path byte-for-byte):
     ```js
     $('#file').onchange = async e => {
       const f = e.target.files[0]; if (!f) return;
       e.target.value = ''; // allow re-selecting the same file (retry)
       if (f.type.startsWith('image/')) return handlePhoto(f);
       bytes = new Uint8Array(await f.arrayBuffer());
       scan();
     };
     ```
   - At the **top** of `scan()` (line 31, after `msg();`), add `hidePhoto();` so a photo preview does not linger when the PDF path runs.
   - Line 310: `$('#again').onclick = () => { bill = analysis = null; markSynthetic(); show('upload'); };` → `$('#again').onclick = () => { bill = analysis = null; hidePhoto(); markSynthetic(); show('upload'); };`
   - **Do not touch** the results "Bill: …" source line (`www/app.js:134`) — a photo does not yet produce a parsed `bill` (that lands with Task 8, which adds the `photo_ocr` source label per tech_spec §4.2).

4. **`www/style.css`** — style the preview. Append at end of file:
   ```css
   #photobox { margin: 12px 0; }
   #photoimg { width: 100%; max-height: 220px; object-fit: contain; border: 1px solid var(--line); border-radius: 8px; }
   ```

5. **`www/sw.js`** — precache the new lib (mandatory for the PWA test). On line 5, add `'lib/intake.js'` to the `lib/…` list (e.g. `…, 'lib/disputes.js', 'lib/intake.js', 'lib/solar.js', …`). Do **not** bump `CACHE` (`tanaw-v2`) here — the new `sw.js` bytes already trigger re-install and `addAll` fills the new entry; cache-version bumping for the OCR assets is Task 11.

6. **`tests/selfcheck.mjs`** — add an `intake` test block **after** `console.log('chat OK');` (line 159) and **before** `// test_reasons` (line 161), so it runs even while the suite is red on `reasons`:
   ```js
   // test_intake: photo intake caps the long edge (pure math) and the file control accepts images
   {
     const { downscaleSize, MAX_EDGE } = await import('../www/lib/intake.js');
     assert.equal(MAX_EDGE, 1600);
     assert.deepEqual(downscaleSize(800, 600), { width: 800, height: 600 });        // under cap: unchanged
     assert.deepEqual(downscaleSize(2000, 4000), { width: 800, height: 1600 });     // portrait: long edge capped
     assert.deepEqual(downscaleSize(3000, 2000), { width: 1600, height: 1067 });    // landscape: long edge capped
     const html = readFileSync('www/index.html', 'utf8');
     const input = html.match(/<input id="file"[^>]*>/)[0];
     assert.ok(/accept="[^"]*application\/pdf/.test(input), 'PDF still accepted');
     assert.ok(/accept="[^"]*image\/\*/.test(input), 'images accepted');
     assert.ok(!/capture=/.test(input), 'no capture attr so the gallery stays available');
     assert.ok(html.includes('id="photobox"'), 'photo status/preview block present');
     console.log('intake OK');
   }
   ```

## Acceptance Criteria
- **Automated:**
  - The new `intake` block runs and prints `intake OK` (down-scale math + HTML wiring).
  - The PWA precache test (`tests/selfcheck.mjs:173-179`) passes with `lib/intake.js` present — i.e. `npm test` no longer fails on "sw.js does not precache lib/intake.js" (this block runs once the pre-existing `reasons` failure from Task 1 is fixed).
- **Manual (browser, `npm start` → http://localhost:8000):**
  - The upload control offers **camera and gallery** on a phone (and image files on desktop); the label reads "Upload your Meralco bill (photo or PDF)".
  - Picking a valid photo shows a **preview** and the status "Photo received. The photo reader isn't available yet — please upload the PDF statement instead…" — a distinct state from the PDF path.
  - Picking a **bad/unreadable** image (corrupt file, or an HEIC the browser can't decode) shows the error "Couldn't read this photo… Try another photo, or upload the PDF statement instead (you can type the numbers in there)" — i.e. **retry** (re-pick, input is reset) **or manual entry** (PDF path → editable confirm screen).
  - A **portrait-EXIF** phone photo displays **upright** in the preview (EXIF orientation applied), and the normalized image's long edge is ≤ 1600 px.
  - The **PDF path is unchanged**: a normal PDF still goes through `scan()` → confirm exactly as before; a photo preview is cleared when a PDF is processed and on "Start over".

## Verification
1. `npm test` → observe `intake OK` printed (new block) and no new failures introduced by this task. (The overall suite stays red only on the pre-existing `reasons` assertion until Task 1; after Task 1, also confirm `pwa OK`.)
2. `npm start`, open http://localhost:8000:
   - Tap "Upload your Meralco bill (photo or PDF)"; on a phone confirm both **Take photo** and **Choose from gallery** are offered (no camera lock).
   - Upload a clear photo → preview appears + "Photo received. The photo reader isn't available yet…" status.
   - Upload a corrupt/unsupported image → "Couldn't read this photo…" with the retry + PDF-fallback wording; the file control remains usable.
   - Upload a PDF → it parses to the confirm screen as before and any earlier photo preview is gone.
   - "Start over" → photo preview hidden, back to a clean upload screen.
3. Grep sanity: `rg "lib/intake.js" www/sw.js` (present) and `rg "capture=" www/index.html` (no match).

## Edge Cases & Non-Goals
- **Non-goal (out of this task):** building OCR, emitting the line model, per-line confidence, or low-confidence field flags — all Task 8 (FR-X-1..5, FR-V-4). Task 7 only stores the normalized image in module-level `photo` for Task 8 to consume and shows the "reader unavailable" state.
- **Non-goal:** routing scanned (text-less) PDFs through this intake — Task 9.
- **Non-goal:** bumping the service-worker `CACHE` version — deferred to Task 11 (OCR assets); adding `lib/intake.js` to the precache list is sufficient for correctness now.
- **HEIC (iPhone) photos** may fail `createImageBitmap` in some browsers → they hit the error path (retry / PDF fallback), which is the intended honest degradation, not a bug to "fix" here.
- **Object-URL hygiene:** every preview `URL.createObjectURL` is revoked before the next is created and on `hidePhoto()`, so long sessions don't leak blob URLs; the original `File` is not persisted (NFR-10 / FR-PR-1 — image never leaves the device, never written to storage).
- **Pre-existing red suite:** the `intake` test is deliberately placed before the `reasons` block so it is verifiable before Task 1; do not read the still-failing `reasons` assertion as a Task 7 defect.
- `f.type`-based dispatch: a file with an empty/odd MIME is not `image/*`, so it falls through to the PDF path and fails there with the existing "Couldn't read this PDF" message — acceptable since the picker only surfaces `application/pdf` and `image/*` in the first place.
