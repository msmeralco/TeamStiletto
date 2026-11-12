# Spec: Populate `reasons.json` with real Meralco advisories (Task 1 from PLAN.md)

## Goal
Replace the empty committed `www/data/reasons.json` (`{}`) with real, verbatim Meralco rate advisories so the Meralco-attribution feature has data to show and `npm test` goes green (the `reasons` assertion and the `pwa` suite it currently blocks).

## Inputs & Context
- Derives from **Task 1** in `PLAN.md` (and its Open Question **OQ1**: "Does Meralco publish an advisory for every rate month?").
- **Failing test** — `tests/selfcheck.mjs`, block `// test_reasons` (lines 161–171). The assertion at **line 169** is the one that throws:
  ```js
  const reasons = json('www/data/reasons.json');
  for (const m of Object.keys(rates)) assert.ok(usableReason(reasons[m]), `reasons.json has no usable advisory for ${m}; run npm run advisories`);
  ```
  `reasons.json` is `{}`, so this fails on `2026-01` and the script exits **before** the `// test_pwa` block (line 173+) ever runs. (Confirmed by `docs/update.md` line 63.)
- **Attribution gate** — `www/lib/explain.js`, `usableReason` (lines 39–41). An entry is usable only if it has non-empty `text` and `date`, and a `url` whose host is `meralco.com.ph` or a subdomain:
  ```js
  export function usableReason(x) {
    try { return x?.text && x.date && /(^|\.)meralco\.com\.ph$/.test(new URL(x.url).hostname) ? x : null; } catch { return null; }
  }
  ```
  It is consumed at `www/lib/explain.js:84` (`const reason = usableReason(reasons[m1]);`).
- **Data files** —
  - `www/data/rates.json`: 10 rate months, keys `2026-01` … `2026-10`. These are the months the test requires coverage for.
  - `www/data/reasons.json`: currently `{}` (one empty line). **This is the only file whose content changes.**
- **Fetch script (already exists, do not rewrite)** — `scripts/fetch_advisories.mjs`, run via `npm run advisories` (`package.json` line 10). It scrapes `https://www.meralco.com.ph/media/advisories` (up to 5 listing pages), keeps cards titled "…Rates this/for <Month> [year]", fetches each article body, and writes a sorted object keyed by `YYYY-MM` where each entry is `{ date, title, text, url, retrieved, sections }`. `text` is the lead paragraph + the first later paragraph mentioning the generation charge (verbatim); `retrieved` is today's date.
- **Target schema** — `docs/tech_spec.md` §4.5 (lines 219–244). The gate rules there match `usableReason` exactly.

### Verified against the live site (2026-11-12)
- Page 1 of `…/media/advisories` lists a rate advisory for **every** of the 10 rate months: `2026-01` (2026-01-12), `2026-02` (2026-02-10), `2026-03` (2026-03-10), `2026-04` (2026-04-10), `2026-05` (2026-05-13), `2026-06` (2026-06-11), `2026-07` (2026-07-10), `2026-08` (2026-08-10), `2026-09` (2026-09-11), `2026-10` (2026-10-13) — plus two older ones, `2025-10` and `2025-11`, which are harmless extras. **OQ1 resolves in favor of full coverage: no test reconciliation is needed.**
- The card structure still matches the script's regex (`article-card__link` → `datetime="…"` → `article-card__title`), and the article body marker `class="article-content__body` is still present on the live advisory pages, so the script should run unchanged.
- All advisory URLs are `https://www.meralco.com.ph/media/articles/…` (host `www.meralco.com.ph`, a subdomain) → passes the gate.

## Changes
Numbered, in order. This task is **run-the-script + commit**, not a code change.

1. **Run the fetch while online:** `npm run advisories`.
   - This executes `scripts/fetch_advisories.mjs` and **overwrites** `www/data/reasons.json` with the freshly scraped, sorted advisories.
   - Do not edit the script unless it throws on the live layout (see Edge Cases). Do not hand-write or paraphrase any entry.
