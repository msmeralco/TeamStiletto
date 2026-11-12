// Open-Meteo archive (CC BY 4.0) daily mean temperature -> www/data/weather.json. Run once while online; the app never fetches.
// Metro Manila coordinates (the bill's own temperature is from PAGASA, Quezon City). Change for a bill outside Metro Manila.
import { writeFileSync } from 'node:fs';

const lat = 14.5995, lon = 120.9842, start = '2016-01-01', end = new Date().toISOString().slice(0, 10);
const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_mean&timezone=Asia/Manila`;
const res = await fetch(url);
if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
const { daily } = await res.json();
if (daily.time[0] !== start) throw new Error(`unexpected first date ${daily.time[0]}`);
while (daily.temperature_2m_mean.at(-1) == null) daily.temperature_2m_mean.pop(); // archive lags a few days
writeFileSync('www/data/weather.json', JSON.stringify({ city: 'Metro Manila', lat, lon, start, t: daily.temperature_2m_mean, source: 'Open-Meteo archive (CC BY 4.0)' }));
console.log(`weather.json: ${start} .. ${daily.time[daily.temperature_2m_mean.length - 1]}, ${daily.temperature_2m_mean.length} days`);
