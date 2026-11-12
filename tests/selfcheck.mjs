// Plan section 6 tests. Run: npm test
// SYNTHETIC bills always; the real golden bill too if data/private/golden_bill.pdf exists (gitignored: it has personal data).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfLines } from '../www/lib/extract.js';
import { parseBill } from '../www/lib/parse.js';
import { runChecks } from '../www/lib/checks.js';
import { temps, trackerPeriods, fit, cdd, project } from '../www/lib/model.js';
import { explain, validateRates } from '../www/lib/explain.js';
import { solar } from '../www/lib/solar.js';
import { billingFlags, disputeMessage, disputePacket } from '../www/lib/flags.js';

// test_feedback: "nothing changed" + a big unexplained rise flags; an answer that explains it does not
{
  const bill = { period_end: '2026-05-26', kwh: 300, days: 30, charges_this_period: 4500, tracker: [200, 210, 205, 300].map((kwh, i) => ({ month: `2026-0${i + 2}`, kwh })) };
  const r = { est_prev_bill: 3000, breakdown: [{ key: 'usage', php: 1400 }] };
  const keys = a => billingFlags(bill, [], r, a).map(f => f.key);
  assert.ok(keys({ keys: ['nothing'] }).includes('unexplained_increase'));
  assert.ok(!keys({ keys: ['nothing', 'aircon'] }).includes('unexplained_increase'));
  assert.ok(!keys({ keys: [] }).includes('unexplained_increase'), 'no answers, no claim');
  assert.match(disputeMessage(bill, [], { keys: ['away'], note: 'house empty 2 weeks' }), /my answers\):\n- We were away or home less\n- house empty 2 weeks/);
}

const json = p => JSON.parse(readFileSync(p, 'utf8'));
const rates = json('www/data/rates.json'), T = temps(json('www/data/weather.json')), truth = json('tests/SYNTHETIC_truth.json');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const readBill = async f => parseBill(await pdfLines(pdfjs, new Uint8Array(readFileSync(f))));
const FIELDS = ['can', 'period_start', 'period_end', 'days', 'kwh', 'previous_reading', 'current_reading', 'multiplier', 'charges_this_period', 'remaining_balance', 'installment_due', 'total_amount_due'];

// test_rates
assert.deepEqual(validateRates(rates), []);
assert.equal(rates['2026-09'].non_lifeline[200].total, 14.7424); // plan's known value
assert.equal(rates['2026-10'].non_lifeline[200].total, 15.0615);
assert.equal(rates['2026-05'].non_lifeline[200].generation, 8.7942); // = May 2026 generation-charge breakdown PDF

function analyse(name, bill) {
  // test_checks
  assert.ok(runChecks(bill).every(c => c.passed), `${name} checks green`);
  const bad = runChecks({ ...bill, kwh: bill.kwh + 50 }).filter(c => !c.passed).map(c => c.name);
  assert.deepEqual(bad, ['readings', 'tracker_latest']);
  const per = trackerPeriods(bill.tracker, bill.period_end), f = fit(per, T);
  const r = explain(bill, per, f, T, cdd, rates);
  // test_explain
  near(r.breakdown.reduce((s, i) => s + i.php, 0), r.bill_change_php, 1, `${name} breakdown sums to change`);
  // test_summary: the two causes shown to the customer add up to the change, and the rate lines add up to the rates cause
  const sm = r.summary;
  near(sm.usage.php + sm.rates.php, r.bill_change_php, 0.01, `${name} usage + rates = change`);
  near(sm.rates.lines.reduce((t, l) => t + l.php, 0), sm.rates.php, 0.01, `${name} rate lines add up`);
  near(sm.this_bill - sm.prev_bill, sm.change, 0.01, `${name} from/to = change`);
  near((sm.rates.per_kwh_now - sm.rates.per_kwh_before) * bill.kwh, sm.rates.php, 0.01, `${name} per-kWh prices agree with the rates cause`);
  assert.ok(sm.rates.lines.length <= 5 && r.sentence.includes("Meralco's rates"), r.sentence);
  const pr = project(per, T, f, r.R1, r.F1), sol = solar(bill, bill.tracker);
  assert.ok(sol.every(s => s.payback > 0 && isFinite(s.payback)));
  // test_flags: a clean bill raises none; a doctored one raises each kind
  assert.deepEqual(billingFlags(bill, runChecks(bill), r), [], `${name} clean bill has no flags`);
  const prevMonth = bill.tracker.at(-2).month;
  const doctored = { ...bill, kwh: bill.kwh * 3, days: 40, tracker: bill.tracker.map(t => ({ ...t, kwh: t.month === prevMonth ? 0 : t.kwh })) };
  const keys = billingFlags(doctored, runChecks(doctored), { ...r, warn_residual: true }).map(x => x.key);
  assert.deepEqual(keys, ['readings', 'tracker_latest', 'missed_reading', 'spike', 'long_period', 'rate_mismatch']);
  assert.match(disputeMessage(doctored, billingFlags(doctored, runChecks(doctored), r)), /Customer Account Number \d+/);
  // test_packet: strongest flag sets the strength; packet survives JSON and carries the evidence
  const dChecks = runChecks(doctored), dFlags = billingFlags(doctored, dChecks, r, { keys: ['nothing'] });
  const p = JSON.parse(JSON.stringify(disputePacket({ bill: doctored, checks: dChecks, flags: dFlags, answers: { keys: ['nothing'], note: ' ' }, r, rates })));
  assert.equal(p.strength, 'strong');
  assert.equal(p.customer_account_number, bill.can);
  assert.deepEqual(p.checks.filter(c => !c.passed).map(c => c.name), ['readings', 'tracker_latest']);
  assert.deepEqual(p.household_answers, { changes: ['Nothing changed at home'], note: null, gadgets: [], added_kwh: null, parser: 'rules' });
  assert.ok(p.rates.sources.every(s => s.startsWith('https://www.meralco.com.ph/')));
  const weakOnly = billingFlags({ ...bill, days: 40 }, runChecks(bill), r);
  assert.equal(disputePacket({ bill, checks: runChecks(bill), flags: weakOnly, answers: { keys: [] }, r, rates }).strength, 'weak');
  console.log(`${name}: tier ${f.tier} (${f.reason}) rates ${r.prev_rate_month}->${r.rate_month}${r.warn_residual ? ' RESIDUAL>3%' : ''}\n  ${r.sentence}\n  next: ${pr.mid ? Math.round(pr.mid) : pr.label}  payback ${sol.map(s => s.payback.toFixed(1)).join(' / ')} yrs`);
  return { f, r };
}

