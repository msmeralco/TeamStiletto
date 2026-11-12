# TANAW — Technical Specification

## 0. Scope and sources

| Item | Value |
|---|---|
| Product | TANAW — "why did my Meralco bill change?" |
| Document | Technical specification for v1 |
| Challenge | `hackathon_challenges.md` → Challenge 2 only |
| Requirements | `requirements.md` |
| Repo | Static web app under `www/`, tests under `tests/`, dev server under `scripts/` |

This spec describes the **target v1** and marks what exists today. It follows the current code where the code is sound and corrects it where the v1 decisions differ.

Status legend: **Implemented**, **Partial**, **Not built**, **Out of scope**.

---

## 1. Architecture overview

v1 is a **static, client-side PWA**. There is no application backend, no account system, and no runtime network call. All customer data stays in the browser tab.

```
                    ┌──────────────────────────────────────────┐
                    │                Browser tab               │
                    │                                          │
  photo ──camera──► │  ocr.js (Web Worker)                     │
                    │    PaddleOCR PP-OCR det + cls + rec      │
                    │    onnxruntime-web (WASM)                │
                    │        │                                 │
  PDF ──file──────► │  extract.js ──► lines [{y,page,items}]   │
                    │        │                                 │
                    │        ▼                                 │
                    │  parse.js  (label-anchored regex)        │
                    │        │                                 │
                    │        ▼                                 │
                    │  checks.js (4 numeric self-checks)       │
                    │        │                                 │
                    │        ▼                                 │
                    │  app.js confirmation screen (editable)   │
                    │        │                                 │
                    │        ▼                                 │
                    │  model.js → explain.js → model.js        │
                    │  fit(3PC)   breakdown     projection     │
                    │        │                                 │
                    │        ▼                                 │
                    │  results UI + sources + attribution      │
                    └──────────────────────────────────────────┘

  Bundled at build: www/data/{rates,weather,reasons}.json, www/models/*, www/vendor/*
  Cached by:        sw.js (app shell + models + data), offline after first load
  Hosting:          static file host or CDN; no API routes
```

### 1.1 Design principles

- **Local-only:** customer data never leaves the device.
- **Verifiable:** every number maps to a bill line, a Meralco rate table, or a labeled model output.
- **Honest degradation:** refuse rather than guess when the model or data is insufficient.
- **Meralco-sourced reasons:** the app may quote Meralco but may not author a cause.

---

## 2. Current implementation vs target

| Capability | Current | Target v1 |
|---|---|---|
| PDF text extraction | Implemented (`www/lib/extract.js`) | Retained as fallback |
| Photo OCR | Not built; `extract.js` throws on scanned PDFs | In-browser PaddleOCR |
| Bill parsing | Implemented (`www/lib/parse.js`) with `shortcut:` guesses | Reconciled against real bills |
| Self-checks | Implemented (`www/lib/checks.js`) | Retained |
| Confirmation UI | Implemented (`www/app.js`) | Add OCR confidence flags |
| Rate lookup | Implemented (`www/lib/explain.js`), synthetic `rates.json` | Real Meralco schedule + schema v2 |
| Weather model | Implemented (`www/lib/model.js`), synthetic `weather.json` | Real Open-Meteo archive |
| Reasons | `reasons.json` empty; code renders `text` only | Quote + date + URL + evergreen fallback |
| Projection | Implemented (`www/lib/model.js`) | Retained |
| Solar | Implemented (`www/lib/solar.js`, UI) | **Removed from v1** |
| PWA/offline | Not built | Service worker + manifest |
| iOS/Capacitor | Present (config + workflow) | Deferred (not v1) |
| Data steward | Not built | Documented monthly procedure |

---

## 3. Module map

### 3.1 Existing modules (v1-relevant)

