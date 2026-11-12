# Spec: Rate provenance + documented data-steward procedure (Task 4 from PLAN.md)

## Goal
Make every bundled rate month carry a verifiable source (title + `meralco.com.ph` URL + retrieval date) that the loader validates and surfaces, state the basis of the key figures in the results view, and record the monthly refresh as a short documented, validated procedure — while preserving the existing component-sum validation.

## Inputs & Context
- **PLAN.md Task 4** — "Add rate provenance and a documented data-steward procedure (FR-S-3, FR-S-4, FR-D-2, FR-D-3)". Requirements: `docs/requirements.md` §5.6 FR-S-3/FR-S-4, §5.7 FR-D-2/FR-D-3, NFR-1 (verifiability). Current gap recorded in `docs/update.md` lines 28–29, 31–32.
- **Data file:** `www/data/rates.json` — 10 months (`2026-01`…`2026-10`). Each month object currently starts with keys `source_url`, `lft_assumed`, `fixed`, `non_lifeline`, `lifeline`. **No** `source_title`, **no** `retrieved`.
- **Builder:** `scripts/build_rates.mjs` — builds `out = { source_url, lft_assumed, fixed, non_lifeline, lifeline }` per month (line 48–49) from `data/rates_pdfs/*.pdf`, then calls `validateRates(rates)` and throws on any error (line 64–65). Note `MON` (3-letter month names) is defined at line 27.
- **Validation entry point (the "loader" check):** `www/lib/explain.js` → `export const validateRates = rates => …` (lines 23–27). It currently checks only that each row's components + fixed sum equal `total` (tolerance `0.0005`). It uses `months(rates)` (line 2) and `fixedSum` (line 43).
- **Surfacing path (already exists):** `www/app.js` line 23–24 — `const rateErrors = validateRates(rates); if (rateErrors.length) msg('rates.json failed validation: ' + rateErrors.join('; '));`. So anything `validateRates` returns is already shown in the UI and already fails `npm test` (tests call it at `tests/selfcheck.mjs:32`) and the build.
- **Results view:** `www/app.js` → `renderResults()` (lines 96–144). The `#sources` "Sources and assumptions" panel is built at lines 132–143; `rm` (line 132) renders each rate month as `Meralco rate table <m>: <source_url>`. Rate month, model tier (`#fitinfo`, lines 124–125), and weather source are already shown; the **reading basis (actual vs. estimated)** is not (per `docs/update.md:29`).
- **Reasons (already gated, do not rework here):** `www/lib/explain.js` `usableReason` (lines 39–41) and `tests/selfcheck.mjs:161–171` (`test_reasons`) already enforce a verbatim quote + date + `meralco.com.ph` URL per reason. Task 4 documents this gate; it does not change it.
- **Docs:** no steward doc exists yet. `README.md` "Commands"/"New rate month" (lines 33–41) is where the pointer belongs.

> Note: `data/rates_pdfs/` is gitignored and **not present** in the repo, so `npm run rates` cannot be re-run here. The 10 already-committed months must be backfilled in place; the builder is updated so **future** builds stamp provenance automatically.

## Changes

### 1. `scripts/build_rates.mjs` — stamp provenance at build time
1a. Next to `MON` (line 27), add full month names for titles:
```js
const MONFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
```
1b. In the `out` object (line 48), add `source_title` and `retrieved` (build date = true retrieval date for that build):
```js
  const out = { source_title: `Residential Bills at Typical Consumption Levels — ${MONFULL[+month.slice(5) - 1]} ${month.slice(0, 4)}`,
    source_url: URLS[month] ?? `https://www.meralco.com.ph/uploads/documents/regulatory/rates/${month}/${month.slice(5)}-${month.slice(0, 4)}-residential-bills.pdf`,
    retrieved: new Date().toISOString().slice(0, 10),
    lft_assumed: 0.005, fixed: {}, non_lifeline: {}, lifeline: {} };
