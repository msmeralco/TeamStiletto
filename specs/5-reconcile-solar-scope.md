# Spec: Reconcile solar scope to the written v1 (Task 5 from PLAN.md)

## Goal

Make the shipped build and the written spec agree on solar: either delete it everywhere (default, Branch A) or formally re-scope it in with requirement IDs (contingency, Branch B) — no half-state where it is "removed" on paper but still ships.

## Decision gate — read first

PLAN.md OQ2 asks the team to decide **remove vs. re-scope**. The written spec (`docs/requirements.md` §2 line 57, §3.2 line 84, §9 line 275; `docs/tech_spec.md` §2 line 77, §16.3 line 578) and the PLAN default both say **remove**.

- **Execute Branch A** unless the team explicitly re-decides (in writing, e.g. a commit message or issue) before implementation starts.
- **Execute Branch B only** on an explicit re-scope decision. Branch B is docs-only: the code already ships solar, so no code changes are needed.
- Record which branch was executed in the dated decision notes described below. Do not edit `PLAN.md` itself.

## Inputs & Context

- PLAN.md Task 5 ("Reconcile solar scope to the written v1") and OQ2. Must land **before Task 10** (scope-guard test) and Task 11 (precache re-validation).
- Code touchpoints (all verified at HEAD `9e3afba`, line numbers current as of this spec):
  - `www/lib/solar.js` — the whole file (18 lines): exports `SOLAR` constant and `solar(bill, tracker, s)`.
  - `www/app.js` — line 7 (`import { solar, SOLAR } from './lib/solar.js';`), line 131 (`renderSolar();` call inside `renderResults()`), lines 141–142 (two solar-specific entries in the `#sources` list — line 141 uses `SOLAR.Y/C/fees`; line 142 "Export credit = …" contains no word "solar" but is solar-specific), lines 304–309 (`renderSolar()` function + `$('#selfuse').onchange` handler).
  - `www/index.html` — lines 61–70: `<h2>Does rooftop solar pay off?</h2>`, `<label>` + `<select id="selfuse">`, `<table id="solar"></table>`.
  - `www/sw.js` — line 3 (`const CACHE = 'tanaw-v2';`), line 5 (`'lib/solar.js'` in the `FILES` precache array).
  - `tests/selfcheck.mjs` — line 11 (import), line 46 (`sol = solar(bill, bill.tracker)`), line 47 (payback assertion), line 65 (console.log prints `payback …` from `sol`).
