# Spec: Reconcile the documentation and regenerate the audit (Task 12 from PLAN.md)

## Goal
Make `docs/requirements.md`, `docs/tech_spec.md`, `README.md`, and `docs/update.md` tell the same true story as the **final** code after Tasks 1–11, with a green `npm test`.

> **Critical execution rule.** This task is **last** (PLAN.md Task Order step 12) and depends on all of Tasks 1–11. The specs directory and repo you are given may still show the *pre-1–11* state (`www/data/reasons.json` = `{}`, `www/lib/solar.js` shipped, `#go` never disabled, no `www/lib/ocr.js` / `www/models/*`, no `docs/` steward procedure). **Do not** hardcode any status value from what you see now. For every FR below, re-verify the claim against the code **as it exists at execution time** and set the status to match. The decision table gives you the exact condition to check and both possible outcomes, so the spec is correct regardless of how Tasks 5 and 6 were resolved (solar removed vs. re-scoped; dispute extension scoped in vs. out).

## Inputs & Context
- Derives from **PLAN.md Task 12** ("Reconcile the documentation and regenerate the audit"), Task Order step 12 (runs last, depends on everything).
- Authoritative living spec: `docs/requirements.md` (v1 scope + status column), `docs/tech_spec.md` (target + current-vs-target table + out-of-scope appendix), `docs/update.md` (the code-verified audit, currently generated at HEAD `9e3afba`).
- The prior audit's "Doc corrections" list (`docs/update.md:64-72`) is the starting checklist of FRs whose doc text is known to disagree with the code: FR-V-3, FR-PR-2, FR-E-2, FR-Dep-2, FR-D-2, tech_spec §2 solar/weather/rates, §3.2 solar, §13.1 solar payback.
- Real code anchors to re-verify at execution time (line numbers are from the *current* checkout and will shift after Tasks 1–11 — re-locate by symbol):
  - `www/index.html` — file input `accept=` (currently `application/pdf` only, line 21); solar section (lines 61–70).
  - `www/app.js` — `#go` handler (line 82, currently no `disabled` gate), solar import/render (lines 7, 131–131, 304–309), reason render (107–110), dispute `localStorage` store (228–230, 211), dev-only `postCase` → `api/cases` (173–181, 258).
  - `www/lib/` — currently `extract.js, parse.js, checks.js, model.js, explain.js, flags.js, chat.js, disputes.js, solar.js`. `usableReason` lives in `www/lib/explain.js:39` (there is **no** `reasons.js` or `data.js` today).
  - `www/sw.js` — `FILES` precache list (line 5) currently includes `lib/solar.js`; `CACHE = 'tanaw-v2'` (line 3).
  - `www/data/reasons.json` — currently `{}`.
  - `tests/selfcheck.mjs` — solar payback assertion (lines 46–47), reasons assertion (161–171), PWA precache test (173–179).
  - `scripts/serve.mjs` — dev-only `POST /api/cases` inbox (lines 2–3, 31).

## Files to change (4)
1. `docs/requirements.md`
2. `docs/tech_spec.md`
3. `README.md`
4. `docs/update.md` (regenerated last)

No new files. No application code changes — this task edits documents only (any code change means a prior task was missed; stop and note it).

## Changes

### Step 0 — Establish the source of truth (do this before editing)
- Run `npm test` and confirm it is **green** (exit 0, ends with the `... OK` lines incl. `pwa OK`). If it is red, **stop**: Task 12 cannot reconcile to a broken baseline. Record the exact passing/failing suite names.
- Record `git rev-parse --short HEAD` (call it `<HEAD>`), `git rev-parse --abbrev-ref HEAD` (branch), and the current date. These go in the regenerated audit header.
- Resolve the two scope decisions by reading the final code, not the old docs:
  - **Solar (Task 5):** run `rg -n -i "solar" www/ tests/`. If there are **no** hits in `www/` (no `lib/solar.js`, no `#solar` markup, no `renderSolar`, no `lib/solar.js` in `sw.js` `FILES`, no solar import in `tests/selfcheck.mjs`) → solar was **removed**. If solar is present and wired in with a requirement ID → solar was **re-scoped in**.
  - **Dispute extension (Task 6):** check whether `docs/requirements.md` now has FR IDs for flags/chat/dispute/triage (search for a dispute/flags/chat requirement block) and whether the privacy FRs (FR-PR-1, FR-PR-2) are reworded to describe the consented on-device dispute store and the dev-only `api/cases` inbox.

