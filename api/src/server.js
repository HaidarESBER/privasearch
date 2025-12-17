// PrivaSearch orchestration API — thin Express layer.
//
// Endpoints:
//   GET  /api/results   Paginated raw SearXNG results (JSON) for the list/UI
//   GET  /api/health    Liveness + config

import express from 'express';
import { searchPage } from './searxng.js';

const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const RESULT_COUNT = parseInt(process.env.RESULT_COUNT || '5', 10);
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

// ── Health ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, resultCount: RESULT_COUNT });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`privasearch-api on :${PORT} (model=${MODEL}, N=${RESULT_COUNT})`);
});
