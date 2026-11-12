// Dev server for www/ on http://localhost:8000 (ES modules don't load from file://). PORT=8001 npm start for another port.
// Also the demo case inbox: POST /api/cases stores a dispute file the user chose to escalate; GET lists them for dashboard.html.
// And POST /api/understand: the chat's local-model fallback (Ollama). If Ollama is not running the chat uses rules only.
// And POST /api/ocr: a photo of a paper bill -> words, read by PaddleOCR (scripts/ocr.py). Without Python + paddleocr the app hides "Scan".
// shortcut: no login and one local JSON file; a real Meralco inbox needs authentication, HTTPS and a database.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { caseKey, ROUTES } from '../www/lib/disputes.js';
import { MODEL_PROMPT, MODEL_SCHEMA, ANSWER_PROMPT, answerSchema, answerMessage, advisoryParas, TOPIC_PROMPT, TOPIC_SCHEMA, ADVISORY_TOPICS, questionMessage,
  FAQ_PROMPT, faqSchema, faqMessage } from '../www/lib/chat.js';
import { faqIndex, faqSearch } from '../www/lib/faq.js';
import { usableReason } from '../www/lib/explain.js';

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

const saveCases = async list => { await mkdir('data/private', { recursive: true }); await writeFile(CASES, JSON.stringify(list, null, 1)); };
async function cases(req, res) {
  if (req.method === 'GET') return send(res, 200, await loadCases());
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
  const p = await readJson(req, 1e6);
  if (p?.format !== 'tanaw-dispute/1' || !p.bill || !Array.isArray(p.flags)) return send(res, 400, { error: 'not a TANAW dispute file' });
  // One case per bill: sending again (e.g. an edited message) replaces the old file and reopens the case.
  const all = await loadCases(), old = all.find(c => caseKey(c) === caseKey(p)), list = all.filter(c => c !== old);
  // route_override is staff-only: never taken from the customer's file, kept from the old case on a resend.
  const { route_override, ...q } = p, asked = Array.isArray(p.unanswered_questions) ? p.unanswered_questions.slice(0, 20).map(s => String(s).slice(0, 500)) : [];
  list.push({ ...q, unanswered_questions: asked, received: new Date().toISOString(), first_received: old?.first_received ?? old?.received ?? new Date().toISOString(),
    status: 'open', reply: old?.reply ?? '', ...(old?.route_override ? { route_override: old.route_override } : {}) });
  await saveCases(list);
  send(res, 201, { ok: true, cases: list.length });
}

