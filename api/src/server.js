// PrivaSearch orchestration API.
//
// Streaming endpoints use Server-Sent Events so the browser renders tokens as
// they land.

import express from 'express';
import { searchPage } from './searxng.js';
import { streamChat, isUp } from './ollama.js';
import { buildMessages } from './prompt.js';

const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const RESULT_COUNT = parseInt(process.env.RESULT_COUNT || '5', 10);
const MAX_SOURCES = parseInt(process.env.MAX_SOURCES || '20', 10);
const TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || '0.2');
const PORT = parseInt(process.env.API_PORT || '3000', 10);

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
  res.json({ ok: true, model: MODEL, resultCount: RESULT_COUNT, maxSources: MAX_SOURCES, llm: await isUp() });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`privasearch-api on :${PORT} (model=${MODEL}, N=${RESULT_COUNT})`);
});