for (const name of ['good', 'weak']) {
  // test_parse
  const bill = await readBill(`www/data/fixtures/${name === 'good' ? 'SYNTHETIC_bill' : 'SYNTHETIC_weak_bill'}.pdf`), t = truth[name];
  for (const k of [...FIELDS, 'source']) assert.equal(bill[k], t[k], `${name}.${k}`);
  assert.deepEqual(bill.tracker, t.tracker, `${name}.tracker`);
  assert.deepEqual(bill.charges.map(c => [c.key, c.amount_php]), t.charges.map(c => [c.key, c.amount_php]), `${name}.charges`);
  const { f, r } = analyse(name, bill);
  assert.ok(!r.warn_residual, `${name} residual under 3%`);
  // test_model
  if (name === 'good') {
    assert.equal(f.tier, 'A_3pc', f.reason);
    const p = truth.params;
    near(f.baseload_kwh_per_day, p.b0, p.b0 * 0.1, 'baseload');
    near(f.cooling_slope_kwh_per_cdd, p.b1, p.b1 * 0.1, 'slope');
    near(f.balance_point_c, p.bp, p.bp * 0.1, 'balance point');
  } else assert.equal(f.tier, 'C_refused', `pure noise should refuse: ${f.reason}`);
}

if (existsSync('data/private/golden_bill.pdf')) {
  const bill = await readBill('data/private/golden_bill.pdf'), g = json('data/private/golden_expected.json');
  for (const k of FIELDS) assert.equal(bill[k], g[k], `golden.${k}`);
  assert.deepEqual(bill.tracker.map(t => t.kwh), g.tracker, 'golden.tracker');
  assert.deepEqual(bill.charges.map(c => c.amount_php), g.charges, 'golden.charges');
  analyse('golden (real bill)', bill);
} else console.log('golden bill not present (data/private/golden_bill.pdf); skipped');
console.log('selfcheck OK');

// test_disputes: follow-up day count
{
  const { daysSince } = await import('../www/lib/disputes.js');
  assert.equal(daysSince('2026-06-06', new Date(2026, 5, 20)), 14);
}
console.log('disputes OK');

// test_dashboard_samples: the sample dispute files cover every strength
{
  const p = json('www/data/fixtures/SYNTHETIC_packets.json');
  assert.ok(p.every(x => x.format === 'tanaw-dispute/1' && x.bill.source === 'synthetic'));
  assert.deepEqual([...new Set(p.map(x => x.strength))].sort(), ['medium', 'strong', 'weak']);
}
console.log('dashboard samples OK');

// test_bracket_lookup: 250 kWh is billed at the 201-300 bracket's distribution rate, not a blend of 200 and 300
{
  const { lookup } = await import('../www/lib/explain.js');
  assert.equal(lookup(rates, '2026-10', 250).distribution, rates['2026-10'].non_lifeline[300].distribution);
  assert.equal(lookup(rates, '2026-10', 200).distribution, rates['2026-10'].non_lifeline[200].distribution);
  assert.equal(lookup(rates, '2026-10', 9999).total, rates['2026-10'].non_lifeline[5000].total);
}
console.log('bracket lookup OK');

// test_chat: Taglish/English answers map to the same keys the checkboxes used; priced gadgets decide the unexplained-rise flag
{
  const { understand, step, startChat, answersOf } = await import('../www/lib/chat.js');
  const { householdExplains } = await import('../www/lib/flags.js');
  const k = t => understand(t).keys.join();
  assert.equal(k('bumili kami ng bagong aircon'), 'appliance');
  assert.equal(k('Nag-WFH ako tsaka may bisita kami'), 'people');
  assert.equal(k('wala kami sa bahay ng 2 weeks, umuwi kami ng probinsya'), 'away');
  assert.equal(k('wala'), 'nothing');
  assert.equal(k('Nothing changed'), 'nothing');
  assert.equal(k('mainit kasi kaya lagi naka aircon'), 'aircon');
  assert.equal(k('nagcha-charge ng e-bike gabi-gabi'), 'business');
  assert.equal(k('bakit may refund?'), '', '"refund" is not a ref(rigerator)');
  const ac = understand('dalawang bagong aircon 1.5 hp inverter').gadgets[0];
  assert.deepEqual([ac.count, ac.watts, ac.new], [2, 810, true]);

  const ctx = { sentence: 'Your bill rose ₱900.', reason: { date: '2026-10-13', text: 'Generation went up.', sections: [{ paragraphs: ['WESM charges went up due to tight supply.'] }] }, days: 30, unexplained_kwh: 300 };
  const chat = msgs => msgs.reduce(({ state }, t) => step(state, t, ctx), { state: startChat() });
  const q = chat(['ano ang WESM?']);
  assert.match(q.reply, /WESM charges went up/);
  assert.equal(q.state.keys.length, 0, 'a question is not an answer');
  const done = chat(['bumili kami ng ref', '24', 'wala']).state;
  assert.equal(done.ask, 'done');
  const a = answersOf(done, 30);
  assert.deepEqual([a.keys, a.added_kwh], [['appliance'], 43]); // 60 W × 24 h × 30 days
  assert.ok(!householdExplains({ kwh: 300 }, a), 'a new ref (43 kWh) does not explain a 300 kWh rise');
  assert.ok(householdExplains({ kwh: 60 }, a));
  assert.ok(householdExplains({ kwh: 300 }, answersOf(chat(['may bisita kami', 'wala']).state, 30)), 'unpriced answer keeps the old rule');
  assert.equal(chat(['wala kami sa bahay', 'wala']).state.keys.join(), 'away');
  assert.equal(answersOf(chat(['bumili kami ng aircon', '8', 'yung aircon pala 10 hours', 'wala']).state, 30).gadgets.length, 1, 'no double count');
}
console.log('chat OK');

