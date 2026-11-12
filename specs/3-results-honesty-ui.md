# Spec: Results-honesty UI — no-published-reason/evergreen state and lifeline/senior warning (Task 3 from PLAN.md)

## Goal
Make the results view always honest: show Meralco's verbatim advisory only when it passes the existing attribution gate, otherwise show an explicit "Meralco has not published a reason for this rate month" state with Meralco's evergreen "why your bill can change" categories (never a hidden/empty block), and warn — without re-deriving — when a bill carries lifeline/senior discount lines.

Covers FR-E-7, FR-E-8, FR-E-9, FR-E-10 (and AC-6, AC-7, AC-8, AC-9).

## Inputs & Context

- **PLAN.md Task 3** ("Complete the results-honesty UI"). Depends on Task 1 for the "advisory present" case; the not-published state is correct regardless of `reasons.json` contents.
- **`www/lib/explain.js`** — the reason module.
  - `usableReason(x)` (lines 39-41): the hard attribution gate — returns the entry only if `text`, `date`, and a `meralco.com.ph`-host `url` all hold; else `null`. **Keep unchanged.**
  - `explain(...)` (lines 45-91): already returns `reason: usableReason(reasons[m1])` (line 84) — the chat (`chatCtx` in `app.js:149`) and `disputePacket` (`www/lib/flags.js:98`) read `r.reason`. **Keep the `reason` field; this task is additive, do not change `explain`'s return shape.**
  - `lookup(...)` (lines 17-20) prices at `non_lifeline` rows only; the `shortcut:` note (line 16) already says lifeline rows are unused. **The app already does NOT re-derive lifeline/senior discounts — do not modify `lookup`.**
- **`www/app.js`**
  - import line 6: `import { explain, validateRates } from './lib/explain.js';`
  - `renderResults()` lines 96-144. The reason block is lines 107-110:
    ```js
    const why = r.reason;
    $('#reason').hidden = !why;
    if (why) $('#reason').innerHTML = `<b>Meralco's advisory for this rate month (${esc(why.date)}):</b> “${esc(why.text)}”
      <a href="${esc(why.url)}" target="_blank" rel="noopener">${esc(why.title ?? 'Source')}</a>`;
    ```
    This is the silent-hide bug: when `why` is null the block is hidden and nothing else is shown.
  - `esc`, `peso` helpers (lines 16-17) are already in scope — reuse them.
- **`www/index.html`** — results section lines 43-74. `<blockquote id="reason" hidden>` is line 46; `<table id="items"></table>` is line 48.
- **`www/style.css`** — `#reason` is styled at line 31; `.note` class (line 13) gives a left-bordered warning box.
- **`tests/selfcheck.mjs`** — `test_reasons` block lines 161-171 (asserts `usableReason` + that each of the 10 rate months has a usable advisory). This block is the "attribution gate still holds" test and **must stay green** (it is currently red only because `reasons.json` is `{}` — Task 1 fixes the data, not this code). New tests are added data-independent (inline fixtures) so they pass regardless of the committed `reasons.json`.
- **Data (for manual checks only):** `www/data/reasons.json` is currently `{}`; `www/data/rates.json` has 10 months `2026-01`..`2026-10`. The SYNTHETIC sample bills (`www/data/fixtures/SYNTHETIC_*.pdf`, truth in `tests/SYNTHETIC_truth.json`) both contain `lifeline` and `senior_subsidy` charge lines, so the discount warning is reachable in a manual run. The samples' detected rate month is `2026-10`.
- **Evergreen source (real, verifiable):** Meralco's live page `https://www.meralco.com.ph/residential/understand-your-bill`, section **"Why your bill can change"**, has exactly five categories (heading + description), verified against the live page. These are Meralco's own words and are quoted verbatim below with that URL — this satisfies "never fabricate" (FR-E-8) and is not app-authored cause text.

## Changes

Ordered. Each is a focused edit to a real file.

### 1. `www/lib/explain.js` — add three exports (no existing code changed)

Insert after the `usableReason` function (after line 41):

