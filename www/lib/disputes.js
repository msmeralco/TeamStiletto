// Follow-up of a dispute the user sent to Meralco themselves. Records stay on this device only.
// shortcut: 14 days is a placeholder follow-up point, not a confirmed Meralco deadline; confirm it before the demo.
export const FOLLOW_UP_DAYS = 14;
export const CHANNELS = ['My Meralco app', "Meralco's Facebook Messenger", 'Hotline 16211', 'Meralco business center', 'Email'];

export function daysSince(date, now = new Date()) {
  const [y, m, d] = String(date ?? '').split('-').map(Number);
  return Math.floor((now - new Date(y, m - 1, d)) / 864e5) || 0; // a missing or unreadable date counts as today, never NaN
}

// One case per bill: the same key in the app, the dev server's inbox and the dashboard.
export const caseKey = p => `${p.customer_account_number}|${p.bill.period_end}`;

// Meralco ticket or chatbot only: a ticket only when a person at Meralco has something to do. Same rule in the app and the dashboard.
// Staff can move a case either way (route_override, set on the dashboard).
export const ROUTES = { meralco: 'Meralco ticket', chatbot: 'Handled by chatbot' };
export function route(p) {
  if (ROUTES[p.route_override]) return { to: p.route_override, why: 'Moved here by Meralco staff.' };
  // Dispute files are untrusted: a flag that is not an object is ignored, never allowed to throw.
  const flags = (Array.isArray(p.flags) ? p.flags : []).filter(f => f && typeof f === 'object'), hard = flags.filter(f => f.strength === 'strong' || f.strength === 'medium');
  if (hard.some(f => f.strength === 'strong')) return { to: 'meralco', why: "Strong evidence: the bill's own numbers or Meralco's published rates do not add up. Needs a recheck." };
  if (hard.length) return { to: 'meralco', why: 'Medium evidence: usage the household cannot explain, or a missed reading. Needs a meter or reading check.' };
  const asked = p.unanswered_questions ?? [];
  if (asked.length) return { to: 'meralco', why: `The chatbot could not answer ${asked.length === 1 ? 'a question' : `${asked.length} questions`} from the bill or Meralco's advisory.` };
  return { to: 'chatbot', why: flags.length ? 'Weak evidence only (an unusual pattern). The chatbot already explained the bill; no recheck indicated.'
    : 'The customer asked for a review. The chatbot already explained the bill.' };
}
