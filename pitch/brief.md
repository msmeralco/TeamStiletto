# Pitch site brief: TANAW

The `pitch-web-developer` agent builds `pitch/` from this and copies text **exactly as written here**.
Source flow: `felice-artifacts/presentation-flow-v2.md`. Nothing outside `pitch/` may be changed, and nothing is committed or pushed to git.

## Event and room

| Item | Value |
|---|---|
| Time limit (pitch only, seconds) | 300 |
| Q&A length | unknown |
| In person / online / recorded | in person (assumed) |
| Presenting laptop and OS | Windows 11 GPU laptop (i5-11400H, RTX 3050 Ti) |
| Display | unknown; assume projector 1920×1080 |
| Room lighting | unknown; default light theme |
| Internet on stage | not needed (everything local); assume none |
| Clicker | unknown; support keyboard + clicker keys |

## Look

| Item | Value |
|---|---|
| Match the product's look? | yes: colors and feel from `www/style.css` |
| Colors | primary `#F26522` (Meralco orange), ink `#C24E12`, text `#111`, bg `#fff`, tint `#FFF3EC`, soft `#F4F4F2`; dark theme per `www/style.css` dark block. Text on orange is black, never white (contrast). |
| Font | system stack, same as product: `Inter, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif` (no web fonts) |
| Logo | `www/logo.png` (current product logo), copied to `pitch/assets/logo.png` and used as an `<img>`; do not edit product files |
| Theme default | light |

## Demo

| Item | Value |
|---|---|
| Demo app URL | `http://localhost:8000` (app) and `http://localhost:8000/dashboard.html` (staff dashboard) |
| How to start it | `npm start` in the repo root (app). Pitch site runs on its own port 8080. |
| Open in | **embedded iframe** — see layout below — plus an "Open in window" button as fallback |
| Demo slide layout | Two panes on the stage. Pane 1 (always visible): the app in a phone-width iframe (~420 px wide, full stage height, centered-left, thin device-style frame). Pane 2 (hidden until build step `data-step="1"`): the dashboard in a wide iframe to the right. Hint line under the panes: "Click outside the frames or press Esc to return to the slides." |
| Demo path reminder (one line on the demo slide) | sample bill → checks → explain → hot vs cool months → next month → planted ₱500 error → dispute → dashboard |
| Backup video | `pitch/assets/demo.mp4` — **to record** (open item). The V key must fail gracefully (show "backup video not recorded yet" caption) while the file is absent, and `check.mjs` lists it as an open item, not a hard failure. |
| Demo step screenshots | to capture (open item). Until then the demo backup slides are text cards (defined below) with no image references. |

## Slides

Main slides, in order. Total time 286 s ≤ 300 s (14 s spare for the app intro animation and slippage).

```
### id: hook
layout: big-number
time: 20
speaker: A
headline: 879 billing complaints in one year.
body: |
  +243 more for bills that were just "unusually high"
  ERC, 2026 — Rappler, 2026-07-13
visual: the big number 879; TANAW logo + wordmark small in a corner
status-label: none
notes: |
  A: Last year, the Energy Regulatory Commission logged 879 complaints about meter errors, estimated bills and billing adjustments — plus 243 more for bills that were just "unusually high." Behind every one is a household staring at a total, with no reason.
```

```
### id: problem
layout: statement
time: 20
speaker: A
headline: The bill gives you a total, not a reason.
body: |
  generation · transmission · distribution · taxes
  Which one changed? The bill never says.
visual: a stylized bill column of the four line names above, each with a "?" where the change would be (build in HTML/CSS; no fake numbers)
status-label: none
notes: |
  A: Your Meralco bill lists every charge: generation, transmission, distribution, taxes. It never says which one changed — or whether the jump came from Meralco's rates, a hotter month, a longer billing period, or how you used electricity. So people pay bills they don't trust, or queue at a hotline with no evidence.
```

```
### id: challenge
layout: quote
time: 15
speaker: A
headline: Challenge 2, taken literally.
body: |
  "How might we help customers understand what makes up their electricity bill, use their own consumption data to manage their usage?"
visual: in the quote, bold these three phrases: "understand what makes up their electricity bill", "their own consumption data" and "manage their usage"
status-label: none
notes: |
  A: The challenge asked: "How might we help customers understand what makes up their electricity bill, use their own consumption data to manage their usage?" We took it literally, both halves: understand the bill, and manage the usage. One customer, one bill, their own data. We'll show both.
```