```js
// Meralco's own evergreen "why your bill can change" categories, quoted verbatim from
// https://www.meralco.com.ph/residential/understand-your-bill (section "Why your bill can change").
// Shown ONLY when the detected rate month has no published advisory (FR-E-9). Meralco's words, never app-authored.
export const EVERGREEN = {
  url: 'https://www.meralco.com.ph/residential/understand-your-bill',
  categories: [
    { text: 'Electricity use changed', detail: 'Weather, occupancy, appliance use, and operating hours can increase or reduce consumption.' },
    { text: 'The billing period has a different number of days', detail: 'Compare daily consumption as well as the total kilowatt-hours when billing periods differ.' },
    { text: 'Rates or pass-through charges changed', detail: 'Generation, transmission, taxes, and other approved charges can change by period.' },
    { text: 'A meter reading or adjustment was posted', detail: 'Estimated readings, corrections, credits, or prior-period adjustments can affect the total.' },
    { text: 'A prior balance or payment changed', detail: 'Check previous balances, payment posting dates, and account credits.' },
  ],
};

// Results-view decision (FR-E-7/8/9): the advisory renders only when it passes the gate;
// otherwise an explicit not-published state that carries the evergreen categories.
export function reasonState(reasons, month) {
  const reason = usableReason(reasons?.[month]);
  return reason ? { kind: 'advisory', reason } : { kind: 'not_published', evergreen: EVERGREEN };
}

// Lifeline/senior discount lines exactly as printed on the bill (FR-E-10). Passed through, never re-derived.
export function discountLines(bill) {
  return (bill?.charges ?? []).filter(c => c.key === 'lifeline' || c.key === 'senior_subsidy');
}
```

Rationale: `EVERGREEN` lives in code (not `reasons.json`) because `scripts/fetch_advisories.mjs` (line 55) and `scripts/make_synthetic.mjs` (line 94) both overwrite `reasons.json`, so a data field would be silently wiped; a constant is durable and is still honest (verbatim Meralco text + real `meralco.com.ph` URL). `reasonState` is a pure function so it is unit-testable without a DOM. `discountLines` detects the pass-through lines; it does no arithmetic.

### 2. `www/index.html` — add two result containers

In the results `<section>` (lines 43-49), add `#evergreen` right after `#reason` and `#discountwarn` right after `#items`:

Change:
```html
      <p id="sentence" class="big"></p>
      <blockquote id="reason" hidden></blockquote>
      <div id="bar" class="bar" aria-hidden="true"></div>
      <table id="items"></table>
      <h2>Possible billing error?</h2>
```
to:
```html
      <p id="sentence" class="big"></p>
      <blockquote id="reason" hidden></blockquote>
      <div id="evergreen" hidden></div>
      <div id="bar" class="bar" aria-hidden="true"></div>
      <table id="items"></table>
      <p id="discountwarn" class="note" hidden></p>
      <h2>Possible billing error?</h2>
```

### 3. `www/app.js` — import + render the three honesty states

(a) Extend the import (line 6):
Change:
```js
import { explain, validateRates } from './lib/explain.js';
```
to:
```js
import { explain, validateRates, reasonState, discountLines, EVERGREEN } from './lib/explain.js';
```

(b) In `renderResults()`, replace the reason block (lines 107-110, the `const why = r.reason;` block shown in Context) with:
```js
  const state = reasonState(reasons, r.rate_month);
  if (state.kind === 'advisory') {
    $('#reason').hidden = false;
    $('#reason').innerHTML = `<b>Meralco's advisory for this rate month (${esc(state.reason.date)}):</b> “${esc(state.reason.text)}”
      <a href="${esc(state.reason.url)}" target="_blank" rel="noopener">${esc(state.reason.title ?? 'Source')}</a>`;
    $('#evergreen').hidden = true;
  } else {
    $('#reason').hidden = true;
    $('#evergreen').hidden = false;
    $('#evergreen').innerHTML =
      `<p><b>Meralco has not published a reason for this rate month (${esc(r.rate_month)}).</b></p>` +
      `<p class="hint">Meralco's own categories for why a bill can change, from its "Understand your bill" page:</p>` +
      `<ul>${EVERGREEN.categories.map(c => `<li><b>${esc(c.text)}</b> — ${esc(c.detail)}</li>`).join('')}</ul>` +
      `<a href="${esc(EVERGREEN.url)}" target="_blank" rel="noopener">meralco.com.ph/residential/understand-your-bill</a>`;
  }
  const discounts = discountLines(bill);
  $('#discountwarn').hidden = !discounts.length;
  if (discounts.length) {
    $('#discountwarn').innerHTML =
      `<b>Lifeline / senior-citizen discount lines on this bill:</b> ` +
      discounts.map(c => `${esc(c.label)} ${peso(c.amount_php)}`).join(', ') +
      `. These amounts are shown exactly as printed on your bill; TANAW did not recalculate or re-derive this discount.`;
  }
