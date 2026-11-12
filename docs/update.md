# TANAW — Update

Generated: 2026-11-12 15:24 | Branch: main | HEAD: 9e3afba

Overall: the core Challenge-2 flow works end to end for PDF statements — real Meralco rate tables (10 months, built from Meralco's own PDFs), real Open-Meteo weather, a tested 3PC degree-day model, exact peso decomposition, projection with backtest, and a working PWA with offline precache. Three things hold it back: `reasons.json` is empty so the Meralco-attribution feature has data to gate but nothing to show (and `npm test` fails on it), the entire photo/OCR path is absent, and several out-of-scope decisions in `requirements.md` §3.2 are not actually enforced in the code (solar still ships, analysis is not blocked on failed checks, dispute records persist bill data to localStorage). The app has also grown well past the v1 requirements doc (dispute flags, chat, ERC dashboard, dev-only case inbox) without the docs being updated.

## Done
- PDF upload incl. password-protected statements, password cleared after use (FR-I-2, FR-I-3): `www/index.html:20-27`, `www/lib/extract.js:2-3`, `www/app.js:40-44`
- One bill per analysis; two labeled SYNTHETIC sample bills (FR-I-4, FR-I-5): `www/app.js:44-48`, `www/data/fixtures/`
- Full field extraction from PDF text into the shared line model (FR-X-4 PDF path): `www/lib/extract.js:5-17`, `www/lib/parse.js:39-77`
- Four numeric self-checks and highlighting of the disagreeing fields (FR-V-1, FR-V-5): `www/lib/checks.js:3-12`, `www/app.js:65-70`
- Editable confirmation screen for every scalar, charge, tracker value (FR-V-2): `www/app.js:55-79`
- Rate-month detection from generation ₱/kWh + mismatch statement (FR-E-1, FR-E-11): `www/lib/explain.js:29-37`, `www/app.js:136`
- Real bundled Meralco rate schedule, 10 months (2026-01..2026-10) built from Meralco's "Residential Bills at Typical Consumption Levels" PDFs, per-month `source_url`, per-component ₱/kWh incl. lifeline rows (FR-E-2): `www/data/rates.json`, `scripts/build_rates.mjs:1-13`
- Weather / billing-days / own-usage split when the fit is reliable (FR-E-3): `www/lib/explain.js:60-71`
- Tier-C refusal to separate weather, surfaced in the UI (FR-E-4, NFR-9): `www/lib/model.js:54-57`, `www/lib/explain.js:60-62`, `www/index.html:44`
- Breakdown sums to the peso change; fixed charges, refund lines, residual, >3% warning (FR-E-5, FR-E-6): `www/lib/explain.js:73-76,89`, `www/app.js:105`
- Projection with range, 3-month backtest, tier-C fallback, "not a weather forecast" label (FR-P-1..FR-P-4): `www/lib/model.js:68-92`, `www/app.js:127-129`
- Sources and assumptions panel incl. rate-table URLs and model-method disclosure (FR-S-1): `www/app.js:133-143`
- Synthetic banner whenever rates/weather/bill are synthetic (FR-S-2): `www/app.js:26-27`, `www/index.html:14`
- Rate-table validation rejecting rows whose components do not sum to total (FR-D-4): `www/lib/explain.js:23-27`, `www/app.js:23-24`
- Local analysis, escaped rendering of untrusted PDF/OCR text, no account/login (FR-PR-3, FR-PR-4): `www/app.js:16`, `www/app.js:55-61`
- PWA installable and offline after first load; network-first SW precaching app shell, libs, vendor, data, fixtures (FR-Dep-2): `www/sw.js:3-17`, `www/manifest.webmanifest`, `www/index.html:8`, registration at `www/app.js:14`

## Partially implemented
- Meralco reason display (FR-E-7, FR-E-8): the hard gate exists and is unit-tested (`www/lib/explain.js:39-41`, `tests/selfcheck.mjs:161-171`) and the UI renders quote + date + URL (`www/app.js:107-110`), but committed `www/data/reasons.json` is `{}` — advisories were never fetched/committed, so nothing can ever render. Fetch script exists (`scripts/fetch_advisories.mjs:1-9`) but was not run against the committed data.
- Lifeline/senior passthrough (FR-E-10): `lifeline`/`senior_subsidy` parsed as charge lines (`www/lib/parse.js:9-10`); no "not re-derived" warning anywhere in the UI.
- Rate-table provenance (FR-S-3): every month has `source_url` but no retrieval date or source title (`www/data/rates.json`, keys `source_url, lft_assumed, fixed, non_lifeline, lifeline`).
- Basis-of-figure panel (FR-S-4): rate months, tracker-day assumption and model method are shown (`www/app.js:134-141`); actual-vs-estimated reading basis is not.
- Bundled data/models (FR-D-1): rates + weather + fixtures bundled; no `www/models/*` (OCR absent).
- Data-steward step (FR-D-2): scripts now exist (`npm run rates|weather|advisories`, `scripts/build_rates.mjs`, `scripts/fetch_advisories.mjs`, `scripts/fetch_weather.mjs`) but there is no documented monthly procedure or validation gate for reasons.
- Provenance recording (FR-D-3): rate months carry a URL; retrieval dates and verbatim-reason records exist only in the (unrun, uncommitted) advisory fetcher.
- Mobile responsiveness (FR-Dep-1): viewport meta (`www/index.html:5`) and basic responsive styles; no real-device audit.
- No application backend (FR-Dep-3): true of a static deploy, but the dev server adds a demo `POST /api/cases` inbox (`scripts/serve.mjs:2,31`) and the client calls it (`www/app.js:176`), degrading to a file-share fallback on static hosting (`www/app.js:180`).
- Nothing persisted (FR-PR-2): the password is cleared (`www/app.js:35`) and no image/PDF is stored, but dispute records containing the bill's data (account number, readings, charges, answers) are saved to `localStorage` (`www/app.js:211,229-230`). The doc's "Implemented" is no longer true since the disputes feature.
- Privacy "never leaves the device" (FR-PR-1): all parsing/analysis is local, but the user-initiated dispute path exports bill data to the dev-only case inbox and via share sheets (`www/app.js:176,273-301`). Consent-gated, still a deviation from the letter of the requirement.

## Not yet implemented
- Photo upload of a bill (FR-I-1): file input is `accept="application/pdf"` only (`www/index.html:21`).
- Entire photo/OCR pipeline (FR-X-1, FR-X-2, FR-X-3, FR-X-5, FR-X-6): no `www/lib/ocr.js`, no `www/lib/ocr-worker.js`, no `www/models/*`; scanned PDFs fail with "photo/OCR path is not built yet" (`www/lib/extract.js:18`).
- Blocking analysis while a self-check fails (FR-V-3): `#go` is never disabled — the user can run "explain" with red checks (`www/app.js:82-92`; no `disabled` state on `#go`). The doc's "Implemented" is wrong; only field highlighting exists.
- Low-confidence OCR flags in the confirmation screen (FR-V-4): depends on the missing OCR path.
- Evergreen categories + explicit "Meralco has not published a reason" state (FR-E-9): no `evergreen` in `reasons.json`; the `#reason` block is simply hidden when no reason validates (`www/app.js:108`).

## Out of scope
Per `requirements.md` §3.2 and §9 — listed with their actual code state, not re-litigated:
- Solar / net-metering (removed in v1): **still ships**, contrary to the decision — imported and rendered in results (`www/app.js:7,304-309`), a UI section in `www/index.html:61-70`, precached by the SW (`www/sw.js:5`), imported by tests (`tests/selfcheck.mjs:11`). The scope guard from tech_spec §13.2 is not built.
- Rewards/points/badges: absent.
- Server-side OCR/backend: absent from production; dev-only `/api/cases` demo inbox exists (`scripts/serve.mjs:2,31`) and is marked `shortcut:` there.
- Accounts/login/cloud storage: absent.
- Multiple-bill import, AMI/smart-meter data, runtime Meralco scraping: absent (rate/weather data is bundled; fetchers run manually offline).
- Non-residential classes, lifeline/senior re-derivation: not built (lifeline rows parsed but unused, `www/lib/explain.js:16`).
- Submitting anything to Meralco on the user's behalf: not built; the dispute feature generates a message the user sends through Meralco's own channels.
- iOS/Capacitor packaging (deferred): Capacitor deps, `npm run ios/android` (`package.json`) and a native share path (`www/app.js:277-289`) exist but are excluded from v1 delivery claims.

Beyond the v1 requirements doc (not traceable to any FR-ID; docs not yet updated to cover them):
- Billing-error flags and evidence strength (`www/lib/flags.js`), Taglish household chat (`www/lib/chat.js`), dispute tracking/ERC escalation (`www/lib/disputes.js`, `www/app.js:227-302`), Meralco-staff triage dashboard (`www/dashboard.html`, `www/dashboard.js`). These extend Challenge 2 toward dispute-filing; `requirements.md`/`tech_spec.md` should either scope them in or mark them out.

## Changes since last update
- First update (no prior `update.md` existed).

## Verification
- Tests: `npm test` **FAILED**. Suites passing: parsing, checks, explain sums, model tiers, flags, disputes, dashboard samples, bracket lookup, chat. Failing: `AssertionError: reasons.json has no usable advisory for 2026-01; run npm run advisories` at `tests/selfcheck.mjs:169` — the committed `reasons.json` is empty, and the PWA precache test (line 173+) never runs as a result.
- Doc corrections (code disagrees with the doc; code wins):
  - FR-V-3 "Implemented" → **Not built**: no gate blocks analysis on failed checks (`www/app.js:82`).
  - FR-PR-2 "Implemented" → **Partial**: dispute records persist bill data to localStorage (`www/app.js:211,229-230`).
  - FR-E-2 / tech_spec §2 "synthetic rates": rates are now real, built from Meralco PDFs (`scripts/build_rates.mjs`, `www/data/rates.json`) — promoted.
  - tech_spec §2 / §7.1 weather "synthetic": weather is real Open-Meteo daily data (`www/data/weather.json`, `source: "Open-Meteo archive (CC BY 4.0)"`, 3969 days) — promoted.
  - FR-Dep-2 / tech_spec §2 PWA "Not built" → **Implemented** (`www/sw.js`, `www/manifest.webmanifest`).
  - FR-D-2 steward "Not built" → **Partial** (fetch/build scripts exist, no documented procedure).
  - tech_spec §3.2 "Solar removed from v1" → still in the UI, SW cache and tests (see Out of scope).
  - tech_spec §13.1 "payback is solar; remove with v1 scope" — not removed; the test still asserts solar payback (`tests/selfcheck.mjs:46-47`).
