// Weather + variable-base degree-day change-point fit (ASHRAE G14 3PC / CalTRACK billing method). Nothing trained.
export const DAY = 864e5;
const sum = a => a.reduce((s, v) => s + v, 0);

export function temps(w) {
  const t0 = Date.parse(w.start);
  return ms => {
    const v = w.t[Math.round((ms - t0) / DAY)];
    if (v == null) throw new Error(`No cached weather for ${new Date(ms).toISOString().slice(0, 10)}`);
    return v;
  };
}

const endOf = (y, m, d) => Date.UTC(y, m - 1, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()));

// Tracker gives months, not reading dates: assume each period ends on the bill's end day-of-month (shown on screen).
export function trackerPeriods(tracker, periodEnd) {
  const d = new Date(periodEnd).getUTCDate();
  return tracker.map(t => {
    const [y, m] = t.month.split('-').map(Number);
    const end = endOf(y, m, d), start = endOf(y, m - 1, d) + DAY;
    return { ...t, start, end, days: Math.round((end - start) / DAY) + 1 };
  });
}

// Always from daily temperatures, never monthly means.
export function cdd(p, base, T) {
  let s = 0;
  for (let t = p.start; t <= p.end; t += DAY) s += Math.max(T(t) - base, 0);
  return s;
}

export function fit(per, T) {
  const n = per.length, y = per.map(p => p.kwh / p.days), w = per.map(p => p.days), W = sum(w);
  const my = sum(w.map((wi, i) => wi * y[i])) / W;
  const sst = sum(w.map((wi, i) => wi * (y[i] - my) ** 2));
  const adj = (r2, k) => (n - k - 1 > 0 ? 1 - (1 - r2) * (n - 1) / (n - k - 1) : -Infinity);
  const at = (bp, k) => {
    const x = per.map(p => cdd(p, bp, T) / p.days);
    if (x.filter(v => v > 0).length < n / 2) return null;
    const mx = sum(w.map((wi, i) => wi * x[i])) / W;
    const sxx = sum(w.map((wi, i) => wi * (x[i] - mx) ** 2));
    if (!sxx) return null;
    const b1 = sum(w.map((wi, i) => wi * (x[i] - mx) * (y[i] - my))) / sxx, b0 = my - b1 * mx;
    if (b1 < 0 || b0 < 0) return null;
    const sse = sum(w.map((wi, i) => wi * (y[i] - b0 - b1 * x[i]) ** 2));
    return { bp, b0, b1, x, sse, adj: adj(1 - sse / sst, k) };
  };
  const grid = Array.from({ length: 23 }, (_, i) => 18 + i * 0.5);
  const best = grid.map(bp => at(bp, 2)).filter(Boolean).sort((a, b) => b.adj - a.adj)[0];
  const f24 = at(24, 1);
  const fmt = v => (v == null || !isFinite(v) ? 'n/a' : v.toFixed(2));
  const [tier, f, reason] =
    best && n >= 12 && best.adj >= 0.7 ? ['A_3pc', best, `Weather explains your usage well (adjusted R² ${fmt(best.adj)} over ${n} months).`]
    : f24 && f24.adj >= 0.7 ? ['B_fixed24', f24, `Simplified model with a fixed 24 °C base (adjusted R² ${fmt(f24.adj)}, ${n} months${n < 12 ? '; fewer than 12 months printed' : ''}).`]
    : ['C_refused', null, `Your usage doesn't track temperature closely enough to separate weather reliably (best adjusted R² ${fmt(best?.adj)}, ${n} months).`];
  const rmse = f && Math.sqrt(f.sse / W);
  return {
    tier, n_periods: n, reason,
    baseload_kwh_per_day: f?.b0 ?? null, cooling_slope_kwh_per_cdd: f?.b1 ?? null, balance_point_c: f?.bp ?? null,
    r2_adj: f?.adj ?? null, cv_rmse: f ? rmse / my : null, residual_sd_kwh_per_day: rmse ?? null,
    points: { x: f?.x ?? per.map(p => cdd(p, 24, T) / p.days), y },
  };
}

// Next period: same calendar dates averaged over the last 10 years (climatology), not a forecast.
export function project(per, T, f, R1, F1) {
  const last = per.at(-1), days = Math.round(sum(per.map(p => p.days)) / per.length);
  if (f.tier === 'C_refused') {
    if (per.length < 15) return { label: 'Not enough months printed on the bill for a projection without the weather model.' };
    const kwh = per.at(-11).kwh * sum(per.slice(-3).map(p => p.kwh)) / sum(per.slice(-15, -12).map(p => p.kwh));
    return { mid: kwh * R1 + F1, kwh, days, label: "Last year's same month, scaled by your last 3 months vs the same months last year." };
  }
  const start = last.end + DAY, perDay = [];
  for (let k = 1; k <= 10; k++) {
    const s = new Date(start);
    s.setUTCFullYear(s.getUTCFullYear() - k);
    try { perDay.push(cdd({ start: +s, end: +s + (days - 1) * DAY }, f.balance_point_c, T) / days); } catch { /* year not cached */ }
  }
  if (!perDay.length) return { label: 'No cached climatology for these dates.' };
  const kwh = days * (f.baseload_kwh_per_day + f.cooling_slope_kwh_per_cdd * sum(perDay) / perDay.length);
  const mid = kwh * R1 + F1, spread = 1.5 * f.residual_sd_kwh_per_day * days * R1;
  // Backtest: fit without the last 3 periods, predict them.
  const fb = fit(per.slice(0, -3), T);
  const backtest_mape = fb.tier === 'C_refused' ? null : sum(per.slice(-3).map(p =>
    Math.abs(p.days * fb.baseload_kwh_per_day + fb.cooling_slope_kwh_per_cdd * cdd(p, fb.balance_point_c, T) - p.kwh) / p.kwh)) / 3;
  return {
    low: mid - spread, mid, high: mid + spread, kwh, days, years_used: perDay.length, backtest_mape,
    label: "Typical weather for these dates, at this month's rates. Not a weather forecast.",
  };
}