```
Notes: the advisory markup is byte-for-byte the old markup (same quote/date/link), so the "advisory present" behavior is unchanged. All bill/URL text goes through `esc` (FR-PR-3). No change to `startChatUI()`/`renderFlags()` (lines 111-112) or to anything else in `renderResults`.

### 4. `www/style.css` — minimal styling for the evergreen block

Append (near the `#reason` rule at line 31):
```css
#evergreen { margin: 8px 0; border-left: 4px solid var(--line); padding: 4px 12px; font-size: 14px; }
#evergreen ul { margin: 8px 0; padding-left: 18px; }
#evergreen a { color: var(--accent); }
```
`#discountwarn` reuses the existing `.note` class; no extra rule needed.

### 5. `tests/selfcheck.mjs` — add data-independent tests

Insert a new block immediately after the existing `test_reasons` block (after line 171, `console.log('reasons OK');`):

```js
// test_reason_state: the results view shows the advisory only when it passes the gate;
// otherwise an explicit not-published state that carries the evergreen categories (FR-E-7/8/9)
{
  const { reasonState, discountLines, EVERGREEN } = await import('../www/lib/explain.js');
  const ok = { date: '2026-10-13', text: 'x', url: 'https://www.meralco.com.ph/media/articles/a' };
  assert.equal(reasonState({ '2026-10': ok }, '2026-10').kind, 'advisory');
  for (const bad of [
    { '2026-10': { ...ok, url: 'https://meralco.com.ph.evil.com/a' } }, // non-meralco host
    { '2026-10': { ...ok, text: '' } },                                  // missing quote
    {},                                                                  // no entry
    { '2026-10': undefined },                                            // explicit null
  ]) assert.equal(reasonState(bad, '2026-10').kind, 'not_published', JSON.stringify(bad));
  const notPub = reasonState({}, '2026-10');
  assert.ok(notPub.evergreen.categories.length >= 1, 'not-published state carries evergreen categories');
  assert.ok(EVERGREEN.categories.every(c => c.text && c.detail), 'every evergreen category has verbatim text');
  assert.match(new URL(EVERGREEN.url).hostname, /(^|\.)meralco\.com\.ph$/, 'evergreen source is a meralco.com.ph page');
  // test_discount_lines: lifeline/senior lines are detected for the pass-through warning; absent otherwise (FR-E-10)
  const withDisc = { charges: [
    { key: 'lifeline', label: 'Lifeline', amount_php: 2.43 },
    { key: 'senior_subsidy', label: 'Senior Citizen', amount_php: 0.02 },
    { key: 'generation', label: 'Generation', amount_php: 100 }] };
  assert.deepEqual(discountLines(withDisc).map(c => c.key).sort(), ['lifeline', 'senior_subsidy']);
  assert.equal(discountLines({ charges: [{ key: 'generation', label: 'Generation', amount_php: 100 }] }).length, 0);
}
console.log('reason state OK');
```

These use inline fixtures, so they pass whether or not Task 1 has populated `reasons.json`.

## Acceptance Criteria

1. **Advisory present (FR-E-7, AC-6):** when the detected rate month has a valid advisory (after Task 1), the results view shows the verbatim quote, its date, and a clickable `meralco.com.ph` link (the `#reason` block). Markup is unchanged from before.
2. **No advisory (FR-E-9, AC-7):** when the rate month has no valid advisory, the view shows "Meralco has not published a reason for this rate month (YYYY-MM)" plus the five evergreen categories and the `meralco.com.ph` link. The block is never hidden/empty. (Trivially observable right now, since committed `reasons.json` is `{}`.)
3. **Attribution gate still holds (FR-E-8, AC-8):** the existing `test_reasons`/`usableReason` assertions remain intact, and the new `reasonState` test proves any non-validating/missing reason yields the not-published state (no advisory render). No reason ever renders without quote + date + `meralco.com.ph` URL.
4. **Lifeline/senior passthrough (FR-E-10, AC-9):** a bill carrying `lifeline`/`senior_subsidy` lines shows the "TANAW did not recalculate or re-derive this discount" warning with the line labels and peso amounts; a bill without them shows nothing. `lookup` is unchanged (no re-derivation).
5. **New tests pass:** `test_reason_state` and `test_discount_lines` pass; the rest of the suite is unaffected by this task.

