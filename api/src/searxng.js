// Thin client for SearXNG's JSON API. Normalizes results to a compact shape.

export const SEARXNG_URL = process.env.SEARXNG_URL || 'http://searxng:8080';

function normalize(r) {
  return {
    title: String(r.title).trim(),
    url: r.url,
    snippet: String(r.content || '').trim(),
    engine: r.engine || (Array.isArray(r.engines) ? r.engines[0] : '') || 'unknown',
  };
}

/**
 * Fetch one page of SearXNG results.
 * @param {string} query
 * @param {{page?:number, signal?:AbortSignal}} opts
 */
export async function searchPage(query, { page = 1, signal } = {}) {
  const url = new URL('/search', SEARXNG_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json'); // requires `formats: [..., json]` in settings.yml
  url.searchParams.set('pageno', String(page));

  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`SearXNG returned HTTP ${res.status}`);

  const data = await res.json();
  const results = (data.results || []).filter((r) => r && r.url && r.title).map(normalize);
  const total = Number(data.number_of_results) || 0;
  return { results, total };
}
