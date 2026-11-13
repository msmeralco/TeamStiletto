# TANAW: why did my Meralco bill change?

Meralco IDOL Hackathon 2026, Challenge 2 (Know Your Bill, Manage Your Usage).

One codebase (`www/`), shipped for now as a web app served from the demo laptop (`npm start`); Android and iOS builds are set up too.
Reading and explaining a PDF bill happens on the device, with no login. Three things use the laptop's server, and each is
optional: sending a dispute to the demo dashboard, the Taglish chat's local model (Ollama), and scanning a paper bill (PaddleOCR).
Full design: [docs/tech_spec.md](docs/tech_spec.md).

## What it does
1. **Read the bill.** Open your My Meralco PDF statement (password-protected PDFs work too), or **scan a paper bill** (beta: the photo is sent to the laptop and read by PaddleOCR; blurry numbers are marked yellow for you to check). TANAW reads every field and the 17-month usage tracker, runs 4 self-checks on page 1 and, for a PDF, recomputes page 2 ("How your bill was computed": every line's base × price, each group's sum, VAT, the totals; 19 checks listed in `www/data/bill_spec.json`) from the bill's own numbers, and lets you correct anything before going on. A check is skipped, never guessed, when a number it needs wasn't read.
2. **Explain the change.** It splits the change from last month into pesos: rate changes (real Meralco rate tables, Jan to Oct 2026), weather (real Metro Manila temperatures), and your own usage. It writes this up as a plain sentence and quotes Meralco's own advisory for the reason when one is available.
3. **Project next month** from a usage model fitted to your tracker history.
4. **Spot possible billing errors** (9 kinds of flag, each rated strong, medium or weak, plus a strong flag for any page-2 check that doesn't add up). A chat in English or Taglish asks "What changed at home?" (new aircon, guests, etc.) so real usage changes aren't mistaken for errors. The same chat answers questions from the bill, Meralco's Help FAQs and that month's Meralco advisory, quoting Meralco word for word with a link.
5. **Send a ticket.** TANAW tells the customer whether the case needs Meralco (strong or medium evidence, or a question the chatbot could not answer) or is already answered by the chatbot. "Send ticket to Meralco" posts a ready-made message plus a dispute file to the case dashboard, which files it under Meralco tickets or Handled by chatbot (you can still send it yourself through the share sheet). **My disputes** keeps track of each one on the phone, shows the staff's reply, and after 14 days reminds the customer to follow up with Meralco.
6. **Staff triage dashboard** (`/dashboard.html`, a concept only: it isn't connected to any Meralco system). Disputes sent from the app appear by themselves within a few seconds, sorted by flag strength, days waiting and bill amount. Staff can reply or mark a case resolved, and the customer's phone shows it.
7. **If you had solar panels** (a Challenge 1 crossover, added on request). Three rooftop sizes from the last 12 months of usage, with payback and **this bill recomputed as if the panels were there** (home use saves the bill's full ₱/kWh, exports are credited at its generation charge). An optional, opt-in form sends a solar lead for MSpectrum (Meralco's solar company) to the laptop server (`POST /api/leads`, kept in `data/private/leads.json`); the dashboard lists them under **Solar leads**. Only with a ticked consent box and a Philippine mobile number, and never the account number or the bill. Concept: no MSpectrum system is connected.

Not built yet: scanned PDFs (only photos go through OCR), live camera framing for the scan, and a warning for lifeline and senior-citizen discount lines.
The Android and iOS builds are set up but haven't been tested on a phone yet.

## Project layout
| Path | What's in it |
|---|---|
| `www/` | The app: `index.html`, `app.js`, `style.css`, web app files (`sw.js`, `manifest.webmanifest`, icons), staff `dashboard.*` |
| `www/lib/` | `extract` (PDF to text) → `parse` (bill fields) → `checks` → `model` (usage model, projection) → `explain` (peso breakdown) → `flags` (billing errors, dispute file) → `disputes` (follow-up, ticket routing); `chat` (What changed at home?, questions), `faq` (Meralco FAQ search), `ocr` (PaddleOCR words → the same text lines as a PDF), `solar` (solar options, bill with solar, opt-in lead; Challenge 1 crossover) |
| `www/data/` | `rates.json`, `weather.json`, `reasons.json`, `bill_spec.json` (what to read from a bill and the arithmetic it must satisfy), and SYNTHETIC sample files in `fixtures/` |
| `scripts/` | The data build scripts, the dev server `serve.mjs` (case inbox, chat model, OCR), `ocr.py` (PaddleOCR worker) and `validate_bill.mjs` (check real bill PDFs from the command line) |
| `tests/` | `selfcheck.mjs`, which is all of `npm test`, and its SYNTHETIC expected values and OCR word samples |
| `docs/` | `tech_spec.md` (technical spec that matches the code), `requirements.md` (v1 requirements), `update.md` (status snapshot) |
| `pitch/` | The pitch slides (`index.html`, speaker notes inside), `brief.md`, and `serve.mjs` (`node pitch/serve.mjs` → http://localhost:8080) |
| `hackathon_challenges.md`, `AGENTS.md` | The official challenge text, and rules for AI assistants working in this repo |

Kept on each laptop and not committed (see `.gitignore`): `node_modules/`, `www/vendor/` (made by `npm install`),
`data/private/` (real bills, dispute cases), `data/rates_pdfs/`, `android/`, `ios/`, and the personal working folders
`felice-skills/` and `felice-artifacts/`.

## Commands
```
npm install          # also copies pdf.js (legacy build, for older phones) into www/vendor
npm run rates:fetch  # Meralco "Monthly Rate Summary" (meralco.com.ph/residential/rates-and-charges) -> data/rates_pdfs/*.pdf + sources.json  (needs internet)
npm run rates        # data/rates_pdfs/*.pdf (Meralco, Jan-Oct 2026) -> www/data/rates.json
npm run weather      # Open-Meteo daily temps (Metro Manila) -> www/data/weather.json  (needs internet, once)
npm run advisories   # Meralco monthly rate advisories (meralco.com.ph/media/advisories, 2025 on) -> www/data/reasons.json  (needs internet)
npm run faqs         # Meralco Help FAQs (meralco.com.ph/help/faqs/*) -> www/data/faqs.json  (needs internet)
npm run synthetic    # SYNTHETIC sample bills and dispute files, priced at the real rates
npm run scenarios    # 71 SYNTHETIC scenario bills (one per situation) + their dispute files, with expected results; picked from "More SYNTHETIC test bills" in the app
node scripts/validate_bill.mjs <bill.pdf> [more.pdf]   # read real bills as the app does and check their own arithmetic (add --json to see what was read)
npm test             # all tests (+ the real golden bill if data/private/golden_bill.pdf exists)
npm start            # refreshes Meralco rates and FAQs first (skipped with a note if offline), then http://localhost:8000  (case dashboard: /dashboard.html; PORT=8001 npm start for another port)
```
New rate month: `npm run rates:fetch && npm run rates`, then `npm run advisories` for Meralco's explanation of that month.
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
   Rates, weather, Meralco advisories and FAQs are already in the repo (`www/data/`); no fetch scripts are needed for the demo.
3. Download the model (~1.9 GB, fits in 4 GB VRAM): `ollama pull qwen2.5:3b`
4. For "Scan a paper bill": install [Python 3.12](https://www.python.org) with **Add python.exe to PATH** ticked, then
   `pip install paddlepaddle paddleocr`. The first scan downloads the OCR models (needs internet once).
   If Python is not on PATH, start with PowerShell `$env:OCR_PYTHON="C:\path\to\python.exe"; npm start`.
   Without it the app simply hides the Scan button.
   A page takes about 25 seconds on a laptop CPU with the default (mobile) models. With `pip install paddlepaddle-gpu` instead,
   PowerShell `$env:OCR_MODELS="server"; npm start` uses the larger models.

**Each demo:**
1. Make sure Ollama is running (its icon is in the system tray; start "Ollama" from the Start menu if not).
2. In the `TeamStiletto` folder: `npm start`. Wait for these lines:
   `TANAW on http://localhost:8000`, `Chat model qwen2.5:3b loaded (Ollama)` and `Scan a paper bill: PaddleOCR ready`.
   "Ollama not running" means step 1 was missed; "Ollama has no qwen2.5:3b" means the pull did not finish.
3. Open `http://localhost:8000` (the app) and `http://localhost:8000/dashboard.html` (the case dashboard).
4. Optional check that the GPU is used: after the first chat message, `ollama ps` should show `100% GPU`.

**Check before each demo** (about 5 minutes, phone on the same Wi-Fi at `http://<laptop IP>:8000`):
1. Phone: "Try sample bill" → change "Charges for this billing period" to a wrong number → "Looks right, explain my bill" → "Send dispute to Meralco".
   Laptop `/dashboard.html`: the case appears within about 5 seconds, with no click.
2. Dashboard: open the case, type a reply, "Send reply". Phone start screen: "Meralco replied: …" appears within about 10 seconds.
3. Chat: ask five questions in Taglish, about rates ("bakit tumaas ang generation charge?") and about the bill itself
   ("bakit tumaas ang bill ko?", "ilang kWh ang nagamit ko?"). Each answer must be a "Sa bill mo (from your bill)" line, a quoted advisory paragraph with a
   meralco.com.ph link, or "Not in your bill or Meralco's advisory".
4. Scan: print a bill, tap "Scan a paper bill", take the photo flat, in good light, with the page filling the frame.
   The numbers should arrive on "Check the numbers we read"; fix any yellow or red field.
Sent cases are kept in `data/private/cases.json`; delete that file to empty the dashboard.

Updating before a demo: `git pull`, then `npm install` if `package.json` changed. The model stays downloaded.
Other model: PowerShell `$env:OLLAMA_MODEL="gemma3:4b"; npm start` (pull it first). Avoid 7B+ on 4 GB VRAM: it spills to the
CPU and gets several times slower. Phones on the same Wi-Fi can open `http://<laptop IP from ipconfig>:8000` if Windows
Firewall allows Node.js on the private network (it asks on the first `npm start`); without HTTPS the offline install is off.

The model never sets watts or kWh: it only picks from the answer types and appliance list in `www/lib/chat.js`, and its
output is checked again in the browser. Dispute files record `parser: "rules + qwen2.5:3b"` when the model read an answer.

Questions ("bakit tumaas?", "saan makikita ang CAN ko?") are answered only from three sources, never in the model's own words:
bill facts (`billFacts` in `www/lib/chat.js`: sentences the app writes from the bill's own numbers and the peso breakdown),
Meralco's Help FAQs (`www/data/faqs.json`, ~380 questions) and Meralco's monthly rate advisories. At most two are shown: a
question about the customer's own bill gets their figure plus the advisory (why it moved this month) or a FAQ; any other
question gets Meralco's FAQ answer, with the advisory as support. Each quote carries its meralco.com.ph link.
FAQ search (`www/lib/faq.js`) maps common Taglish words to the FAQ's English, and only uses a FAQ about one month
("…this April?") for a bill of that month.
The model (endpoint `/api/answer`) does three small jobs, all limited to fixed choices: it names the question's topic from a
fixed list (`TOPIC_PROMPT` + `TOPIC_SCHEMA`), which the app maps to one of its own bill facts; it returns the number of the
advisory paragraph that answers the question, or `null` (`ANSWER_PROMPT` + `answerSchema`); and it picks the FAQ that asks the
same thing from a keyword shortlist of 8, or `null` (`FAQ_PROMPT` + `faqSchema`). The app then shows its own copy word for word,
or says nothing covers it and points to the 16211 hotline (and the question goes into the customer's Meralco ticket).
The model never sees the bill or any of its numbers: only the question is sent. Checks in code drop a topic the question has
no word for, any question naming another month (`fromModelTopic`), and any FAQ not on the browser's own shortlist
(`fromModelFaq`). The server reads the advisory and FAQs from its own `www/data`.

## Web app
Run `npm install` first (it puts pdf.js in `www/vendor/`, which is not committed), then publish the `www/` folder to
any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages). It can be installed
("Add to Home Screen") and works offline after the first visit. If you add a file to `www/`, add it to `FILES` in
`www/sw.js` and bump `CACHE`; `npm test` fails if the list is wrong.
On a static host only the PDF reading and explanation work. Sending a dispute to the dashboard, the chat's local model and
scanning a paper bill need the laptop server (`npm start`); the app hides what is missing and the share-sheet route still works.

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