```
### id: solution
layout: split
time: 18
speaker: A
headline: Why your bill changed, and what to do next month.
body: |
  Your bill rose ₱475, from ₱3,272 to ₱3,747. Using 26 kWh more added ₱391 (a hotter month added ₱482, a shorter billing period took off ₱90). Meralco's rates added ₱84 (higher: ₱15.42 per kWh now, ₱15.08 before).
visual: |
  right pane: a result card styled like the app (orange header strip), the body sentence above as its text, and under it a small horizontal bar chart from these exact values, label left of each bar:
  A hotter month: +482
  Shorter billing period: −90
  Meralco's rates: +84
  Total change: +475  (highlight this bar in orange; grey the rest)
  caption under the chart: "SYNTHETIC sample output, real Meralco rates"
status-label: Built (sample bill)
notes: |
  A: So we built TANAW. Give it your bill — the PDF, or a photo of the paper one — and it tells you why it changed, in pesos. Then it shows how your hot and cool months compare, and a range for next month. And when the bill itself is wrong, it helps you prove it. [B] will show you.
```

```
### id: demo
layout: demo
time: 110
speaker: B (C drives)
headline: Live demo
body: sample bill → checks → explain → hot vs cool months → next month → planted ₱500 error → dispute → dashboard
visual: the two iframes described in the Demo section; dashboard pane appears on build step 1; "Open in window" button; V = backup video
status-label: Sample data
notes: |
  B (1:15): This is a sample household — the banner says so — priced at Meralco's real published rates. We open its statement. TANAW reads it and shows the three numbers that matter: billing period, kilowatt-hours, charges. Behind them, it has already checked the bill against itself — readings versus kWh, the history, the charges against the total — and recomputed page two line by line. All of it adds up. Every number is one tap away if you want to fix it.
  B (1:35): "Looks right — explain my bill." [pause] There's the answer, in one sentence. [read it: "Your bill rose ₱475, from ₱3,272 to ₱3,747. Using 26 kWh more added ₱391 (a hotter month added ₱482, a shorter billing period took off ₱90). Meralco's rates added ₱84."] The bar shows two causes: how you used electricity, and Meralco's rates. Tap for the detail; every line names its source.
  B (2:05): Now the second half of the challenge — managing usage. [C scrolls to "Hot months vs cool months" and taps the hottest month] This month: this many kWh a day, this far above your average. Orange bars are hotter months, grey are cooler. And next month — a range, not a forecast: ₱2,984 to ₱3,061, about 195 kWh. That's the target.
  B (2:30): But what if the bill itself is wrong? We go back, tap "See or fix every number we read", and make this bill overcharge by five hundred pesos. [C edits "Charges for this billing period" +500] The self-check fails instantly — and TANAW grades the evidence: strong, because the bill's own arithmetic doesn't add up. One tap: send ticket to Meralco. On a normal bill, sending is still possible, but it stays one tap away.
  B (2:50): Now the staff side. [C reveals the dashboard pane — build step] The case arrived on its own — ranked by evidence strength, full computation attached. Staff reply, and it's on the customer's phone. Reason, evidence, answer.
```

```
### id: how
layout: image
time: 40
speaker: C
headline: Reading and explaining run on your phone.
body: |
  No login · no account · chat, photo scan and case inbox run on the demo laptop
visual: |
  an inline SVG pipeline diagram, left to right:
  [PDF / photo] → [read (pdf.js / PaddleOCR)] → [parse every line] → [self-checks: page 1 + page 2 recompute] → [you confirm] → [rate tables (Meralco, Jan–Oct 2026) + weather model (change-point fit, real Manila temps)] → [the reason, in pesos] → [flags → dispute]
  build step 1 adds a box below: [Taglish chat — caged: bill facts + Meralco advisories + FAQs only · small local model on the laptop]
status-label: Built
notes: |
  C (3:05): Reading and explaining run in the browser — on your phone, no login, no account. The chat, photo scan and case inbox you saw run on this laptop. pdf.js reads the statement, our parser rebuilds every line, and the checks redo the bill's own arithmetic. The explanation comes from two things: Meralco's real rate tables — ten months, each linked to its source — and a standard change-point weather model fitted to this home's own seventeen-month history against real Manila temperatures.
  C (3:35): There's also a chat in Taglish for "what changed at home?" It runs on a small model on this laptop, and it's caged: it can only pick from the bill's own facts, Meralco's published advisories and Meralco's FAQs. It never writes its own answer. Type "restart" and it starts over.
```

