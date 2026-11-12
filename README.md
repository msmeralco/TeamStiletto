# TANAW: why did my Meralco bill change?

One codebase (`www/`), three ways to ship it: web app, Android app, iOS app. Everything runs on the device: no backend,
no login, no network calls at runtime. Full design: [docs/tech_spec.md](docs/tech_spec.md).

```
npm install          # also copies pdf.js (legacy build, for older phones) into www/vendor
npm run rates        # data/rates_pdfs/*.pdf (Meralco, Jan-Oct 2026) -> www/data/rates.json
npm run weather      # Open-Meteo daily temps (Metro Manila) -> www/data/weather.json  (needs internet, once)
npm run advisories   # Meralco monthly rate advisories (meralco.com.ph/media/advisories) -> www/data/reasons.json  (needs internet)
npm run synthetic    # SYNTHETIC sample bills and dispute files, priced at the real rates
npm test             # all tests (+ the real golden bill if data/private/golden_bill.pdf exists)
npm start            # http://localhost:8000  (case dashboard: /dashboard.html; PORT=8001 npm start for another port)
```
New rate month: drop its "Residential Bills at Typical Consumption Levels" PDF in `data/rates_pdfs/` and run `npm run rates`.
If Meralco changed the columns again, the script stops and prints the header to add to `LAYOUTS`.

## Web app
Run `npm install` first (it puts pdf.js in `www/vendor/`, which is not committed), then publish the `www/` folder to
any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages). It can be installed
("Add to Home Screen") and works offline after the first visit. If you add a file to `www/`, add it to `FILES` in
`www/sw.js` and bump `CACHE`; `npm test` fails if the list is wrong.

## Android (.apk)
- **No setup:** push to GitHub. `.github/workflows/android.yml` builds `app-debug.apk` (Actions, then the run, then Artifacts). Install it on the phone after allowing "install unknown apps".
- **On this PC:** install Android Studio, then `npx cap add android` once, then `npm run android` and press Run.
- Play Store: build a signed release (`assembleRelease`) with your own keystore.

## iOS (.ipa)
- **No Mac:** push to GitHub. `.github/workflows/ios.yml` builds `TANAW-unsigned.ipa` on a macOS runner. Sideload it with Sideloadly or AltStore (they re-sign it with your Apple ID). TestFlight needs an Apple Developer account and signing secrets.
- **With a Mac:** `npx cap add ios`, then `npm run ios`, then Run in Xcode.

## Data
Rates and weather are real. Only the sample bills and sample dispute files are SYNTHETIC. The parser is fitted to a real
May 2026 My Meralco statement. Keep real bills in `data/private/` (gitignored) and never commit them.
Search the code for `shortcut:` to find every remaining placeholder.
