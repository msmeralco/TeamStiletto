# TANAW: why did my Meralco bill change?

Meralco IDOL Hackathon 2026, Challenge 2 (Know Your Bill, Manage Your Usage).

One codebase (`www/`), three ways to ship it: web app, Android app, iOS app. Everything runs on the device: no backend,
no login, no network calls at runtime. Full design: [docs/tech_spec.md](docs/tech_spec.md).

## What it does
1. **Read the bill.** Open your My Meralco PDF statement (password-protected PDFs work too). TANAW reads every field and the 17-month usage tracker, runs 4 self-checks, and lets you correct anything before going on.
2. **Explain the change.** It splits the change from last month into pesos: rate changes (real Meralco rate tables, Jan to Oct 2026), weather (real Metro Manila temperatures), and your own usage. It writes this up as a plain sentence and quotes Meralco's own advisory for the reason when one is available.
3. **Project next month** from a usage model fitted to your tracker history.
4. **Spot possible billing errors** (9 kinds of flag, each rated strong, medium or weak). A chat in English or Taglish asks "What changed at home?" (new aircon, guests, etc.) so real usage changes aren't mistaken for errors.
5. **Send a dispute.** Your phone's share sheet sends a ready-made message plus a dispute file. **My disputes** keeps track of each one on the phone and, after 14 days without an answer, prepares an escalation to the ERC (Energy Regulatory Commission).
6. **Staff triage dashboard** (`/dashboard.html`, a concept only: it isn't connected to any Meralco system). Load dispute files and they're sorted by flag strength, days waiting and bill amount.

Not built yet: reading a photo of a paper bill or a scanned PDF (planned for v1.1), and a warning for lifeline and senior-citizen discount lines.
The Android and iOS builds are set up but haven't been tested on a phone yet.

## Project layout
| Path | What's in it |
|---|---|
| `www/` | The app: `index.html`, `app.js`, `style.css`, web app files (`sw.js`, `manifest.webmanifest`, icons), staff `dashboard.*` |
| `www/lib/` | `extract` (PDF to text) → `parse` (bill fields) → `checks` → `model` (usage model, projection) → `explain` (peso breakdown) → `flags` (billing errors, dispute file) → `disputes` (follow-up, ERC escalation); `chat` (What changed at home?), `solar` (outside Challenge 2) |
| `www/data/` | `rates.json`, `weather.json`, `reasons.json`, and SYNTHETIC sample files in `fixtures/` |
| `scripts/` | The data build scripts and the dev server (commands below) |
| `tests/` | `selfcheck.mjs`, which is all of `npm test` |
| `docs/tech_spec.md` | Technical spec that matches the code |
| `requirements.md`, `tech_spec.md`, `hackathon_challenges.md` | Requirements, the earlier draft of the spec, the official challenge text |

## Commands
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

## Demo laptop setup (everything runs on the GPU laptop)
The "what changed at home?" chat reads answers with keyword rules first. Messages the rules can't read go to a local model
(Ollama) through `npm start`; without Ollama the chat still works on rules only. Nothing goes to the cloud.
Target laptop: i5-11400H, 16 GB RAM, RTX 3050 Ti (4 GB VRAM).

**One-time install** (needs internet):
1. Install [Git](https://git-scm.com), [Node.js 20 LTS](https://nodejs.org) and [Ollama](https://ollama.com).
   Update the NVIDIA driver too: Ollama uses the GPU automatically when the driver is recent.
2. Get the code and its dependencies:
   ```
   git clone https://github.com/msmeralco/TeamStiletto.git
   cd TeamStiletto
   npm install
   ```
   Rates, weather and Meralco advisories are already in the repo (`www/data/`); no fetch scripts are needed for the demo.
3. Download the model (~1.9 GB, fits in 4 GB VRAM): `ollama pull qwen2.5:3b`

**Each demo:**
1. Make sure Ollama is running (its icon is in the system tray; start "Ollama" from the Start menu if not).
2. In the `TeamStiletto` folder: `npm start`. Wait for both lines:
   `TANAW on http://localhost:8000` and `Chat model qwen2.5:3b loaded (Ollama)`.
   "Ollama not running" means step 1 was missed; "Ollama has no qwen2.5:3b" means the pull did not finish.
3. Open `http://localhost:8000` (the app) and `http://localhost:8000/dashboard.html` (the case dashboard).
4. Optional check that the GPU is used: after the first chat message, `ollama ps` should show `100% GPU`.

Updating before a demo: `git pull`, then `npm install` if `package.json` changed. The model stays downloaded.
Other model: PowerShell `$env:OLLAMA_MODEL="gemma3:4b"; npm start` (pull it first). Avoid 7B+ on 4 GB VRAM: it spills to the
CPU and gets several times slower. Phones on the same Wi-Fi can open `http://<laptop IP from ipconfig>:8000` if Windows
Firewall allows Node.js on the private network (it asks on the first `npm start`); without HTTPS the offline install is off.

The model never sets watts or kWh: it only picks from the answer types and appliance list in `www/lib/chat.js`, and its
output is checked again in the browser. Dispute files record `parser: "rules + qwen2.5:3b"` when the model read an answer.

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
