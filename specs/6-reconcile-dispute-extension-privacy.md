# Spec: Reconcile the disputes/flags/chat/triage-dashboard extension and its privacy claims (Task 6 from PLAN.md)

## Goal
Assign requirement IDs to the shipped dispute extension (flags, chat, dispute tracking/ERC escalation, dev-only triage dashboard), make the privacy requirements (FR-PR-1, FR-PR-2) state the true boundary, and label the on-device store and dev-only inbox as such in the UI — without changing any behavior.

**Decision this spec executes (per PLAN.md OQ3 default):** the extension is **scoped in** as a documented product decision ("dispute follow-up extension", new IDs `FR-DSP-1..5`), not removed. It is built, tested (`tests/selfcheck.mjs`: `test_feedback`, `test_disputes`, `test_dashboard_samples`, `test_chat`) and README-documented. If the team instead votes to strip it out, this spec does not apply — that is a different edit set (remove modules, UI, `sw.js` precache entries, and the four test blocks).

## Inputs & Context
- PLAN.md Task 6 + OQ3. Task 6 runs after Task 1 (so `npm test` is green on the `reasons` assertion) and before Task 10 (the privacy/scope-guard tests in Task 10 encode exactly the boundary this spec writes down).
- **The extension (all shipped, all tested):**
  - `www/lib/flags.js` — `billingFlags`, `disputeMessage`, `disputePacket` (9 flag kinds, strong/medium/weak, machine-readable `tanaw-dispute/1` packet).
  - `www/lib/chat.js` — `understand`, `step`, `answersOf` (rule-based English/Taglish "What changed at home?").
  - `www/lib/disputes.js` — `daysSince`, `ercMessage`, `ercPacket`, `FOLLOW_UP_DAYS = 14`.
  - `www/app.js` — chat UI (L146–170), flags UI + `postCase` (L173–181, the only `fetch` POST, to relative `api/cases`), "My disputes" `localStorage` store `STORE = 'tanaw.disputes'` (L227–269), `sendDispute` share-sheet export (L273–302).
  - `www/dashboard.html` + `www/dashboard.js` — staff triage concept; reads `api/cases` via `#inbox` (dev server only) or file input.
- **The privacy boundary (current, per `docs/update.md` L34–36):** `scripts/serve.mjs` (dev server) exposes `POST/GET /api/cases`, persisting to gitignored `data/private/cases.json`; on a static production deploy that route does not exist, so `postCase` 404s and falls back to the share-sheet message (`www/app.js:180`). "My disputes" persists bill data (account number, readings, charges, answers) to `localStorage` on explicit user action.
- **Docs to fix:** `docs/requirements.md` (§3.1, §3.2, §5.8, §8, §11 — no dispute section exists at all), `docs/tech_spec.md` (§2 table, §3.1 module map, §9 privacy, §10 deployment), `README.md` (line 5 "no backend" claim).
- **Out of this spec:** `docs/update.md` (regenerated in Task 12), `tests/selfcheck.mjs` (privacy/scope-guard tests are Task 10), solar (Task 5).

## Changes
Ordered; docs first, then UI labels. No code logic changes anywhere.

### 1. `docs/requirements.md` — scope the extension in
1a. In §3.1 (In scope table), after the `| Data | … |` row, add:
```
| Dispute follow-up (product decision) | Billing-error flags, "what changed at home?" chat, dispute message + evidence file, on-device "My disputes" tracking with ERC escalation, dev-only staff triage dashboard (FR-DSP-1..5) |
```
1b. In §3.2 (Out of scope table), after `| Server-side OCR or any backend | Not built. |`, add:
```
| Case-inbox backend | Not built in production; the dev server (`npm start`) exposes a dev-only `/api/cases` inbox for the triage concept (FR-DSP-5). |
```
1c. New section between §5.9 (Delivery) and `## 6`:
```
### 5.10 Dispute follow-up extension (product decision)

Built, tested, and shipped as a product decision that extends Challenge 2 from understanding the bill to acting on a suspected billing error. Not from the challenge text; labeled here as a product decision.

| ID | Requirement | Status |
|---|---|---|
| FR-DSP-1 | When self-checks fail or unusual patterns appear, the app shows evidence-only billing-error flags (9 kinds), each rated strong/medium/weak; a flag is evidence, not a verdict. | Implemented |
| FR-DSP-2 | A rule-based "What changed at home?" chat (English or Taglish) collects the household's explanation; the answers only support or suppress flags and go into the dispute message. | Implemented |
| FR-DSP-3 | The app produces a ready-made message plus a machine-readable evidence file; the user sends them themselves through their own channels (share sheet) — the app never submits anything to Meralco. | Implemented |
| FR-DSP-4 | "My disputes" tracks sent disputes (date, channel, reference, status) in an explicit, consented, **on-device-only** store (browser `localStorage`, key `tanaw.disputes`); after 14 days without resolution it prepares an ERC escalation message + evidence file. | Implemented |
| FR-DSP-5 | A staff triage dashboard (`/dashboard.html`) sorts dispute files by flag strength, days waiting, and bill amount; it is a dev-only concept, connected to no Meralco or ERC system, and its case inbox (`POST /api/cases`) exists only on the `npm start` dev server. | Implemented |
```
1d. Replace the §5.8 rows (currently L197–198):
```
| FR-PR-1 | Bill images, PDFs, and extracted data never leave the device. | Implemented |
| FR-PR-2 | Images, PDF passwords, and bill data are not persisted to storage. | Implemented |
```
with:
```
| FR-PR-1 | Bill analysis is **local-only**: the app makes no runtime network call carrying bill data. Bill data leaves the device only when the user explicitly initiates it — the share-sheet export, or escalation to the dev-only `/api/cases` inbox, which exists only on the `npm start` dev server (not in the production static deploy). | Implemented |
| FR-PR-2 | Images and PDF passwords are never persisted. Bill data is persisted only in the explicit, consented, **on-device-only** "My disputes" store (`localStorage` key `tanaw.disputes`, `www/app.js`), written only on the user's "Save in My disputes" action; there is no other persistence and no server-side customer record. | Implemented |
```
1e. In §8 (Acceptance criteria), after the AC-13 row, add:
```
| AC-14 | Given the production static deploy, when inspected, then there is no `/api/cases` route and no network call carrying bill data; "My disputes" data exists only in on-device `localStorage`. |
```
1f. In §11 (traceability matrix), extend the last row `| (Product principle) no backend / privacy | FR-PR-1..4, FR-Dep-3, NFR-5..6, NFR-10, AC-1, AC-13 |` to `… NFR-10, AC-1, AC-13, AC-14 |`.

