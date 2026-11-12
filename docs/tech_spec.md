# TANAW: Technical Specification

## 0. Scope and sources

| Item | Value |
|---|---|
| Product | TANAW: "why did my Meralco bill change?" |
| Document | Technical specification for v1, aligned with the code as of 2026-11-12 |
| Challenge | Meralco IDOL Hackathon 2026, Challenge 2 (Know Your Bill, Manage Your Usage) |
| Repo | Static web app in `www/`, data scripts in `scripts/`, tests in `tests/`, this spec in `docs/` |
| Delivery | One codebase (`www/`) shipped three ways: web app (installable, works offline), Android app (`.apk`) and iOS app (`.ipa`), both built with Capacitor |

Status legend: **Implemented**, **Partial**, **Not built**, **Out of scope**.

Where the earlier draft of this spec and the code disagreed, the choice below is the one with the least risk for a 24-hour build. Section 17 lists each decision and why.

---

## 1. Architecture overview

v1 is a **static, client-side app**. There is no application backend, no account, and no network call at runtime. Bill data stays on the device unless the user chooses to share a dispute.

```
  PDF statement ──file picker──►  extract.js (pdf.js, legacy build)  ──► lines [{y, page, items:[{str,x}]}]
  photo (v1.1)  ──camera──────►  ocr (Apple Vision via Capacitor)   ──► same line model
                                          │
                                          ▼
                                 parse.js  (label-anchored, fitted to the real My Meralco statement)
                                          │
                                          ▼
                                 checks.js (4 self-checks)  ──►  confirm screen (editable, failed fields highlighted)
                                          │
                                          ▼
          model.js  ──►  explain.js  ──►  model.js         flags.js                 disputes.js
          3PC fit        rate lookup      projection       possible billing error   follow-up + ERC escalation
                         peso breakdown                    dispute packet
                                          │
                                          ▼
                          results screen + "Send dispute" (share sheet) + My disputes (start screen)

  Bundled data:  www/data/rates.json (Meralco, Jan–Oct 2026), weather.json (Open-Meteo), reasons.json, fixtures/
  Built by:      scripts/build_rates.mjs, scripts/fetch_weather.mjs, scripts/make_synthetic.mjs (run once, online)
  Staff concept: www/dashboard.html (dispute triage; loads dispute files by hand)

  Web:      static host (HTTPS) + manifest.webmanifest + sw.js (precache, network-first)  → installable, offline after 1st visit
  Android:  Capacitor 6 → .apk (GitHub Actions, Linux)        iOS: Capacitor 6 → .ipa (GitHub Actions, macOS)
  Sharing:  native Share + Filesystem plugins in the apps; Web Share API or download + copy in browsers
```

### 1.1 Design principles

- **Local-only:** bill data never leaves the device unless the user taps "Send dispute" and picks an app.
- **Verifiable:** every peso maps to a bill line, a named Meralco rate PDF, or a labelled model output.
- **Honest degradation:** refuse rather than guess (model tier C, no matching rate table, failed checks).
- **Meralco-sourced reasons:** the app may quote Meralco; it never writes a cause itself.
- **Evidence, not verdicts:** billing-error flags cite numbers; the user decides whether to dispute.

---

## 2. Current implementation vs v1 target

