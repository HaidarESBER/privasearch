// PrivaSearch orchestration API.
//
// Endpoints:
//   GET  /api/results    Paginated raw SearXNG results (JSON) for the list/UI
//   POST /api/answer     Stream a RAG answer over a caller-provided set of
//                        sources (lets the UI pick HOW MANY sources to use)
//   POST /api/chat       Stream a plain multi-turn chat with the local LLM
//   POST /api/summarize  Stream an AI summary of ONE source (page text or snippet)
//   GET  /api/health     Liveness + config
//
// Streaming uses Server-Sent Events so the browser renders tokens as they land.

import express from 'express';
import { searchPage, SEARXNG_URL } from './searxng.js';
import { streamChat, isUp } from './ollama.js';
import { buildMessages, buildSummaryMessages } from './prompt.js';
import { fetchReadable } from './fetchPage.js';
import { getExitLocation } from './geo.js';

const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const RESULT_COUNT = parseInt(process.env.RESULT_COUNT || '5', 10); // default N
const MAX_SOURCES = parseInt(process.env.MAX_SOURCES || '20', 10); // hard cap for N
const TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || '0.2');
const CHAT_TEMPERATURE = parseFloat(process.env.CHAT_TEMPERATURE || '0.6');
const PORT = parseInt(process.env.API_PORT || '3000', 10);
// When false, "Summarize" never fetches the page — it uses the snippet only,
// preserving the zero-external-calls guarantee.
const ALLOW_PAGE_FETCH = (process.env.ALLOW_PAGE_FETCH || 'true').toLowerCase() !== 'false';

const CHAT_SYSTEM =
  "You are PrivaSearch Assistant, a helpful AI running entirely on the user's own machine — " +
  'nothing they say leaves their computer. Be concise, accurate and friendly. Use plain ' +
  'language. If you are unsure or lack the information, say so rather than guessing.';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) PrivaSearch/1.0';

const app = express();
app.use(express.json({ limit: '16kb' }));

// Pull the SearXNG filter params out of a query/body object.
function filtersFrom(o = {}) {
  return {
    category: o.category || 'general',
    timeRange: o.time_range || '',
    safesearch: o.safesearch ?? '1',
    language: o.language || '',
  };
}

// ── SSE helpers ─────────────────────────────────────────────────────────
function openSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  return (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

// ── Health ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    resultCount: RESULT_COUNT,
    maxSources: MAX_SOURCES,
    pageFetch: ALLOW_PAGE_FETCH,
    llm: await isUp(),
  });
});

// ── Exit location / privacy posture ──────────────────────────────────────
app.get('/api/privacy', async (_req, res) => {
  try {
    const loc = await getExitLocation({ signal: AbortSignal.timeout(6000) });
    res.json(loc);
  } catch (err) {
    // Never fail the UI over a geo lookup — just report the mode.
    res.json({ enabled: true, mode: process.env.EGRESS_MODE || 'direct', error: err.message });
  }
});

// ── Paginated raw results ────────────────────────────────────────────────
app.get('/api/results', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  if (!query) {
    res.status(400).json({ error: 'Missing query "q".' });
    return;
  }
  try {
    const { results, total } = await searchPage(query, { page, ...filtersFrom(req.query) });
    // SearXNG doesn't return a reliable total; treat "page had results" as
    // "there may be more".
    res.json({ page, results, total, hasMore: results.length > 0 });
  } catch (err) {
    res.status(502).json({ error: `Search failed: ${err.message}` });
  }
});

