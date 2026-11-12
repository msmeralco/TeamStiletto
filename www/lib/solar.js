// Export-aware rooftop solar payback. Every constant is shown on screen with its source.
export const SOLAR = { Y: 1402.1, C: 60000, fees: 1500 + 3000 };

export function solar(bill, tracker, s = 0.4) {
  const last12 = tracker.slice(-12);
  const A = last12.reduce((t, m) => t + m.kwh, 0) * 12 / last12.length; // annualised if fewer than 12 months printed
  const retail = bill.charges_this_period / bill.kwh;
  const G = (bill.charges.find(c => c.key === 'generation')?.amount_php ?? 0) / bill.kwh; // export credit = bill's generation ₱/kWh
  const row = (name, kWp, exportAware) => {
    const E = kWp * SOLAR.Y, self = exportAware ? Math.min(E, A * s) : E, save = self * retail + (E - self) * G;
    return { name, kWp, save, payback: (kWp * SOLAR.C + SOLAR.fees) / save };
  };
  return [
    row('Offset all usage, valued at retail (how it is usually sold)', A / SOLAR.Y, false),
    row('Offset all usage, export-aware', A / SOLAR.Y, true),
    row('Right-sized for self-consumption', A * s / SOLAR.Y, true),
  ];
}