### 2. `docs/tech_spec.md` — same boundary in the tech doc
2a. In §2 (Current vs target table), after `| Data steward | Not built | Documented monthly procedure |`, add:
```
| Billing-error flags / chat / "My disputes" | Implemented (`www/lib/flags.js`, `www/lib/chat.js`, `www/lib/disputes.js`, `www/app.js`) | Retained; documented as the FR-DSP extension (FR-DSP-1..4) |
| Staff triage dashboard | Implemented (`www/dashboard.html`, `www/dashboard.js`) | Retained; dev-only concept, FR-DSP-5 |
```
2b. In §3.1 (module map), after the `www/lib/solar.js` row, add:
```
| `www/lib/flags.js` | Billing-error flags, dispute message + evidence packet | FR-DSP-1, FR-DSP-3 |
| `www/lib/chat.js` | Rule-based Taglish/English "what changed at home?" chat | FR-DSP-2 |
| `www/lib/disputes.js` | On-device dispute follow-up, ERC escalation | FR-DSP-4 |
| `www/dashboard.html`, `www/dashboard.js` | Staff triage concept dashboard + dev-only inbox reader | FR-DSP-5 (dev-only) |
```
and change the serve row's Notes cell from `Dev-only` to `Dev-only; also the dev-only `/api/cases` concept inbox (FR-DSP-5)`.
2c. In §9 (Privacy and security table):
- Replace the `No persistence` row content `Do not write images, extracted fields, or passwords to IndexedDB/localStorage.` with: `Images and PDF passwords are never persisted. The one persistence is the consented, on-device-only "My disputes" store: `localStorage` key `tanaw.disputes` (`www/app.js`), written only on the user's explicit "Save in My disputes" action; it never leaves the device.`
- After the `No upload` row, add:
```
| Dev-only case inbox | `POST /api/cases` exists only in `scripts/serve.mjs` (`npm start`); it is not part of the static production deploy, stores cases in gitignored `data/private/cases.json`, and is a concept for the triage dashboard — not a Meralco/ERC system. |
```
2d. In §10 (Deployment), after the `- **Hosting:** static files only (`www/`). No API routes, no server runtime.` line, add:
```
- **Dev-only inbox:** the case inbox (`/api/cases`) is provided only by `scripts/serve.mjs` (`npm start`) for the triage concept (FR-DSP-5); production deploys have no API routes.
```

### 3. UI labels (no logic changes)
3a. `www/index.html` — the "My disputes" hint (currently `Saved only on this phone.`):
```
<p class="hint">Saved only on this phone (on-device store; never uploaded or sent anywhere).</p>
```
3b. `www/app.js` — three label strings only:
- `postCase` confirm (L174): replace `'Send this evidence file (account number, meter readings, charges and your answers) to the TANAW case dashboard for ERC review?'` with `'Send this evidence file (account number, meter readings, charges and your answers) to the TANAW case inbox? Development only (npm start) — it is not connected to Meralco or the ERC.'`
- Flags button (L195): `<button id="escalate">Escalate to the case dashboard (ERC)</button>` → `<button id="escalate">Escalate to the case dashboard (dev only)</button>`
- "My disputes" ERC box (L256): `<button data-erc="post">Send to the case dashboard</button>` → `<button data-erc="post">Send to the case dashboard (dev only)</button>`
- (Optional, same spirit) L213: `'Saved in "My disputes" on the start screen.'` → `'Saved in "My disputes" on the start screen (this phone only).'`
3c. `www/dashboard.html` — banner (L18):
```
<div class="banner">CONCEPT — DEVELOPMENT ONLY: how Meralco staff could triage TANAW dispute files. Not connected to any Meralco or ERC system; files are loaded by hand or from the dev-server inbox (npm start).</div>
```
3d. `scripts/serve.mjs` — header comment (L2): replace `// Also the demo case inbox: POST /api/cases …` with `// DEV-ONLY: also the concept case inbox (FR-DSP-5): POST /api/cases stores a dispute file the user chose to escalate; GET lists them for dashboard.html. Not part of the static production deploy (no API routes).`