### 1. `docs/requirements.md` — status column + scope decisions
Edit only the Status cells (and §3.2/§9 scope text). Use the decision table below; set each cell to the branch that matches the final code. Do not invent new FRs except the Task-6 dispute IDs if that was the decision.

Decision table (verify the "check" in the final code, then apply the matching outcome):

| FR (current row) | Current status | Check in final code | → If true | → If false |
|---|---|---|---|---|
| FR-I-1 (line 123) photo upload | Not built | `www/index.html` file input `accept` includes `image/*` and intake normalizes | **Implemented** | Not built |
| FR-X-1,2,3,5,6 (133–138) OCR | Not built | `www/lib/ocr.js` + `www/lib/ocr-worker.js` + `www/models/*` exist and run | **Implemented** | Not built |
| FR-X-4 (136) extraction | Implemented (PDF), Not built (photo) | OCR path exists | **Implemented (PDF + photo)** | keep as-is |
| FR-V-3 (146) block on failed checks | Implemented *(wrong)* | `#go` is `disabled` while any check fails and re-enabled when fixed | **Implemented** | **Not built** |
| FR-V-4 (147) low-confidence flags | Not built | confirmation screen marks low-confidence OCR fields | **Implemented** | Not built |
| FR-E-2 (155) rate components | Partial (synthetic rates) | `www/data/rates.json` is real Meralco (not `synthetic:true`) | **Implemented** | Partial |
| FR-E-7 (160) verbatim quote | Partial | `reasons.json` has usable entries AND gate tested | **Implemented** | Partial |
| FR-E-8 (161) never invent reason | Partial (gate not enforced/tested) | attribution gate enforced + a test fails a bad reason | **Implemented** | Partial |
| FR-E-9 (162) evergreen + not-published | Not built | `reasons.json` has `evergreen` AND UI shows explicit "not published" state | **Implemented** | Not built |
| FR-E-10 (163) lifeline/senior warning | Partial (warning not built) | results UI shows a "not re-derived" warning for lifeline/senior lines | **Implemented** | Partial |
| FR-S-3 (181) rate provenance | Partial | each `rates.json` month has source title + URL + retrieval date, loader validates | **Implemented** | Partial |
| FR-S-4 (182) basis of figure | Partial | results state actual-vs-estimated reading basis (and rate month, tier) | **Implemented** | Partial |
| FR-D-1 (188) bundled data/models | Partial | `www/models/*` bundled + precached (if OCR built) | **Implemented** | Partial |
| FR-D-2 (189) data-steward step | Not built | a documented monthly refresh procedure exists under `docs/` | **Implemented** | Partial (scripts exist) |
| FR-D-3 (190) provenance recording | Partial | rate months + reasons carry verbatim provenance | **Implemented** | Partial |
| FR-Dep-2 (207) PWA offline | Not built *(wrong — PWA already ships)* | `www/sw.js` + `www/manifest.webmanifest` present, precache test green | **Implemented** | Not built |
| FR-Dep-1 (206) mobile-responsive | Partial | a real-device/portrait audit was performed (Task 11) | **Implemented** | Partial |
| FR-Dep-3 (208) no backend | Implemented | production path posts no bill data to a server; `api/cases` is dev-only | Implemented *(reword: "no production backend; dev-only case inbox")* | Partial |
| FR-PR-1 (197) never leaves device | Implemented | per Task-6 decision: local-only + consented on-device store + dev-only inbox | **Partial** *(reword to the agreed boundary)* or Implemented if trimmed to letter | Partial |
| FR-PR-2 (198) nothing persisted | Implemented *(wrong)* | disputes persist to `localStorage` (they do) | **Partial** *(reword: "explicit, consented on-device-only dispute store")* | Implemented |

- **Scope decisions:**
  - **Solar:** If **removed** (default per §3.2/§9/tech_spec §16.3): leave §3.2 row 84 and §9 row 275 as "Removed"; ensure no solar FR exists. If **re-scoped in**: add solar requirement IDs in §3.1 and a status, and edit §3.2/§9 to reflect the new in-scope decision.
  - **Dispute extension:** If **scoped in** (Task 6 default): add a requirement block (e.g. `FR-DS-1..n`) covering billing-error flags, household chat, dispute tracking/ERC escalation, and the staff triage dashboard, each with a status matching the code; add a §3.1 row. If **marked out**: add an explicit out-of-scope line in §3.2. In either case, make §3.1/§3.2 and the new FR block agree.

