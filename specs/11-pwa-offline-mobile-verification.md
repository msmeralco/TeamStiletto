# Spec: Verify PWA offline behavior and mobile usability (Task 11 from PLAN.md)

## Goal
Make the shipped precache list complete (OCR models + dashboard), bump the cache version, encode the model-precache invariant in the PWA test, and record a passed/failed device+emulation audit (installability, offline repeat of the full flow, portrait usability, native share path) so AC-11, FR-Dep-1, FR-Dep-2 and NFR-8 are provably met.

## Inputs & Context
- PLAN.md Task 11 (lines 113–119): "Verify PWA offline behavior and mobile usability (FR-Dep-1, FR-Dep-2, NFR-8, AC-11)". Depends on Task 8 (OCR models must exist and be precached) and Task 10 (green suite incl. offline full-flow assertion). See also OQ7 (target device availability) and requirements R-10 (`docs/requirements.md:297`).
- `www/sw.js` — the whole service worker (18 lines): `const CACHE = 'tanaw-v2'` (line 3), `FILES` precache list (lines 4–7, ends `];` — the test regex depends on this literal form), network-first fetch handler (lines 12–17) with `caches.match(..., { ignoreSearch: true })` offline fallback.
- `tests/selfcheck.mjs` lines 173–180 — `test_pwa`: parses `FILES` out of `www/sw.js` via `/const FILES = (\[[\s\S]*?\]);/`, asserts every precached file exists, and asserts every file in `www/lib` is precached. It does **not** check `www/models`.
- `www/models/` — does not exist yet; Task 8 creates it (tech_spec §3.2: PP-OCR det/clu/rec ONNX files, flat under `www/models/*`).
- `www/dashboard.html`, `www/dashboard.js` — shipped staff triage page; currently **not** precached, so on a static HTTPS deploy it 404s offline. (`sw.js` itself is intentionally *not* in `FILES` — self-precaching would block SW updates; keep it out.)
- `www/manifest.webmanifest` — installable as-is (name, 192+512 icons incl. maskable, `standalone`, `start_url`/`scope` `./`). No change planned; it is verified in the checklist, not edited.
- `www/index.html` line 5 — viewport `width=device-width, initial-scale=1, viewport-fit=cover`; SW registration at `www/app.js:14` (skipped on native platforms).
- `www/style.css` — current responsive baseline: `main { max-width: 720px }`, full-width tables, `svg { max-width: 420px }`, safe-area padding on `body`, flex `#chatform`. Portrait audit target widths: 360–412 px (mid-range phone).
- `www/app.js:276` — `// shortcut: native path untested on devices; check it on one iPhone and one Android phone before the demo.` inside `sendDispute` (Capacitor `Filesystem.writeFile({ directory: 'CACHE' })` → `Share.share({ files: [uri] })`, cancel → clipboard fallback).
- `docs/pwa_offline_checklist.md` — new file (deliverable of this task); gives Task 12 (`docs/update.md` regeneration) something concrete to cite.
- Dev server: `npm start` → `scripts/serve.mjs` on http://localhost:8000 (localhost counts as a secure context, so the SW registers; plain-LAN `http://<ip>:8000` does **not**, which is why real-device testing needs an HTTPS static deploy — see Verification D).

