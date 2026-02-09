// Thin client for SearXNG's JSON API, with category + filter support.
// Results are normalized per type (text / image / video) and image thumbnails
// are rewritten to load through OUR proxy so remote hosts never see the user.

export const SEARXNG_URL = process.env.SEARXNG_URL || 'http://searxng:8080';

// Turn a SearXNG thumbnail/image reference into a same-origin proxied URL, so
// the browser fetches it via /api/image_proxy (→ SearXNG's image_proxy, which
// respects the Tor/VPN egress) instead of hitting the remote host directly.
function proxied(ref) {
  if (!ref) return null;
  if (ref.startsWith('/image_proxy')) return '/api' + ref; // SearXNG-signed proxy path
  if (/^https?:\/\//i.test(ref)) return '/api/image_proxy?url=' + encodeURIComponent(ref);
  return null;
}

function normalize(r) {
  let thumbnail = proxied(r.thumbnail_src || r.thumbnail);
  // Images: if no thumbnail, proxy the full image as the thumb.
  if (!thumbnail && r.img_src) thumbnail = proxied(r.img_src);
  return {
    title: String(r.title).trim(),
    url: r.url,
    snippet: String(r.content || '').trim(),
    engine: r.engine || (Array.isArray(r.engines) ? r.engines[0] : '') || 'unknown',
    template: r.template || 'default.html', // default | images | videos | map | files | paper
    thumbnail,
    resolution: r.resolution || null, // images
    length: r.length || null, // videos (duration)
    author: r.author || null, // videos / music
    publishedDate: r.publishedDate || null, // news / science
  };
}

/**
 * Fetch one page of SearXNG results with filters.
 * @param {string} query
 * @param {{page?:number, category?:string, timeRange?:string, safesearch?:string|number, language?:string, signal?:AbortSignal}} opts
 */
export async function searchPage(
  query,
  { page = 1, category = 'general', timeRange = '', safesearch = '1', language = '', signal } = {},
) {
  const url = new URL('/search', SEARXNG_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json'); // requires `formats: [..., json]` in settings.yml
  url.searchParams.set('pageno', String(page));
  url.searchParams.set('categories', category);
  url.searchParams.set('safesearch', String(safesearch));
  if (timeRange) url.searchParams.set('time_range', timeRange); // day|week|month|year
  if (language) url.searchParams.set('language', language);

  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`SearXNG returned HTTP ${res.status}`);

  const data = await res.json();
  const results = (data.results || []).filter((r) => r && r.url && r.title).map(normalize);
  // number_of_results is a rough estimate SearXNG sometimes provides (often 0).
  const total = Number(data.number_of_results) || 0;
  return { results, total };
}