### 2. `docs/tech_spec.md` — current-vs-target table, stale notes, out-of-scope appendix
- **§2 "Current implementation vs target" (lines 64–80):** update the *Current* column to the final code. In particular: Photo OCR → Implemented (if built); Rate lookup Current → "real Meralco schedule" (drop "synthetic `rates.json`"); Weather model Current → "real Open-Meteo archive"; Reasons Current → "populated + evergreen" (if Task 1/3 done); PWA/offline Current → **Implemented**; Data steward Current → "documented monthly procedure" (if Task 4 done); Solar → set to the Task-5 outcome ("Removed from v1" or "Implemented, in scope"). Keep the *Target v1* column describing the target (adjust the rate-lookup target to match the OQ4 decision — default is to **keep the working `non_lifeline` model + add provenance**, so drop/soften the "schema v2" target wording if that was chosen).
- **§3.1 existing modules (lines 86–101):** if solar was removed, delete/annotate the `www/lib/solar.js` row (line 98); update `www/app.js` note ("add OCR branch and remove solar UI") to reflect what actually happened.
- **§3.2 "Modules to add" (lines 103–113):** reconcile against the **real** final `www/lib/` listing. Move any now-existing module (`sw.js`, `manifest.webmanifest`, `ocr.js`, `ocr-worker.js`, `models/*`) out of "to add" (they exist). Note that `reasons.js` and `data.js` were **not** created — the attribution gate lives in `www/lib/explain.js` (`usableReason`) and data validation in `www/lib/explain.js` (`validateRates`); correct this table to match reality rather than leaving phantom modules.
- **§13.1 Existing tests (line 490):** the parenthetical "(payback is solar; remove with v1 scope)" — if solar was removed and the payback assertion is gone from `tests/selfcheck.mjs`, update this line to drop the payback reference. If re-scoped, leave it.
- **§16.3 Out-of-scope code (lines 576–580):** reflect the Task-5 solar decision (removed → keep "excluded from v1, do not ship"; re-scoped → move solar out of this appendix) and the Task-6 decision for the dispute extension. Keep the Capacitor/`ios.yml` "excluded from v1 delivery" line.

### 3. `README.md` — feature list must agree with the spec
- **"What it does" (lines 8–17):**
  - Item 1 "Read the bill" currently says photo is "Not built yet ... planned for v1.1" (line 16). **Requirements/PLAN treat photo+OCR as v1 (Tasks 7–9).** If the OCR path is built, remove the "photo not built / v1.1" wording and describe reading a photo **or** PDF. If (contrary to plan) OCR is not built, keep it but make the "v1.1" claim consistent with the spec — flag any mismatch in your report.
  - The same line 16 lists "a warning for lifeline and senior-citizen discount lines" as not built. If Task 3 built the warning, remove it from "Not built yet."
  - Ensure items 4–6 (flags/chat, dispute, triage dashboard) still match what ships, and that the dispute/`My disputes` on-device store and the dev-only case dashboard are described accurately (on-device / dev-only).
- **Project layout table (lines 20–28):**
  - Line 23 lists `solar` under `www/lib/`. If solar was removed, delete it; if re-scoped, keep it.
  - Line 28 mis-describes the docs (`requirements.md` as "the earlier draft of the spec"). Fix to: `requirements.md` = requirements (v1 scope + status), `tech_spec.md` = technical spec, `hackathon_challenges.md` = official challenge text. (Minor, but it contradicts line 27 and the requirements doc itself.)
- **Data section (lines 58–61):** if rates/provenance changed (Task 4), confirm "Rates and weather are real" and the "run `npm run rates`" instructions still match.

### 4. `docs/update.md` — regenerate to the final state (write LAST)
Rewrite the file (same section structure) so it is a faithful audit of the **final** code:
- **Header (line 3):** `Generated: <date time> | Branch: <branch> | HEAD: <HEAD>` (from Step 0).
- **Overall (line 5):** rewrite the summary to the final state — `npm test` green, photo/OCR status, solar scope, dispute extension scope.
- **Done / Partially implemented / Not yet implemented (lines 7–43):** re-bucket every item against the final code with current file:line citations. Items completed by Tasks 1–11 move from "Partially/Not yet" to "Done". The only things that may remain "Not yet implemented" are **explicitly gated** items (see Risks in PLAN.md): real-bill accuracy (Gate 0, `data/private/` corpus) and real-device mobile/share verification (OQ7) if not cleared.
- **Out of scope (lines 45–57):** reflect the Task-5 solar outcome (remove the "still ships, contrary to the decision" contradiction) and the Task-6 dispute-extension disposition (remove the "docs not yet updated" note once requirements/tech_spec cover them).
- **Changes since last update (lines 59–60):** replace "First update" with a list of what changed since `9e3afba` (Tasks 1–11 deltas + this docs reconciliation).
- **Verification (lines 62–72):** state `npm test` **PASSED** (list the suites that ran) and update the "Doc corrections" list to the residual corrections actually applied in this task; drop any that are now resolved.