| Capability | Status | Notes |
|---|---|---|
| PDF text extraction | **Implemented** | `extract.js`, pdf.js 4.10.38 legacy build (supports iOS Safari 15+) |
| Password-protected PDF | **Implemented** | Password field appears on `PasswordException`; held in memory, cleared after open |
| Bill parsing | **Implemented** | Fitted to a real May 2026 statement; all fields and 17 tracker months exact |
| Self-checks + confirm screen | **Implemented** | 4 checks; failed fields highlighted; every field editable |
| Rate tables | **Implemented** | Real Meralco tables, Jan–Oct 2026, every row validated |
| Weather | **Implemented** | Real Open-Meteo daily means, Metro Manila, 2016-01-01 onward |
| Usage model, 3 tiers | **Implemented** | `model.js` |
| Peso breakdown + sentence | **Implemented** | `explain.js`; adds up to the change within ₱1 |
| Projection + backtest | **Implemented** | `model.js` |
| Possible billing error flags | **Implemented** | `flags.js`; 9 flag kinds, 3 strengths |
| "What changed at home?" | **Implemented** | Checkboxes + note; feeds the unexplained-increase flag and the message |
| Dispute packet + Send dispute | **Implemented** | Share sheet with message + JSON file; download fallback |
| My disputes + ERC escalation | **Implemented** | On-device follow-up, 14-day prompt, ERC message + file |
| Staff triage dashboard | **Implemented (concept)** | `dashboard.html`; loads files by hand; no Meralco system connected |
| Reasons with attribution gate | **Implemented** | `npm run advisories` scrapes Meralco advisories; quote + date + meralco.com.ph link, gated by `usableReason` |
| Lifeline/senior warning | **Not built** | Lines pass through; no warning shown |
| Photo OCR | **Not built** | v1.1; Apple Vision via Capacitor (see §5) |
| Scanned (image-only) PDF | **Not built** | Shows a clear error today; v1.1 routes it to OCR |
| Solar payback | **Implemented, out of scope for v1** | Remove the UI section before v1 acceptance; keep `solar.js` for Challenge 1 |
| Web app (PWA) | **Implemented** | Manifest, icons, service worker; offline after the first visit (tested in Chrome); needs an HTTPS host |
| Android `.apk` | **Partial** | Capacitor 6 + `.github/workflows/android.yml`; never run; untested on a device |
| iOS `.ipa` | **Partial** | Capacitor 6 + `.github/workflows/ios.yml`; never run; untested on a device |
| Native sharing | **Partial** | `@capacitor/share` + `@capacitor/filesystem` in the apps; untested on devices |

---

## 3. Module map

| File | Responsibility |
|---|---|
| `www/index.html`, `www/style.css` | Upload, confirm and results screens; My disputes on the start screen; mobile-first, dark mode |
| `www/app.js` | Flow, data loading, rendering, events, `sendDispute` (native or web sharing), on-device dispute storage, service worker registration (web only) |
| `www/sw.js`, `www/manifest.webmanifest`, `www/icon-*.png` | Web app: precache list, network-first fetch, install metadata |
| `www/lib/extract.js` | PDF bytes → line model. The contract any OCR engine must also meet |
| `www/lib/parse.js` | Line model → bill object |
| `www/lib/checks.js` | Bill object → 4 pass/fail checks |
| `www/lib/model.js` | Daily temperatures, tracker periods, CDD, 3PC fit, projection |
| `www/lib/explain.js` | Rate validation, bracket lookup, rate-month detection, peso breakdown, sentence |
| `www/lib/flags.js` | Billing-error flags, household changes, dispute message, dispute packet |
| `www/lib/disputes.js` | Days waiting, ERC message, ERC packet, channel list |
| `www/lib/solar.js` | Solar payback (out of scope for v1) |
| `www/dashboard.html`, `www/dashboard.js` | Staff triage concept |
| `scripts/build_rates.mjs` | Meralco PDFs in `data/rates_pdfs/` → `www/data/rates.json` |
| `scripts/fetch_weather.mjs` | Open-Meteo archive → `www/data/weather.json` |
| `scripts/make_synthetic.mjs` | SYNTHETIC sample bills (PDF), sample dispute files, test truth |
| `scripts/serve.mjs` | Dev server on port 8000 |
| `tests/selfcheck.mjs` | All tests (`npm test`) |

To add in v1.1: a Capacitor OCR plugin and `www/lib/ocr.js` (§5).

---

## 4. Data schemas

All bundled data lives in `www/data/`. Data is validated when built (`build_rates.mjs` stops on any error) and again at app load (`validateRates`; a failure shows a visible error).

