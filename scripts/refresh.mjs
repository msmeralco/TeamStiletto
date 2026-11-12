// Runs before `npm start` (prestart): refresh Meralco data while online. Offline, or a changed Meralco page, never blocks the
// app: that step is skipped and the saved file is used. Advisories (~11 s) are left to `npm run advisories`, run once a month.
import { execFileSync } from 'node:child_process';

for (const [what, steps] of [['rates', ['fetch_rates', 'build_rates']], ['FAQs', ['fetch_faqs']]]) {
  try { for (const s of steps) execFileSync(process.execPath, [`scripts/${s}.mjs`], { stdio: 'inherit' }); }
  catch { console.log(`Could not refresh Meralco ${what} (offline or site changed): starting with the saved ${what}.`); }
}