```
(Only `source_title` and `retrieved` are new; `source_url` is unchanged.)

### 2. `www/data/rates.json` — backfill provenance on the 10 committed months
For **each** of the 10 months, replace that month's single `source_url` line with a 3-line block that adds `source_title` (above) and `retrieved` (below). `retrieved` is the date the data was recorded/verified by the steward (the original per-month fetch timestamps were never committed), all set to **`2026-11-12`**. The `source_url` value is copied through **unchanged**.

Title = `Residential Bills at Typical Consumption Levels — <MonthName> 2026` (use the **em dash** `—`, U+2014, exactly as in the builder).

| month | title suffix |
|---|---|
| 2026-01 | January 2026 |
| 2026-02 | February 2026 |
| 2026-03 | March 2026 |
| 2026-04 | April 2026 |
| 2026-05 | May 2026 |
| 2026-06 | June 2026 |
| 2026-07 | July 2026 |
| 2026-08 | August 2026 |
| 2026-09 | September 2026 |
| 2026-10 | October 2026 |

Each `source_url` line is unique in the file, so each edit is unambiguous. Worked examples (the other 8 follow the identical shape):

2026-01 (current line 3 → becomes; keep the file's 2-space field indent):
```json
  "source_title": "Residential Bills at Typical Consumption Levels — January 2026",
  "source_url": "https://www.meralco.com.ph/uploads/documents/legacy-documents/v2/unclassified/79/meralco-doc-793d5eaae26cee22.pdf",
  "retrieved": "2026-11-12",
```
2026-10 (current line 3711 → becomes):
```json
  "source_title": "Residential Bills at Typical Consumption Levels — October 2026",
  "source_url": "https://www.meralco.com.ph/uploads/documents/source-delta/2026-10-25/5afca4c86acee54e324a937c7481894500ae62aa0a92140d65f6a0e6ea943f79.pdf",
  "retrieved": "2026-11-12",
```

### 3. `www/lib/explain.js` — validate provenance (preserving the sum check)
Add a provenance error function just above `validateRates`, and append its result to `validateRates`. The existing sum-check expression is kept **byte-identical** so "existing behavior preserved" is literal.

Insert before `export const validateRates`:
```js
// FR-S-3 / FR-D-3: a rate month is unusable without a source title, a meralco.com.ph URL, and a retrieval date.
const meralcoUrlOk = u => { try { return /(^|\.)meralco\.com\.ph$/.test(new URL(u).hostname); } catch { return false; } };
export function rateProvenanceErrors(rates, m) {
  const x = rates[m] ?? {}, e = [];
  if (!x.source_title) e.push(`${m}: missing source_title`);
  if (!x.source_url) e.push(`${m}: missing source_url`);
  else if (!meralcoUrlOk(x.source_url)) e.push(`${m}: source_url is not a meralco.com.ph URL`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.retrieved ?? '')) e.push(`${m}: missing or malformed retrieved date`);
  return e;
}
```
Replace the `validateRates` body (lines 23–27) so it appends per-month provenance errors:
```js
export const validateRates = rates => months(rates).flatMap(m => ['non_lifeline', 'lifeline'].flatMap(t =>
  Object.entries(rates[m][t] ?? {}).flatMap(([kwh, r]) => {
    const s = Object.entries(r).reduce((a, [k, v]) => (k === 'total' ? a : a + v), fixedSum(rates, m) / kwh);
    return r.total && Math.abs(s - r.total) > 0.0005 ? [`${m} ${t} @ ${kwh} kWh: components ${s.toFixed(4)} != total ${r.total}`] : [];
  }))).concat(rateProvenanceErrors(rates, m)));
```
Because `www/app.js:23-24` already surfaces `validateRates` output via `msg(...)` and `tests/selfcheck.mjs:32` already asserts it is empty, this single change makes the **loader** validate missing provenance **and** surface it, with no extra wiring. The build (`build_rates.mjs:64-65`) also now gates on provenance.

### 4. `www/app.js` → `renderResults()` — state the basis of key figures (FR-S-4)
4a. Enhance `rm` (line 132) to surface the new provenance (title + retrieval date) in the Sources panel:
```js
  const rm = m => `Meralco rate table ${m} — "${rates[m].source_title}" (retrieved ${rates[m].retrieved}): ${rates[m].source_url}`;
```
4b. In the `#sources` array (lines 133–143), insert one honest reading-basis line right after the `Bill:` line:
```js
    `Bill: ${bill.source === 'synthetic' ? 'SYNTHETIC sample (invented household, priced at real Meralco rates)' : 'your PDF statement'}.`,
    `kWh basis: (current reading ${bill.current_reading} − previous reading ${bill.previous_reading}) × multiplier ${bill.multiplier}, read from the bill. We do not detect an "Estimated" reading marker — check it on your statement.`,
```
(Rate month, model tier, and weather source are already shown; this adds the one missing basis — the reading. We do **not** claim to distinguish actual vs. estimated, because the parser cannot — see `www/lib/flags.js:71`.)