```
### id: evidence
layout: table
time: 28
speaker: C
headline: What's real, and what isn't.
body: |
  | Feature | Status |
  |---|---|
  | PDF read (incl. password) · 4 self-checks · page-2 recompute | Built |
  | Peso split — real rate tables + real weather | Built |
  | Hot vs cool months (tap a month) · next-month range · refuses weather split on weak fit | Built |
  | 9 billing-error flags, graded → dispute + ERC escalation | Built |
  | Taglish chat, local model, caged answers (bill + advisories + FAQs) | Built (needs the laptop) |
  | Paper-bill photo scan (PaddleOCR) | Beta |
  | Staff triage dashboard | Concept — not connected to Meralco |
  | Scanned PDFs · lifeline/senior warnings | Not built |

  npm test: all suites green (parsing, checks, model, flags, disputes, chat, PWA, OCR, page 2)
visual: the table above
status-label: none (statuses are in the table)
notes: |
  C (3:50): What's real: everything demoed is live code. The bills are synthetic and labeled; the rates and the weather are real; the parser was fitted on a real statement. A paper-bill photo scan already works in beta. Two honest limits: the staff dashboard is a concept, not connected to Meralco — and when a home's usage doesn't track the weather, TANAW refuses to split it rather than invent numbers.
```

```
### id: next
layout: statement
time: 22
speaker: A
headline: Next: real bills, usage tips, lifeline checks.
body: |
  Our ask: help us gather a consented set of real Meralco statements.
  Then: usage tips from your own bill — which appliance, how many kWh, how many pesos.
  Deployment: static files — every customer's phone does its own computing.
visual: none
status-label: Planned
notes: |
  A (4:20): Next: prove accuracy on real bills — that's our ask: help us gather a consented set of real Meralco statements. Then usage tips from your own bill — which appliance costs what, and what to aim for next month. After that, scanned PDFs, and lifeline and senior-citizen checks. Deploying this is trivial — it's static files; every customer's phone does its own computing.
```

```
### id: close
layout: close
time: 13
speaker: A
headline: Now they have the reason, the evidence, and a plan for next month.
body: |
  TANAW · why did my Meralco bill change?
  TeamStiletto
visual: TANAW logo large; space reserved for a QR/link (open item)
status-label: none
notes: |
  A (4:42): That household with the unexplained bill now has the reason in pesos, a range for next month — and when Meralco owes them, the evidence. That's TANAW. Salamat po. (Stop talking.)
```

## Backup slides (Q&A only)

```
### id: backup-builtvsplanned
layout: table
headline: Built, beta, concept, planned
body: |
  | Feature | Status |
  |---|---|
  | PDF statement upload, incl. password (never stored) | Built |
  | 4 page-1 self-checks + page-2 line-by-line recompute | Built |
  | Peso split: rates / usage (weather and billing days under "details") | Built |
  | Real Meralco rate tables, Jan–Oct 2026, source-linked | Built |
  | Real daily Manila temperatures (Open-Meteo archive) | Built |
  | Next-month range + 3-month backtest | Built |
  | Hot vs cool months chart — tap a bar or card for month details | Built |
  | Refusal when weather fit is weak (adjusted R² < 0.7) | Built |
  | 9 billing-error flags graded strong / medium / weak | Built |
  | Dispute message + machine-readable dispute file | Built |
  | My disputes tracking + 14-day ERC escalation | Built |
  | Taglish chat (rules + Meralco FAQs + local Qwen2.5 3B, caged) | Built — needs the demo laptop |
  | Paper-bill photo scan (PaddleOCR, low-confidence fields yellow) | Beta |
  | Staff triage dashboard | Concept — not a Meralco system |
  | Installable PWA, offline after first visit | Built |
  | Scanned PDFs through OCR · live camera framing · lifeline/senior warnings | Not built |
notes: |
  The bill was synthetic and labeled on screen. The reading, checks, peso split, flags, dispute flow and dashboard are live code. Rates and weather are real. The dashboard is a concept, not a Meralco system.
```

