# Spec: Block analysis while any self-check fails (Task 2 from PLAN.md)

## Goal
Make the "Looks right, explain my bill" action (`#go`) impossible to run while any of the four numeric self-checks is red — disabled button + a guard in the handler — and cover the gate with a Node test.

## Inputs & Context
- Derives from **Task 2** in `PLAN.md` (FR-V-3, AC-2 in `docs/requirements.md:146,256`). `docs/update.md:41,65` records the current truth: "`#go` is never disabled — the user can run 'explain' with red checks … only field highlighting exists."
- **The checks** — `www/lib/checks.js` (whole file, lines 3–12). `runChecks(b)` returns the four checks, each `{ name, expected, found, passed, fields }` (`passed` = within ±1). Do **not** change the checks themselves.
- **The confirm screen** — `www/app.js`:
  - `renderConfirm()` (lines 55–63) renders editable fields, then calls `renderChecks()`.
  - `renderChecks()` (lines 65–70) computes `const checks = runChecks(bill)`, renders the ✓/✗ list into `#checks`, and toggles the `bad` class on disagreeing inputs. Called from `renderConfirm()` and from `$('#fields').oninput` (lines 72–79), so it re-runs on **every keystroke** — the natural home for the gate.
  - `$('#go').onclick` (lines 82–92) is the **only** path to results: it computes the analysis and calls `show('results')`. There is no other route into the results screen (only `show('confirm')` at line 38, `show('results')` at line 90, `show('upload')` at line 310).
- **The button** — `www/index.html:40`, inside the hidden `#confirm` section: `<button id="go" class="primary">Looks right, explain my bill</button>`.
- **Styles** — `www/style.css`: `.primary` (line 9) paints an orange background with no `:disabled` treatment, so a disabled button would not look obviously disabled without a rule.
- **Tests** — `tests/selfcheck.mjs`, run via `npm test` (`package.json:12`). Pure Node, no DOM/jsdom: UI state cannot be asserted in Node, so the gate predicate must live in a Node-importable module. `runChecks` is already imported at line 8; existing pass/fail behavior is asserted at lines 39–41 (`analyse()`). The good/weak fixture loop ends at line 85.
- **Single source of truth for the gate:** the predicate `every check passed` derived from `runChecks`. All three consumers (button state, handler guard, Node test) must use the same definition.

## Changes
Numbered, in order. Four small edits, no new files.

1. **`www/lib/checks.js`** — add an exported gate predicate after `runChecks` (line 12):
   ```js
   export const checksPass = b => runChecks(b).every(c => c.passed);
   ```
   Nothing else in this file changes.

2. **`www/app.js`** — three edits:
   - Line 4: extend the import to `import { runChecks, checksPass } from './lib/checks.js';`.
   - `renderChecks()` (line 70, end of the function, after the `document.querySelectorAll(...)` block): set the button state from the checks already computed in that function:
     ```js
     $('#go').disabled = checks.some(c => !c.passed);
     ```
     This runs on initial confirm render and on every field edit, so the button re-enables the moment the user fixes a failing field and re-disables the moment they reintroduce a mismatch.
   - `$('#go').onclick` (line 82): add a defensive guard as the first statement of the handler, so analysis is blocked even if the button were ever invoked while red (belt-and-braces; the disabled attribute is the primary gate):
     ```js
     if (!checksPass(bill)) return msg('Fix the red self-checks before explaining.');
     ```

3. **`www/style.css`** — make the disabled state visible; add one rule (e.g. after the `.primary` rule on line 9):
   ```css
   #go:disabled { background: #9e9e9e; cursor: not-allowed; opacity: .7; }
   ```