### 4.1 Line model (parser input)

```json
[{ "y": 694, "page": 1, "items": [{ "str": "27 Apr 2026 to 26 May 2026", "x": 36 }, { "str": "26 May 2026", "x": 198 }] }]
```

- Items on one line are within 3 pt of the same `y`; lines run top to bottom, items left to right.
- Any OCR engine must emit this shape so `parse.js` stays engine-agnostic.
- Text is untrusted and escaped at render time (`esc`).

### 4.2 Bill object (`parseBill` output)

```json
{
  "can": "0000000000",
  "period_start": "2026-04-27", "period_end": "2026-05-26", "days": 30,
  "kwh": 706, "previous_reading": 5568, "current_reading": 6274, "multiplier": 1,
  "tracker": [{ "month": "2025-01", "kwh": 717 }],
  "charges": [{ "key": "generation", "label": "Generation", "amount_php": 6208.71 }],
  "charges_this_period": 10949.58, "remaining_balance": 0, "installment_due": 0, "total_amount_due": 10949.58,
  "source": "pdf_text"
}
```

- `can` is kept as text so leading zeros survive.
- `days` counts both end dates (27 Apr to 26 May = 30).
- `charges` are the 10 page-1 summary categories: `generation`, `transmission`, `system_loss`, `distribution`, `senior_subsidy`, `taxes`, `universal`, `fit_all`, `gea_all`, `lifeline`, plus `refund` and `other` if printed. They add up to `charges_this_period`.
- `source` is `pdf_text` or `synthetic`; v1.1 adds `photo_ocr`.
- No address or city is parsed. Weather uses Metro Manila (§4.4).

### 4.3 `rates.json`

Built from Meralco's **"Residential Bills at Typical Consumption Levels"** PDFs, one per month (Jan–Oct 2026 in the repo). This table is chosen over the Summary Schedule of Rates because it is residential-only, already includes VAT, LFT and energy tax per kWh at each level, and prints a total per row that every row is checked against.

```json
{
  "2026-10": {
    "source_url": "https://www.meralco.com.ph/uploads/documents/source-delta/2026-10-25/5afca4c8….pdf",
    "lft_assumed": 0.005,
    "fixed": { "supply_cust": 16.38, "metering_cust": 5.0 },
    "non_lifeline": {
      "200": { "generation": 10.2005, "transmission": 0.5422, "ancillary": 0.602, "system_loss": 0.9301,
               "distribution": 0.9803, "...": 0, "vat": 1.0778, "total": 15.0615 }
    },
    "lifeline": { "50": { "...": 0 } }
  }
}
```

Rules:
- Rows sit at 50, 70, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 3000 and 5000 kWh.
- `fixed` holds the ₱/customer/month charges; they are removed from the per-kWh rows.
- **Validation:** per-kWh components + Σfixed ÷ kWh = `total` within ₱0.0005/kWh, for every row of every month. Known values are tested: Sep 2026 @ 200 = 14.7424, Oct 2026 @ 200 = 15.0615, May 2026 generation = 8.7942.
- **Column layouts change between months.** `build_rates.mjs` maps four known header layouts by hand (Jan; Feb–Mar; Apr–Jun; Sep–Oct, where ancillary is split from transmission and AWAT has two lines). An unknown header stops the build and prints it.
- Columns that exist in one month but not another count as 0 when two months are compared.
- **New month:** drop its PDF into `data/rates_pdfs/` and run `npm run rates`.

### 4.4 `weather.json`

```json
{ "city": "Metro Manila", "lat": 14.5995, "lon": 120.9842, "start": "2016-01-01",
  "source": "Open-Meteo archive (CC BY 4.0)", "t": [27.1, 27.4] }
```

- `t[i]` is the daily mean °C for `start + i` days. `temps()` throws on any missing day, so a weather gap can never be filled silently.
- Fixed to Metro Manila. The bill's own temperature also comes from PAGASA in Quezon City. Per-city coordinates would mean sending a location derived from the user's address to a service, so they are not used.
- Refresh with `npm run weather` (online, once).

