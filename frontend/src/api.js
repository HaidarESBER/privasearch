// Client for the PrivaSearch API. SSE is read via fetch + ReadableStream so we
// can POST bodies and abort in-flight requests.

// ── Health / config (default & max source counts, etc.) ───────────────────
export async function fetchHealth(signal) {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