```
### id: backup-architecture
layout: image
headline: One codebase, no required backend
body: |
  Browser (always): pdf.js → parse → checks → confirm → rates + weather model → explain → flags → dispute file
  Laptop (optional): Node server — case inbox · Ollama (qwen2.5:3b) chat fallback · PaddleOCR scan
  Phone installs: PWA offline · Capacitor Android/iOS builds set up
visual: the three lines above as a layered diagram (browser box, optional laptop box, install row)
notes: |
  Static files on any host — each phone does its own computing. The optional extras (chat model, OCR, case inbox) ran on one gaming laptop today. At 1,000× users nothing changes on our side.
```

```
### id: backup-privacy
layout: statement
headline: Nothing leaves the device unless the customer sends it
body: |
  Read + explain: in the browser. No account, no upload. PDF password never stored.
  Sending a dispute is one explicit tap — and a share-sheet route exists instead.
  Dispute records stay on the phone. Aligned with RA 10173 (Data Privacy Act).
notes: |
  Reading and explaining never leave the device. Sending a dispute is the customer's explicit choice, clearly labeled, and they can use their own share sheet instead. Records stay on their phone.
```

```
### id: backup-model
layout: image
headline: The weather model: fit it, or refuse
body: |
  Tier A — change-point degree-day fit (ASHRAE G14 / CalTRACK), ≥12 months, adjusted R² ≥ 0.7
  Tier B — fixed 24 °C base, adjusted R² ≥ 0.7
  Tier C — refuse to split weather
  Sample bill: Tier A, adjusted R² 1.00 over 22 months (synthetic)
visual: the three tiers as a simple decision ladder
notes: |
  It fits the bill's own 17-month tracker against daily Manila temperatures and learns a baseload plus kWh per degree-day. Below adjusted R-squared 0.7 it refuses to split rather than invent numbers.
```

```
### id: backup-refusal
layout: quote
headline: When it can't tell, it says so
body: |
  "Your bill fell ₱621, from ₱4,874 to ₱4,253. Using 41 kWh less took off ₱630. Meralco's rates added ₱9 (about the same: ₱15.41 per kWh now, ₱15.38 before). We can't separate weather reliably for this household."
  — the weak-fit SYNTHETIC sample, verbatim
notes: |
  A calculator gives a total. TANAW gives the reason the total changed — and refuses when it can't tell. This is the weak-fit sample's actual output.
```

```
### id: backup-chat
layout: statement
headline: The chat can't make things up
body: |
  The model only picks: a topic from a fixed list, an advisory paragraph number, or a Meralco FAQ from a shortlist — or null.
  The app then shows its own sentence from the bill's numbers, or Meralco's advisory or FAQ word for word with date and meralco.com.ph link.
  Otherwise: "Not in your bill or Meralco's advisory" → hotline 16211.
  The model never sees the bill. Runs on the laptop (Ollama, qwen2.5:3b); if it is down, keyword rules answer. Type "restart" to start over.
notes: |
  It can't write its own answers. The model names a topic or an advisory paragraph; the app renders its own text or Meralco's, word for word. The model never sees the bill's numbers — only the question.
```

```
### id: backup-ocr
layout: statement
headline: Paper bills: photo → PaddleOCR → the same checks
body: |
  Photo goes to the demo laptop; PaddleOCR reads it into the same confirm screen.
  Low-confidence numbers are marked yellow for the customer to check.
  Beta. Scanned PDFs and live camera framing: not built yet.
notes: |
  Built, in beta: photo to the laptop, PaddleOCR, then the exact same confirm screen and checks — with blurry numbers marked yellow. Scanned PDFs are next.
```

```
### id: backup-disputes
layout: statement
headline: The dispute doesn't end at "sent"
body: |
  My disputes: each case tracked on the phone; the staff reply appears there.
  The customer decides: sending is always possible, but one tap away unless the evidence is strong.
  14 days without an answer → TANAW prepares an escalation to the ERC.
notes: |
  The app tracks each dispute; after 14 days without an answer it prepares an escalation to the ERC — the customer's actual legal recourse.
```

```
### id: backup-data
layout: table
headline: Data sources — all bundled, no runtime calls
body: |
  | Source | What |
  |---|---|
  | Meralco "Residential Bills at Typical Consumption Levels" PDFs | Rate tables, Jan–Oct 2026, one source URL per month; rows whose parts don't sum to the total are rejected |
  | Open-Meteo archive (CC BY 4.0) | Daily Metro Manila temperatures |
  | Meralco advisories (meralco.com.ph) | Quoted reasons, with date + link |
  | The customer's own bill | Everything else |
notes: |
  Three sources beside the bill itself, all bundled with the app, nothing fetched while it runs. A rate row whose components don't add up to its printed total is rejected at build time.
```