4. **`tests/selfcheck.mjs`** — cover the gate:
   - Line 8: change the import to `import { runChecks, checksPass } from '../www/lib/checks.js';`.
   - After the good/weak loop (i.e. after line 85, before the `golden_bill.pdf` block at line 87), add:
     ```js
     // test_gate (FR-V-3 / AC-2): a red self-check disables the explain action; fixing the field re-enables it
     {
       const b = await readBill('www/data/fixtures/SYNTHETIC_bill.pdf');
       assert.ok(checksPass(b), 'sample bill: all checks pass → explain enabled');
       const red = { ...b, kwh: b.kwh + 50 };
       assert.ok(!checksPass(red), 'kWh disagreeing with readings and tracker → explain disabled');
       assert.ok(checksPass({ ...red, kwh: b.kwh }), 'editing the field back to a consistent value → explain enabled again');
       assert.ok(!checksPass({ ...b, total_amount_due: b.total_amount_due + 100 }), 'total disagreeing with its components → explain disabled');
     }
     console.log('gate OK');
     ```
     (Reuses the existing `readBill` helper, line 28. The `kwh + 50` mismatch reproduces the same `['readings', 'tracker_latest']` failure the suite already asserts at line 41; the `total_amount_due + 100` case exercises the `total` check via a different field path than the kwh edit does.)

## Acceptance Criteria
- `npm test` exits 0 and its output includes a new `gate OK` line (after `selfcheck OK`, before `disputes OK`), with all previously passing suites still green.
- `www/app.js` contains `$('#go').disabled = checks.some(c => !c.passed);` inside `renderChecks()` and the `checksPass(bill)` guard at the top of `$('#go').onclick`.
- With a sample bill loaded, the explain button is enabled (all four checks ✓); corrupting any one field so a check turns red disables it; correcting it re-enables it.
- A red-check bill cannot reach the results screen: the button is unclickable, and invoking the handler directly with a failing check returns the "Fix the red self-checks before explaining." message without calling `show('results')`.
- The four self-checks themselves (`www/lib/checks.js` names, tolerances, `fields` lists) are unchanged — `npm test`'s existing `test_checks` assertions (lines 39–41) still pass unmodified.

## Verification
Run from the repo root, in order:

1. **Unit level:** `npm test` — expect exit 0 and output containing `selfcheck OK`, `gate OK`, `disputes OK`, … `pwa OK`.
2. **Manual DOM check (the part Node tests cannot cover):** `npm start`, open http://localhost:8000:
   1. Click **Try the SYNTHETIC sample** → confirm screen: all four checks show ✓, the "Looks right, explain my bill" button is orange/clickable. Click it → results screen renders (no regression for green bills).
   2. Click **Start over** → load the sample again → on the confirm screen, change the **kWh used** field to its value + 50. Expected, immediately (no other action needed): the *readings* and *tracker_latest* checks flip to ✗ (red), the disagreeing inputs get the red `bad` outline, and the explain button turns grey and is disabled. Clicking it does nothing.
   3. Change **kWh used** back to its original value. Expected: checks flip back to ✓ and the button re-enables; clicking it reaches the results screen.
   4. (Optional, exercises the handler guard) In the browser console with a red check present: `document.querySelector('#go').onclick()` → `#msg` shows "Fix the red self-checks before explaining." and the results screen is **not** shown.

## Edge Cases & Non-Goals
- **No change to check semantics:** the ±1 tolerance, the four check names, and the `fields` attribution stay exactly as in `www/lib/checks.js` (FR-V-1/FR-V-5 already covered).
- **No new UI copy required:** the red ✗ list plus red field outlines (existing FR-V-5) explain why the button is disabled; the spec adds no additional banner or text beyond the guard message.
- **Disabled initial state is always set before the button is visible:** `#confirm` is hidden until `renderConfirm()` runs, which calls `renderChecks()`, so the button is never shown in a stale enabled state.
- **Docs:** `requirements.md:146` already lists FR-V-3 as "Implemented" — this task makes that true; `docs/update.md:41,65` will go stale but is regenerated by **Task 12**, so no doc edits here.
- **Out of scope:** OCR low-confidence field flags (FR-V-4, Tasks 8/9), any backend changes, and touching the dispute/chat/flags features (they run only after analysis, which now requires green checks; `renderFlags`' own `runChecks` call is unaffected).
