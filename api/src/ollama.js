// Thin client for the local Ollama REST API. Streams chat tokens.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';

/**
 * Stream a chat completion token-by-token.
 * Ollama's /api/chat returns newline-delimited JSON objects when stream=true.
 * @param {Array<{role:string,content:string}>} messages
 * @param {{ model:string, temperature:number, signal?:AbortSignal }} opts
 * @returns {AsyncGenerator<string>} yields content deltas
 */
export async function* streamChat(messages, { model, temperature, signal } = {}) {
  const res = await fetch(new URL('/api/chat', OLLAMA_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: { temperature },
      // Keep the model resident so we don't pay the multi-minute cold load on
      // every request (CPU inference loads ~5GB into RAM each time otherwise).
      keep_alive: process.env.OLLAMA_KEEP_ALIVE || '30m',
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status} ${detail.slice(0, 200)}`.trim());
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // skip partial/garbage lines
      }
      if (obj.error) throw new Error(obj.error);

      const delta = obj.message?.content || '';
      if (delta) yield delta;
      if (obj.done) return;
    }
  }
}

/** Quick liveness probe used for graceful degradation + /api/health. */
export async function isUp() {
  try {
    const res = await fetch(new URL('/api/tags', OLLAMA_URL), {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
