// Dev server for www/ on http://localhost:8000 (ES modules don't load from file://).
// Also the demo case inbox: POST /api/cases stores a dispute file the user chose to escalate; GET lists them for dashboard.html.
// shortcut: no login and one local JSON file; a real ERC inbox needs authentication, HTTPS and a database.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const ROOT = resolve('www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const CASES = 'data/private/cases.json'; // gitignored: cases carry account numbers
const loadCases = () => readFile(CASES, 'utf8').then(JSON.parse, () => []);

async function cases(req, res) {
  const json = (code, v) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(v));
  if (req.method === 'GET') return json(200, await loadCases());
  if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });
  let body = '';
  for await (const chunk of req) if ((body += chunk).length > 1e6) return json(413, { error: 'file too large' });
  let p;
  try { p = JSON.parse(body); } catch { return json(400, { error: 'not JSON' }); }
  if (p?.format !== 'tanaw-dispute/1' || !p.bill || !Array.isArray(p.flags)) return json(400, { error: 'not a TANAW dispute file' });
  const list = await loadCases();
  list.push({ ...p, received: new Date().toISOString() });
  await mkdir('data/private', { recursive: true });
  await writeFile(CASES, JSON.stringify(list, null, 1));
  json(201, { ok: true, cases: list.length });
}

createServer(async (req, res) => {
  if (req.url.split('?')[0] === '/api/cases') return cases(req, res).catch(e => res.writeHead(500).end(String(e.message)));
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  let body;
  try { body = await readFile(file); } catch { return res.writeHead(404).end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
}).listen(process.env.PORT ?? 8000, () => console.log(`TANAW on http://localhost:${process.env.PORT ?? 8000}`));