### 4.5 `reasons.json`

```json
{ "2026-10": { "date": "2026-10-13", "text": "<verbatim Meralco quote>", "url": "https://www.meralco.com.ph/…", "retrieved": "2026-11-12" } }
```

- **Implemented:** `npm run advisories` fills it from meralco.com.ph/media/advisories (verbatim `text` = lead + generation paragraph; `sections` feed the chat). Shown under the sentence with date and link.
- **Implemented (gate, `usableReason`):** an entry is usable only if `text`, `date` and `url` are non-empty and the `url` host is `meralco.com.ph` or a subdomain; otherwise it is ignored. The rendered reason shows quote, date and a clickable link. A test fails if a rendered reason lacks any of the three.

### 4.6 Dispute packet (`tanaw-dispute/1`)

Written by `disputePacket` (`flags.js`), shared by "Send dispute", read by `dashboard.js`.

| Field | Content |
|---|---|
| `format`, `created`, `strength` | `tanaw-dispute/1`, ISO time, strongest flag: `strong` / `medium` / `weak` |
| `customer_account_number` | From the bill |
| `bill`, `charges`, `tracker` | Readings, kWh, days, totals, every charge category, all tracker months |
| `checks` | The 4 checks with expected vs found |
| `flags` | Each flag's key, strength and evidence text |
| `rates` | Both rate months, their Meralco source URLs, bill minus published rates (₱) |
| `usage` | Estimated last bill, unexplained change (₱), its share, and the household's flag limit |
| `household_answers` | Ticked changes and note |
| `message` | The dispute message, including the user's edits |
| `meralco_follow_up` | ERC packets only: date sent, channel, Meralco reference, days waiting |

---

## 5. Photo OCR (v1.1, not built)

**Choice: the phone's own OCR through one Capacitor plugin:** Apple Vision (`VNRecognizeTextRequest`) on iOS and Google ML Kit on-device text recognition on Android. Not PaddleOCR in the browser.

- Native, offline and free on both platforms. No model files to bundle, download or cache in the app (PP-OCR ONNX plus `onnxruntime-web` would add tens of MB and is slow on a phone CPU in a WebView).
- Use a maintained Capacitor plugin that wraps both if one fits; otherwise write a small native plugin per platform. The plugin returns text plus bounding box and confidence per line.
- The web app stays PDF-only in v1.1.
- `www/lib/ocr.js` converts the boxes to the §4.1 line model. Vision's y axis runs bottom-up, which matches pdf.js; x and y are scaled to page points.
- Same parser, same checks, same confirm screen. Fields whose source line has confidence under 0.6 are highlighted on the confirm screen.
- Scanned (image-only) PDFs: render each page with pdf.js to a canvas, then send it through the same OCR path.
- The web demo keeps the PDF path only. The PDF statement from the My Meralco app is the primary input.

---

## 6. Parsing (`parse.js`)

Fitted to a real My Meralco statement (May 2026 layout). Each rule below was confirmed on that statement.

- **Field rule:** match the label, then take the first number after it on the same line. If there is none, look up to 3 lines below for a number within 15 pt of the label's x. On this statement, readings, kWh, multiplier and account number sit under their labels.
- **Billing period:** first `DD Mon YYYY to DD Mon YYYY` in the document.
- **kWh:** `Actual Consumption`, else `(current − previous) × multiplier`.
- **Charges:** only the lines between "Charges for this billing period" and "Total Amount Due" on page 1. Page 2 mixes two text columns on one line and is not parsed. Several labels may share a line; each takes the first number before the next label.
- **Tracker:** two consecutive lines of 12 cells (numbers or `-`), no month labels in the text. Columns are Jan–Dec. The upper row is the billing year, the lower row the year before. `-` and months after the billing period are dropped. The bill's own text confirms the mapping: "+69 kWh vs previous" and "−121 kWh vs same period last year".
- **Zero-kWh months** stay in the tracker (they are evidence for flags) but are left out of the model.
- `shortcut:` markers in the code mark remaining assumptions. Remove one only with a fixture that proves the real format.

