# TANAW: why did my Meralco bill change?

Runs entirely on the device (iPhone or browser). No backend, no login, no network calls after install.

```
npm install          # also copies pdf.js (legacy build, for older iOS Safari) into www/vendor
npm run rates        # data/rates_pdfs/*.pdf (Meralco, Jan-Oct 2026) -> www/data/rates.json
npm run weather      # Open-Meteo daily temps (Metro Manila) -> www/data/weather.json  (needs internet, once)
npm run synthetic    # SYNTHETIC sample bills priced at the real rates
npm test             # plan section 6 tests (+ the real golden bill if data/private/golden_bill.pdf exists)
npm start            # http://localhost:8000
```
New rate month: drop its "Residential Bills at Typical Consumption Levels" PDF in `data/rates_pdfs/` and `npm run rates`.
If Meralco changed the columns again, the script stops and prints the header to add to `LAYOUTS`.

## iOS (.ipa)
- **No Mac:** push to GitHub. `.github/workflows/ios.yml` builds `TANAW-unsigned.ipa` on a macOS runner (Actions → run → Artifacts). Sideload it with Sideloadly or AltStore (they re-sign it with your Apple ID). TestFlight needs an Apple Developer account and signing secrets.
- **With a Mac:** `npx cap add ios`, then `npm run ios`, then Run in Xcode.

## Changes from the original plan
| Plan | Here | Why |
|---|---|---|
| Python/FastAPI backend | Same modules in JS under `www/lib/` | An iPhone can't run a Python server; on-device also means it works offline |
| PaddleOCR photo path | Not built | Use Apple Vision through a Capacitor plugin when Phase 2 starts |
| `build_rates.py`, `fetch_weather.py` | Not built; `scripts/make_synthetic.mjs` writes data files in the same format | Waiting on Gate 0: the real Meralco PDFs |

Module map: `extract.js` (PDF → lines), `parse.js`, `checks.js`, `model.js` (weather, 3PC fit, projection), `explain.js` (rates, breakdown, sentence), `solar.js`, `app.js` (UI).

## Data
Rates and weather are real. Only the two sample bills are SYNTHETIC. The parser is fitted to a real May 2026 My Meralco statement.
Search the code for `shortcut:` to find every remaining placeholder.