```
### id: backup-dashboard
layout: statement
headline: Staff triage, from evidence — a concept
body: |
  Cases arrive as machine-readable dispute files (tanaw-dispute/1), within seconds.
  Sorted by flag strength, days waiting, bill amount. Staff reply or resolve; the phone shows it.
  Customers can always send; with no ticket needed, sending sits behind "Still want Meralco to review it?"
  Not connected to any Meralco system.
notes: |
  A concept, and we say so. It shows what triage could look like: structured evidence in, strongest cases answered first, instead of a phone queue.
```

```
### id: backup-limits
layout: statement
headline: Known limits of the demo
body: |
  Case inbox: plain HTTP, no login, one local file on the demo laptop — not a Meralco system.
  Chat model, photo scan and inbox need the laptop. If the model is down, keyword rules answer.
  Parser fitted on one real statement; synthetic bills elsewhere. "Hotter month" is a model estimate, not a fact.
  Not built: usage tips, lifeline/senior checks, scanned PDFs.
notes: |
  Say it before they ask. The inbox is a demo with no authentication. The weather split is a fitted model and TANAW refuses it when the fit is weak. If Ollama dies, the chat falls back to keyword rules, so say that and carry on.
```

```
### id: backup-demo-1
layout: statement
headline: Demo step: the bill, read and checked
body: |
  SYNTHETIC banner · confirm screen shows 3 numbers (period, kWh, charges); every field one tap away under "See or fix every number we read"
  Checks: readings ↔ kWh · tracker ↔ this month · lines ↔ total · balance ↔ amount due · page-2 recompute
  (screenshot to be captured — text card until then)
notes: |
  Fallback if the live demo fails at step 1–2. Narrate from this card or play the video (V).
```

```
### id: backup-demo-2
layout: statement
headline: Demo step: the reason, in pesos
body: |
  "Your bill rose ₱475, from ₱3,272 to ₱3,747. Using 26 kWh more added ₱391 (a hotter month added ₱482, a shorter billing period took off ₱90). Meralco's rates added ₱84 (higher: ₱15.42 per kWh now, ₱15.08 before)."
  Next month: ₱2,984–₱3,061 (about 195 kWh) — "not a weather forecast"
  Hot vs cool months: tap a bar for that month's kWh a day and how far it is from the average
  (screenshot to be captured — text card until then)
notes: |
  The sample's actual output, verbatim. Fallback for demo step 3.
```

```
### id: backup-demo-3
layout: statement
headline: Demo step: the planted ₱500 error
body: |
  Tap "See or fix every number we read"; "Charges for this billing period" edited +₱500 → the line-sum check fails, the field is highlighted
  Flag: STRONG — "The charges do not add up to 'Charges for this billing period'"
  → Send ticket to Meralco
  (screenshot to be captured — text card until then)
notes: |
  Fallback for demo steps 4–5. Strong = the bill's own arithmetic or Meralco's published rates disagree.
```

```
### id: backup-demo-4
layout: statement
headline: Demo step: the case on the staff side
body: |
  The dispute appears on the dashboard by itself within seconds — strength-ranked, full computation attached
  Staff reply → "Meralco replied" on the customer's phone
  (screenshot to be captured — text card until then)
notes: |
  Fallback for demo step 6.
```

## Allowed changes outside `pitch/`

- [x] None. Only `pitch/`. No `package.json` edit; the run command goes in the report instead. No git commands at all.

## Open items

- [ ] Record `pitch/assets/demo.mp4` (steps 1–6, 60–90 s)
- [ ] Capture screenshots for the four demo backup slides and the solution slide (replace the recreated card if preferred)
- [ ] QR code / link for the close slide
- [ ] Speaker names for A / B / C
- [ ] Event details: Q&A length, room, projector, clicker
- [ ] Verify the hook: open the Rappler 2026-07-13 article and confirm both 879 and 243
- [ ] Re-run `npm test` before the pitch so "all suites green" on the evidence slide is true on the day
- [ ] Rehearse the new demo path with a timer (intro animation, FAQ chat answer, hot-month tap, "See or fix every number" tap)
- [ ] Deferred (outside `pitch/`): usage-tips card, bill-components on the results screen, rename "Possible billing error?", regenerate `docs/update.md`