## Changes
1. **`www/sw.js` line 3** — bump the cache version: `const CACHE = 'tanaw-v2';` → `const CACHE = 'tanaw-v3';`. (If a preceding task already bumped it past v2, use current+1 instead; the point is exactly one bump for the new precache list, so activate purges the old cache.)
2. **`www/sw.js` `FILES` (lines 4–7)** — make the precache list complete:
   - Append one entry per file Task 8 created under `www/models/` (take the exact names from the filesystem, e.g. `'models/det.onnx'`, `'models/clu.onnx'`, `'models/rec.onnx'`). Files must sit flat in `www/models/` per tech_spec §3.2.
   - Append `'dashboard.html', 'dashboard.js'` so the whole static deploy (including the staff page) works offline.
   - If Task 5 removed `www/lib/solar.js`, its `FILES` entry must be gone too (the test's `existsSync` loop catches a stale entry).
   - Keep the exact current syntax: single-quoted strings, one statement, terminated by `];` — `test_pwa`'s regex and JSON-parse rely on it.
3. **`tests/selfcheck.mjs` `test_pwa` block (after line 178)** — add the models completeness assertion, mirroring the existing `www/lib` loop (`readdirSync` and `existsSync` are already in scope in this block):
   ```js
   if (existsSync('www/models')) for (const f of readdirSync('www/models')) assert.ok(files.includes(`models/${f}`), `sw.js does not precache models/${f}`);
   ```
   This makes "a model file added but not precached" a red build instead of an offline surprise, regardless of the exact ONNX filenames Task 8 chose.
4. **`docs/pwa_offline_checklist.md` (new file)** — the verification record. Purpose line + six sections, each with numbered steps, a pass criterion, and a result field (`PASS / FAIL / NOT POSSIBLE + note`):
   - **A. Automated baseline** — `npm test` green (incl. `pwa OK`); note that Tasks 1–10 must be done first.
   - **B. Offline repeat of the full flow (AC-11)** — Chrome: `npm start`, load http://localhost:8000 once online (SW installs, precache fills); DevTools → Network → Offline; hard reload; complete the full PDF flow: *Try the SYNTHETIC sample* → confirm screen (all 4 checks green) → *Looks right, explain my bill* → chat one answer → *Send dispute* (web fallback: file download + clipboard) → *Start over* → repeat the flow. Pass: flow completes; Network panel shows **zero** network requests while offline; DevTools → Application → Cache Storage shows `tanaw-v3` present and `tanaw-v2` purged. Add one line: "OCR flow (Task 8): with models cached, a bill photo also completes offline" — verify if `www/models/` exists.
   - **C. Installability** — DevTools → Application → Manifest: no errors; install prompt/"Add to home screen" offered in Chrome (desktop) and on the Android device (C-1) — installed app opens to a blank-then-loadable shell offline (start_url `./` is precached). iOS: Share → Add to Home Screen using `apple-touch-icon` (already in `www/index.html:10`).
   - **D. Portrait usability on a mid-range phone** — deploy `www/` to a static HTTPS host (GitHub Pages / Netlify / Cloudflare Pages, per README §Web app); on a mid-range Android and an iPhone, in portrait, walk upload → confirm → results. Pass criteria: no horizontal overflow on any screen (console: `document.documentElement.scrollWidth <= window.innerWidth`), confirm-screen table and inputs usable with the software keyboard open, fit chart fits the width, all buttons tappable with no overlap; record device models + dates.
   - **E. Native share path (clears `www/app.js:276` note)** — on one Android and one iOS Capacitor build (README §Android/§iOS build paths), run a flagged bill → *Send dispute*: expect the native share sheet with the `tanaw-dispute-*.json` file attached; also test the cancel path (message lands on clipboard + note shown). If a device is unavailable (OQ7), mark `NOT POSSIBLE` and **keep** the `shortcut:` note.
   - **F. Results table** — columns: date, device, section, result, notes. Closing line stating whether AC-11 is met.
5. **`www/app.js` line 276** — after Section E passes on both devices, replace the `shortcut:` comment with the verification record, e.g. `// verified 2026-XX-XX on <Android model> + <iPhone model>: Filesystem + Share open the native sheet with the JSON file; cancel copies the message.` If a defect is found, make the minimal fix in `sendDispute` (e.g. `Filesystem`/`Share` params) and record both fix and verification in the comment. If Section E is `NOT POSSIBLE`, leave the comment untouched.
6. **`www/style.css` — only if Section D finds a layout defect** — make the minimal fix (e.g. table column wrapping, `#chatform` input width under keyboard, chart max-width) and record it in the checklist's Section D notes. If the audit is clean, make no CSS change.

## Acceptance Criteria
- `npm test` passes end to end, including `pwa OK` (full suite green — Tasks 1–10 done).
- `www/sw.js` declares the bumped cache name (v3, or current+1) and `rg "tanaw-v" www/` shows exactly one version string.
- `FILES` contains an entry for every file in `www/models/` (if the directory exists), for `dashboard.html`, and for `dashboard.js`; no `FILES` entry points at a missing file (test enforces).
- Offline check (checklist B) passes: after one online load, with network disabled, the full PDF flow completes with zero network requests, and cache storage shows the new version with the old one purged.
- OCR (when `www/models/` exists, i.e. Task 8 done): the photo flow also completes offline after the models were cached once online.
- Installability (checklist C) passes in Chrome/Android; manifest reports no errors.
- Portrait usability (checklist D) passes on a mid-range Android and an iOS device (or accurate emulation if OQ7 blocks a device — record which); any CSS fix re-verified.
- Native share path (checklist E) verified on one Android and one iOS Capacitor build, and `rg "shortcut:" www/app.js` returns no match (that file's only marker is line 276); or, if no device was available, the note remains and the checklist records `NOT POSSIBLE`.
- `docs/pwa_offline_checklist.md` exists with every section marked PASS/FAIL/NOT POSSIBLE and the closing AC-11 statement.

## Verification
1. `npm test` → expect the full suite green, ending `pwa OK` (after `chat OK`, `reasons OK`).
2. `node --version`-independent greps: `rg "const CACHE" www/sw.js` → bumped value; `rg "shortcut:" www/app.js` → 0 matches (only if E passed); `rg -n "models/|dashboard" www/sw.js` → the new entries.
3. `npm start`, then in Chrome at http://localhost:8000: Application → Service Workers shows `sw.js` activated; follow checklist B exactly; in the Network panel with Offline enabled, confirm every request is `(from cache)` / `(ServiceWorker)` and none hits the network.
4. Checklist C: Application → Manifest shows parsed manifest, no red errors; install prompt present.
5. Checklist D/E: follow the written steps on the real devices (HTTPS deploy for D; Capacitor builds for E); fill in the checklist's results table.
6. Re-run `npm test` after any `style.css`/`app.js` change to confirm the suite stays green.

## Edge Cases & Non-Goals
- **Ordering/dependencies:** assumes Tasks 1–10 are complete (green baseline; OCR models present; solar decision applied to the same `FILES` line — apply this task's edits on top of Task 5's final state). `www/models/` does not exist yet; the test loop is guarded by `existsSync` so the suite stays green before and after Task 8.
- **sw.js is deliberately absent from `FILES`** (self-precaching prevents SW updates) — do not "fix" this.
- **Dashboard inbox is dev-only:** `POST /api/cases` needs `scripts/serve.mjs`; offline, the escalate button must keep showing its existing error fallback. We do not precache or fix the inbox, only the static page.
- **First-load OCR model-download UX (progress states, R-10) is Task 8's** — this task only verifies the cached/offline repeat.
- **No device available (OQ7):** device sections may be `NOT POSSIBLE`; the `shortcut:` note and the "no real-device audit" state must then remain (Task 12 reports it) — never clear a note that wasn't verified.
- **Out of scope:** no backend changes, no new runtime network calls (NFR-10), no manifest redesign, no Capacitor delivery work beyond the share-path check (FR-Dep-4 keeps iOS/Capacitor out of v1 delivery).
- **Discovered issues with the parent task (for the master planner):** (a) PLAN Task 11 names no owner for the `dashboard.html`/`dashboard.js` precache gap found here — change 2 closes it; (b) Task 8's exact model filenames are unknown to this spec, so change 3 enforces the invariant by directory scan rather than hardcoded names; (c) OQ7 is an open gate on the device half of the ACs — the team must confirm an Android + iPhone (or accept emulation + recorded gap).