// test_chat_model: the local model is only a fallback, and its JSON is checked like user input
{
  const { step, startChat, answersOf, fromModel, needsModel } = await import('../www/lib/chat.js');
  const ctx = { sentence: 'x', reason: null, days: 30, unexplained_kwh: 300 };
  assert.ok(!needsModel(startChat(), 'bumili kami ng aircon'), 'rules read it: no model call');
  assert.ok(needsModel(startChat(), 'nagpakabit kami ng split type'));
  const bad = fromModel({ changes: ['appliance', 'hack'], gadgets: [{ name: 'aircon', count: 999, is_new: true, hours_per_day: 99, watts: 1 },
    { name: 'nuclear reactor', count: 1, is_new: true }], hours_per_day: -3 }, 'qwen2.5:3b');
  assert.deepEqual(bad.keys, ['appliance']);
  assert.deepEqual(bad.gadgets.map(g => [g.name, g.count, g.watts, g.hours]), [['aircon', 10, 900, null]], 'watts from GADGETS, count/hours clamped');
  assert.equal(fromModel('nonsense'), null);
  const m = fromModel({ is_question: false, changes: ['appliance'], gadgets: [{ name: 'aircon', count: 1, is_new: true, hours_per_day: null }], hours_per_day: null }, 'qwen2.5:3b');
  let s = step(startChat(), 'nagpakabit kami ng split type', ctx, m);
  assert.match(s.reply, /Ilang oras/);
  s = step(s.state, 'mga walong oras', ctx, fromModel({ is_question: false, changes: [], gadgets: [], hours_per_day: 8 }, 'qwen2.5:3b'));
  s = step(s.state, 'wala', ctx);
  const a = answersOf(s.state, 30);
  assert.deepEqual([a.keys, a.added_kwh, a.parser], [['appliance'], 216, 'rules + qwen2.5:3b']);
  const q = step(startChat(), 'system loss po?', ctx, fromModel({ is_question: true, changes: [], gadgets: [], hours_per_day: null }));
  assert.equal(q.state.keys.length, 0);
  assert.equal(answersOf(step(startChat(), 'wala', ctx).state, 30).parser, 'rules');
}
console.log('chat model OK');

