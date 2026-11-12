# Spec: Add the missing trust, privacy, and scope-guard tests (Task 10 from PLAN.md)

## Goal
Add three Node-runnable test blocks to `tests/selfcheck.mjs` that encode the v1 trust invariants as enforced assertions — **privacy** (no network request carries bill data; no unexpected persistence of inputs), **offline full-flow** (the app shell's reachable assets are all precached so the flow works with the network disabled), and **scope guard** (no out-of-scope solar/rewards UI ships) — while leaving the existing attribution-gate, breakdown-sums, model-tier/refusal, and PWA-precache tests green and unmodified.

## Inputs & Context
- **Derives from:** PLAN.md Task 10 + `docs/tech_spec.md` §13.2 ("Required additions": rows *Privacy*, *Offline*, *Scope guard*) and §9 (Privacy & security table), §10 (Deployment/offline). PLAN.md acceptance names exactly three new tests: a privacy test, a scope-guard test, and an offline full-flow assertion, plus the four existing suites staying green.
- **The single file this task changes:** `tests/selfcheck.mjs` (run by `npm test` → `node tests/selfcheck.mjs`; `package.json` L12). No new files, no production code changes, no data changes.
- **How the suite works today (grounded):**
  - It is a plain Node ESM script using `node:assert/strict` (`tests/selfcheck.mjs` L3). Top imports: `node:fs` (`existsSync`, `readFileSync`) L4; `pdfjs-dist` L5; app libs L6–12. Helpers `json` (L25), `near` (L27), `readBill` (L28).
  - Each suite ends with a `console.log('<name> OK')`. Existing suites: `test_feedback` (L14), `test_rates` + per-bill `analyse` (L31–67, includes **breakdown-sums** at L45 and **model-tier/refusal** at L78–84), `test_disputes` (L96), `test_dashboard_samples` (L110), `test_bracket_lookup` (L119), `test_chat` (L128), **`test_reasons` = attribution gate** (L161–171, via `usableReason` from `www/lib/explain.js` L39–41), **`test_pwa` = PWA precache** (L173–180, regex-parses `const FILES = [...]` from `www/sw.js`).
- **The privacy/persistence surface (what the privacy test must reflect — the post-Task-6 boundary):**
  - Network: the only `fetch` with a request **body** is the consent-gated, dev-only escalation `postCase` → `fetch('api/cases', { method: 'POST', … body: JSON.stringify(packet) })` (`www/app.js` L176), guarded by `if (!confirm(…)) return;` (L174). Every other `fetch` is a same-origin GET of bundled data/fixture: `www/app.js` L21 (`data/${n}.json`), L46 (`data/fixtures/${name}.pdf`); `www/dashboard.js` L34 (`api/cases`, GET), L37 (`data/fixtures/SYNTHETIC_packets.json`, GET). `www/sw.js` L14 `fetch(e.request)` is the SW network-first passthrough (variable URL, no bill data). No `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `document.cookie`, or analytics anywhere in `www/`.
  - Persistence: the **only** storage write in the app is `localStorage.setItem(STORE, JSON.stringify(list))` (`www/app.js` L230) where `const STORE = 'tanaw.disputes'` (L228) — the consented, on-device-only "My disputes" store. No other file under `www/` touches `localStorage`/`indexedDB`/`sessionStorage`/cookies. The PDF password is cleared after open: `$('#pw').value = ''` (`www/app.js` L35).
- **The scope state (what the scope guard must reflect — the post-Task-5/6 scope):**
  - Solar is **out of v1** (`docs/requirements.md` §9 "Removed"; `docs/tech_spec.md` §16.3). Per the PLAN default (Task 5 / OQ2 = remove), after Task 5 the shipped build has **no** solar: `www/app.js` does not import/call `solar`/`SOLAR`, `www/index.html` has no `#solar`/`#selfuse`/"rooftop solar" UI, `www/sw.js` `FILES` has no `lib/solar.js`, and `www/lib/solar.js` is not reachable from the app entry. (Currently all four are present — `www/app.js` L7, L304–309; `www/index.html` L61–70; `www/sw.js` L5; `tests/selfcheck.mjs` L11, L46–47 — so the guard will fail until Task 5 runs.)
  - Rewards/points/badges/leaderboards are **out of scope and never built**: no `reward`/`leaderboard`/`loyalty` tokens exist anywhere in `www/` today.
  - The dispute extension (flags/chat/disputes/dashboard) is **in scope** (Task 6 / OQ3 default = scope in as FR-DSP-1..5; see `specs/6-reconcile-dispute-extension-privacy.md`), so the scope guard must **not** flag it as out-of-scope.
- **The offline mechanism (what the offline test asserts structurally):** `www/sw.js` — `const CACHE = 'tanaw-v2'` (L3); `install` does `caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())` (L9); `activate` deletes keys `k !== CACHE` (L10–11); the `fetch` handler falls back to `.catch(() => caches.match(e.request, { ignoreSearch: true }))` (L17). `FILES` (L4–7) currently precaches the shell, all `lib/*`, `vendor/*`, `data/*.json`, and the two fixture PDFs.
- **Preconditions (run first):** Task 5 (solar removed → scope guard passes) and Task 6 (privacy boundary written → privacy test reflects the true boundary). This task's assertions encode the *final* scope; if a guard fails because solar still ships or the privacy boundary is un-reconciled, that is the guard working — finish Task 5/6.

## Changes
All edits are in **one file: `tests/selfcheck.mjs`**. Order: extend imports → add one shared helper → append three test blocks after the existing `test_pwa` block (L180). Do **not** edit any existing suite.

### 1. `tests/selfcheck.mjs` — extend the top imports (L4)
Replace:
```js
import { existsSync, readFileSync } from 'node:fs';
```
with:
```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
```
(`readdirSync` is currently imported only inline at L177; `node:path` is new. Both are needed by the helper below.)

### 2. `tests/selfcheck.mjs` — add the shared helper `offlineAssets()` (after the `readBill`/`FIELDS` block, ~L29)
Purpose: compute the set of local `www/` files the `index.html` shell (entry `www/app.js`) can reach at runtime, so the offline test can require each be in the SW `FILES` precache. It is also reused by the scope guard (to confirm no solar asset is reachable).
```js
// Every local asset the app entry (www/app.js) can reach at runtime must be SW-precached,
// or the full flow breaks when the network drops after first load.
function offlineAssets() {
  const need = new Set();
  const add = p => { const q = relative('www', p); if (q && !q.startsWith('..' + sep) && existsSync(p)) need.add(q); };
  // (1) static import closure from the app entry
  const seen = new Set(), stack = ['www/app.js'];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const p = resolve(dirname(f), m[1]);
      if (p.startsWith('www' + sep) && existsSync(p)) stack.push(p);
    }
    // (2) string-literal runtime asset targets (pdf.js worker; future OCR worker). Not register(): the SW manages its own lifecycle.
    for (const m of src.matchAll(/(?:workerSrc\s*=\s*|new\s+Worker\()\s*['"]([^'"]+)['"]/g)) add(resolve(dirname(f), m[1]));
  }
  // (3) bundled data the app fetches: every top-level data JSON + every fixture PDF (the sample bills)
  for (const f of readdirSync('www/data')) if (f.endsWith('.json')) add(`www/data/${f}`);
  for (const f of readdirSync('www/data/fixtures')) if (f.endsWith('.pdf')) add(`www/data/fixtures/${f}`);
  // (3b) OCR model files (Task 8): if the models dir exists, every model must be precached for offline
  if (existsSync('www/models')) for (const f of readdirSync('www/models')) add(`www/models/${f}`);
  // (4) the shell itself
  for (const f of ['index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']) add(`www/${f}`);
  return [...need];
}
```
Note for the implementer: the two dynamic `fetch(`data/${n}.json`)` / `fetch(`data/fixtures/${name}.pdf`)` template literals are intentionally **not** resolved as literal paths; step (3) covers their concrete targets (`data/*.json`, `data/fixtures/*.pdf`) directly. `sw.js` is deliberately excluded (the browser manages the SW; it is not a precached asset).

### 3. `tests/selfcheck.mjs` — append `test_privacy` (after L180)
Encodes FR-PR-1 (no runtime network call carries bill data), FR-PR-2 (no unexpected persistence of inputs), and NFR-10 (no analytics/third-party calls).
```js
// test_privacy: no request carries bill data (only the consent-gated, dev-only api/cases escalation posts a body);
// no persistence except the consented on-device 'tanaw.disputes' store; PDF password cleared, never stored
{
  const app = readFileSync('www/app.js', 'utf8');
  const appCode = app + '\n' + readFileSync('www/dashboard.js', 'utf8'); // app code (not the SW)
  // (a) no network / side-channel API other than fetch. (Web Worker postMessage is on-device, not a network
  //     request, so it is allowed — Task 8's OCR worker uses it; do NOT ban .postMessage here.)
  for (const bad of [/XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket/, /document\.cookie\s*=/])
    assert.ok(!bad.test(appCode), `app code uses a network/side-channel API: ${bad}`);
  // (b) every string-literal fetch URL in app code is a bundled data/asset GET or the dev-only api/cases
  const urls = [...appCode.matchAll(/fetch\(\s*(['"`])([^'"`?#]+)\1/g)].map(m => m[2]);
  assert.ok(urls.length, 'expected fetch calls in app code');
  for (const u of urls) assert.ok(/^data\//.test(u) || u === 'api/cases', `fetch target ${u} is not bundled data or the dev-only api/cases`);
  // (c) exactly ONE request carries a body, and it is the consent-gated, dev-only api/cases escalation
  assert.equal((appCode.match(/body:/g) || []).length, 1, 'exactly one request carries a body');
  assert.equal((appCode.match(/method:\s*'POST'/g) || []).length, 1, 'exactly one POST (the dev-only escalation)');
  assert.ok(/fetch\('api\/cases'[\s\S]*?body:/.test(app), 'the body-carrying POST is the dev-only api/cases');
  assert.ok(/confirm\(/.test(app), 'the escalation is consent-gated by confirm()');
  // (d) the only storage surface in the whole app is the consented on-device 'tanaw.disputes' store, in app.js only
  const allJs = ['www/app.js', 'www/dashboard.js', 'www/sw.js', ...readdirSync('www/lib').map(f => `www/lib/${f}`)];
  assert.deepEqual(allJs.filter(f => /localStorage|indexedDB|IndexedDB|sessionStorage|document\.cookie/.test(readFileSync(f, 'utf8'))),
    ['www/app.js'], 'only app.js touches storage, and only the consented dispute store');
  const writes = [...appCode.matchAll(/localStorage\.setItem\(\s*([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")/g)].map(m => m[1]);
  assert.deepEqual(writes, ['STORE'], 'the only localStorage write is the dispute store (STORE)');
  assert.ok(/const STORE = 'tanaw\.disputes'/.test(app), 'STORE is the on-device dispute key');
  assert.ok(!/localStorage|indexedDB|IndexedDB|document\.cookie/.test(readFileSync('www/sw.js', 'utf8')), 'SW caches assets, not customer data');
  // (e) PDF password is cleared after open, never persisted
  assert.ok(/\$\(?'?#pw'?\)?\.value\s*=\s*''/.test(app), 'password input is cleared after open');
}
console.log('privacy OK');
```

### 4. `tests/selfcheck.mjs` — append `test_scope_guard` (after the privacy block)
Encodes "no out-of-scope UI ships in v1" (tech_spec §13.2 scope guard; requirements §9; tech_spec §16.3). Asserts solar and rewards/loyalty are absent from the shipped surface, and that the in-scope dispute extension is not over-flagged.
```js
// test_scope_guard: out-of-scope features (solar, rewards/loyalty) are absent from the shipped v1 build;
// the in-scope dispute extension is not flagged
{
  const app = readFileSync('www/app.js', 'utf8');
  const sw = readFileSync('www/sw.js', 'utf8');
  const html = readFileSync('www/index.html', 'utf8');
  const swFiles = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  // solar: no module import, no call/render, no precache, no UI, not reachable from the app flow
  assert.ok(!/lib\/solar/.test(app), 'app.js must not import the solar module');
  assert.ok(!/solar\s*\(|\bSOLAR\b/.test(app), 'app.js must not call/render solar');
  assert.ok(!swFiles.includes('lib/solar.js'), 'SW must not precache lib/solar.js');
  assert.ok(!/id="solar"|id="selfuse"|rooftop solar/i.test(html), 'index.html must have no solar UI');
  assert.ok(!offlineAssets().some(f => /solar/.test(f)), 'no solar asset reachable from the app flow');
  // rewards/loyalty: no feature family in the shipped surface
  const surface = ['www/app.js', 'www/dashboard.js', 'www/sw.js', 'www/index.html', 'www/dashboard.html',
    ...readdirSync('www/lib').map(f => `www/lib/${f}`)].map(f => readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/reward|leaderboard|loyalty/i.test(surface), 'no rewards/loyalty feature family in the v1 build');
  // regression guard: the in-scope dispute extension must remain shipped (do not over-broaden the guard)
  assert.ok(/flags\.js|disputes\.js|chat\.js/.test(swFiles.join('|')), 'the in-scope dispute extension is still shipped');
}
console.log('scope guard OK');
```

### 5. `tests/selfcheck.mjs` — append `test_offline` (after the scope-guard block)
Encodes AC-11 / NFR-8 ("after first load, the full flow works with the network disabled") at the static level: every asset the flow can reach is precached, and the SW provides an offline fallback.
```js
// test_offline: after one load, the full flow needs no network — every reachable asset is precached and the SW
// installs the cache atomically, prunes stale caches, and falls back to cache on fetch failure
{
  const sw = readFileSync('www/sw.js', 'utf8');
  const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  // (a) every asset the app flow can reach is in the precache (catches a new lib/model/data file that is not cached)
  for (const f of offlineAssets()) assert.ok(files.includes(f), `sw.js does not precache ${f} needed for offline flow`);
  // (b) the SW provides offline serving
  assert.ok(/caches\.open\(CACHE\)\.then\(c => c\.addAll\(FILES\)/.test(sw), 'install precaches the full file list');
  assert.ok(/self\.skipWaiting\(\)/.test(sw), 'new SW version activates immediately');
  assert.ok(/filter\(k => k !== CACHE\)/.test(sw), 'activate removes stale caches');
  assert.ok(/\.catch\(\(\) => caches\.match\(/.test(sw), 'fetch falls back to cache when offline');
}
console.log('offline OK');
```

### 6. Do NOT modify the existing suites
The following must remain byte-for-byte intact and green: **attribution gate** `test_reasons` (L161–171), **breakdown-sums** (the `near(r.breakdown.reduce(…), r.bill_change_php, 1, …)` inside `analyse`, L45), **model-tier/refusal** (L78–84), and **PWA precache** `test_pwa` (L173–180). The new blocks are appended after L180; the only pre-existing lines touched are the two import lines (Change 1).

## Acceptance Criteria
1. `npm test` passes and prints, in order, all pre-existing `… OK` lines **plus** exactly three new lines: `privacy OK`, `scope guard OK`, `offline OK` (each after its block, before the next suite). No assertion fails.
2. **Privacy** (`test_privacy`): (a) no `XMLHttpRequest`/`sendBeacon`/`WebSocket`/cookie-write in `www/app.js`+`www/dashboard.js` (Web Worker `postMessage` is deliberately *allowed* — it is on-device IPC, not a network request, and Task 8's OCR worker uses it); (b) every string-literal `fetch` URL is `data/…` or `api/cases`; (c) exactly one `body:` and one `method:'POST'`, and that POST is the `api/cases` escalation which is behind a `confirm(`; (d) the only file touching `localStorage`/`indexedDB`/`sessionStorage`/cookies is `www/app.js`, its only `setItem` key is `STORE`, `STORE === 'tanaw.disputes'`, and `www/sw.js` writes no customer data; (e) the `#pw` value is cleared after open.
3. **Scope guard** (`test_scope_guard`): `www/app.js` has no `lib/solar` import and no `solar(`/`SOLAR` use; `www/sw.js` `FILES` lacks `lib/solar.js`; `www/index.html` has no `#solar`/`#selfuse`/"rooftop solar"; no solar asset is in `offlineAssets()`; the shipped `www/` surface has no `reward`/`leaderboard`/`loyalty` tokens; and `flags.js`/`disputes.js`/`chat.js` are still precached (the in-scope extension is not flagged).
4. **Offline** (`test_offline`): every file in `offlineAssets()` is present in `sw.js` `FILES`, and the SW source contains the `caches.open(CACHE)…addAll(FILES)` install, `self.skipWaiting()`, the `k !== CACHE` stale-cache prune, and the `.catch(() => caches.match(…))` offline fallback.
5. **Existing suites stay green and unchanged:** the attribution-gate, breakdown-sums, model-tier/refusal, and PWA-precache assertions pass, and `git diff` shows no change to their lines (only the two import lines and appended blocks in `tests/selfcheck.mjs`).
6. **Guards are live (negative check):** each guard actually trips — see Verification step 3.

## Verification
1. `npm test` — expect the existing `selfcheck OK` + all suite `OK` lines (feedback, disputes, dashboard samples, bracket lookup, chat, reasons, pwa) **and** the three new lines `privacy OK`, `scope guard OK`, `offline OK`. (Prereq: Task 1 green baseline, Task 5 solar removed, Task 6 boundary written. If the scope guard fails on solar or the privacy test fails on a second storage write, that is a Task 5/6 gap, not a test bug.)
2. `rg -n "test_privacy|test_scope_guard|test_offline|offlineAssets|console.log\('(privacy|scope guard|offline) OK\)" tests/selfcheck.mjs` — confirms the three blocks + helper are present and each ends with its `OK` log.
3. **Prove the guards catch regressions (then revert):**
   - Privacy: temporarily add `localStorage.setItem('other', 'x')` to `www/app.js` (or a `fetch('https://example.com', {body:'y'})`); `npm test` must fail with the specific privacy assertion; revert.
   - Scope: temporarily restore `import { solar } from './lib/solar.js';` in `www/app.js` and `'lib/solar.js'` in `www/sw.js` `FILES`; `npm test` must fail with the scope-guard assertion; revert.
   - Offline: temporarily remove `'data/rates.json'` from `www/sw.js` `FILES`; `npm test` must fail with "sw.js does not precache data/rates.json needed for offline flow"; revert.
4. `git diff --stat` — the only changed file is `tests/selfcheck.mjs` (no production code, no data, no new files).

## Edge Cases & Non-Goals
- **Depends on Task 5 (solar) and Task 6 (privacy boundary).** The scope guard asserts the *post-Task-5* state and the privacy test reflects the *post-Task-6* boundary. Run 5 and 6 first (per PLAN task order 1→…→5→6→…→10). A failure before those is the guard working, not a test defect.
- **OQ2 branch (solar re-scoped in):** if the team instead votes to keep solar, invert the four solar-absent assertions in `test_scope_guard` to solar-*present* (module imported by `app.js`, UI in `index.html`, `lib/solar.js` in `FILES`, and a solar asset reachable), and record the requirement ID. Do not ship with the "absent" assertions when solar is in scope.
- **OQ3 branch (dispute extension stripped):** if the extension is removed (not the default), delete the "in-scope extension still shipped" assertion and re-derive the privacy boundary (the `tanaw.disputes` store and `api/cases` POST may no longer exist). This spec assumes the default (scoped in).
- **`sw.js` is not required to precache itself** — the browser manages SW installation/updates, so it is excluded from `offlineAssets()`. Likewise `register('sw.js')` is not treated as a precache asset.
- **Task 5 must delete `www/lib/solar.js`, not just un-import it.** The *pre-existing* `test_pwa` asserts that **every** file in `www/lib` is precached (`readdirSync('www/lib')`). If Task 5 only removes the `lib/solar.js` precache entry and the `app.js` import but leaves the orphan file on disk, `test_pwa` fails with `sw.js does not precache lib/solar.js`. So Task 5's "repo search confirms solar is not part of the shipped v1 build" requires deleting `www/lib/solar.js` (and the `renderSolar`/`#selfuse`/solar-table UI). This task's scope guard is consistent with that (it also requires no reachable solar asset); it is an additional guard, and the two together force the file's deletion.
- **Task 8 (OCR Web Worker) interactions, anticipated:** (1) The OCR worker calls `postMessage`/`onmessage` — that is on-device IPC, **not** a network request, so the privacy test deliberately does **not** ban `.postMessage` (banning it would break the moment Task 8 lands). (2) The worker file (`www/lib/ocr-worker.js`) is reached via `new Worker('…')`, which the `offlineAssets()` helper resolves and requires to be precached; the OCR ONNX files under `www/models/*` are swept in by the `existsSync('www/models')` branch, so they must be added to `sw.js` `FILES` for `test_offline` to stay green. Task 8 adds those `FILES` entries; this spec's offline assertion then verifies them.
- **This is the static/Node encoding** of the offline and privacy guarantees. The on-device repeat-offline run and real mobile check are Task 11 (AC-11); this task makes those invariants fail-fast in CI instead of relying on review. No browser is available to this suite, so "no request carries bill data" is asserted by exhaustive source inspection of the network/persistence surfaces, not by intercepting live requests.
- **Non-goals (other §13.2 rows are owned by other tasks — do not add them here):** OCR fixture tests + confidence flagging → Task 8; no-reason/evergreen fallback, rate-month mismatch, and lifeline/senior passthrough tests → Task 3; rate schema v2 test → Task 4. The attribution-gate test already exists (`test_reasons`) and is only required to stay green.