---

## 7. Usage model (`model.js`)

Variable-base degree-day change-point regression (ASHRAE Guideline 14 "3PC", CalTRACK billing-period method), fitted per bill. Nothing is trained.

- **Periods:** each tracker month ends on the bill's end day-of-month (shown on screen as an assumption). Zero-kWh months are excluded.
- **Fit:** `y = kWh/day`, weight = days, `x = CDD(bp)/day` from **daily** temperatures. Grid search `bp` from 18.0 to 29.0 °C in 0.5 °C steps. A candidate is rejected if fewer than half the periods have `x > 0`, if `sxx = 0`, or if `b0 < 0` or `b1 < 0`. The highest adjusted R² wins.
- **Tiers:**

| Tier | Condition | UI |
|---|---|---|
| `A_3pc` | ≥ 12 periods and adjusted R² ≥ 0.7 | Weather, billing days and own usage split |
| `B_fixed24` | fixed 24 °C base, adjusted R² ≥ 0.7 | Same split, labelled "simplified" |
| `C_refused` | otherwise | One line: "a change in your usage (we can't separate weather reliably)", plus a deliberate refusal note |

- **Projection:** next period from climatology (same calendar dates, last 10 years), `kWh × this month's rate + fixed`, range ± 1.5 × residual SD × days × rate. Backtest: refit without the last 3 periods and report mean absolute % error. Tier C: last year's same month × (last 3 months ÷ same months a year earlier), needs ≥ 15 printed months. Always labelled "typical weather, not a forecast".
- Real result: the May 2026 golden bill is tier C (adjusted R² 0.28). That is the intended refusal path.

---

## 8. Explanation (`explain.js`)

### 8.1 Rate month detection

- Bill generation ₱/kWh = `generation.amount_php ÷ kWh`; pick the month whose generation rate is closest.
- **If the gap is over ₱0.01/kWh, stop** with "No Meralco rate table matches this bill; add this month's PDF". Never price a bill with a nearby month.
- If the matched month differs from `period_end`'s month, say so in Sources and assumptions.
- The previous month is the one before it in `rates.json`; if missing, stop with a clear message.

### 8.2 Lookup (bracket rule)

Meralco prices all of a month's kWh at the bracket's rate; distribution steps at 200, 300 and 400 kWh. The table has a row at each bracket's top, so **the first row at or above the kWh is used, with no interpolation**. VAT, LFT and energy tax per kWh in that row are computed at the row's kWh; the small difference falls into "local tax and rounding". Above 5,000 kWh the 5,000 row is used.

### 8.3 Change decomposition

```
q0, d0 = previous tracker month kWh and days     q1, d1 = this bill's kWh and days
r0 = rates(previous month, q0)   r1 = rates(this month, q1)   F0, F1 = fixed charges   R0 = r0.total

estPrev  = Σ r0[k]·q0 + F0                 change = charges_this_period − estPrev
usage    = (q1 − q0)·R0
tiers A/B: weather = b1·ΔCDD·R0,  billing_days = b0·(d1 − d0)·R0,  own_usage = usage − weather − billing_days
tier C:    one usage item
per component k: (r1[k] − r0[k])·q1          fixed: F1 − F0          AWAT refunds are components
residual = change − Σ items   → "local tax and rounding"; a warning shows if |residual| > 3% of the bill
```

- The breakdown adds up to `change` within ₱1 (tested on synthetic and real bills).
- The sentence names the 3 largest items by absolute peso and states the remainder.
- Sanity check on the real bill: the estimated April bill (₱9,888) matches the April payment on the statement (₱9,886.30).

### 8.4 Lifeline and senior lines

