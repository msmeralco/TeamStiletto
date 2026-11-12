# TANAW — Requirements

## 0. Document control

| Item | Value |
|---|---|
| Product | TANAW — "why did my Meralco bill change?" |
| Document | Product and software requirements |
| Version | 1.0 (v1 scope) |
| Status | Draft for team review |
| Source of truth | `hackathon_challenges.md` (Challenge 2 only) |
| Companion | `tech_spec.md` |

This document separates three things so they are never confused:

1. **What the official challenge says** (quoted from `hackathon_challenges.md`).
2. **What this product decides to build** (our v1 scope).
3. **What is actually built today** (status column).

Status legend: **Implemented** (works in the current repo), **Partial** (exists but incomplete or synthetic), **Not built** (specified, absent), **Out of scope** (explicitly excluded).

---

## 1. Product summary

TANAW helps a Meralco residential customer understand why their electricity bill changed month-over-month, and what the next bill is likely to be. The customer supplies one bill (a photo, or a PDF as a fallback). The app:

1. extracts the bill's numbers,
2. asks the customer to confirm/correct them,
3. breaks the peso change into rate changes and usage changes,
4. attributes rate changes to Meralco's own published rate schedule and — when Meralco has published one — Meralco's own stated reason,
5. projects next month's bill with a range and a backtest.

Everything runs on the customer's device. Photos are never uploaded, and there is no account, login, or backend.

---

## 2. Challenge traceability

> **Challenge 2: Know Your Bill, Manage Your Usage**
>
> "How might we help customers understand what makes up their electricity bill, use their own consumption data to manage their usage?"
>
> Extracted elements: **Users:** Customers. **Goals:** Understand the components of an electricity bill; manage usage. **Data:** The customer's own consumption data.

TANAW addresses **Challenge 2 only**. It does **not** claim Challenge 1, 3, or 4.

| Challenge element | How TANAW addresses it |
|---|---|
| Users: Customers | A residential Meralco customer, acting on their own bill. |
| Goal: understand what makes up the bill | Itemized peso breakdown of each charge component and the drivers of the month-over-month change. |
| Goal: manage usage | Shows whether the change came from weather, billing days, or the customer's own behavior, and projects next month so the customer can act. |
| Data: the customer's own consumption data | The uploaded bill's kWh, charge lines, and printed monthly consumption tracker. No third-party or account data. |

**Explicitly not addressed (out of scope):**

- Challenge 1 — solar comparison and rewards. Solar has been removed from v1.
- Challenge 3 — grid intelligence, smart meters, IoT, outage detection.
- Challenge 4 — field observation, dashcams, sensors.

No requirements in this document add users, goals, data sources, or constraints beyond Challenge 2 without labeling them as product decisions below.

---

## 3. Scope

### 3.1 In scope (v1)

| Area | Included |
|---|---|
| Input | Photo of the Meralco bill (primary), PDF statement (fallback) |
| Extraction | In-browser PaddleOCR (PP-OCR) for photos; PDF text extraction for PDFs |
| Verification | Numeric self-checks plus an editable confirmation screen |
| Explanation | Rate-component breakdown, usage/weather/billing-days decomposition, Meralco-stated reasons with attribution |
| Projection | Next-month estimate with range and a 3-month backtest |
| Trust | Sources and assumptions panel, synthetic-data banner, per-number provenance |
| Delivery | Mobile-responsive web app / PWA, offline after first load |
| Data | Bundled Meralco rate schedule, Meralco reasons, historical weather |

### 3.2 Out of scope (v1)

| Item | Decision |
|---|---|
| Solar / net-metering comparison | Removed. Existing `www/lib/solar.js` and the solar UI are excluded from v1. |
| Rewards, points, badges, leaderboards | Not built. |
| Server-side OCR or any backend | Not built. |
| User accounts, login, cloud storage | Not built. |
| Multiple bill uploads / account history import | Not built; history comes from the one uploaded bill. |
| AMI / smart-meter / interval data | Not built. |
| Live scraping of Meralco at runtime | Not built; data is bundled at build time. |
| Non-residential customer classes | Not built; Residential only. |
| Re-deriving lifeline/senior discount rules | Not built; discounts are passed through from the bill with a warning. |
| Submitting anything to Meralco | Not built. |
| iOS/Capacitor packaging | Deferred; v1 ships as a web app/PWA. |

---

## 4. Users, context, and assumptions

### 4.1 Primary user

A **Meralco residential customer** who has a bill (photo or PDF) and wants to know why it changed. This is the product's instantiation of the challenge's "Customers"; it is a scoping decision, not new challenge text.

### 4.2 Assumptions

