// Dev server for www/ on http://localhost:8000 (ES modules don't load from file://). PORT=8001 npm start for another port.
// Also the demo case inbox: POST /api/cases stores a dispute file the user chose to escalate; GET lists them for dashboard.html.
// And POST /api/understand: the chat's local-model fallback (Ollama). If Ollama is not running the chat uses rules only.
// shortcut: no login and one local JSON file; a real ERC inbox needs authentication, HTTPS and a database.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { MODEL_PROMPT, MODEL_SCHEMA } from '../www/lib/chat.js';

const ROOT = resolve('www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const CASES = 'data/private/cases.json'; // gitignored: cases carry account numbers
// qwen2.5:3b (Q4_K_M, ~1.9 GB) fits a 4 GB laptop GPU with room for context; 7B models spill to CPU and get several times slower.
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434', MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';
const loadCases = () => readFile(CASES, 'utf8').then(JSON.parse, () => []);
const send = (res, code, v) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(v));
async function readJson(req, max) {
  let body = '';
  for await (const chunk of req) if ((body += chunk).length > max) throw Object.assign(new Error('too large'), { code: 413 });
  try { return JSON.parse(body); } catch { throw Object.assign(new Error('not JSON'), { code: 400 }); }
}

async function cases(req, res) {
  if (req.method === 'GET') return send(res, 200, await loadCases());
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
  const p = await readJson(req, 1e6);
  if (p?.format !== 'tanaw-dispute/1' || !p.bill || !Array.isArray(p.flags)) return send(res, 400, { error: 'not a TANAW dispute file' });
  const list = await loadCases();
  list.push({ ...p, received: new Date().toISOString() });
  await mkdir('data/private', { recursive: true });
  await writeFile(CASES, JSON.stringify(list, null, 1));
  send(res, 201, { ok: true, cases: list.length });
}

// One chat message -> Ollama, constrained to MODEL_SCHEMA. The browser validates the result again (fromModel).
async function understand(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const text = String((await readJson(req, 4000))?.text ?? '').slice(0, 500);
  if (!text.trim()) return send(res, 400, { error: 'empty' });
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ model: MODEL, stream: false, format: MODEL_SCHEMA, keep_alive: '30m', options: { temperature: 0, num_ctx: 2048 },
      messages: [{ role: 'system', content: MODEL_PROMPT }, { role: 'user', content: text }] }),
  }).catch(e => ({ ok: false, status: 503, text: async () => e.message }));
  if (!r.ok) return send(res, 503, { error: `local model unavailable: ${await r.text()}` });
  const out = await r.json();
  send(res, 200, { model: MODEL, result: JSON.parse(out.message?.content ?? 'null') });
}

const API = { '/api/cases': cases, '/api/understand': understand };
createServer(async (req, res) => {
  const route = API[req.url.split('?')[0]];
  if (route) return route(req, res).catch(e => send(res, e.code ?? 500, { error: e.message }));
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  let body;
  try { body = await readFile(file); } catch { return res.writeHead(404).end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
}).listen(process.env.PORT ?? 8000, () => console.log(`TANAW on http://localhost:${process.env.PORT ?? 8000}`));

// Load the model into GPU memory now, so the first chat message isn't slow.
fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model: MODEL, keep_alive: '30m' }), signal: AbortSignal.timeout(120000) })
  .then(r => console.log(r.ok ? `Chat model ${MODEL} loaded (Ollama)` : `Ollama has no ${MODEL}: run "ollama pull ${MODEL}". Chat uses rules only.`))
  .catch(() => console.log(`Ollama not running at ${OLLAMA}: chat uses rules only.`));