| File | Responsibility | Notes |
|---|---|---|
| `www/index.html` | Three screens: upload, confirm, results | Static markup, module script |
| `www/app.js` | Flow control, loading data, rendering, UI events | Keep; add OCR branch and remove solar UI |
| `www/style.css` | Styling | Make mobile-first; audit responsive behavior |
| `www/lib/extract.js` | PDF bytes → line model | Contract for OCR output |
| `www/lib/parse.js` | Line model → bill object | Label-anchored; `shortcut:` markers |
| `www/lib/checks.js` | Bill object → pass/fail checks | Four equations |
| `www/lib/model.js` | Weather, 3PC fit, projection | See §7 |
| `www/lib/explain.js` | Rate lookup, rate-month detection, peso breakdown | See §8 |
| `www/lib/solar.js` | Solar payback | **Out of scope for v1** |
| `scripts/make_synthetic.mjs` | Generates synthetic data and fixture PDFs | Dev-only |
| `scripts/serve.mjs` | Local static server on port 8000 | Dev-only |
| `tests/selfcheck.mjs` | End-to-end checks on synthetic fixtures | Extend |

### 3.2 Modules to add

| File | Responsibility |
|---|---|
| `www/lib/ocr.js` | Image → line model via PP-OCR; confidence per line/field |
| `www/lib/ocr-worker.js` | Runs ONNX inference off the main thread |
| `www/lib/reasons.js` | Validate/merge Meralco reason entries; attribution gate |
| `www/lib/data.js` | Load and validate bundled JSON; provenance checks |
| `www/sw.js` | Service worker: precache app shell, models, data |
| `www/manifest.webmanifest` | PWA manifest |
| `www/models/*` | PP-OCR detection, classification, recognition ONNX models |

---

## 4. Data schemas

All bundled data lives under `www/data/`. Every file must validate at load; invalid data disables the affected feature with a visible message.

### 4.1 Line model (parser input)

Shared by PDF and OCR paths:

```json
[
  { "y": 812.5, "page": 1, "items": [{ "str": "Generation Charge", "x": 40 }, { "str": "2,431.22", "x": 460 }] }
]
```

Rules:
- `y` decreases down the page; items sorted by `x` left to right.
- OCR must emit the same shape so `parse.js` is engine-agnostic.
- Text is untrusted and escaped at render time.

### 4.2 Bill object (`parseBill` output)

```json
{
  "period_start": "2026-09-15",
  "period_end": "2026-10-14",
  "days": 30,
  "kwh": 312,
  "previous_reading": 10000,
  "current_reading": 10312,
  "multiplier": 1,
  "tracker": [{ "month": "2026-09", "kwh": 288 }],
  "charges": [
    { "key": "generation", "label": "Generation Charge", "amount_php": 2431.22 }
  ],
  "charges_this_period": 4312.55,
  "remaining_balance": 0,
  "installment_due": 0,
  "total_amount_due": 4312.55,
  "city": "Manila",
  "source": "synthetic"
}
```

`source` is `synthetic` or `pdf_text`; add `photo_ocr` for the new path.

### 4.3 `rates.json` — target schema v2

The current `non_lifeline` shape does not match Meralco's bracket table. v2:

```json
{
  "2026-10": {
    "synthetic": false,
    "effective": "2026-10-01",
    "customer_class": "Residential",
    "vat_inclusive": false,
    "source": {
      "title": "Summary Schedule of Rates — Effective October 2026 Billing",
      "url": "https://www.meralco.com.ph/...",
      "retrieved": "2026-11-12"
    },
    "lifeline_discount_pct": { "0-50": 100, "51-70": 35, "71-100": 20 },
    "fixed": { "supply_per_cust_mo": 16.38, "metering_per_cust_mo": 5.00 },
    "brackets": [
      {
        "min_kwh": 0, "max_kwh": 50,
        "rates": {
          "generation": 10.2005, "transmission": 0.5422, "system_loss": 0.9301,
          "distribution": 0.9803, "supply": 0.4979, "metering": 0.3350,
          "subsidies": 0.0100, "universal": 0.0001, "fit_all": 0.3296,
          "gea_all": 0.0428, "vat": 1.4366, "franchise_tax": 0.0687,
          "total": 15.0615
        }
      }
    ]
  }
}
```

