// "What changed at home?" as a chat, in English or Taglish. Rule-based on purpose: the answers become dispute evidence, so the
// same words must always give the same result, offline, on a cheap phone. It fills the same answers object the checkboxes did
// (keys from flags.js CHANGES + the user's own words), plus new gadgets with an estimated kWh.
// Hybrid: keyword rules first. Only a message the rules can't read goes to a local model (Ollama, via scripts/serve.mjs), whose
// JSON is validated by fromModel like any user input; watts, hours and kWh always come from GADGETS, never from the model.

// [name, pattern, typical watts, typical hours/day]. shortcut: typical PH household values, not measured; the user can give hours.
export const GADGETS = [
  ['aircon', /\b(air ?-?con(d|ditioner)?|aircon|a\/c|ac)\b/i, 900, 8],
  ['refrigerator', /\b(ref|refrigerator|refrigerador|pridyider|fridge)\b/i, 60, 24],
  ['freezer', /\bfreezer\b/i, 80, 24],
  ['electric fan', /\b(electric ?fan|e-?fan|bentilador|fan)\b/i, 60, 8],
  ['TV', /\b(tv|telebisyon|television)\b/i, 100, 5],
  ['desktop computer', /\b(pc|desktop|computer|kompyuter|gaming)\b/i, 250, 6],
  ['laptop', /\blaptop\b/i, 60, 8],
  ['washing machine', /\b(washing machine|washer|labahan|panlaba)\b/i, 500, 1],
  ['water heater', /\b(water heater|shower heater|heater|pampainit)\b/i, 3000, 0.5],
  ['rice cooker', /\b(rice ?cooker)\b/i, 600, 1],
  ['electric stove', /\b(induction|electric stove)\b/i, 1500, 1],
  ['oven or air fryer', /\b(microwave|oven|air ?fryer)\b/i, 1200, 0.5],
  ['flat iron', /\b(plantsa|flat ?iron|iron)\b/i, 1000, 0.5],
  ['water dispenser', /\b(water dispenser|dispenser)\b/i, 100, 24],
  ['e-bike charging', /\b(e-?bike|e-?trike|scooter)\b/i, 300, 5],
  ['electric car charging', /\b(ev|electric car|e-?car)\b/i, 3500, 3],
];
const CHARGING = ['e-bike charging', 'electric car charging'];
const NEW = /\b(bago|bagong|bumili|binili|nabili|bili|new|bought|got|nagpakabit|nagpalagay|kinabit|install(ed)?|dagdag|added|another|extra|pang)\b/i;
const NUM = { isa: 1, isang: 1, dalawa: 2, dalawang: 2, tatlo: 3, tatlong: 3, apat: 4, lima: 5, limang: 5, one: 1, two: 2, three: 3, four: 4, five: 5 };
const RULES = [ // [key, pattern]
  ['away', /\b(probinsya|province|out of town|vacation|nagbakasyon kami|travel|abroad kami|wala (kami|ako|kaming|tao)|walang tao|away|ospital|hospital|umalis kami)\b/i],
  ['people', /\b(bisita|guests?|visitors?|nakitira|lumipat|dumating|balikbayan|wfh|work ?from ?home|online class|baby|sanggol|dumami|more people|kamag-anak|relatives|nanay|tatay|lola|lolo)\b/i],
  ['business', /\b(negosyo|business|tindahan|sari-sari|piso ?wifi|laundry shop|salon|carinderia|online selling|bake|baking)\b/i],
  ['aircon', /\b(init|mainit|hot|heat|summer|tag-init)\b/i], // used the aircon or fans more because of the heat
];
const NO = /^(wala|wala na|wala naman|wala po|none|nothing|no|nope|hindi|hindi po|tapos|done|ok na|okay na|yun lang|that's all|walang nagbago|same|pareho( lang)?|ganun pa rin|ganon pa rin|normal)\b/i;
const UNSURE = /\b(hindi ko alam|di ko alam|ewan|not sure|don'?t know|dunno|idk)\b/i;
const QUESTION = /\?|^(bakit|why|paano|how|ano|what|saan|magkano|totoo)\b/i;
const HOURS = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|oras|h)\b/i;

// One message -> what it says. Pure, so it is tested without a browser.
export function understand(text) {
  const t = ` ${text.toLowerCase()} `, keys = new Set(), gadgets = [];
  for (const [k, re] of RULES) if (re.test(t)) keys.add(k);
  let unquantified = keys.has('people') || keys.has('business') || keys.has('aircon');
  for (const [name, re, watts, hours] of GADGETS) {
    const m = t.match(re);
    if (!m) continue;
    const isNew = CHARGING.includes(name) || NEW.test(t);
    const before = t.slice(0, m.index).trim().split(/\s+/).slice(-2); // "2 aircon", "dalawang bagong aircon"
    const count = before.map(w => (/^\d+$/.test(w) ? +w : NUM[w])).find(Boolean) ?? 1;
    const hp = name === 'aircon' && +t.match(/(\d+(?:\.\d+)?)\s*hp\b/)?.[1];
    const w = (hp ? watts * hp : watts) * (name === 'aircon' && /inverter/.test(t) ? 0.6 : 1);
    const h = t.match(HOURS)?.[1];
    gadgets.push({ name, count, watts: w, hours: h ? +h : /buong araw|maghapon|24\/7|all day|whole day/.test(t) ? 24 : null, typical_hours: hours, new: isNew });
    keys.add(keyFor(name, isNew));
    if (!isNew) unquantified = true; // "used the TV more": no extra hours to price
  }
  if (!keys.size && (NO.test(text.trim()) || /walang nagbago|nothing changed/i.test(t))) keys.add('nothing');
  return { keys: [...keys], gadgets, unquantified };
}

const keyFor = (name, isNew) => (CHARGING.includes(name) ? 'business' : isNew ? 'appliance' : name === 'aircon' || name === 'electric fan' ? 'aircon' : 'appliance');

// ---------- local model (hybrid fallback) ----------
export const CHANGE_KEYS = ['nothing', 'away', 'people', 'aircon', 'appliance', 'business'];
const hoursType = { type: ['number', 'null'] };
// Ollama "format": the model can only answer with these keys and these gadget names.
export const MODEL_SCHEMA = {
  type: 'object', required: ['is_question', 'changes', 'gadgets', 'hours_per_day'],
  properties: {
    is_question: { type: 'boolean' },
    changes: { type: 'array', items: { enum: CHANGE_KEYS } },
    gadgets: { type: 'array', items: { type: 'object', required: ['name', 'count', 'is_new', 'hours_per_day'], properties: {
      name: { enum: GADGETS.map(g => g[0]) }, count: { type: 'integer' }, is_new: { type: 'boolean' }, hours_per_day: hoursType } } },
    hours_per_day: hoursType,
  },
};
export const MODEL_PROMPT = `You read one message from a Filipino household about their electricity bill. It may be English, Tagalog or Taglish.
Return JSON only. Do not guess: if the message does not say it, leave it out.
- is_question: true if they are asking something instead of telling what changed at home.
- changes: what changed at home this billing period:
  nothing = nothing changed; away = they were away or home less (vacation, province, hospital);
  people = more people at home (guests, relatives, new baby, work or school from home);
  aircon = used the aircon or electric fan more (e.g. because of the heat);
  appliance = new or extra appliance, or used another appliance more; business = home business, or charging an e-bike or electric car.
- gadgets: appliances they mention, using only the allowed names. is_new = bought, newly installed or added this period.
  count = how many (default 1). hours_per_day = only if they say how long it runs each day.
- hours_per_day (top level): if the whole message is just a duration ("mga walong oras", "buong gabi", "half day"), that number of hours.
Examples:
"nagpakabit kami ng bagong split type sa kwarto, gabi-gabi naka-on" -> {"is_question":false,"changes":["appliance"],"gadgets":[{"name":"aircon","count":1,"is_new":true,"hours_per_day":10}],"hours_per_day":null}
"dumating yung pinsan ko galing Cebu, dito muna siya ng isang buwan" -> {"is_question":false,"changes":["people"],"gadgets":[],"hours_per_day":null}
"mga walong oras siguro" -> {"is_question":false,"changes":[],"gadgets":[],"hours_per_day":8}
"ano po ba yung system loss?" -> {"is_question":true,"changes":[],"gadgets":[],"hours_per_day":null}`;

// The model's JSON, checked: unknown keys and gadget names dropped, counts and hours clamped. Returns null if unusable.
export function fromModel(m, model = 'local model') {
  if (!m || typeof m !== 'object') return null;
  const hrs = v => (typeof v === 'number' && v > 0 && v <= 24 ? v : null);
  const gadgets = (Array.isArray(m.gadgets) ? m.gadgets : []).flatMap(g => {
    const d = GADGETS.find(x => x[0] === g?.name);
    if (!d) return [];
    return [{ name: d[0], count: Math.min(Math.max(Math.round(+g.count) || 1, 1), 10), watts: d[2], hours: hrs(g.hours_per_day),
      typical_hours: d[3], new: CHARGING.includes(d[0]) || g.is_new === true }];
  });
  const keys = new Set((Array.isArray(m.changes) ? m.changes : []).filter(k => CHANGE_KEYS.includes(k)));
  for (const g of gadgets) keys.add(keyFor(g.name, g.new));
  if (keys.size > 1) keys.delete('nothing');
  const unquantified = keys.has('people') || keys.has('aircon') || gadgets.some(g => !g.new)
    || (keys.has('business') && !gadgets.some(g => CHARGING.includes(g.name)));
  return { keys: [...keys], gadgets, unquantified, question: m.is_question === true, hours: hrs(m.hours_per_day), model };
}

// Should this message go to the model? Only when the rules got nothing out of it.
export function needsModel(state, text) {
  if (state.ask === 'done' || !text.trim()) return false;
  if (state.ask === 'hours') return !/\d/.test(text) && !UNSURE.test(text);
  const u = understand(text);
  return !u.keys.length && !u.gadgets.length;
}

export const gadgetKwh = (g, days) => g.count * g.watts * (g.hours ?? g.typical_hours) * days / 1000;

// The answers object flags.js reads. added_kwh is set only when every usage-raising answer is a new gadget we can price.
export function answersOf(s, days) {
  const fresh = s.gadgets.filter(g => g.new);
  return {
    keys: s.keys.includes('nothing') && s.keys.length > 1 ? s.keys.filter(k => k !== 'nothing') : [...s.keys],
    note: s.notes.join(' / '),
    gadgets: s.gadgets.map(({ asked, ...g }) => ({ ...g, kwh: Math.round(gadgetKwh(g, days)) })),
    added_kwh: s.unquantified || !fresh.length ? null : Math.round(fresh.reduce((a, g) => a + gadgetKwh(g, days), 0)),
    parser: s.model ? `rules + ${s.model}` : 'rules', // so Meralco/ERC can see a model read part of the answers
  };
}

export const startChat = () => ({ keys: [], gadgets: [], notes: [], unquantified: false, ask: 'open', pending: null });
const label = g => `${g.count > 1 ? g.count + ' × ' : ''}${g.name}`;
const STOP = new Set(['bakit', 'why', 'what', 'paano', 'ang', 'ano', 'yung', 'mga', 'this', 'that', 'month', 'ngayon', 'buwan', 'mataas', 'tumaas', 'bill', 'ko', 'namin', 'there']);
const SYN = { buwis: 'tax', singil: 'charge', kuryente: 'electricity', bawas: 'refund', ibinalik: 'refund', presyo: 'rate' };

// A question instead of an answer: reply from the bill explanation and Meralco's own advisory text (best-matching paragraph).
function answer(text, ctx) {
  const words = text.toLowerCase().match(/[a-z-]{3,}/g)?.map(w => SYN[w] ?? w).filter(w => !STOP.has(w)) ?? [];
  const paras = (ctx.reason?.sections ?? []).flatMap(s => s.paragraphs);
  const best = words.length && paras.map(p => [words.filter(w => p.toLowerCase().includes(w)).length, p]).sort((a, b) => b[0] - a[0])[0];
  const src = ctx.reason ? ` (Meralco advisory, ${ctx.reason.date})` : '';
  return best?.[0] ? `Ayon sa Meralco${src}: "${best[1]}"` : `${ctx.sentence}${ctx.reason ? ` Meralco${src}: "${ctx.reason.text}"` : ''}`;
}

const MORE = 'May iba pa bang nagbago? (Anything else?) Type "wala" kung wala na.';

// One turn of the chat. ctx: { sentence, reason, days, unexplained_kwh }. model: fromModel() output for this message, or null
// (the caller asks the model only when needsModel says so). Returns the new state and the bot's reply.
export function step(state, text, ctx, model = null) {
  const s = { ...state, keys: [...state.keys], gadgets: state.gadgets.map(g => ({ ...g })), notes: [...state.notes] };
  text = text.trim();
  if (!text || s.ask === 'done') return { state: s, reply: s.ask === 'done' ? 'Tapos na tayo. Tingnan sa ibaba ang resulta. (Results are below.)' : '' };
  if (s.ask === 'hours') {
    const g = s.gadgets[s.pending], h = text.match(/(\d+(?:\.\d+)?)/)?.[1];
    if (h) g.hours = Math.min(+h, 24);
    else if (model?.hours) { g.hours = model.hours; s.model = model.model; } // "mga walong oras"
    else if (!UNSURE.test(text)) return { state: s, reply: `Ilang oras kada araw ang ${g.name}? Number lang, hal. "8". O "di ko alam".` };
  } else {
    let u = understand(text);
    if (!u.keys.length && !u.gadgets.length && model && (model.keys.length || model.gadgets.length)) {
      u = model;
      s.model = model.model;
    }
    if (!u.keys.length && (QUESTION.test(text) || model?.question)) return { state: s, reply: `${answer(text, ctx)}\n\n${s.ask === 'open' ? 'Balik tayo: may nagbago ba sa bahay ngayong billing period?' : MORE}` };
    s.notes.push(text);
    const saidNo = u.keys.join() === 'nothing'; // "wala": no (more) changes; "wala kami sa bahay" is 'away' instead
    if (!(saidNo && s.keys.length)) for (const k of u.keys) if (!s.keys.includes(k)) s.keys.push(k);
    for (const g of u.gadgets) { // "yung aircon, 8 hours" later updates the aircon already mentioned
      const old = s.gadgets.find(x => x.name === g.name);
      if (!old) s.gadgets.push(g);
      else if (g.hours != null) old.hours = g.hours;
    }
    s.unquantified ||= u.unquantified;
    if (!u.keys.length && !u.gadgets.length) {
      return { state: s, reply: 'Pasensya, hindi ko masyadong nakuha. Isusulat ko pa rin ito sa note mo. Halimbawa: "bumili kami ng aircon", "may bisita kami", "umuwi kami ng probinsya", o "wala".' };
    }
    if (saidNo) s.ask = 'done';
  }
  const next = s.gadgets.findIndex(g => g.new && g.hours == null && !g.asked);
  if (s.ask !== 'done' && next >= 0) {
    Object.assign(s, { ask: 'hours', pending: next });
    s.gadgets[next].asked = true;
    return { state: s, reply: `Ilang oras kada araw ginagamit ang ${label(s.gadgets[next])}? (How many hours a day?)` };
  }
  if (s.ask !== 'done') return { state: { ...s, ask: 'more', pending: null }, reply: MORE };
  return { state: s, reply: summary(s, ctx) };
}

function summary(s, ctx) {
  const a = answersOf(s, ctx.days), fresh = a.gadgets.filter(g => g.new);
  const lines = ['Salamat! Ito ang naintindihan ko:'];
  if (fresh.length) lines.push(...fresh.map(g => `• ${label(g)}: about ${g.kwh} kWh this bill (${g.hours ?? g.typical_hours} h/day${g.hours == null ? ', typical' : ''})`));
  if (a.keys.includes('nothing')) lines.push('• Walang nagbago sa bahay (nothing changed)');
  if (a.keys.includes('away')) lines.push('• Wala kayo o mas kaunti ang tao sa bahay (away or home less)');
  if (a.keys.includes('people')) lines.push('• Mas maraming tao sa bahay (more people at home)');
  if (a.keys.includes('aircon')) lines.push('• Mas madalas ang aircon o electric fan (more aircon or fan use)');
  if (a.keys.includes('business') && !fresh.some(g => CHARGING.includes(g.name))) lines.push('• Negosyo sa bahay (home business)');
  if (ctx.unexplained_kwh > 0) lines.push(`Ang hindi maipaliwanag ng panahon at billing days: about ${Math.round(ctx.unexplained_kwh)} kWh. Tingnan sa ibaba kung may sign ng billing error.`);
  return lines.join('\n');
}