### 4. `README.md` — make the top-level privacy line true
After the sentence `Everything runs on the device: no backend, no login, no network calls at runtime.` (line 5, which wraps after "backend,"), append:
` "My disputes" is an on-device store (this phone's localStorage, never uploaded); the only exception to "no backend" is a dev-only case inbox served by `npm start` for the triage concept — it is not in production deploys.`

## Acceptance Criteria
1. `grep -n "FR-DSP" docs/requirements.md docs/tech_spec.md` finds FR-DSP-1..5 in `requirements.md` §5.10 (all status **Implemented**) and in `tech_spec.md` §2/§3.1/§9/§10.
2. `requirements.md` §5.8 FR-PR-1 and FR-PR-2 state: analysis is local-only with no runtime network call carrying bill data; "My disputes" is explicit, consented, on-device-only (`localStorage` key `tanaw.disputes`); the case inbox is dev-only and not in the production static deploy. Both remain status **Implemented** (code matches the amended text).
3. AC-14 exists in `requirements.md` §8 and is referenced in the §11 matrix.
4. UI labels: "My disputes" hint in `www/index.html` says on-device/never uploaded; both "case dashboard" buttons in `www/app.js` say **dev only**; the `postCase` confirm dialog names it development-only and not connected to Meralco/ERC; the `www/dashboard.html` banner says CONCEPT — DEVELOPMENT ONLY; `scripts/serve.mjs` header says DEV-ONLY.
5. No production path posts bill data: in `www/app.js`, `postCase`'s `fetch('api/cases', {method:'POST'…})` (L176) is the **only** fetch with a request body; every other `fetch` is a GET of bundled data/fixtures. On static hosting (no such route) it 404s and the existing fallback message at L180 tells the user to use "Send dispute" instead.
6. `npm test` passes with no new failures (baseline: green after Task 1; if Task 1 is not done yet, the only failure remains the pre-existing `reasons.json` one).
7. No file under `www/` writes to any storage other than `localStorage` key `tanaw.disputes` (`grep -rn "localStorage" www/` → only `www/app.js`).

## Verification
1. `npm test` — expect `selfcheck OK` + all suite `OK` lines (or, pre-Task 1, the single pre-existing `reasons` failure and nothing else).
2. `rg -n "FR-DSP" docs/` — extension IDs present in both docs; `rg -n "FR-PR-[12]" docs/requirements.md` — amended text.
3. `rg -n "localStorage" www/` — only `STORE = 'tanaw.disputes'` usage in `www/app.js`.
4. `rg -n "fetch\(" www/app.js www/dashboard.js` — only one POST (`api/cases` in `app.js` `postCase`); dashboard's `api/cases` fetch is a GET.
5. Manual (5 min): `npm start` → open `http://localhost:8000`, run the SYNTHETIC sample, confirm "Escalate to the case dashboard (dev only)" button label, confirm dialog says development-only; open `/dashboard.html`, banner says DEVELOPMENT ONLY, "Load cases escalated from the app" succeeds against the dev server.
6. `git diff --stat` — changed files are exactly: `docs/requirements.md`, `docs/tech_spec.md`, `README.md`, `www/index.html`, `www/app.js`, `www/dashboard.html`, `scripts/serve.mjs` (7 files, no tests, no data).

## Edge Cases & Non-Goals
- **Team decision (OQ3):** this spec assumes "scope in" (the plan's stated default). A "strip it out" decision invalidates this spec entirely.
- If the dev inbox were ever promoted to production, FR-PR-1/FR-DSP-5 would have to be re-opened — out of scope here; the static deploy simply has no API route, so the letter of FR-Dep-3 ("no application backend") holds for production.
- **Non-goals:** no changes to `tests/selfcheck.mjs` (privacy/scope-guard tests = Task 10, which will assert AC-14 against the boundary written here); no changes to `docs/update.md` (regenerated in Task 12); no changes to solar (Task 5); no changes to the 14-day `FOLLOW_UP_DAYS` placeholder, chat keyword rules, or the native Capacitor share path (those `shortcut:` markers are accuracy items, not scope/privacy items); no behavior change of any kind — this task is docs + labels only.
- `data/private/cases.json` stays gitignored; the dev inbox stores account numbers locally — that is exactly why it is dev-only, and the spec says so in three places (requirements §3.2, tech_spec §9, README).