## Acceptance Criteria
- `npm test` exits 0 (green), including the `reasons` and `pwa` suites; this is recorded in the regenerated `docs/update.md` Verification section.
- Every status cell in `docs/requirements.md` that the prior audit flagged (FR-V-3, FR-PR-1, FR-PR-2, FR-E-2, FR-E-7/8/9/10, FR-S-3/4, FR-D-1/2/3, FR-Dep-1/2/3, FR-I-1, FR-X-*) matches the final code per the decision table; no "Implemented" claim lacks a real code anchor.
- `docs/tech_spec.md` §2 current-vs-target, §3.1/§3.2 module lists, §13.1, and §16.3 out-of-scope appendix are accurate for the final code (no phantom `reasons.js`/`data.js`, solar reflects the Task-5 decision).
- The Task-5 solar and Task-6 dispute-extension decisions are written consistently across `requirements.md`, `tech_spec.md`, and `README.md`; a repo `rg -n -i "solar" www/ tests/` result matches the documented decision.
- `README.md` "What it does" and layout table agree with the spec (photo/OCR status, lifeline warning, dispute on-device/dev-only, no stale "v1.1" photo claim if OCR is built).
- Regenerated `docs/update.md` header carries the new `<HEAD>`/branch/date, shows green `npm test`, and lists **no** unresolved "not yet implemented" v1 items except explicitly gated ones (Gate 0 real-bill accuracy; real-device verification if OQ7 not cleared).
- No file outside the four listed was modified (`git status --porcelain` shows only `docs/requirements.md`, `docs/tech_spec.md`, `README.md`, `docs/update.md`).

## Verification
1. `npm test` — must pass; copy the tail (the `... OK` lines) into the audit.
2. `git rev-parse --short HEAD` and `git rev-parse --abbrev-ref HEAD` — paste into the `docs/update.md` header.
3. `rg -n -i "solar" www/ tests/` — confirm the result is consistent with the solar decision in all four docs.
4. `rg -n "Implemented|Partial|Not built|Out of scope" docs/requirements.md` — spot-check each changed FR against its code anchor (open the cited `www/` file and confirm the behavior).
5. `rg -n "reasons\.js|data\.js|ocr\.js|ocr-worker\.js|models/" docs/tech_spec.md` — confirm §3.2 no longer lists modules that don't exist and does list ones that do.
6. `git status --porcelain` — confirm only the 4 doc files changed.
7. Read `docs/update.md` top-to-bottom: header HEAD matches step 2, Verification says PASSED, and "Not yet implemented" contains only gated items.

## Edge Cases & Non-Goals
- **Non-goal / out of scope:** any application-code change, re-running the fetch/build data scripts, migrating `rates.json` to the bracket "schema v2" (OQ4 default is to keep the working model + add provenance), collecting a real-bill corpus, or any real-device/mobile re-verification beyond recording its status.
- **If `npm test` is red when you start:** stop and report — Task 12 cannot truthfully regenerate a green audit over a broken baseline; this means a prior task (likely Task 1) was not completed.
- **If the solar or dispute scope is in a half-state** (e.g., solar removed from `www/` but still in `sw.js` `FILES`, or dispute FRs partially added): treat the code as the truth for status, but flag the inconsistency in your reply and in the audit rather than silently papering over it.
- **Gated items stay honest:** real-bill accuracy (Gate 0 / `data/private/golden_bill.pdf`) and real-device share/mobile checks (OQ7) may legitimately remain "not verified" — list them under "Not yet implemented / gated" with their gate ID, not as regressions.
- **Line numbers drift:** all `www/`/`tests/` line numbers cited above are from the pre-1–11 checkout; re-locate by symbol/function after Tasks 1–11 before citing them in the regenerated audit.
- **README "v1.1" photo claim:** if OCR is built but the README still says photo is "v1.1", that is a spec-vs-README contradiction to fix in this task (the spec/PLAN treat photo+OCR as v1); if OCR is genuinely not built, surface the contradiction with PLAN.md Tasks 7–9 instead of silently reconciling.