Migration rules:
- Replace `non_lifeline` with `brackets`; keep a loader adapter until `explain.js` is updated.
- Brackets follow the actual schedule: 0–50, 51–70, 71–100, 101–200, 201–300, 301–400, >400 kWh.
- Keep `validateRates` semantics: component sum must equal `total` within `0.0005`.
- Do not mix VAT-exclusive rows with VAT-inclusive totals without an explicit flag.

### 4.4 `weather.json`

```json
{
  "synthetic": false,
  "city": "Manila",
  "lat": 14.5995,
  "lon": 120.9842,
  "start": "2016-01-01",
  "source": "Open-Meteo historical weather API (CC BY 4.0)",
  "t": [27.1, 27.4, 26.9]
}
```

- `t[i]` is the daily mean temperature in °C for `start + i days`.
- Coverage must include every date the model reads; `temps()` throws otherwise.

### 4.5 `reasons.json` — target schema

```json
{
  "2026-10": {
    "date": "2026-10-13",
    "text": "Meralco said the generation charge rose because of higher fuel costs and peso depreciation.",
    "url": "https://www.meralco.com.ph/...",
    "retrieved": "2026-11-12",
    "categories": ["generation"]
  },
  "evergreen": [
    {
      "key": "usage",
      "text": "Your electricity use changed.",
      "url": "https://www.meralco.com.ph/residential/understand-your-bill"
    }
  ]
}
```

Validation rules (attribution gate):
- A month entry is usable only if `text`, `date`, and `url` are non-empty and `url` host is `meralco.com.ph` or a subdomain.
- `text` must be a verbatim quote or a faithful excerpt; no app-generated paraphrase.
- If no valid month entry exists, the UI must show the no-published-reason state plus evergreen categories.
- The reason is shown only when the detected rate month equals the entry month.

---

## 5. Photo OCR pipeline (PaddleOCR in-browser)

### 5.1 Model choice

Use PP-OCR components:
- **Text detection** (DBNet-family) → line boxes.
- **Angle classification** → rotate 180° where needed.
- **Text recognition** (CRNN-family) → strings + confidence.
- **English** recognition dictionary, since Meralco bills are English.

Do **not** use PP-Structure in v1. Field reconstruction is the parser's job plus the confirmation screen.

Export models to ONNX and run with `onnxruntime-web` (WASM backend; WebGPU optional if available). Pin exact model files and versions.

### 5.2 Processing steps

1. **Capture/normalize:** accept `image/*`; downscale the long edge to a bounded size; apply EXIF orientation.
2. **Preprocess:** grayscale/contrast as needed; optionally deskew. Do not aggressively binarize before detection.
3. **Detect:** produce line polygons; sort top-to-bottom.
4. **Classify/rotate:** apply angle classifier; re-run detection on rotated crops if needed.
5. **Recognize:** produce `str` and confidence per line.
6. **Map to line model:** group words into lines by `y` within tolerance; sort by `x`; emit `{ y, page: 1, items: [{ str, x }] }`.
7. **Parse:** run the existing `parseBill` over the line model.
8. **Flag:** attach low-confidence markers to fields whose source lines fall below threshold.

Suggested default confidence threshold: `0.60` for a line, configurable. Thresholds are tunable against the Gate 0 corpus; document changes.

### 5.3 Runtime constraints

- Run inference in a **Web Worker**; post progress messages to the UI.
- Cache model files with the service worker so repeat runs are offline.
- Show explicit first-load download and processing states; never appear frozen.
- On failure or low confidence, fall back to the confirmation screen with manual entry — never silently proceed.

### 5.4 Fallback order

1. Photo → OCR → parser → checks → confirmation.
2. PDF → embedded text → parser → checks → confirmation.
3. Any failure → manual entry on the confirmation screen (fields still editable), or a clear error.

If a PDF has no selectable text, route it through the same OCR path (render pages to images first) rather than failing.

---

## 6. Parsing

`www/lib/parse.js` is label-anchored: a label is matched, then the first number after it on the same line is taken.