- The bill's `senior_subsidy` and `lifeline` lines pass through as bill lines; lookup uses non-lifeline rows.
- **Not built:** for a bill of 100 kWh or less, or with a lifeline discount line, show "TANAW did not recalculate the lifeline discount".

---

## 9. Possible billing error (`flags.js`)

### 9.1 Flags

| Key | Rule | Strength |
|---|---|---|
| `readings`, `tracker_latest`, `line_sum`, `total` | The matching check fails | strong |
| `rate_mismatch` | Local tax and rounding over 3% of the bill | strong |
| `unexplained_increase` | User ticked only "nothing changed" or "away", and the unexplained usage change is over max(10%, 2 × the household's median month-to-month swing) of last month's bill | medium |
| `missed_reading` | Last month shows 0 kWh or is missing | medium |
| `spike` | kWh over 1.5 × median of the last 12 months | weak |
| `long_period` | Billing period over 33 days | weak |

Packet strength = the strongest flag. Wording is evidence, never blame. The real golden bill raises no flags, including with "nothing changed" ticked (+11% is within its normal swing).

### 9.2 Household answers

Checkboxes: nothing changed; away or home less; new appliance; more aircon or fans; more people at home; home business or EV/e-bike charging; plus a free-text note. Answers that raise usage show "your answers may explain the rise" and stop the unexplained-increase flag. All answers go into the message and the packet.

### 9.3 Sending

There is no Meralco API, so the user sends.

1. **Send dispute** opens the share sheet with the message and `tanaw-dispute-<date>.json` (My Meralco app, Messenger, Mail, Files).
   - **Android and iOS apps:** the file is written to the app cache (`@capacitor/filesystem`) and shared with `@capacitor/share`. The WebViews have no web share sheet or downloads.
   - **Browsers:** Web Share API with the file. Where sharing files is not supported (most desktops), the file downloads and the message is copied, with paste instructions.
2. After a send (not a cancel), the dispute is saved to **My disputes**. The user can add the channel, date and Meralco reference number.
3. **My disputes** (start screen): days waiting; "time to follow up" from day 14; Send dispute again; Escalate to ERC (message to consumer@erc.ph / 8687-5577 + file with `meralco_follow_up`); Mark resolved; Delete with confirmation.

### 9.4 Staff triage concept (`dashboard.html`)

- Loads dispute files by hand (or 4 SYNTHETIC samples). Same account and period: the newest file wins.
- Sorted by strength, then days waiting, then bill amount.
- Each card shows a suggested action per strength, the evidence, the 4 checks, rates, usage, household answers and the message.
- Every field is escaped; non-TANAW files are skipped with a message.
- Labelled CONCEPT: no Meralco system is connected. For the pitch, it is the screen Meralco would integrate.

---

## 10. Privacy and security

| Control | Implementation |
|---|---|
| No upload | Parsing and modelling run on the device. No runtime `fetch` other than bundled files. No analytics. |
| Persistence | Bills, images and passwords are never stored. **Exception, user-initiated:** a dispute the user sends is kept in local storage (account number, readings, charges, answers) for follow-up, and can be deleted. |
| Sharing | Data leaves the device only through the share sheet, after the user reviews the message. |
| PDF password | In memory for one open, cleared after; never logged or stored. |
| Untrusted text | Bill text, user input and loaded dispute files are escaped before insertion (`esc`); tested with an HTML/script payload. |
| Data integrity | Rate rows validated at build and load; pinned dependency versions. |
| Repo hygiene | Real bills live in `data/private/` (gitignored); never commit them. |
| Data Privacy Act | No personal data is collected or held by TANAW. Sharing is the user's own act. |

---

## 11. Deployment

- **Dev / demo:** `npm install` (copies pdf.js legacy build to `www/vendor`), `npm start`, then open `http://localhost:8000` (app) and `/dashboard.html` (staff concept).
- **Data refresh (online, before the event):** `npm run rates`, `npm run weather`, `npm run synthetic`, `npm test`. Commit `www/data/`.
- **Web:**
  - Publish `www/` to any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages). HTTPS is required for the service worker, clipboard and sharing.
  - `sw.js` precaches the app, pdf.js, data and samples. Fetches go network-first, so a new deploy (code or `rates.json`) is picked up when online; the cache serves offline. Bump `CACHE` in `sw.js` when the file list changes.
  - A test fails if `sw.js` precaches a missing file or misses a `lib/` module.
  - Users can "Add to Home Screen" from Chrome (Android) or Safari (iOS).