// Staff reply / status for one case. GET ?key= is what the customer's app polls: it returns only that case's status, never the list.
// shortcut: anyone on the network can set a status; a real inbox needs staff login.
const STATUSES = ['open', 'replied', 'resolved'];
async function caseStatus(req, res) {
  const list = await loadCases();
  if (req.method === 'GET') {
    const c = list.find(c => caseKey(c) === new URL(req.url, 'http://x').searchParams.get('key'));
    return c ? send(res, 200, { status: c.status ?? 'open', reply: c.reply ?? '' }) : send(res, 404, { error: 'no such case' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
  const { key, status, reply, route } = (await readJson(req, 1e4)) ?? {}, c = list.find(c => caseKey(c) === key);
  if (!c || !STATUSES.includes(status)) return send(res, 400, { error: 'unknown case or status' });
  if (route !== undefined && !ROUTES[route]) return send(res, 400, { error: 'unknown route' });
  Object.assign(c, { status, reply: String(reply ?? c.reply ?? '').slice(0, 2000), updated: new Date().toISOString() }, route ? { route_override: route } : {});
  await saveCases(list);
  send(res, 200, { ok: true });
}

// ---------- PaddleOCR (scripts/ocr.py): one Python process kept alive, because loading the models takes several seconds ----------
let ocrPy = null, ocrProc = null, ocrWaiting = null, ocrQueue = Promise.resolve();
const ocrReady = (async () => {
  // Not the Windows "py" launcher: started from a background process it can take the whole server down. Set OCR_PYTHON instead.
  for (const py of process.env.OCR_PYTHON ? [process.env.OCR_PYTHON] : ['python', 'python3']) {
    const ok = await new Promise(done => execFile(py, ['scripts/ocr.py', '--check'], { timeout: 60000 }, (e, out) => done(!e && /ok/.test(out))));
    if (ok) return (ocrPy = py);
  }
  return null;
})();
function ocrWorker() {
  if (ocrProc) return ocrProc;
  ocrProc = spawn(ocrPy, ['scripts/ocr.py'], { stdio: ['pipe', 'pipe', 'inherit'] });
  // Results are the lines that start with "TANAW "; anything else on stdout is Paddle's own logging.
  createInterface({ input: ocrProc.stdout }).on('line', l => { if (l.startsWith('TANAW ')) { ocrWaiting?.ok(JSON.parse(l.slice(6))); ocrWaiting = null; } });
  ocrProc.on('exit', () => { ocrWaiting?.fail(new Error('the OCR worker stopped')); ocrWaiting = ocrProc = null; });
  ocrProc.on('error', () => {});
  return ocrProc;
}
const ocrRun = path => (ocrQueue = ocrQueue.catch(() => {}).then(() => new Promise((ok, fail) => {
  ocrWaiting = { ok, fail };
  ocrWorker().stdin.write(path + '\n');
})));
async function ocr(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!await ocrReady) return send(res, 503, { error: 'PaddleOCR is not installed on the TANAW server' });
  const chunks = [];
  let size = 0;
  for await (const c of req) { if ((size += c.length) > 20e6) return send(res, 413, { error: 'photo larger than 20 MB' }); chunks.push(c); }
  if (!size) return send(res, 400, { error: 'empty' });
  const file = join(tmpdir(), `tanaw-ocr-${randomUUID()}`); // the photo is deleted right after it is read
  await writeFile(file, Buffer.concat(chunks));
  try {
    const out = await ocrRun(file);
    send(res, out.error ? 422 : 200, out);
  } finally { rm(file, { force: true }).catch(() => {}); }
}
const health = async (req, res) => send(res, 200, { ocr: !!await ocrReady });

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

// A customer question -> (1) its topic (a fixed list; the browser maps the topic to a sentence it wrote itself from the bill),
// (2) the number of the paragraph in that month's scraped Meralco advisory that answers it, or null, and (3) the Meralco FAQ
// that answers it, chosen from a keyword shortlist (faq.js), or null.
// The bill never comes here and the model never sees it. The advisory and FAQs come from our own www/data (never from
// the request). The model can only output enum values, and the browser shows its own text for them, so nothing the model
// returns is ever shown as text. Hard-coded on purpose: no setting turns this into free-text generation.
const reasons = readFile(resolve(ROOT, 'data/reasons.json'), 'utf8').then(JSON.parse);
const faqs = readFile(resolve(ROOT, 'data/faqs.json'), 'utf8').then(s => faqIndex(JSON.parse(s)), () => faqIndex(null)); // no file: no FAQs
async function answer(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const { text, month } = (await readJson(req, 4000)) ?? {};
  const reason = usableReason((await reasons)[String(month)]), n = advisoryParas(reason).length;
  if (!String(text ?? '').trim()) return send(res, 400, { error: 'empty' });
  const shortlist = faqSearch(await faqs, String(text), /^\d{4}-\d{2}$/.test(month) ? month : null);
  // Two short single-purpose calls: a 3B model sorts a question into a topic far better than it picks from a long mixed list.
  const pick = async (system, user, format) => {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ model: MODEL, stream: false, format, keep_alive: '30m', options: { temperature: 0, num_ctx: 4096 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(await r.text());
    return JSON.parse((await r.json()).message?.content ?? 'null');
  };
  try {
    const t = await pick(TOPIC_PROMPT, questionMessage(text), TOPIC_SCHEMA);
    const p = n && ADVISORY_TOPICS.includes(t?.topic) ? await pick(ANSWER_PROMPT, answerMessage(reason, text), answerSchema(n)) : null;
    const q = shortlist.length ? await pick(FAQ_PROMPT, faqMessage(shortlist, text), faqSchema(shortlist.length)) : null;
    const faq = Number.isInteger(q?.faq) && shortlist[q.faq] ? shortlist[q.faq].f.id : null;
    send(res, 200, { model: MODEL, result: { topic: t?.topic, charge: t?.charge ?? null, paragraph: p ? p.paragraph : null, faq } });
  } catch (e) { send(res, 503, { error: `local model unavailable: ${e.message}` }); }
}

const API = { '/api/cases': cases, '/api/cases/status': caseStatus, '/api/understand': understand, '/api/answer': answer, '/api/ocr': ocr, '/api/health': health };
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
ocrReady.then(py => console.log(py ? `Scan a paper bill: PaddleOCR ready (${py} scripts/ocr.py)` : 'PaddleOCR not found (pip install paddlepaddle paddleocr): the app hides "Scan a paper bill".'));
