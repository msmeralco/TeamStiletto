// Reads Meralco bill PDFs exactly as the app does (extract -> parse with data/bill_spec.json -> checks) and prints whether each
// bill's own arithmetic adds up. Usage: node scripts/validate_bill.mjs <bill.pdf> [more.pdf ...]   (add --json to print what was read)
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLines } from '../www/lib/extract.js';
import { parseBill } from '../www/lib/parse.js';
import { runChecks } from '../www/lib/checks.js';

const spec = JSON.parse(readFileSync('www/data/bill_spec.json', 'utf8'));
const files = process.argv.slice(2).filter(a => !a.startsWith('--')), asJson = process.argv.includes('--json');
if (!files.length) { console.error('Usage: node scripts/validate_bill.mjs <bill.pdf> [more.pdf ...] [--json]'); process.exit(2); }
const warn = console.warn, log = console.log; // pdf.js prints font and image warnings through both
console.warn = () => {};
console.log = (...a) => { if (!String(a[0]).startsWith('Warning:')) log(...a); };
let failed = 0;
for (const file of files) {
  const bill = parseBill(await pdfLines(pdfjs, new Uint8Array(readFileSync(file))), spec), checks = runChecks(bill, spec);
  if (asJson) { console.log(JSON.stringify({ ...bill, can: undefined }, null, 1)); continue; }
  const d = bill.detail, lines = d?.groups.flatMap(g => g.lines) ?? [], unknown = lines.filter(l => !l.basis);
  console.log(`\n${file}\n  ${bill.period_start} to ${bill.period_end}, ${bill.kwh} kWh, charges ${bill.charges_this_period}` +
    (d ? `; page 2: ${d.groups.length} groups, ${lines.length} lines, ${d.adjustments.length} credit lines, ${bill.payments.length} payments` : '; page 2 not found'));
  if (unknown.length) console.log(`  lines not in bill_spec.json (still counted): ${unknown.map(l => l.label).join('; ')}`);
  const missing = spec.groups.filter(g => d && !d.groups.some(x => x.key === g.key)).map(g => g.label);
  if (missing.length) console.log(`  groups not found: ${missing.join(', ')}`);
  for (const c of checks) {
    console.log(`  ${c.passed ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(24)}${c.detail ? `${String(c.n).padStart(3)}  ${c.formula}` : c.passed ? '' : `     expected ${c.expected}, found ${c.found}`}`);
    for (const f of c.fails ?? []) console.log(`          ${f.what}: computed ${+f.expected.toFixed(4)}, printed ${f.found}`);
  }
  const skipped = spec.checks.filter(c => c.in === 'detail' && !checks.some(x => x.name === c.name)).map(c => c.name);
  if (d && skipped.length) console.log(`  not run (numbers not on this bill): ${skipped.join(', ')}`);
  const bad = checks.filter(c => !c.passed).length;
  failed += bad;
  console.log(`  ${checks.reduce((s, c) => s + (c.n ?? 1), 0)} comparisons in ${checks.length} checks, ${bad} failed`);
}
console.warn = warn;
process.exit(failed ? 1 : 0);