## Verification

1. **Unit:** `npm test`. The new block is *data-independent* (inline fixtures), but it is inserted **after** the pre-existing `test_reasons` assertion at `tests/selfcheck.mjs:169`, which throws until `reasons.json` holds the 10 advisories (Task 1's data work, not this code). So: **before** Task 1, `npm test` still fails at line 169 and the new block never runs (expected — PLAN orders Task 3 after Task 1). **After** Task 1, `npm test` passes and prints the new `reason state OK` line. To sanity-check the new logic in isolation before Task 1 lands, run the block's assertions manually (e.g. `node --input-type=module -e "..."` importing `../www/lib/explain.js`) — they pass regardless of `reasons.json`.
2. **Not-published + evergreen + discount warning (works now, no data needed):** `npm start`, open the app, click **Try the SYNTHETIC sample**, then **Looks right, explain my bill**. Because committed `reasons.json` is `{}`, the results must show the "Meralco has not published a reason for this rate month (2026-10)" state with the five evergreen categories and the Meralco link, and (because the sample has both lines) the discount warning "Lifeline / senior-citizen discount lines on this bill: Lifeline ₱2, Senior Citizen ₱0 ... did not recalculate". Confirm `#reason` is empty/hidden and `#evergreen` is populated.
3. **Advisory present (needs Task 1):** with `reasons.json` populated for `2026-10`, repeat the sample flow; `#reason` now shows the quoted advisory (date + link) and `#evergreen` is hidden. The discount warning still shows.
4. **Gate regression:** confirm `npm test` still prints `reasons OK` (the `usableReason` gate) — i.e. this task did not weaken the gate.
5. **Manual negative for discount warning (optional):** in the console, or by loading a bill without lifeline/senior lines, confirm `#discountwarn` stays hidden.

## Edge Cases & Non-Goals

- **`reasons.json` is `{}` until Task 1.** This task is correct in both data states: empty data → not-published state (honest); populated data → advisory. Do not fabricate advisory data here; that is Task 1.
- **`evergreen` as a code constant vs. tech_spec §4.5.** `tech_spec.md` §4.5 shows `evergreen` inside `reasons.json`. This spec deliberately keeps it as a code constant in `explain.js` because `fetch_advisories.mjs`/`make_synthetic.mjs` overwrite `reasons.json` and would wipe a data field. This is a minor deviation from §4.5; flag it for Task 12 (docs reconciliation) to either update §4.5 or move the constant to data with generator preservation. The content is unchanged (verbatim Meralco text + real URL).
- **Double-counting is out of scope.** The itemized breakdown is rate-derived at `non_lifeline` rates; the bill's actual lifeline/senior amounts are shown only in the warning, not added back into the breakdown sum. Folding them in would be re-derivation, which FR-E-10 forbids. Any discrepancy is already absorbed by the existing "local tax and rounding" residual (FR-E-6).
- **`lookup` is intentionally untouched.** It already uses only `non_lifeline` rows; "no code path re-derives the bracket percentages" is satisfied by the existing behavior plus the pass-through warning. Do not add lifeline bracket math.
- **`explain()` return shape is unchanged.** `reason` stays in the return (used by the chat and `disputePacket`); `reasonState`/`discountLines`/`EVERGREEN` are additive.
- **Detection is presence-based.** The warning triggers when a `lifeline`/`senior_subsidy` charge line is present, regardless of amount; the amount is shown so a ₱0.00 line is self-evident to the user.
- **Non-`meralco.com.ph` evergreen source** is impossible here (the URL is a fixed constant matching the gate's host rule); the `reasonState` test asserts the host.
