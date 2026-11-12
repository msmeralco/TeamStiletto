const check = (name, expected, found, fields) => ({ name, expected, found, passed: Math.abs(expected - found) <= 1, fields });

export function runChecks(b) {
  const sum = b.charges.reduce((s, c) => s + c.amount_php, 0);
  return [
    check('readings', (b.current_reading - b.previous_reading) * b.multiplier, b.kwh, ['previous_reading', 'current_reading', 'multiplier', 'kwh']),
    check('tracker_latest', b.tracker.at(-1)?.kwh ?? NaN, b.kwh, ['tracker', 'kwh']),
    check('line_sum', sum, b.charges_this_period, ['charges', 'charges_this_period']),
    check('total', b.remaining_balance + b.charges_this_period + b.installment_due, b.total_amount_due,
      ['remaining_balance', 'charges_this_period', 'installment_due', 'total_amount_due']),
  ];
}