- **Charge lines:** `CHARGES` maps a key to a regex. Multiple labels can share a printed line; each takes the first number before the next label.
- **Billing dates:** currently assumes `MM/DD/YYYY`; replace against the Gate 0 corpus.
- **Readings/kWh:** `kwh used` preferred, else `(current − previous) × multiplier`.
- **Tracker:** find a line with at least three month labels; take the numeric row above or below; align numbers to labels by `x` proximity; sort by month.
- **City:** last comma-separated token of the service address.

All `shortcut:` comments mark assumptions that must be validated against real bills. Do not remove a `shortcut:` marker without a fixture that proves the real format.

---

## 7. Usage model: variable-base degree-day change-point regression

Implemented in `www/lib/model.js`. This is the **usage side** of the explanation; it does not interpret Meralco's rate reasons.

### 7.1 Inputs

- `tracker` months with kWh.
- Daily temperatures `T`.
- Bill `period_end` to infer tracker period end day-of-month.

`trackerPeriods` assumes each tracker month ends on the same day-of-month as the current bill. This assumption is shown to the user.

### 7.2 Fit

- Target: `y = kWh / days`; weight `w = days`.
- Predictor at balance point `bp`: `x = CDD(bp) / days`.
- Grid search `bp` from 18.0 to 40.5 °C in 0.5 °C steps.
- Weighted least squares for `b0` (baseload kWh/day) and `b1` (kWh per degree-day).
- Reject a candidate if fewer than half the periods have `x > 0`, if `sxx = 0`, or if `b0 < 0` or `b1 < 0`.
- Choose the candidate with the highest adjusted R².

### 7.3 Tiers and refusal

| Tier | Condition | Meaning |
|---|---|---|
| `A_3pc` | at least 12 periods and adjusted R² ≥ 0.7 | Full weather/usage split |
| `B_fixed24` | fixed 24 °C base, adjusted R² ≥ 0.7 | Simplified split, labeled |
| `C_refused` | otherwise | Refuse to separate weather |

Tier C must be surfaced in the UI; the explanation collapses the usage side into a single "not separable" line.

### 7.4 Projection

- Weather model: build next period dates from the last period; compute CDD using the same dates from each of the last 10 years (climatology), average them; predict kWh; convert to pesos at the detected rate month plus fixed charges.
- Range: `mid ± 1.5 × residual_sd × days × rate`.
- Backtest: refit without the last 3 periods and report mean absolute percentage error.
- Tier C fallback: scale last year's same month by the ratio of the last 3 months to the same months a year earlier; require at least 15 printed months, else state that a projection is not possible.
- Label always states this is typical weather at current rates, not a forecast.

---

## 8. Explanation: rate lookup and peso decomposition

Implemented in `www/lib/explain.js`, with the v2 rate schema as the target.

### 8.1 Rate month detection

- Compute the bill's generation ₱/kWh: `generation.amount_php / bill.kwh`.
- For each bundled rate month, look up the generation rate at the bill's kWh and take the absolute gap.
- Choose the month with the smallest gap.
- Warn if that month does not equal `period_end.slice(0, 7)`.

### 8.2 Lookup

- Find the bracket containing the kWh (v2) or interpolate between bracket points (current code).
- Return per-component rates plus fixed charges.
- Never extrapolate beyond the schedule silently; clamp and warn.

### 8.3 Change decomposition

Let:
- `q0, d0` = previous tracker month kWh and days; `q1, d1` = current bill kWh and days.
- `r0, r1` = component rates for previous and current rate months at the respective kWh.
- `F0, F1` = fixed charges for previous and current months.
- `R0` = previous month total rate.

Then:

```
estPrev        = Σ_k r0[k] · q0 + F0
change         = charges_this_period − estPrev
usage          = (q1 − q0) · R0

if tier != C:
  ΔCDD         = CDD(current period) − CDD(previous period)
  weather      = b1 · ΔCDD · R0
  billingDays  = b0 · (d1 − d0) · R0
  ownUsage     = usage − billingDays − weather

for each component k:
  componentΔ   = (r1[k] − r0[k]) · q1

fixedΔ         = F1 − F0
refund         = sum of refund lines on the bill
residual       = change − Σ(all items)
```

