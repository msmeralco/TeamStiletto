# TANAW: why did my Meralco bill change?

Runs entirely on the device (iPhone or browser). No backend, no login, no network calls after install.

```
npm install          # also copies pdf.js into www/vendor
npm run synthetic    # (re)generate SYNTHETIC rates/weather/sample bills
npm test             # plan section 6 tests
npm start            # http://localhost:8000
```

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

## Everything in `www/data` is SYNTHETIC
To replace it, put real numbers in `rates.json` (same shape; `validateRates` must pass), Open-Meteo daily means in `weather.json` (`{start, t:[...]}`), and fix the label regexes in `parse.js` against a real bill. Search the code for `shortcut:` to find every placeholder.
