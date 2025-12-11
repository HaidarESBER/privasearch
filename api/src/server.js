// PrivaSearch orchestration API — thin Express layer.
//
// Endpoints:
//   GET  /api/health   Liveness + config

import express from 'express';

const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const PORT = parseInt(process.env.API_PORT || '3000', 10);

const app = express();
app.use(express.json({ limit: '16kb' }));

// ── Health ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`privasearch-api on :${PORT} (model=${MODEL})`);
});