| ID | Assumption | Impact if false |
|---|---|---|
| A-1 | The bill is an English-language Meralco residential bill. | Parser labels, OCR language, and rate class must change. |
| A-2 | The bill prints a monthly consumption tracker with several months of kWh. | Weather/usage decomposition and projection degrade; tier-C fallback applies. |
| A-3 | The bill prints charge lines whose amounts sum to the period charges. | Self-check `line_sum` fails; customer must correct fields. |
| A-4 | Meralco publishes a monthly Summary Schedule of Rates with per-component ₱/kWh by bracket. | Rate lookup cannot be verified; rate month detection warns. |
| A-5 | Meralco sometimes publishes a narrative reason for a rate movement. | App must use the "no published reason" fallback; it may never invent one. |
| A-6 | The customer can review and correct OCR output. | Accuracy cannot be guaranteed; the app must block analysis until checks pass. |

---

## 5. Functional requirements

### 5.1 Input and capture

| ID | Requirement | Status |
|---|---|---|
| FR-I-1 | The user can upload a **photo** of the bill from camera or gallery. | Not built |
| FR-I-2 | The user can upload the **PDF** statement as an alternative. | Implemented |
| FR-I-3 | If the PDF is password-protected, the app can open it with a password entered by the user and **never stores** that password. | Implemented |
| FR-I-4 | Each analysis uses exactly **one bill**. | Implemented |
| FR-I-5 | The app offers clearly labeled **synthetic sample bills** for demo/testing. | Implemented |

### 5.2 Extraction

| ID | Requirement | Status |
|---|---|---|
| FR-X-1 | Photo OCR runs **on-device in the browser** using PaddleOCR PP-OCR models via ONNX Runtime Web. Bill images are never uploaded. | Not built |
| FR-X-2 | OCR uses **English** detection, angle-classification, and recognition models. | Not built |
| FR-X-3 | OCR output is normalized into the existing line model: `[{ y, page, items: [{ str, x }] }]`. | Not built |
| FR-X-4 | The app extracts: billing period start/end, days, previous/current reading, multiplier, kWh used, charge lines, monthly consumption tracker, charges for the period, remaining balance, installment due, total amount due, service city. | Implemented (PDF), Not built (photo) |
| FR-X-5 | OCR exposes a per-field confidence signal used to flag uncertain fields for review. | Not built |
| FR-X-6 | v1 does **not** use a table-structure model (PP-Structure); fields are reconstructed from recognized lines plus the parser and confirmation screen. | Not built |

### 5.3 Verification and correction

| ID | Requirement | Status |
|---|---|---|
| FR-V-1 | The app runs four self-checks: readings delta = kWh; tracker latest = kWh; sum of charge lines = charges for the period; remaining balance + charges + installment = total amount due. | Implemented |
| FR-V-2 | The confirmation screen lets the user edit every extracted scalar, charge amount, and tracker value. | Implemented |
| FR-V-3 | Analysis is **blocked** while any self-check fails. | Implemented |
| FR-V-4 | Fields flagged as low-confidence by OCR are visibly marked in the confirmation screen. | Not built |
| FR-V-5 | A failed self-check highlights the specific fields that disagree by more than ₱1 or 1 kWh. | Implemented |

### 5.4 Bill explanation

| ID | Requirement | Status |
|---|---|---|
| FR-E-1 | The app detects the bill's rate month by comparing the bill's generation ₱/kWh against each bundled Meralco rate month. | Implemented |
| FR-E-2 | The app explains the change in **rate components** (generation, transmission, system loss, distribution, supply, metering, subsidies, universal, FIT-All, GEA-All, VAT, franchise tax, fixed charges) using the Meralco Summary Schedule of Rates. | Partial (synthetic rates) |
| FR-E-3 | When the weather fit is reliable, the app splits the usage-side change into **weather**, **billing days**, and **the customer's own usage**. | Implemented |
| FR-E-4 | When the fit is not reliable, the app refuses to split weather and labels the usage change as not separable. | Implemented |
| FR-E-5 | The app includes fixed monthly charges, any refund line, and a residual line for local tax and rounding. | Implemented |
| FR-E-6 | The breakdown sums to the peso change, and the app warns when the residual exceeds 3% of the period charges. | Implemented |
| FR-E-7 | The app shows a **verbatim Meralco quote**, its date, and its `meralco.com.ph` URL when Meralco has published a reason for the rate month. | Partial (no real data; URL display not built) |
| FR-E-8 | The app **never generates, infers, or paraphrases a reason**. No reason is shown without a visible Meralco quote, date, and link. | Partial (attribution gate not enforced/tested) |
| FR-E-9 | When no Meralco reason exists for the rate month, the app shows the component deltas, Meralco's evergreen "why your bill can change" categories, and an explicit "Meralco has not published a reason for this month" state. | Not built |
| FR-E-10 | Lifeline/senior discount lines are **passed through from the bill** and flagged with a warning; the app does not re-derive them. | Partial (line parsed; warning not built) |
| FR-E-11 | The app states when the detected rate month does not match the bill's billing dates. | Implemented |