- Docs: `docs/requirements.md` lines 57, 84, 275; `docs/tech_spec.md` lines 77, 91, 98, 490, 505, 578; `README.md` line 23 (project-layout table lists `solar` under `www/lib/`).
- Verified **no** solar references in: `www/style.css`, `www/dashboard.html`, `www/dashboard.js`, `scripts/`, `www/data/`, `package.json`.
- **Test interlock:** `tests/selfcheck.mjs` lines 173–179 (`test_pwa`) asserts both directions — every `FILES` entry exists on disk (`existsSync`) AND every file in `www/lib/` is in `FILES` (`readdirSync`). Deleting `www/lib/solar.js` and removing it from `FILES` **must happen together**, in the same change.
- `npm test` is currently red at `tests/selfcheck.mjs:169` (empty `reasons.json` — Task 1's job). In the PLAN order Task 1 finishes before this one, so `npm test` should be green when this task runs; if not, the only permitted failure is that reasons assertion.

---

## Changes — Branch A (default: remove)

Ordered edits. Do 1–5 as one change set (the pwa-test interlock), then 6–8.

1. **Delete `www/lib/solar.js`.**

2. **`www/app.js`** — four deletions:
   - Delete line 7: `import { solar, SOLAR } from './lib/solar.js';`
   - In `renderResults()`, delete the `renderSolar();` line (line 131) — the `const rm = …` line that follows stays.
   - In the `$('#sources').innerHTML = [ … ]` array, delete the last two entries:
     - `` `Solar yield ${SOLAR.Y} kWh/kWp/yr (Philippine DOE, Global Solar Atlas, Metro Manila); cost ₱${SOLAR.C.toLocaleString()}/kWp (Ember, May 2026); fees ₱${SOLAR.fees.toLocaleString()} (ERC certificate + meter difference).`, ``
     - `'Export credit = the generation charge per kWh on your bill. Home-use share is your own estimate.',`
     
     The array now ends with the `Weather split: …` entry (its trailing comma before `]` is valid JS).
   - Delete the end-of-file block:
     ```js
     function renderSolar() {
       $('#solar').innerHTML = '<tr><th>Scenario</th><th class="n">Payback</th><th class="n">kWp</th><th class="n">Saves/yr</th></tr>' +
         solar(bill, bill.tracker, +$('#selfuse').value).map(s =>
           `<tr><td>${esc(s.name)}</td><td class="n"><b>${s.payback.toFixed(1)} yrs</b></td><td class="n">${s.kWp.toFixed(1)}</td><td class="n">${peso(s.save)}</td></tr>`).join('');
     }
     $('#selfuse').onchange = () => analysis && renderSolar();
     ```
     Keep the `$('#again').onclick = …` line that follows.

3. **`www/index.html`** — delete lines 61–70 (the whole solar block), so `<p id="proj"></p>` is directly followed by `<h2>Sources and assumptions</h2>`:
   ```html
   <h2>Does rooftop solar pay off?</h2>
   <label>How much of the solar power would you use at home? (assumption)
     <select id="selfuse">
       <option value="0.25">Mostly away during the day (25%)</option>
       <option value="0.4" selected>Some daytime use (40%)</option>
       <option value="0.6">Home most days, aircon by day (60%)</option>
       <option value="0.8">Home all day, heavy daytime use (80%)</option>
     </select>
   </label>
   <table id="solar"></table>
   ```

4. **`www/sw.js`** — two edits:
   - Remove `'lib/solar.js'` from `FILES` (line 5): the libs entry ends at `'lib/disputes.js',`.
   - Bump the cache version (line 3): `const CACHE = 'tanaw-v2';` → `const CACHE = 'tanaw-v3';` (precache list changed; the `activate` handler already deletes stale caches).

5. **`tests/selfcheck.mjs`** — three edits:
   - Delete line 11: `import { solar } from '../www/lib/solar.js';`
   - Line 46: `const pr = project(per, T, f, r.R1, r.F1), sol = solar(bill, bill.tracker);` → `const pr = project(per, T, f, r.R1, r.F1);`
   - Delete line 47: `assert.ok(sol.every(s => s.payback > 0 && isFinite(s.payback)));`
   - Line 65: drop the payback fragment from the console.log — `… next: ${pr.mid ? Math.round(pr.mid) : pr.label}  payback ${sol.map(s => s.payback.toFixed(1)).join(' / ')} yrs\`);` → `… next: ${pr.mid ? Math.round(pr.mid) : pr.label}\`);`

6. **`docs/requirements.md`** — record the decision (two cells):
   - §3.2 line 84: `| Solar / net-metering comparison | Removed. Existing \`www/lib/solar.js\` and the solar UI are excluded from v1. |` → `| Solar / net-metering comparison | Removed (decision confirmed 2026-11-12, PLAN OQ2). \`www/lib/solar.js\`, the solar UI, the SW precache entry, and the test assertions are deleted from the build. |`
   - §9 line 275: append to the Disposition cell: ` **Decision recorded 2026-11-12 (OQ2): removed — the module, UI, service-worker precache entry, and test assertions were deleted from the build.**`

7. **`docs/tech_spec.md`** — five edits:
   - §2 line 77: `| Solar | Implemented (\`www/lib/solar.js\`, UI) | **Removed from v1** |` → `| Solar | Removed from the build (deleted 2026-11-12, OQ2) | **Removed from v1** |`
   - §3.1 line 91 (`www/app.js` row): `Keep; add OCR branch and remove solar UI` → `Keep; add OCR branch`
   - §3.1 line 98: delete the row `| \`www/lib/solar.js\` | Solar payback | **Out of scope for v1** |` (file no longer exists).
   - §13.1 line 490: `- projection and payback sanity (payback is solar; remove with v1 scope).` → `- projection sanity (solar payback removed with v1 scope, 2026-11-12).`
   - §16.3 line 578: `- \`www/lib/solar.js\` and the solar section in \`www/index.html\` / \`www/app.js\` are excluded from v1.` → `- Solar: \`www/lib/solar.js\` and the solar section in \`www/index.html\` / \`www/app.js\` are excluded from v1 and were deleted from the build on 2026-11-12 (OQ2: removed).`

8. **`README.md`** line 23 — the layout table references the deleted file; remove the trailing mention: `…; \`chat\` (What changed at home?), \`solar\` (outside Challenge 2) |` → `…; \`chat\` (What changed at home?) |` (broader README reconciliation stays with Task 12).

## Acceptance Criteria — Branch A

- [ ] `www/lib/solar.js` no longer exists.
- [ ] `rg -in "solar" www/ tests/ package.json` returns **zero matches** (case-insensitive catches `SOLAR`, `renderSolar`, `Solar`); `rg -in "selfuse" www/` also returns zero.
- [ ] `www/sw.js`: `FILES` has no `lib/solar.js` entry and `const CACHE = 'tanaw-v3';`.
- [ ] `www/app.js` has no solar import, no `renderSolar`, and the sources list has no solar-yield/cost/fees or export-credit entries.
- [ ] `www/index.html` has no solar heading, no `#selfuse` select, no `#solar` table.
- [ ] `tests/selfcheck.mjs` has no solar import, no solar assertion, no `sol` references.
- [ ] `docs/requirements.md` §3.2 and §9 carry the dated removal decision; `docs/tech_spec.md` §2, §3.1, §13.1, §16.3 no longer describe solar as shipped.
- [ ] `npm test`: green, or failing **only** at the known Task-1 reasons assertion (`tests/selfcheck.mjs:169`) if Task 1 is not yet done — no solar- or pwa-related error.
- [ ] Results screen (manual): after "Next month" comes "Sources and assumptions" with no solar section in between.

## Verification — Branch A

1. `rg -in "solar" www/ tests/ package.json` → no output. `rg -in "selfuse" www/` → no output.
2. `ls www/lib/` → `solar.js` absent; `grep -n "tanaw-v3" www/sw.js` → matches line 3; `grep -n "solar" www/sw.js` → no output.
3. `npm test` → expect exit 0 with final lines `chat OK`, `reasons OK`, `pwa OK` (if Task 1 is complete). If reasons is still empty, the only failure is `AssertionError: reasons.json has no usable advisory for 2026-01; run npm run advisories` at `tests/selfcheck.mjs:169` — nothing solar-related, and the run never gets a pwa error.
4. Optional manual UI check: `npm start`, open http://localhost:8000, click "Try the SYNTHETIC sample", confirm fields, click "Looks right, explain my bill". The results screen must show no "Does rooftop solar pay off?" heading, no self-use dropdown, no payback table, and no solar/export-credit lines under "Sources and assumptions".

---

## Changes — Branch B (contingency: re-scope in; docs-only)

Only if the team explicitly re-decides. **No code changes** — `www/lib/solar.js`, the UI, the SW precache entry, and the test assertions stay exactly as at HEAD.

1. **`docs/requirements.md`**:
   - §2 line 57: `- Challenge 1 — solar comparison and rewards. Solar has been removed from v1.` → `- Challenge 1 — rewards, points, badges, leaderboards remain out of scope. Rooftop solar payback is re-scoped into v1 as a product decision (2026-11-12, OQ2): see FR-E-12/FR-E-13 and AC-14.`
   - §3.2 line 84: **delete** the solar row (it is no longer out of scope).
   - §5.4: after the FR-E-11 row, add:
     ```markdown
     | FR-E-12 | The results screen shows rooftop solar payback in three scenarios (offset-all at retail, offset-all export-aware, right-sized for self-consumption), priced from the bill's own generation rate, with the yield, system cost, and fee constants disclosed in the sources panel. | Implemented |
     | FR-E-13 | The self-consumption share is a user-adjustable assumption; changing it re-renders the payback table. | Implemented |
     ```
   - §8: after the AC-13 row, add:
     ```markdown
     | AC-14 | Given a completed analysis, when the results render, then the solar payback table shows three scenarios and the sources panel lists the yield, cost, and fee assumptions. |
     ```
   - §9 line 275: **delete** the solar row (it is no longer removed).
   - §11 line 307: `| Goal: manage usage | FR-E-3..4, FR-P-1..4 |` → `| Goal: manage usage | FR-E-3..4, FR-E-12..13, FR-P-1..4 |`

2. **`docs/tech_spec.md`**:
   - §2 line 77: → `| Solar | Implemented (\`www/lib/solar.js\`, UI) | Retained — re-scoped into v1 on 2026-11-12 (OQ2; FR-E-12) |`
   - §3.1 line 91: `Keep; add OCR branch and remove solar UI` → `Keep; add OCR branch`
   - §3.1 line 98: → `| \`www/lib/solar.js\` | Solar payback | Retained; re-scoped into v1 (FR-E-12, 2026-11-12) |`
   - §13.1 line 490: → `- projection and payback sanity (solar payback re-scoped into v1 on 2026-11-12; assertions retained).`
   - §13.2 line 505: → `| Scope guard | Assert no rewards UI or exports ship in v1 (solar is in scope, FR-E-12). |`
   - §16.3 line 578: **delete** the solar bullet (keep the Capacitor bullet).

## Acceptance Criteria — Branch B

- [ ] Code is untouched: `git status --porcelain www/ tests/` is empty.
- [ ] `docs/requirements.md`: solar row gone from §3.2 and §9; FR-E-12 and FR-E-13 exist with status **Implemented**; AC-14 exists; §2 states solar is re-scoped in; no remaining "removed from v1" claim about solar.
- [ ] `docs/tech_spec.md`: §2, §3.1, §13.1, §13.2, §16.3 are mutually consistent with solar in scope; §16.3 no longer lists solar as out-of-scope code.
- [ ] `npm test` behaves exactly as before the task (solar payback assertion at `tests/selfcheck.mjs:47` still runs; same green/red state as pre-task — red only if reasons is still empty).
- [ ] Note handed to Task 10: the scope-guard test must assert **no rewards UI ships**, and must **not** assert solar absence.

## Verification — Branch B

1. `git status --porcelain www/ tests/` → empty output.
2. `rg -in "solar" www/ tests/` → matches present in exactly `www/app.js`, `www/index.html`, `www/sw.js`, `www/lib/solar.js`, `tests/selfcheck.mjs` (same as HEAD).
3. `grep -n "FR-E-12\|FR-E-13\|AC-14" docs/requirements.md` → all present; `grep -n "Removed from v1" docs/tech_spec.md` → no solar row among matches.
4. `npm test` → identical result to pre-task run.

---

## Edge Cases & Non-Goals

- **`docs/update.md` is generated** (regenerated in Task 12). Do not hand-edit it; its "solar still ships" lines (5, 47, 71–72) go stale in the interim — expected.
- **`hackathon_challenges.md` and `AGENTS.md`** quote Challenge 1's official text (which mentions solar). These are source documents, not v1 scope statements — do not touch.
- The "Export credit = …" sources line (`www/app.js:142`) contains no word "solar" but is solar-specific — it must be deleted with line 141 in Branch A. A naive "delete lines matching /solar/" would miss it (and the `#selfuse` id in `index.html`).
- **pwa-test interlock:** the `www/lib/solar.js` deletion and the `FILES` edit must land together — either half alone breaks `test_pwa` in the opposite direction.
- Do **not** fix the red reasons assertion (Task 1), do **not** build the scope-guard test itself (Task 10 — Task 5 only puts the code in the state that guard will check), do **not** touch the disputes/flags/chat/dashboard features (Task 6), do **not** touch `package.json` (no dependency changes), do **not** touch Capacitor/iOS (deferred).
- `www/style.css` has no solar selectors (verified) — no CSS cleanup needed.
- Branch A's README edit is limited to the one layout row that names the deleted file; the full README feature-list reconciliation belongs to Task 12.
- `PLAN.md` is not edited by this task; OQ2's resolution is recorded in `requirements.md`/`tech_spec.md` per the acceptance criteria and picked up by Task 12's audit regeneration.
