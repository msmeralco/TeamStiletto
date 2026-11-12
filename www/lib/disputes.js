// Follow-up of a dispute the user sent to Meralco themselves. Records stay on this device only.
// shortcut: 14 days is a placeholder follow-up point, not a confirmed ERC or Meralco deadline; confirm it before the demo.
export const FOLLOW_UP_DAYS = 14;
export const CHANNELS = ['My Meralco app', "Meralco's Facebook Messenger", 'Hotline 16211', 'Meralco business center', 'Email'];

export function daysSince(date, now = new Date()) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor((now - new Date(y, m - 1, d)) / 864e5);
}

export function ercMessage(x, now = new Date()) {
  const p = x.packet;
  return [
    'To the ERC Consumer Affairs Service:',
    '',
    `I am a Meralco customer${p.customer_account_number ? ` (Customer Account Number ${p.customer_account_number})` : ''}. ` +
      `On ${x.sent} I asked Meralco through ${x.channel} to review my bill for ${p.bill.period_start} to ${p.bill.period_end}` +
      (x.ref ? ` (Meralco reference number ${x.ref})` : '') + `. After ${daysSince(x.sent, now)} days it has not been resolved.`,
    '',
    'Evidence from my bill and Meralco\'s published rates:',
    ...p.flags.map(f => `- ${f.text}`),
    ...(p.household_answers.changes.length ? ['', `Changes at home this period: ${p.household_answers.changes.join('; ')}.`] : []),
    '',
    'I request the ERC\'s help in having this bill reviewed. My evidence file is attached.',
  ].join('\n');
}

export const ercPacket = (x, now = new Date()) =>
  ({ ...x.packet, meralco_follow_up: { sent: x.sent, channel: x.channel, reference: x.ref || null, days_waiting: daysSince(x.sent, now) } });