- **Android:**
  - `.github/workflows/android.yml` builds a debug `app-debug.apk` on a Linux runner (Java 17). Install it directly ("install unknown apps").
  - A Play Store release needs `assembleRelease` signed with your keystore.
  - Local build on Windows: install Android Studio, then `npm run android`.
- **iOS:**
  - `.github/workflows/ios.yml` builds an unsigned `TANAW-unsigned.ipa` on a macOS runner. Install it by re-signing with Sideloadly or AltStore; a free Apple ID expires in 7 days. TestFlight needs a paid developer account.
  - Minimum iOS 15 (top-level `await` in `app.js`).
- **Both apps:** Capacitor 6, `webDir: www`, appId `ph.tanaw.app`. The service worker is not registered inside the apps.
- **Offline:** the apps bundle all data and code. The web app is offline after its first visit.

---

## 12. Error handling and degradation

| Condition | Behaviour |
|---|---|
| Password-protected PDF | Password field; "wrong password" on retry |
| PDF without text | Clear error (OCR is v1.1) |
| Self-check fails | Fields highlighted on confirm; user corrects; failing checks also become strong flags |
| No rate table for the bill's month | Stop: "add this month's Meralco PDF" |
| No previous rate month / fewer than 2 tracker months | Stop with a clear message |
| Weak usage-temperature fit | Tier C refusal, shown deliberately |
| Weather gap | `temps()` throws; the error is shown; nothing is filled in |
| Residual over 3% | Warning row + `rate_mismatch` flag |
| Share sheet unavailable or cancelled | Download + copy fallback / nothing saved |
| Local storage unavailable | "Couldn't save on this phone. Keep the evidence file instead." |

Rule: show less, never invent.

---

## 13. Performance targets

| Metric | Target | Measured |
|---|---|---|
| PDF upload to confirm screen | under 2 s | Well under 1 s on a laptop; not yet on an iPhone |
| Analysis after confirm | under 1 s | Instant on a laptop |
| Photo OCR, one page (v1.1) | under 3 s with Apple Vision | Not built |

---

## 14. Testing (`npm test`)

Implemented:

| Test | Asserts |
|---|---|
| Rates | Every row of Jan–Oct 2026 adds up; Sep/Oct @ 200 kWh totals; May generation |
| Bracket lookup | 250 kWh uses the 201–300 distribution rate; the top row is used above the table |
| Parse | Synthetic good/weak PDFs match truth exactly; the real golden bill (if `data/private/golden_bill.pdf` exists) matches every field, charge and tracker month |
| Checks | Corrupt kWh fails `readings` and `tracker_latest` only |
| Model | Recovers baseload, slope and balance point within 10% on real weather; pure noise lands in tier C |
| Explain | Breakdown adds up within ₱1; residual under 3% on synthetic bills |
| Flags | Clean bills raise none; a doctored bill raises all six kinds in order |
| Household answers | "Nothing changed" + big rise flags; a usage-raising answer clears it; no answers, no claim |
| Packet, disputes | Strength ranking, JSON round trip, ERC message and follow-up fields, 14-day count |
| Dashboard samples | Samples cover all three strengths and an ERC escalation |

Browser checks (headless, run by hand): upload the real PDF, all 4 checks pass, results render, no console errors; Send dispute; My disputes after reload; ERC export; dashboard order and HTML-injection payload.