### 5. `tests/selfcheck.mjs` — make the acceptance checkable
Add a new block immediately after the `test_rates` assertions (after line 35, before `function analyse`). It reuses the already-imported `validateRates`, `rates`, and `existsSync`:
```js
// test_rate_provenance (FR-S-3, FR-D-3): every rate month has a title, a meralco.com.ph URL and a retrieval date; validation gate holds
{
  const { rateProvenanceErrors } = await import('../www/lib/explain.js');
  for (const m of Object.keys(rates)) {
    assert.deepEqual(rateProvenanceErrors(rates, m), [], `${m} provenance: ${rateProvenanceErrors(rates, m).join('; ')}`);
    assert.match(rates[m].source_url, /meralco\.com\.ph/);
    assert.match(rates[m].retrieved, /^\d{4}-\d{2}-\d{2}$/);
  }
  const noDate = JSON.parse(JSON.stringify(rates)); delete noDate['2026-01'].retrieved;
  assert.ok(validateRates(noDate).some(e => /retrieved/.test(e)), 'missing retrieved must fail validation');
  const badSum = JSON.parse(JSON.stringify(rates)); badSum['2026-01'].non_lifeline[200].total = 99;
  assert.ok(validateRates(badSum).some(e => /components .* != total/.test(e)), 'sum check still rejects a non-adding row');
  assert.ok(existsSync('docs/data_steward.md'), 'docs/data_steward.md missing');
}
console.log('rate provenance OK');
```
(Do **not** modify the existing `assert.deepEqual(validateRates(rates), [])` at line 32 — with the backfilled data it still holds and now also covers provenance.)

### 6. `docs/data_steward.md` — the documented monthly procedure (new file, FR-D-2/FR-D-3)
Create `docs/data_steward.md` with this content (short; it is the FR-D-2 procedure and the FR-D-3 provenance record):