### 5.5 Projection

| ID | Requirement | Status |
|---|---|---|
| FR-P-1 | The app projects next month's bill with a low/mid/high range. | Implemented |
| FR-P-2 | The projection includes a 3-month backtest showing average percentage error. | Implemented |
| FR-P-3 | When the weather model is unusable, the app falls back to last year's same month scaled by recent months, or states that a projection is not possible. | Implemented |
| FR-P-4 | The projection is labeled as typical weather at current rates, **not a weather forecast**. | Implemented |

### 5.6 Sources, provenance, and honesty

| ID | Requirement | Status |
|---|---|---|
| FR-S-1 | The app lists every source and assumption behind the numbers shown. | Implemented |
| FR-S-2 | A visible banner appears whenever rates, weather, or sample bills are synthetic. | Implemented |
| FR-S-3 | Every rate table entry carries a source title/URL and retrieval date. | Partial (synthetic placeholder) |
| FR-S-4 | The app shows the basis of each figure (actual vs. estimated reading, billing days, rate month, model tier). | Partial |

### 5.7 Data refresh and stewardship

| ID | Requirement | Status |
|---|---|---|
| FR-D-1 | Rate schedule, reasons, weather, and OCR models are **bundled** with the deployment. | Partial (rates/weather bundled; models absent) |
| FR-D-2 | A monthly **manual data-steward step** updates `rates.json`, `reasons.json`, and the weather cache, validates them, and redeploys. | Not built |
| FR-D-3 | The steward records provenance for every rate month (source, URL, retrieval date) and every reason (verbatim quote, date, URL). | Partial |
| FR-D-4 | Build/startup validation rejects a rate month whose component values do not sum to its stated total. | Implemented |

### 5.8 Privacy and security

| ID | Requirement | Status |
|---|---|---|
| FR-PR-1 | Bill images, PDFs, and extracted data never leave the device. | Implemented |
| FR-PR-2 | Images, PDF passwords, and bill data are not persisted to storage. | Implemented |
| FR-PR-3 | All extracted/OCR text is treated as untrusted and escaped before rendering. | Implemented |
| FR-PR-4 | There is no account, login, or server-side customer record. | Implemented |

### 5.9 Delivery

| ID | Requirement | Status |
|---|---|---|
| FR-Dep-1 | The app is a **mobile-responsive web app** that works in a phone browser without downloading an app. | Partial (basic responsive UI) |
| FR-Dep-2 | The app is installable as a PWA and works **offline after first load**. | Not built |
| FR-Dep-3 | The app runs from static hosting with **no application backend**. | Implemented |
| FR-Dep-4 | iOS/Capacitor packaging is not part of v1. | Out of scope |

---

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Verifiability:** every displayed peso figure traces to the bill, the Meralco rate schedule, or a labeled model output. No unexplained numbers. |
| NFR-2 | **Performance:** first load should remain usable on a mid-range phone; OCR of one bill should complete without freezing the UI (run in a Web Worker). |
| NFR-3 | **Compatibility:** current Chrome, Safari, and Edge on Android and iOS, portrait phone first. |
| NFR-4 | **Accessibility:** semantic headings, labeled inputs, keyboard-operable controls, and text alternatives for charts. |
| NFR-5 | **Security:** no secrets in the client bundle; dependency and model assets pinned; untrusted PDF/OCR text escaped. |
| NFR-6 | **Privacy:** aligned with the Data Privacy Act of 2012 (RA 10173) by processing everything locally and collecting nothing. |
| NFR-7 | **Maintainability:** data updates do not require code changes beyond validated JSON; modules stay separately testable. |
| NFR-8 | **Offline:** after first load, the core flow works with no network. |
| NFR-9 | **Honesty under degradation:** when the app cannot compute something reliably, it says so instead of guessing. |
| NFR-10 | **No runtime network:** no analytics, no tracking, no third-party API calls during use. |

---

## 7. Data requirements

### 7.1 Required inputs

| Data | Source | Provenance requirement |
|---|---|---|
| Bill fields and charge lines | Customer's uploaded bill (photo/PDF) | Read from the bill; shown for confirmation. |
| Monthly consumption tracker | Same bill | Read from the bill; shown for confirmation. |
| Rate schedule | Meralco Summary Schedule of Rates (monthly) | Source title, URL, retrieval date per month. |
| Rate-change reasons | Meralco-published advisory/explainer | Verbatim quote, date, `meralco.com.ph` URL. |
| Daily temperatures | Open-Meteo historical archive (bundled) | Source, city, coordinate, date range. |