- Residual is shown as "local tax and rounding"; warn when `|residual| > 3%` of `charges_this_period`.
- The sentence ranks the largest items by absolute peso and states the remainder.
- If a Meralco reason exists for `r1`'s month, append it with attribution; otherwise show the no-reason state.

### 8.4 Lifeline and senior discounts

v1 targets residential non-lifeline rates. If the bill contains lifeline/senior lines:

- Pass the amounts through as bill lines.
- Do not re-derive bracket percentages.
- Show a warning that the app did not recalculate the discount.

### 8.5 Reasons and attribution (hard gate)

- Render a reason only from a validated `reasons.json` entry.
- The rendered reason must include the quote, date, and a clickable Meralco URL.
- If validation fails, behave as if no reason exists.
- Add a unit test that fails if any rendered reason lacks quote/date/URL.
- The app must not contain generated cause text anywhere in the explanation path.

---

## 9. Privacy and security

| Control | Implementation |
|---|---|
| No upload | All parsing/OCR/model work in the tab; no `fetch` with bill data; no analytics. |
| No persistence | Do not write images, extracted fields, or passwords to IndexedDB/localStorage. |
| PDF password | Held in memory for the session only; cleared after open; never logged. |
| Untrusted text | Escape all bill/OCR text before insertion into HTML (current `esc` helper). |
| Model/data integrity | Pin versions and hashes; validate JSON at load; reject invalid rate tables. |
| Supply chain | Prefer self-hosted model files; no remote model fetch at runtime. |
| Data Privacy Act | Local-only processing means no personal data is collected, stored, or shared by the app. |

Note: the service worker caches app assets and models, not customer data.

---

## 10. Deployment (PWA)

- **Hosting:** static files only (`www/`). No API routes, no server runtime.
- **Build steps:** `npm install` (copies pdf.js to `www/vendor`), `npm run synthetic` for dev data, then publish `www/`.
- **PWA:** add `manifest.webmanifest` and a versioned service worker that precaches:
  - app shell (`index.html`, `app.js`, `style.css`, `lib/*`),
  - `vendor/pdf.*`,
  - `models/*`,
  - `data/*.json`,
  - sample fixtures used by the demo.
- **Cache versioning:** bump on every data or model update; old caches removed on activate.
- **Offline:** after first successful load, the full flow must work with the network disabled.
- **iOS/Capacitor:** not part of v1. Leave existing config in place but exclude it from v1 delivery and documentation claims.

---

## 11. Error handling and degradation

| Condition | Behavior |
|---|---|
| Unreadable image | Show error; allow retry or manual entry. |
| Low OCR confidence | Proceed to confirmation with flagged fields; block until checks pass. |
| Missing required field | Highlight field; block analysis. |
| Self-check failure | Highlight offending fields; block analysis. |
| No prior tracker month | State that a change explanation needs at least two months. |
| No previous rate month | State that last month's rate table is missing. |
| Rate month mismatch | Warn; use closest match and say so. |
| Invalid rate table | Disable explanation; show a data error (do not guess). |
| Weather gap | Disable the weather split; use tier-C behavior. |
| No Meralco reason | Show evergreen categories + explicit "not published" state. |
| Non-meralco reason URL | Reject the entry; behave as no reason. |

Every degradation must preserve the rule: show less, never invent.

---

## 12. Performance targets

| Metric | Target |
|---|---|
| First interactive load (cached) | under 2 s on a mid-range phone |
| First load including OCR models | explicit progress UI; models cached afterward |
| Photo OCR (one page) | completes without blocking the UI; target under ~15 s on a mid-range phone |
| Analysis after confirmation | under 1 s |

Treat these as goals to measure against the Gate 0 corpus and real devices, not guarantees.

---

## 13. Testing plan

### 13.1 Existing

`npm test` runs `tests/selfcheck.mjs` against synthetic fixtures:
- rate table validation,
- parsing exactness for good/weak bills,
- self-check pass/fail behavior,
- model tier selection and refusal,
- breakdown summing to the change,
- projection and payback sanity (payback is solar; remove with v1 scope).