```markdown
# TANAW — Data-steward procedure (monthly refresh)

The bundled data (`www/data/rates.json`, `weather.json`, `reasons.json`) is refreshed by a **human data steward** and re-validated before redeploy. The app never calls the network at runtime; it ships whatever is committed here.

## When
Monthly, when Meralco publishes the new "Residential Bills at Typical Consumption Levels" rate month (and whenever the weather archive or an advisory changes).

## Steps
1. **Rates.** Download the new month's Meralco PDF and save it to `data/rates_pdfs/` (gitignored). Run `npm run rates`. This rebuilds `www/data/rates.json` and stamps every month with `source_title`, `source_url`, and `retrieved` (the build date). The build **throws** if any month's components do not sum to its `total`, or if any month is missing provenance — that is the gate. If Meralco changed the column layout, the script stops and prints the header to add to `LAYOUTS` in `scripts/build_rates.mjs`.
2. **Weather.** Run `npm run weather` (needs internet, once). Refreshes `www/data/weather.json` from the Open-Meteo archive (CC BY 4.0), Metro Manila.
3. **Advisories / reasons.** Run `npm run advisories` (needs internet). Refreshes `www/data/reasons.json` from `meralco.com.ph/media/advisories`. It writes **only** months where Meralco published a rate advisory, each with a verbatim `text` (quote), its `date`, a `meralco.com.ph` `url`, and `retrieved`. **Never hand-write a reason.** A month with no published advisory gets no entry — the app shows the "not published" state instead.
4. **Validate (the pre-deploy gate).** Run `npm test`. It re-validates every committed rate month (component sums **and** provenance: title + `meralco.com.ph` URL + retrieval date) and asserts every rate month has a usable Meralco advisory in `reasons.json` (the existing `usableReason` gate). It must pass with zero failures. Do not redeploy on a red suite.
5. **Redeploy.** Bump the `CACHE` string in `www/sw.js` (so existing clients pick up the new data), then commit the regenerated `www/data/*.json` and deploy the `www/` folder.

## Provenance rules (FR-S-3, FR-D-3)
- Every rate month in `rates.json` MUST carry `source_title`, `source_url` (a `meralco.com.ph` URL), and `retrieved` (`YYYY-MM-DD`). `validateRates` (and therefore the build and `npm test`) rejects a month missing any of these.
- Every reason in `reasons.json` MUST carry a verbatim `text`, a `date`, a `meralco.com.ph` `url`, and `retrieved`. The app never shows a reason without all of these (`usableReason`).

## Never fabricate
No invented reasons and no invented rate months. If a month has no Meralco advisory, leave it out of `reasons.json`. `retrieved` for a month is the date the steward downloaded/verified that source; do not guess an earlier date.

## New month, quick path
Drop the PDF in `data/rates_pdfs/`, run `npm run rates`, then `npm run advisories` if an advisory exists, then `npm test`, then bump `www/sw.js` `CACHE` and commit.
```

### 7. `README.md` — point at the procedure
In the "Commands" section, after the "New rate month" line (line 40–41), add one line:
```
Monthly data refresh, the validation gate, and redeploy: see [docs/data_steward.md](docs/data_steward.md).
```

## Acceptance Criteria
- Every one of the 10 months in `www/data/rates.json` carries a non-empty `source_title`, a `meralco.com.ph` `source_url`, and a `retrieved` in `YYYY-MM-DD` form.
- `validateRates` (the loader check) now rejects a month missing `source_title`/`source_url`/`retrieved` (or with a non-`meralco.com.ph` URL); this is surfaced in the UI via the existing `rates.json failed validation:` message and enforced by the build and by `npm test`.
- The existing component-sum validation is unchanged: a row whose components do not equal `total` (within `0.0005`) is still rejected.
- The results view "Sources and assumptions" panel shows each rate table's **source title and retrieval date**, and a line stating the **kWh reading basis** (current − previous × multiplier, with an honest note that an estimated-reading marker is not auto-detected). Rate month and model tier continue to be shown.
- `docs/data_steward.md` exists and documents the monthly `rates`/`weather`/`advisories` refresh, the `npm test` validation gate, the provenance rules, and the redeploy (SW cache bump) step.
- `npm test` passes end to end (including the new `rate provenance OK` block and the pre-existing `test_rates`, `reasons`, and `pwa` suites).

## Verification
1. **`npm test`** (run `node tests/selfcheck.mjs`). Must exit 0 and print `rate provenance OK`, `selfcheck OK`, `reasons OK`, `pwa OK`. This single command exercises: the backfilled provenance (via `test_rates`' `validateRates(rates) === []` and the new `test_rate_provenance`), the provenance-missing rejection, the preserved sum-check rejection, the existence of `docs/data_steward.md`, and that `www/sw.js` precache files still exist.
2. **Provenance spot-check** (fast, independent of the app):
   ```
   node -e "const r=require('./www/data/rates.json');for(const[m,x]of Object.entries(r))console.log(m, x.source_title?'title-ok':'MISSING-TITLE', x.retrieved||'MISSING-DATE')"
   ```
   Expect 10 lines, each `title-ok <YYYY-MM-DD>`.
3. **UI check.** `npm start`, open http://localhost:8000, click **Try the SYNTHETIC sample**, then **Looks right, explain my bill**. In "Sources and assumptions": the two "Meralco rate table …" bullets now read `… — "Residential Bills at Typical Consumption Levels — <Month> 2026" (retrieved 2026-11-12): <url>`, and a `kWh basis: (current reading … − previous reading …) × multiplier …` line is present.
4. **Build path (only if `data/rates_pdfs/` is populated).** `npm run rates` should succeed and re-stamp `retrieved` to the build date for all months. In this repo the PDFs are gitignored/absent, so verify the builder change by code review (change 1) plus the committed-data + `npm test` path above; do not treat an inability to run the build as a failure here.

## Edge Cases & Non-Goals
- **`npm run rates` cannot be re-run in this checkout** (`data/rates_pdfs/` is gitignored and empty), so the 10 months are backfilled in place (change 2) rather than regenerated; the builder change (change 1) covers future months.
- **`retrieved` semantics:** for the 10 backfilled months, `2026-11-12` is the date the data was recorded/verified by the steward, not a recovered original fetch timestamp (the original timestamps were never committed). This is stated in `docs/data_steward.md` and is consistent with "never fabricate" — we record when we actually verified the data.
- **Estimating vs. actual readings:** the parser does not detect an "Estimated" marker (`www/lib/flags.js:71`), so FR-S-4's reading basis is stated honestly as the derivation + a manual-check note, **not** a fabricated actual/estimated classification.
- **Reasons provenance is not reworked here** — it is already enforced by `usableReason` + `test_reasons` (Task 1/3/5 territory); Task 4 only documents that gate.
- **Not done (follow-ups, out of scope for this task):** the fuller `www/lib/data.js` loader from `tech_spec.md` §3.2; a per-line provenance tooltip on every breakdown row; migrating `rates.json` to the bracket-based "v2" schema (PLAN OQ4 default: keep the working model, only add provenance); any solar/dispute/UI scope changes.
- **Do not** alter `www/data/reasons.json` or the `usableReason` gate in this task.