### 7.2 Data rules

- Synthetic data must be visibly labeled wherever it affects output.
- A reason may only exist in `reasons.json` if it has a Meralco source URL and date.
- A rate month may only be used if its components sum to its total within tolerance.
- Weather must be daily values covering every date the model reads; no monthly means.

---

## 8. Acceptance criteria

| ID | Given / When / Then |
|---|---|
| AC-1 | Given a bill photo, when the user uploads it, then OCR runs in-browser and no network request carries the image. |
| AC-2 | Given extracted fields, when any self-check fails, then the "explain" action is disabled and the offending fields are highlighted. |
| AC-3 | Given a corrected, check-passing bill, when the user proceeds, then a peso breakdown is shown that sums to the month-over-month change within tolerance. |
| AC-4 | Given a successful weather fit, when the breakdown renders, then weather, billing days, and own usage are shown separately. |
| AC-5 | Given an unsuccessful weather fit, when the breakdown renders, then the app states that weather cannot be separated and does not invent a split. |
| AC-6 | Given a rate month with a Meralco-published reason, when the explanation renders, then a verbatim quote, date, and clickable Meralco URL are visible. |
| AC-7 | Given a rate month with no Meralco-published reason, when the explanation renders, then the app says Meralco has not published a reason and shows only component deltas and evergreen categories. |
| AC-8 | Given any analysis, when a reason is displayed, then a test proves it has a non-empty Meralco quote, date, and URL. |
| AC-9 | Given a bill that includes lifeline/senior discounts, when the explanation renders, then the discount line is passed through and a warning is shown. |
| AC-10 | Given a completed analysis, when the projection renders, then a range, a label that it is not a forecast, and a 3-month backtest are shown. |
| AC-11 | Given the app has been loaded once, when the device goes offline and the user repeats the flow, then it still completes. |
| AC-12 | Given any synthetic rate, weather, or sample bill, when it is displayed, then the synthetic banner is visible. |
| AC-13 | Given the deployed bundle, when inspected, then there is no backend endpoint, account, or runtime network call. |

---

## 9. Removed and deferred items

| Item | Disposition |
|---|---|
| Rooftop solar payback (`www/lib/solar.js`, solar UI) | Removed from v1 scope; must not appear in v1 requirements or acceptance tests. |
| Reward/recognition mechanics | Removed; not future work in this document. |
| iOS/Capacitor build (`ios.yml`, `capacitor.config.json`) | Deferred; not part of v1 delivery. |
| Server-side PaddleOCR | Rejected; conflicts with no-upload privacy. |
| PP-Structure table extraction | Rejected for v1; parser + confirmation instead. |
| Multiple-bill history import | Deferred. |

---

## 10. Risks and open gates

| ID | Risk / gate | Mitigation |
|---|---|---|
| R-1 | **Gate 0: no real Meralco bill corpus.** | Collect real residential bill photos/PDFs before claiming real accuracy. |
| R-2 | PaddleOCR in-browser is unproven for this layout and may be slow or large. | Prototype early; budget model download; run in a Worker; keep PDF fallback. |
| R-3 | Photo quality (glare, skew, crop) hurts OCR. | Preprocess, show confidence, require confirmation, allow manual entry. |
| R-4 | Real bill labels/dates differ from current regex shortcuts. | Fix parser against Gate 0 corpus; keep `shortcut:` markers. |
| R-5 | Rate schedule vintage drifts from the bill. | Detect rate month, warn on mismatch, steward refresh each month. |
| R-6 | Meralco may not publish a reason every month. | "No published reason" fallback; never invent. |
| R-7 | Weather model unreliable for some households. | Tier-C refusal and fallback projection; state limitations. |
| R-8 | Lifeline/senior customers need different math. | Pass through discount lines with a warning in v1. |
| R-9 | Attribution drift (paraphrased cause). | Acceptance test AC-8 and a review rule requiring exact quotes + URLs. |
| R-10 | PWA offline caching of large OCR models. | Versioned cache; show a clear first-load download state. |

---

## 11. Requirement traceability matrix (Challenge 2)

| Challenge element | Requirements |
|---|---|
| Users: Customers | FR-I-1..5, FR-V-2, NFR-4 |
| Goal: understand bill components | FR-E-1..11, FR-V-1..5, FR-S-1..4 |
| Goal: manage usage | FR-E-3..4, FR-P-1..4 |
| Data: customer's own consumption data | FR-I-1..4, FR-X-1..6, FR-PR-1..4 |
| (Product principle) verifiable sources | FR-S-3, FR-D-2..4, NFR-1, AC-6..8 |
| (Product principle) no backend / privacy | FR-PR-1..4, FR-Dep-3, NFR-5..6, NFR-10, AC-1, AC-13 |