// ── Image proxy ──────────────────────────────────────────────────────────
// Serves result thumbnails so the browser NEVER contacts the remote image
// host directly (that would leak your IP). Two paths:
//   • SearXNG-signed  (?…&h=…)  → forwarded to SearXNG's own image_proxy,
//     which fetches the image through its egress (Tor/VPN-aware).
//   • plain ?url=<abs>          → fetched by this API (API egress) as a fallback
//     for engines that hand back an absolute thumbnail.
app.get('/api/image_proxy', async (req, res) => {
  const qs = req.originalUrl.split('?')[1] || '';
  const params = new URLSearchParams(qs);
  const signed = params.has('h');
  const target = signed ? `${SEARXNG_URL}/image_proxy?${qs}` : params.get('url');

  if (!signed && !/^https?:\/\//i.test(target || '')) {
    res.status(400).end();
    return;
  }
  try {
    const r = await fetch(target, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': UA, Accept: 'image/*' },
    });
    if (!r.ok) {
      res.status(r.status).end();
      return;
    }
    const ct = r.headers.get('content-type') || '';
    if (!signed && !/^image\//i.test(ct)) {
      res.status(415).end(); // refuse to proxy non-images from arbitrary URLs
      return;
    }
    res.setHeader('Content-Type', ct || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).end();
  }
});

// ── RAG answer over caller-provided sources ──────────────────────────────
// The UI fetches results itself (/api/results) and passes the top N here, so
// the user can choose how many sources the AI considers and regenerate the
// answer instantly without re-running the search.
app.post('/api/answer', async (req, res) => {
  const query = String(req.body?.q || '').trim();
  const sources = (Array.isArray(req.body?.sources) ? req.body.sources : [])
    .filter((s) => s && s.title && s.url)
    .slice(0, MAX_SOURCES)
    .map((s, i) => ({
      index: i + 1,
      title: String(s.title),
      url: String(s.url),
      snippet: String(s.snippet || ''),
    }));

  if (!query || sources.length === 0) {
    res.status(400).json({ error: 'Need "q" and a non-empty "sources" array.' });
    return;
  }

  const send = openSSE(res);
  const ac = new AbortController();
  res.on('close', () => ac.abort()); // see note above re: res vs req 'close'

  try {
    const messages = buildMessages(query, sources);
    for await (const token of streamChat(messages, {
      model: MODEL,
      temperature: TEMPERATURE,
      signal: ac.signal,
    })) {
      send('token', { text: token });
    }
  } catch (err) {
    if (!ac.signal.aborted) {
      send('error', { stage: 'llm', message: `LLM unavailable (${err.message}).` });
    }
  }

  send('done', {});
  res.end();
});

// ── Plain chat with the local LLM (no search, no RAG) ────────────────────
app.post('/api/chat', async (req, res) => {
  let messages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20) // cap conversation history
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (messages.length === 0) {
    res.status(400).json({ error: 'No messages.' });
    return;
  }
  messages = [{ role: 'system', content: CHAT_SYSTEM }, ...messages];

  const send = openSSE(res);
  const ac = new AbortController();
  res.on('close', () => ac.abort());

  try {
    for await (const token of streamChat(messages, {
      model: MODEL,
      temperature: CHAT_TEMPERATURE,
      signal: ac.signal,
    })) {
      send('token', { text: token });
    }
  } catch (err) {
    if (!ac.signal.aborted) {
      send('error', { message: `LLM unavailable (${err.message}).` });
    }
  }

  send('done', {});
  res.end();
});

// ── Summarize a single source ────────────────────────────────────────────
app.post('/api/summarize', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  const title = String(req.body?.title || '').trim();
  const snippet = String(req.body?.snippet || '').trim();

  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'Invalid or missing url.' });
    return;
  }

  const send = openSSE(res);
  const ac = new AbortController();
  // Abort upstream work only when the RESPONSE closes (client disconnect).
  // NOTE: not req.on('close') — after express.json() reads the POST body the
  // request stream is "complete" and would fire close immediately.
  res.on('close', () => ac.abort());

  // Prefer full page text; fall back to the snippet.
  let text = '';
  let source = 'snippet';
  if (ALLOW_PAGE_FETCH) {
    try {
      text = await fetchReadable(url, { signal: ac.signal });
      source = 'page';
    } catch (err) {
      if (ac.signal.aborted) return res.end();
      send('notice', { message: `Couldn't fetch the page (${err.message}); summarizing the snippet instead.` });
    }
  }
  if (!text || text.length < 40) {
    text = snippet;
    source = 'snippet';
  }

  if (!text) {
    send('error', { stage: 'fetch', message: 'No readable text available to summarize.' });
    send('done', {});
    return res.end();
  }

  send('meta', { source }); // tells the UI whether this is a page or snippet summary

  try {
    const messages = buildSummaryMessages({ title, url, text });
    for await (const token of streamChat(messages, {
      model: MODEL,
      temperature: TEMPERATURE,
      signal: ac.signal,
    })) {
      send('token', { text: token });
    }
  } catch (err) {
    if (!ac.signal.aborted) {
      send('error', { stage: 'llm', message: `LLM unavailable (${err.message}).` });
    }
  }

  send('done', {});
  res.end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `privasearch-api on :${PORT} (model=${MODEL}, N=${RESULT_COUNT}, pageFetch=${ALLOW_PAGE_FETCH})`,
  );
});