2. **Commit the generated file** `www/data/reasons.json` exactly as the script wrote it (sorted keys, unmodified by hand). No other file is changed by this task.
3. **Do not modify** `tests/selfcheck.mjs`, `www/lib/explain.js`, or `www/data/rates.json`. (Because all 10 rate months have real advisories, the existing assertion at line 169 passes as-is.)

## Acceptance Criteria
- `npm test` exits 0 and its output includes both `reasons OK` (line 171) and `pwa OK` (line 180). The `test_reasons` assertion at `tests/selfcheck.mjs:169` no longer throws.
- `www/data/reasons.json` is no longer `{}`; it contains a key for each of the 10 rate months `2026-01` … `2026-10`.
- For each of those 10 months, the entry has a **non-empty `text`**, a **`date`** (`YYYY-MM-DD`), a **`url`** whose host is `meralco.com.ph` or a subdomain, and a **`retrieved`** date (`YYYY-MM-DD`). (This is precisely what `usableReason` + the PLAN acceptance list require.)
- **No invented reasons:** every `text` is a verbatim excerpt produced by `scripts/fetch_advisories.mjs` from a live `meralco.com.ph` advisory, and every `url` is that advisory's real article URL. No entry is hand-authored.
- The `test_pwa` suite now actually runs (it is no longer short-circuited) and passes.

## Verification
Run from the repo root (`C:\Users\keneth bural\Downloads\TeamStiletto`), in this order:

1. **Populate (requires internet):**
   ```
   npm run advisories
   ```
   Expected: exit 0 and one printed line per matched advisory, e.g.
   `2026-10: Higher Residential Rates this October 2026 (2026-10-13), N sections`, covering `2026-01` … `2026-10` (and `2025-10`/`2025-11`).
2. **Spot-check the data** — confirm all 10 rate months resolve as usable:
   ```
   node --input-type=module -e "import{usableReason}from'./www/lib/explain.js';import{readFileSync}from'node:fs';const r=JSON.parse(readFileSync('www/data/rates.json','utf8'));const d=JSON.parse(readFileSync('www/data/reasons.json','utf8'));for(const m of Object.keys(r)){const x=usableReason(d[m]);console.log(m,x?'OK  '+x.date+'  '+x.url:'MISSING');}"
   ```
   Expected: ten lines, all `OK`, none `MISSING`. (Visually confirm at least one `text` is real prose from the advisory, not a placeholder.)
3. **Run the suite:**
   ```
   npm test
   ```
   Expected: exit 0, ending with `chat OK` → `reasons OK` → `pwa OK`. No `AssertionError` about `reasons.json`.

## Edge Cases & Non-Goals
- **Fetch throws on live layout (card regex / `article-content__body` marker no longer match):** STOP and report — do NOT hand-write, paraphrase, or fabricate any reason (violates PLAN.md "Never fabricate reasons"). Fixing a stale site-scrape regex is a separate change; note it, don't silently work around it.
- **No internet at build time:** the fetch cannot run. Per PLAN.md, build-time internet is assumed available; if it is not, the task cannot complete — report the environment limitation rather than fabricating data.
- **A rate month has no live advisory at run time** (contradicting today's check): reconcile `tests/selfcheck.mjs:169` to accept the FR-E-9 no-reason state for that month (per OQ1's stated default) instead of forcing a fabricated entry. Today's live check says this branch is **not** triggered.
- **Extra 2025 keys** (`2025-10`, `2025-11`) in the file are harmless — the test only iterates `Object.keys(rates)`.
- **Out of scope for this task (later tasks):** the `evergreen` array + "Meralco has not published a reason" UI (Task 3); rate-table provenance / source-title / retrieval-date *enforcement* and the documented steward procedure (Task 4); the schema mismatch between fetched entries (`title`/`sections`) and tech_spec §4.5's target (`categories`) — a Task 4/docs concern. Task 1's bar is only: real data committed and the suite green.