// test_advisory_pick: for questions the model can only point at a scraped advisory paragraph; the reply quotes it verbatim
{
  const { step, startChat, fromModelPick, answerSchema, answerMessage, isQuestion } = await import('../www/lib/chat.js');
  const reason = { date: '2026-10-13', text: 'Rates up.', url: 'https://www.meralco.com.ph/media/advisories/x',
    sections: [{ heading: null, paragraphs: ['Generation charge rose by P0.20 per kWh.', 'Lower peso helped.'] }, { paragraphs: ['Transmission was flat.'] }] };
  const ctx = pick => ({ sentence: 'Your bill rose ₱900.', reason, days: 30, unexplained_kwh: 0, pick });
  assert.deepEqual(answerSchema(3).properties.paragraph.enum, [0, 1, 2, null], 'schema allows only real paragraph numbers or null');
  assert.match(answerMessage(reason, 'bakit?'), /\[2\] Transmission was flat\./);
  assert.deepEqual([fromModelPick({ paragraph: 2 }, 3), fromModelPick({ paragraph: null }, 3), fromModelPick({ paragraph: 7 }, 3),
    fromModelPick({ paragraph: '1' }, 3), fromModelPick({ answer: 'made up' }, 3), fromModelPick(null, 3)], [2, null, undefined, undefined, undefined, undefined]);
  assert.ok(isQuestion(startChat(), 'bakit mas mahal ngayon?') && !isQuestion(startChat(), 'bumili kami ng aircon'));
  const picked = step(startChat(), 'bakit mas mahal ngayon?', ctx(2)).reply;
  assert.ok(picked.includes('"Transmission was flat."') && picked.includes(reason.url), 'verbatim quote + source link');
  const none = step(startChat(), 'paano magbayad online?', ctx(null)).reply;
  assert.match(none, /Not in your bill or Meralco's FAQs or advisory/);
  assert.ok(!/Generation|peso|Transmission/.test(none), 'no advisory text passed off as an answer it does not contain');
  assert.match(step(startChat(), 'bakit tumaas ang generation charge?', ctx(undefined)).reply, /Generation charge rose/, 'no model: keyword fallback');
}
console.log('advisory pick OK');

// test_bill_facts: questions about the customer's own bill are answered only with a sentence billFacts wrote from the bill's
// numbers. The model only names a topic from a fixed list (it never sees the bill); code maps the topic to the fact.
{
  const { step, startChat, billFacts, fromModelTopic, TOPIC_SCHEMA, TOPICS, ADVISORY_TOPICS, questionMessage, answerMessage } = await import('../www/lib/chat.js');
  const bill = await readBill('www/data/fixtures/SYNTHETIC_weak_bill.pdf'), per = trackerPeriods(bill.tracker, bill.period_end), f = fit(per, T);
  const r = explain(bill, per, f, T, cdd, rates), all = billFacts(bill, { r, f, per, proj: project(per, T, f, r.R1, r.F1) }), facts = all.map(x => x.text);
  const text = id => all.find(x => x.id === id)?.text, topic = (topic, charge = null) => facts[fromModelTopic({ topic, charge }, all)];
  assert.equal(all[0].text, r.sentence, 'the first fact is the overall explanation');
  assert.equal(new Set(all.map(x => x.id)).size, all.length, 'fact ids are unique');
  assert.ok(all.length > 10 && facts.every(x => typeof x === 'string' && x.length < 240 && !/NaN|undefined|null/.test(x)), facts.join('\n'));
  assert.ok(text('usage').includes(`You used ${bill.kwh} kWh`) && /the rate went from ₱\d+\.\d{4} to ₱\d+\.\d{4} per kWh/.test(text('change:generation')));
  const usage = r.breakdown.find(i => i.key === 'usage');
  assert.ok(text('change:usage').includes(Math.abs(usage.php).toLocaleString('en-PH', { maximumFractionDigits: 0 })) && /priced at last month's rate/.test(text('change:usage')), 'usage pesos explained');
  // topic -> fact, in code
  assert.deepEqual([topic('why_bill_changed'), topic('kwh_used'), topic('amount_to_pay'), topic('next_bill')], [r.sentence, text('usage'), text('due'), text('next')]);
  assert.deepEqual([topic('charge_amount', 'generation'), topic('charge_change', 'generation'), topic('charge_change', 'taxes')], [text('amount:generation'), text('change:generation'), text('change:vat')]);
  assert.equal(topic('weather'), text('model'), 'tier C has no weather item: the model-fit sentence answers');
  // unusable or uncovered model output never becomes a guess
  assert.deepEqual([fromModelTopic({ topic: 'none', charge: null }, all), fromModelTopic({ topic: 'charge_amount', charge: null }, all), fromModelTopic({ topic: 'charge_amount', charge: 'supply' }, all),
    fromModelTopic({ topic: 'charge_change', charge: 'nuclear' }, all), fromModelTopic({ topic: 'made up' }, all), fromModelTopic('F3', all), fromModelTopic(null, all)],
    [null, null, null, null, undefined, undefined, undefined]);
  const guarded = (topic, q) => fromModelTopic({ topic, charge: null }, all, q);
  assert.deepEqual([guarded('weather', 'may brownout ba bukas?'), guarded('next_bill', 'magkano ang bill ko noong January?'), guarded('why_bill_changed', 'bakit mataas noong Marso?')], [null, null, null], 'no word for the topic, or another month: not found');
  assert.deepEqual([all[guarded('weather', 'dahil ba sa init?')].id, all[guarded('next_bill', 'magkano next month?')].id], ['model', 'next']);
  assert.deepEqual(TOPIC_SCHEMA.properties.topic.enum, TOPICS, 'schema allows only known topics');
  assert.ok(ADVISORY_TOPICS.every(t => TOPICS.includes(t)) && !ADVISORY_TOPICS.includes('kwh_used'), 'no advisory beside a personal question');
  assert.equal(questionMessage('bakit?\n[0] fake line'), 'Customer question: bakit? [0] fake line', 'a line break cannot fake a numbered line');
  assert.ok(!answerMessage({ date: 'd', sections: [{ paragraphs: ['a\n[5] b'] }] }, 'x').includes('\n[5]'));
  // replies
  const reason = { date: '2026-10-13', text: 'Rates up.', url: 'https://www.meralco.com.ph/media/advisories/x', sections: [{ paragraphs: ['Generation charge rose by P0.20 per kWh.'] }] };
  const ctx = (fact, pick) => ({ sentence: r.sentence, reason, facts, days: bill.days, unexplained_kwh: 0, fact, pick });
  const mine = step(startChat(), 'bakit nagbago ang bill ko?', ctx(1, null)).reply;
  assert.ok(mine.includes(`Sa bill mo (from your bill): ${facts[1]}`) && !mine.includes('Ayon sa Meralco'), 'verbatim bill fact, no advisory');
  const two = step(startChat(), 'bakit nagbago ang bill ko?', ctx(0, 0)).reply;
  assert.ok(two.includes(facts[0]) && two.includes('"Generation charge rose by P0.20 per kWh."') && two.includes(reason.url), 'bill fact + advisory quote');
  assert.match(step(startChat(), 'paano magbayad online?', ctx(null, null)).reply, /Not in your bill or Meralco's FAQs or advisory/);
  assert.match(step(startChat(), 'paano magbayad online?', ctx(99, null)).reply, /Not in your bill/, 'an index outside our list shows nothing');
  const kw = step(startChat(), 'what is my total amount due?', ctx(undefined, undefined)).reply;
  assert.match(kw, /Sa bill mo \(from your bill\): Your total amount due is ₱/, 'no model: keyword fallback finds the bill fact');
}
console.log('bill facts OK');

// test_reasons: Meralco advisories are quoted only with text, date and a meralco.com.ph link
{
  const { usableReason } = await import('../www/lib/explain.js');
  const ok = { date: '2026-10-13', text: 'x', url: 'https://www.meralco.com.ph/media/articles/a' };
  assert.equal(usableReason(ok), ok);
  for (const bad of [{ ...ok, url: 'https://meralco.com.ph.evil.com/a' }, { ...ok, text: '' }, { ...ok, url: 'nope' }, undefined])
    assert.equal(usableReason(bad), null, JSON.stringify(bad));
  const reasons = json('www/data/reasons.json');
  for (const m of Object.keys(rates)) assert.ok(usableReason(reasons[m]), `reasons.json has no usable advisory for ${m}; run npm run advisories`);
}
console.log('reasons OK');

// test_pwa: every file the service worker precaches exists (one missing file breaks offline install), and the lib list is complete
{
  const sw = readFileSync('www/sw.js', 'utf8'), files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of files) assert.ok(existsSync(`www/${f}`), `sw.js precaches missing file ${f}`);
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync('www/lib')) assert.ok(files.includes(`lib/${f}`), `sw.js does not precache lib/${f}`);
}
console.log('pwa OK');

// test_ocr: OCR words (as PaddleOCR returns them for a photo) give the same bill as the PDF's own text
{
  const { ocrLines } = await import('../www/lib/ocr.js');
  const { toNum } = await import('../www/lib/parse.js');
  const { caseKey } = await import('../www/lib/disputes.js');
  const f = 'www/data/fixtures/SYNTHETIC_bill.pdf', lines = await pdfLines(pdfjs, new Uint8Array(readFileSync(f)));
  // A 2000 px wide "photo" of the page: PDF points scaled up, y measured from the top; each tracker row read as ONE run of numbers.
  const S = 2000 / 612, cells = l => l.items.filter(it => /^(\d[\d,]*|-)$/.test(it.str));
  const b = parseBill(lines), blurry = str => (str.match(/\d[\d,]*\.\d+/) ?? []).some(n => toNum(n) === b.charges_this_period);
  const one = (l, it) => ({ str: it.str, x: it.x * S, w: it.str.length * 12, y: (800 - l.y) * S + (it.x % 3), h: 30, conf: blurry(it.str) ? 0.6 : 0.99 });
  const run = (l, c) => ({ str: c.map(i => i.str).join(' '), x: c[0].x * S, w: (c.at(-1).x - c[0].x) * S * (1 + 1 / 23), y: (800 - l.y) * S, h: 30, conf: 0.99 });
  const words = lines.flatMap(l => cells(l).length === 12 ? [...l.items.filter(it => !cells(l).includes(it)).map(it => one(l, it)), run(l, cells(l))] : l.items.map(it => one(l, it)));
  const o = ocrLines(words, 2000), a = parseBill(o.lines);
  for (const k of FIELDS) assert.deepEqual(a[k], b[k], `ocr ${k}`);
  assert.deepEqual(a.charges, b.charges, 'ocr charges');
  assert.deepEqual(a.tracker, b.tracker, 'ocr tracker: a run of numbers is split back into 12 cells');
  assert.ok(o.low.has(b.charges_this_period) && !o.low.has(b.current_reading), 'only numbers from blurry text are marked "please check"');
  assert.ok(o.clear < o.total);
  assert.equal(caseKey({ customer_account_number: '0012345678', bill: { period_end: '2026-05-26' } }), '0012345678|2026-05-26');
}
console.log('ocr OK');

// test_ocr_real: what PaddleOCR 3.7 really returned for an image of the SYNTHETIC bill (it dropped one tracker "-") reads as the same bill
{
  const { ocrLines } = await import('../www/lib/ocr.js');
  // _glued: a second real run that also glued tracker numbers together ("194199 210 298 329304")
  for (const f of ['SYNTHETIC_ocr_words', 'SYNTHETIC_ocr_words_glued']) {
    const out = json(`tests/${f}.json`);
    assert.deepEqual(parseBill(ocrLines(out.words, out.width).lines), await readBill('www/data/fixtures/SYNTHETIC_bill.pdf'), f);
  }
}
console.log('ocr real output OK');

// test_page2: "How your bill was computed" is read per data/bill_spec.json and the bill's own arithmetic is checked.
// Invented numbers in the real layout: two printed columns, a label printed a few points away from its numbers, VAT lines
// continuing in the right column, a group with no header (nets to 0.00), credits after Total Energy Amount, payments.
{
  const spec = json('www/data/bill_spec.json');
  const row = (y, ...cells) => ({ page: 2, y, items: cells.map(([x, str]) => ({ x, str })) });
  const line = (y, x, label, ...v) => row(y, [x, label], ...v.map((s, i) => [x + 130 + i * 50, s]));
  const page2 = amount => [
    row(790, [32, "What you've paid"]), row(760, [32, '27 May-26 Jun 2026'], [101, '30 Jun 2026 Meralco Online'], [259, '₱'], [265, '9,811.31']),
    row(700, [32, 'How your bill was computed'], [306, 'Continued']),
    row(690, [306, 'Rate Components'], [447, 'Base'], [497, 'Price'], [538, 'Amount']),
    row(684, [442, '300.00'], [483, '10.4933%'], [547, '31.48']), row(680, [310, 'Distribution Charge']),
    row(660, [306, 'Energy Bill Amount']), line(650, 310, 'VAT Sales', '900.00', '91.48'), line(640, 310, 'Non-VAT', '8.52'),
    row(650.5, [36, 'Rate Components'], [177, 'Base'], [227, 'Price'], [268, 'Amount']),
    line(630, 306, 'Total Energy Amount', '1,000.00'), line(620, 306, 'Applied Credits', '-50.00'),
    line(610, 310, 'Bill Deposit Refund', '-20.00'), line(600.5, 310, 'Bill Deposit Refund', '-30.00'),
    line(590.5, 306, 'Charges for this billing period', '950.00'), line(580.5, 304, 'Additional Bill Information', '999.00'),
    line(640.5, 36, 'Generation 60.00%', '600.00'), line(630.5, 40, 'Generation Charge (PhP/kWh)', '100 kWh', '6.0000', amount),
    line(620.5, 36, 'Distribution (Meralco) 30.00%', '300.00'), line(610.5, 40, 'Distribution Charge (PhP/kWh)', '100 kWh', '3.0000', '300.00'),
    line(600, 40, 'Lifeline Rate Adjustment', '100 kWh', '-0.0100', '-1.00'), line(590, 40, 'Senior Citizen Subsidy', '100 kWh', '0.0100', '1.00'),
    line(580, 36, 'Government Taxes 10.00%', '100.00'), line(570, 40, 'RPT Charge (PhP/kWh)', '100 kWh', '0.0400', '4.00'),
    line(560, 40, 'LFT Charge', '904.00', '0.5000%', '4.52'), row(550, [36, 'VALUE ADDED TAX']),
    line(540, 40, 'Generation Charge', '600.00', '10.0000%', '60.00'), row(100, [36, 'Reminders when paying']),
  ].sort((a, b) => b.y - a.y);
  const page1 = { kwh: 100, previous_reading: 0, current_reading: 100, multiplier: 1, days: 30, charges_this_period: 950, remaining_balance: 0, installment_due: 0,
    total_amount_due: 950, rate_this_month: 10, tracker: [{ month: '2026-01', kwh: 100 }],
    charges: [['Generation', 600], ['Distribution (Meralco)', 300], ['Senior Citizen', 0], ['Government Taxes', 100], ['Applied Credits', -50]].map(([label, amount_php]) => ({ label, amount_php })) };
  const read = amount => ({ ...parseBill(page2(amount), spec), ...page1 });
  const bill = read('600.00'), d = bill.detail;
  assert.deepEqual(d.groups.map(g => [g.key, g.amount, g.lines.length]), [['generation', 600, 1], ['distribution', 300, 1], ['senior_citizen', 0, 2], ['taxes', 100, 4]]);
  assert.deepEqual(d.groups[3].lines.map(l => l.key), ['rpt', 'lft', 'vat_generation', 'vat_distribution'], 'VAT lines continue in the right column');
  assert.deepEqual(d.groups[3].lines[3], { key: 'vat_distribution', label: 'VALUE ADDED TAX: Distribution Charge', basis: 'percent_of', base: 300, price: 10.4933, percent: true, amount: 31.48 });
  assert.deepEqual([d.energy, d.applied_credits, d.adjustments.length], [{ vat_sales_base: 900, vat_sales_vat: 91.48, non_vat: 8.52, total_energy_amount: 1000 }, -50, 2]);
  assert.deepEqual(bill.payments, [{ billing_period: '27 May-26 Jun 2026', period_end: '2026-06-26', posting_date: '2026-06-30', channel: 'Meralco Online', amount_php: 9811.31 }]);
  const checks = runChecks(bill, spec), detail = checks.filter(c => c.detail);
  assert.ok(checks.every(c => c.passed), JSON.stringify(checks.filter(c => !c.passed)));
  assert.deepEqual(detail.map(c => c.name), ['line_amounts', 'kwh_bases', 'percent_bases', 'lft_base', 'group_sums', 'summary_matches_detail', 'group_percents',
    'vat_sales_base', 'vat_total', 'non_vat', 'total_energy_amount', 'credits', 'charges_total', 'rate_this_month'], 'a check runs only when its numbers were read');
  assert.equal(runChecks(bill).length, 4, 'no spec: page 1 checks only');
  for (const c of spec.checks.filter(c => c.in === 'summary')) assert.ok(checks.some(x => x.name === c.name && !x.detail), `spec summary check ${c.name} exists in checks.js`);
  // one wrong amount on page 2 is caught, named, and becomes a strong flag
  const wrong = read('610.00'), bad = runChecks(wrong, spec).filter(c => !c.passed);
  assert.deepEqual(bad.map(c => c.name), ['line_amounts', 'group_sums']);
  assert.deepEqual(bad[0].fails, [{ what: 'Generation Charge (PhP/kWh): 100 x 6', expected: 600, found: 610 }]);
  const flag = billingFlags({ ...wrong, period_end: '2026-01-26' }, bad, null)[0];
  assert.deepEqual([flag.key, flag.strength], ['line_amounts', 'strong']);
  assert.match(flag.text, /does not add up .*computed 600\.00, the bill shows 610\.00/);
  // every spec line label is unique within its group, so a printed line maps to one key
  for (const g of spec.groups) assert.equal(new Set(g.lines.flatMap(l => [l.label, ...(l.alt ?? [])])).size, g.lines.reduce((n, l) => n + 1 + (l.alt?.length ?? 0), 0), g.key);
}
console.log('page 2 OK');

// Ticket routing: a Meralco ticket only when a person has something to do; staff can move a case either way.
{
  const { route } = await import('../www/lib/disputes.js');
  const { step, startChat, answersOf } = await import('../www/lib/chat.js');
  const to = (flags, extra = {}) => route({ flags: flags.map(strength => ({ strength })), ...extra }).to;
  assert.equal(to(['strong', 'weak']), 'meralco');
  assert.equal(to(['medium']), 'meralco');
  assert.equal(to(['weak']), 'chatbot');
  assert.equal(to([]), 'chatbot');
  assert.equal(to([], { unanswered_questions: ['paano magbayad sa GCash?'] }), 'meralco');
  assert.equal(to(['strong'], { route_override: 'chatbot' }), 'chatbot', 'staff override wins');
  assert.equal(to([], { route_override: 'bogus' }), 'chatbot', 'unknown override ignored');
  // The chat remembers a question it could not answer from the bill or the advisory, and only that one.
  const ctx = { sentence: 'Your bill rose.', facts: ['Generation charge this month: ₱1,940.10'], reason: null, days: 30 };
  let s = step(startChat(), 'paano magbayad sa GCash?', ctx).state;
  s = step(s, 'magkano ang generation charge?', ctx).state;
  assert.deepEqual(answersOf(s, 30).unanswered, ['paano magbayad sa GCash?']);
  const msg = disputeMessage({ period_start: '2026-04-27', period_end: '2026-05-26', kwh: 300, charges_this_period: 4500 }, [], { keys: [], unanswered: ['paano magbayad sa GCash?'] });
  assert.match(msg, /help with questions[\s\S]*could not answer[\s\S]*- paano magbayad sa GCash\?[\s\S]*Please answer my questions/);
  // Nothing flagged, nothing asked: the customer can still escalate, as a plain review request.
  assert.match(disputeMessage({ period_start: '2026-04-27', period_end: '2026-05-26', kwh: 300, charges_this_period: 4500 }, []), /request a review[\s\S]*Please recheck/);
  assert.doesNotMatch(msg, /What I noticed/);
}
console.log('routing OK');

// Meralco FAQs in the chat: Taglish questions find the right FAQ, month-specific FAQs only for that month, unrelated -> nothing.
{
  const { faqIndex, faqBest, faqSearch, faqQuote } = await import('../www/lib/faq.js');
  const { step, startChat, answersOf, fromModelFaq } = await import('../www/lib/chat.js');
  const F = (id, q, ...answer) => ({ id, topic: 'Bills and Payments', category: null, q, answer, url: `https://www.meralco.com.ph/help/faqs/x#${id}` });
  const ix = faqIndex({ faqs: [
    F('can', 'What is Meralco CAN?', 'Meralco CAN is your Customer Account Number. It is the 10-digit permanent number.'),
    F('find-can', 'Where can I find my Meralco CAN?', 'Your Meralco CAN is found at the top right portion of your Meralco paper bill.'),
    F('outage', 'What is an outage?', 'An outage is an interruption of electric service.'),
    F('april', 'Why did my electricity bill increase this April?', 'Higher generation charge and hotter weather.'),
    F('paperless', 'What is Paperless Billing?', 'Paperless Billing lets you receive your bill by email instead of paper.'),
    F('read', 'How often is my meter read?', 'Meralco reads your meter once a month.'),
    F('deposit', 'What is the Bill Deposit?', 'The bill deposit guarantees payment of your bills.', 'It is refundable.'),
  ] });
  const best = (q, m = '2026-10') => faqBest(ix, q, m)?.id ?? null;
  assert.equal(best('ano ang Meralco CAN?'), 'can');
  assert.equal(best('saan makikita ang CAN ko?'), 'find-can');
  assert.equal(best('may brownout ba sa amin?'), 'outage');
  assert.equal(best('paano basahin ang metro?'), 'read');
  assert.equal(best('ano ang WESM?'), null, 'nothing about it: no FAQ, never a near miss');
  assert.equal(best('can I pay with GCash?'), null, 'lowercase "can" is the verb, not the account number');
  assert.ok(!faqSearch(ix, 'bakit tumaas ang bill ko?', '2026-10').some(r => r.f.id === 'april'), 'an April FAQ never answers an October bill');
  assert.ok(faqSearch(ix, 'bakit tumaas ang bill ko?', '2026-04').some(r => r.f.id === 'april'));
  assert.match(faqQuote(ix.docs.at(-1).f, 50), /"What is the Bill Deposit\?"\nThe bill deposit guarantees payment of your bills\.\n…\nhttps:/, 'cut at a paragraph, marked, linked');
  // The model's FAQ pick only counts if it is on our own shortlist for that question.
  const short = faqSearch(ix, 'ano ang Meralco CAN?', '2026-10');
  assert.equal(fromModelFaq('can', short), 'can');
  assert.equal(fromModelFaq('april', short), undefined);
  assert.equal(fromModelFaq(null, short), null);
  // In the chat: a FAQ answers it (no ticket); the customer's own bill figure wins over a general FAQ.
  const ctx = { sentence: 'Your bill rose.', facts: ['Generation charge this month: ₱1,940.10'], reason: null, days: 30, faqIndex: ix, month: '2026-10' };
  let r = step(startChat(), 'saan makikita ang CAN ko?', ctx);
  assert.match(r.reply, /Meralco FAQ: "Where can I find my Meralco CAN\?"[\s\S]*top right portion[\s\S]*#find-can/);
  assert.deepEqual(answersOf(r.state, 30).unanswered, []);
  r = step(startChat(), 'magkano ang generation charge ko?', ctx);
  assert.match(r.reply, /^Sa bill mo \(from your bill\): Generation charge/);
  r = step(startChat(), 'ano ang WESM?', ctx);
  assert.deepEqual(answersOf(r.state, 30).unanswered, ['ano ang WESM?'], 'not in the bill, FAQs or advisory: a question for Meralco');
  // With the model: its FAQ pick is shown verbatim.
  r = step(startChat(), 'ano yung number sa taas ng bill?', { ...ctx, fact: null, pick: null, faq: 'find-can' });
  assert.match(r.reply, /Meralco FAQ: "Where can I find my Meralco CAN\?"/);
}
// The scraped FAQ file: unique ids, links to the exact question on meralco.com.ph, verbatim answers.
{
  const data = json('www/data/faqs.json');
  assert.ok(data.faqs.length > 50, `${data.faqs.length} FAQs`);
  assert.equal(new Set(data.faqs.map(f => f.id)).size, data.faqs.length);
  assert.ok(data.faqs.every(f => f.q && f.answer.length && f.answer.every(p => typeof p === 'string' && p) && f.url === `${f.url.split('#')[0]}#${f.id}` && f.url.startsWith('https://www.meralco.com.ph/help/faqs/')));
}
console.log('faqs OK');
// A one-word overlap with a bill sentence ("Meralco") must not beat an exact FAQ match.
{
  const { faqIndex } = await import('../www/lib/faq.js');
  const { step, startChat } = await import('../www/lib/chat.js');
  const ix = faqIndex({ faqs: [{ id: 'can', q: 'What is Meralco CAN?', answer: ['Meralco CAN is your Customer Account Number.'], url: 'https://www.meralco.com.ph/help/faqs/x#can' },
    { id: 'o', q: 'What is an outage?', answer: ['An interruption of service.'], url: 'https://www.meralco.com.ph/help/faqs/x#o' }] });
  const ctx = { sentence: 'x', facts: ["Meralco's rates this month: ₱15.06 per kWh."], reason: null, days: 30, faqIndex: ix, month: '2026-10' };
  assert.match(step(startChat(), 'ano ang Meralco CAN?', ctx).reply, /^Meralco FAQ: "What is Meralco CAN\?"/);
}
console.log('faq vs bill fact OK');

// Hot vs cool months chart: hotter half by each period's own mean temperature, averages weighted by days.
{
  const { heatSplit } = await import('../www/lib/model.js');
  const T0 = Date.UTC(2025, 0, 1), day = 864e5, per = [[0, 30], [1, 26], [2, 32], [3, 24]].map(([i, t]) => ({ month: `2025-0${i + 1}`, start: T0 + i * 10 * day, end: T0 + (i * 10 + 9) * day, days: 10, kwh: t * 10, t }));
  const h = heatSplit([...per].reverse(), ms => per.find(p => ms >= p.start && ms <= p.end).t);
  assert.deepEqual(h.rows.map(r => r.month), ['2025-01', '2025-02', '2025-03', '2025-04'], 'bars in date order');
  assert.deepEqual(h.rows.map(r => r.hot), [true, false, true, false]);
  near(h.hot_kwh_per_day, 31, 1e-9, 'hot average'); near(h.cool_kwh_per_day, 25, 1e-9, 'cool average'); near(h.diff_share, 0.24, 1e-9, 'hot vs cool');
  assert.equal(heatSplit([], () => 0).diff_share, null);
  console.log('heat split OK');
  const { isReset } = await import('../www/lib/chat.js');
  assert.ok(['restart', ' Reset! ', 'Start over', 'simula ulit', 'ULITIN'].every(isReset), 'reset phrases');
  assert.ok(!['wala', 'bumili kami ng aircon ulit', 'how do I restart my meter?', ''].some(isReset), 'normal messages are not resets');
}

// test_qa_edge_cases: regressions from the edge-case QA pass (2026-11-13)
{
  const { understand, step, startChat, answersOf, hoursIn, needsModel, isQuestion } = await import('../www/lib/chat.js');
  const { billProblems } = await import('../www/lib/checks.js');
  const { route, daysSince } = await import('../www/lib/disputes.js');
  const { faqIndex } = await import('../www/lib/faq.js');
  const { detectRateMonth } = await import('../www/lib/explain.js');
  const k = t => understand(t).keys.join('+');
  // a denied gadget is never recorded as a change at home (the answers become dispute evidence)
  for (const t of ['hindi kami bumili ng aircon', 'we did NOT buy an aircon', 'wala kaming bagong aircon', 'no aircon', 'bumili kami ng 0 aircon']) {
    const u = understand(t);
    assert.deepEqual([u.keys, u.gadgets, u.negated], [[], [], true], t);
    assert.ok(!needsModel(startChat(), t), `${t}: the model is not asked to re-read a denial`);
  }
  assert.equal(k('wala kami sa bahay, pero naka-on ang aircon'), 'away+aircon', 'a negation in another clause does not cancel the gadget');
  assert.equal(k('nothing changed except the aircon'), 'aircon');
  // "I don't know" is not "nothing changed", and does not end the chat
  for (const t of ['hindi ko alam', 'no idea', 'di ko sure']) {
    assert.equal(k(t), '', t);
    assert.equal(step(startChat(), t, { sentence: 'x', days: 30 }).state.ask, 'open', t);
  }
  assert.equal(k('hindi'), 'nothing');
  assert.equal(k('wala po'), 'nothing');
  // counts and hours are clamped on the rules path too; the 2 of "2 hp" is not a count
  const g = t => understand(t).gadgets[0];
  assert.equal(g('bumili kami ng 100 aircon').count, 10);
  assert.equal(g('bumili ng aircon 30 hours').hours, 24);
  assert.equal(g('bumili ng 2 hp aircon').count, 1);
  // hours without a model: number words, h:mm, capped at 24
  assert.deepEqual(['walong oras', '8:30', '99', 'mga 2.5 hrs', 'buong araw', 'hmm'].map(hoursIn), [8, 8.5, 24, 2.5, 24, null]);
  const ctx = { sentence: 'Your bill rose.', reason: null, days: 30, unexplained_kwh: 0 };
  let s = step(startChat(), 'bumili kami ng aircon', ctx);
  assert.ok(isQuestion(s.state, 'ano ang system loss?') && !isQuestion(s.state, '8'));
  s = step(s.state, 'ano ang system loss?', ctx);
  assert.equal(s.state.ask, 'hours', 'a question while waiting for hours is answered, then the hours are asked again');
  assert.match(s.reply, /Balik tayo: ilang oras/);
  s = step(s.state, 'walong oras', ctx);
  assert.equal(answersOf(step(s.state, 'wala', ctx).state, 30).added_kwh, 216);
  // confirm screen: cleared or impossible fields are named before the analysis runs
  const ok = { period_start: '2026-09-15', period_end: '2026-10-14', kwh: 243, charges_this_period: 3747, charges: [{ label: 'Generation', amount_php: 2000 }], remaining_balance: 0 };
  assert.deepEqual(billProblems(ok), []);
  assert.equal(billProblems({ ...ok, kwh: NaN }).length, 1);
  assert.equal(billProblems({ ...ok, kwh: 0, charges_this_period: NaN, period_start: '' }).length, 3);
  assert.match(billProblems({ ...ok, period_start: ok.period_end, period_end: ok.period_start })[0], /ends before it starts/);
  assert.match(billProblems({ ...ok, remaining_balance: NaN, charges: [{ label: 'Generation', amount_php: NaN }] })[0], /Remaining Balance, Generation/);
  assert.throws(() => detectRateMonth(rates, { kwh: NaN, charges: [{ key: 'generation', amount_php: 2000 }] }), /kWh used/);
  assert.throws(() => T(Date.parse('2031-01-01')), /saved weather covers/);
  // a text PDF that is not a bill reads as "nothing found", not as 0 kWh
  assert.equal(parseBill([{ y: 1, page: 1, items: [{ str: 'Hello world', x: 10 }] }]).kwh, null);
  // untrusted dispute files and scraped FAQs cannot throw
  assert.equal(route({ flags: [null, 'x', { strength: 'strong' }] }).to, 'meralco');
  assert.equal(route({ flags: [null] }).to, 'chatbot');
  assert.equal(faqIndex({ faqs: [{ q: 'no answer' }, null, { q: 'ok', answer: ['yes'], url: 'u', id: 1 }] }).docs.length, 1);
  assert.equal(daysSince('abc'), 0);
  assert.match(disputeMessage({ period_start: 'a', period_end: 'b', charges_this_period: 1, kwh: 1 }, [], { keys: ['bogus'] }), /- bogus/);
}
console.log('qa edge cases OK');

// test_scenarios: each SYNTHETIC scenario bill (npm run scenarios) is read through the real pipeline and must still do what the catalogue
// recorded, and the catalogue must cover every flag, every page-2 check, every model tier and both routes.
{
  const { analyse } = await import('../scripts/scenario_lib.mjs');
  const { route } = await import('../www/lib/disputes.js');
  const cat = json('www/data/fixtures/SYNTHETIC_scenarios.json').scenarios, spec = json('www/data/bill_spec.json');
  // Only what must stay put when rates or weather are refreshed: no peso or kWh projections.
  const stable = o => ({ stage: o.stage, tier: o.tier, rate_month: o.rate_month, rate_month_matches_dates: o.rate_month_matches_dates, prev_exact: o.prev_exact,
    warn_residual: o.warn_residual, flags: o.flags, flags_if_nothing_changed: o.flags_if_nothing_changed, route: o.route, checks_failed: o.checks?.failed, problems: o.problems, failed: !!o.error });
  assert.ok(cat.length >= 60 && new Set(cat.map(s => s.id)).size === cat.length, `${cat.length} unique scenarios`);
  for (const s of cat) {
    const seen = await analyse(readFileSync(`www/data/fixtures/${s.file}`));
    assert.deepEqual(stable(seen), stable(s.observed), `${s.id} no longer behaves as recorded (run "npm run scenarios" if rates or weather changed on purpose)`);
    if (s.expect.error) assert.match(seen.error, new RegExp(s.expect.error.regex), s.id);
  }
  const all = cat.map(s => s.observed), has = (f, v) => all.some(o => (o[f] ?? []).includes?.(v) || o[f] === v);
  const flagKeys = new Set(all.flatMap(o => [...(o.flags ?? []), ...(o.flags_if_nothing_changed ?? [])].map(f => f.split(':')[0])));
  for (const k of ['readings', 'tracker_latest', 'line_sum', 'total', 'rate_mismatch', 'missed_reading', 'spike', 'long_period', 'unexplained_increase']) assert.ok(flagKeys.has(k), `a scenario raises ${k}`);
  const failedChecks = new Set(all.flatMap(o => o.checks?.failed ?? []));
  for (const c of spec.checks) assert.ok(failedChecks.has(c.name), `a scenario trips the ${c.name} check`);
  for (const t of ['A_3pc', 'B_fixed24', 'C_refused']) assert.ok(has('tier', t), `a scenario lands in tier ${t}`);
  for (const r of ['meralco', 'chatbot']) assert.ok(has('route', r), `a scenario routes to ${r}`);
  for (const st of ['strong', 'medium', 'weak']) assert.ok(all.some(o => (o.flags ?? []).some(f => f.endsWith(`:${st}`))), `a ${st} flag`);
  for (const st of ['result', 'analysis', 'pdf', 'not_a_bill', 'confirm']) assert.ok(has('stage', st), `a scenario ends at stage ${st}`);
  for (let m = 2; m <= 10; m++) assert.ok(has('rate_month', `2026-${String(m).padStart(2, '0')}`), `a bill priced at 2026-${m}`);
  assert.ok(has('prev_exact', true) && has('prev_exact', false) && has('rate_month_matches_dates', false), 'exact and estimated previous bill, and a rate month that differs from the dates');
  // the dispute files that go with them
  const pk = json('www/data/fixtures/SYNTHETIC_scenario_packets.json');
  assert.ok(pk.length >= 20 && pk.every(p => p.format === 'tanaw-dispute/1' && p.bill.source === 'synthetic'));
  assert.equal(new Set(pk.map(p => `${p.customer_account_number}|${p.bill.period_end}`)).size, pk.length, 'one dashboard case per file');
  assert.deepEqual([...new Set(pk.map(p => p.strength))].sort(), ['medium', 'strong', 'weak']);
  assert.deepEqual([...new Set(pk.map(p => route(p).to))].sort(), ['chatbot', 'meralco']);
  assert.ok(pk.some(p => p.status === 'resolved') && pk.some(p => p.route_override) && pk.some(p => p.unanswered_questions.length), 'resolved, staff-moved and unanswered-question cases');
}
console.log('scenarios OK');