### 13.2 Required additions

| Test | Purpose |
|---|---|
| OCR fixture tests | Same known-value assertions using bill photos and the OCR line model. |
| Confidence flagging | Low-confidence lines mark the right fields. |
| Attribution gate | Any rendered reason has quote + date + Meralco URL; else no render. |
| No-reason fallback | Missing month entry yields evergreen + "not published" text. |
| Rate schema v2 | Bracket lookup and validation against real schedule rows. |
| Rate month mismatch | Warn path. |
| Lifeline/senior passthrough | Warning shown; no re-derivation. |
| Offline | Repeat full flow with network disabled. |
| Privacy | Assert no network request carries bill data; no persistence of inputs. |
| Scope guard | Assert no solar/rewards UI or exports ship in v1. |

### 13.3 Gate 0 corpus

Before any real-bill accuracy claim, collect a consented corpus of Meralco residential bills (photos and PDFs) covering:
- multiple consumption brackets,
- lifeline and senior accounts,
- refunds and adjustments,
- different bill layouts/vintages.

Store it outside the public repo unless consent and anonymization allow publication.

---

## 14. Dependencies

| Dependency | Use | Notes |
|---|---|---|
| `pdfjs-dist` 4.10.38 | PDF text extraction | Copied to `www/vendor` on install |
| `onnxruntime-web` | PaddleOCR inference | New; pin version; WASM assets self-hosted |
| PP-OCR ONNX models (det/cls/rec, English) | Photo OCR | New; pin files and hashes |
| `pdf-lib` (dev) | Synthetic fixture generation | Dev-only |
| `@capacitor/*` | iOS packaging | **Deferred**; not v1 |

No server framework, database, auth provider, or third-party API is required.

---

## 15. Open questions and gates

| ID | Question | Blocks |
|---|---|---|
| G-1 | Real Meralco bill corpus (Gate 0). | Parser fixes, OCR accuracy claims |
| G-2 | Which PaddleOCR ONNX export and model sizes work acceptably on target phones? | OCR module |
| G-3 | Exact rate-schedule rows and bracket boundaries for the current month. | `rates.json` v2 |
| G-4 | Which Meralco pages publish narrative reasons each month, and can we quote them with a stable URL? | `reasons.json` |
| G-5 | Current weather archive license/attribution requirements. | `weather.json` |
| G-6 | Whether PDF-rendered-to-image OCR is needed for scanned statements. | Fallback design |

---

## 16. Appendices

### 16.1 Meralco schedule fields observed

The reviewed sample (`agent_artifacts/Meralco_report_sample.pdf`, local only; not committed) is a Summary Schedule of Rates effective October 2026 billing. Relevant columns for residential rows include:

- Generation Charge (₱/kWh)
- Transmission Charge
- Ancillary Service Charge
- System Loss Charge
- Distribution Charge (bracket-dependent)
- Supply Charge, Metering Charge
- AWAT (Refund)/Collect 1 and 2, Regulatory Reset Fees Adjustment
- Lifeline Rate / Senior Citizen Subsidy
- RPT Charge, RPT Adjustment
- Universal Charges: UC-ME (NPC-SPUG), UC-EC, UC-SD
- FIT-All, GEA-All
- Power Factor, Lifeline Eligibility

The schedule is **VAT-exclusive**, with a separate VAT table and energy-tax table. Residential brackets are 0–50, 51–70, 71–100, 101–200, 201–300, 301–400, and over 400 kWh.

### 16.2 Explanation sentence contract

The results sentence must:
- state the peso direction and amount,
- name the top contributors by absolute peso,
- account for the remainder,
- append a Meralco reason only with quote + date + URL,
- avoid causal language the app cannot support.

### 16.3 Out-of-scope code

- `www/lib/solar.js` and the solar section in `www/index.html` / `www/app.js` are excluded from v1.
- `capacitor.config.json` and `.github/workflows/ios.yml` are excluded from v1 delivery.
- Do not ship either in v1 acceptance tests or documentation claims.