To add: reasons attribution gate; lifeline warning; v1 scope guard (no solar UI); OCR fixtures (v1.1); run on a real iPhone.

---

## 15. Dependencies

| Dependency | Use |
|---|---|
| `pdfjs-dist` 4.10.38 (legacy build) | PDF text extraction |
| `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/cli` 6.2.0 | iOS and Android packaging |
| `@capacitor/share`, `@capacitor/filesystem` 6.0.0 | Sending a dispute from the apps |
| `pdf-lib` 1.17.1 (dev) | SYNTHETIC fixture PDFs |
| Apple Vision / ML Kit via a Capacitor plugin (v1.1) | Photo OCR in the apps |

No server framework, database, auth provider, LLM or third-party API at runtime.

---

## 16. Open questions and gates

| ID | Question | Status |
|---|---|---|
| G-1 | Real bill corpus | **Partial:** one real statement (May 2026) parses exactly. Need more: lifeline, senior, refunds, other layouts, an estimated reading |
| G-2 | OCR engine | **Decided:** Apple Vision on iOS, ML Kit on Android (§5) |
| G-3 | Rate tables | **Done:** Jan–Oct 2026, validated |
| G-4 | Meralco narrative reasons with a stable URL | Open |
| G-5 | Weather licence | **Done:** Open-Meteo, CC BY 4.0, attributed on screen |
| G-6 | Scanned PDFs | **Decided:** render with pdf.js, then OCR (v1.1) |
| G-7 | Follow-up deadline | Open: 14 days is a placeholder; confirm against ERC and Meralco rules |
| G-8 | Meralco hotline 16211 | Open: printed on the bill without a label; confirm before the demo |
| G-9 | Sharing inside the apps | **Decided:** native Share + Filesystem plugins. Open: test on one iPhone and one Android phone |
| G-10 | Android and iOS builds | Open: run both workflows once and install on real devices |
| G-11 | Web host | Open: pick a static HTTPS host and publish `www/` |

---

## 17. Decisions where the earlier draft and the code differed

| Topic | Earlier draft | Chosen | Why |
|---|---|---|---|
| Delivery | PWA; iOS deferred | Web app + Android `.apk` + iOS `.ipa`, all from `www/` | Team needs iOS and Android; Capacitor wraps the same web code, so a third target costs one workflow |
| Service worker | Required | Web only, network-first | Makes the web app installable and offline; the apps don't need it |
| Sharing | Not in draft | Native plugins in the apps, Web Share in browsers | Android's WebView has no web share sheet or downloads |
| OCR | PaddleOCR ONNX in the browser | Native OCR via a Capacitor plugin in the apps (Apple Vision on iOS, ML Kit text recognition on Android), v1.1; web app stays PDF-only | No model download, native speed, PDF path is primary |
| Rate source | Summary Schedule, VAT-exclusive, schema v2 brackets | "Residential Bills at Typical Consumption Levels", validated per row | Already residential, includes VAT/LFT/energy tax, and prints a total to check every row |
| Rate lookup | Bracket | Bracket (first row ≥ kWh) | Matches how Meralco bills; the earlier code's interpolation was off up to ~₱40 between brackets |
| Rate month mismatch | Warn, use closest | Stop if the generation gap > ₱0.01/kWh | A wrong month would invent pesos |
| Bp grid | 18.0–40.5 °C | 18.0–29.0 °C | Manila daily means stay in this range |
| Parsing | MM/DD/YYYY, month-label tracker, same-line values, city | Real statement layout (§6) | Confirmed on a real bill |
| Weather location | Bill city | Metro Manila | No address-derived location leaves the device |
| Persistence | None | None, except disputes the user sends | Follow-up needs the record; the user can delete it |
| Solar | Removed | Remove the UI before v1 acceptance; keep `solar.js` | Challenge 2 only; reusable for Challenge 1 |
| Billing-error disputes | Not in draft | Flags, household answers, packet, follow-up, ERC, staff concept | Team decision; evidence-only and user-sent |
