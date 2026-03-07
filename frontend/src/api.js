// Client for the PrivaSearch API. SSE is read via fetch + ReadableStream so we
// can POST bodies and abort in-flight requests.

// ── Shared SSE reader ─────────────────────────────────────────────────────
async function consumeSSE(res, handlers) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const evt = parseEvent(raw);
      if (evt) handlers[evt.event]?.(evt.data);
    }
  }
}

function parseEvent(raw) {
  let event = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return { event, data: null };
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data: null };
  }
}

// ── Health / config (default & max source counts, etc.) ───────────────────
export async function fetchHealth(signal) {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── RAG answer over a chosen set of sources ────────────────────────────────
export async function streamAnswer(query, sources, { onToken, onError, onDone, signal }) {
  const res = await fetch('/api/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, sources }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await consumeSSE(res, {
    token: (d) => onToken?.(d?.text || ''),
    error: (d) => onError?.(d || { message: 'Unknown error' }),
    done: () => onDone?.(),
  });
}

// ── Paginated raw results ─────────────────────────────────────────────────
export async function fetchResults(query, page, filters, signal) {
  const p = new URLSearchParams({ q: query, page: String(page) });
  if (filters.category) p.set('category', filters.category);
  if (filters.timeRange) p.set('time_range', filters.timeRange);
  if (filters.safesearch != null) p.set('safesearch', String(filters.safesearch));
  if (filters.language) p.set('language', filters.language);
  const res = await fetch(`/api/results?${p.toString()}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json(); // { page, results, hasMore }
}

// ── Summarize a single source ─────────────────────────────────────────────
export async function summarizeSource({ url, title, snippet }, { onMeta, onToken, onNotice, onError, onDone, signal }) {
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title, snippet }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await consumeSSE(res, {
    meta: (d) => onMeta?.(d || {}),
    token: (d) => onToken?.(d?.text || ''),
    notice: (d) => onNotice?.(d?.message || ''),
    error: (d) => onError?.(d || { message: 'Unknown error' }),
    done: () => onDone?.(),
  });
}

