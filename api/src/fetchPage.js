// Fetch a single URL and extract readable text — dependency-free (no cheerio/
// jsdom), to keep the audit surface small.
//
// PRIVACY NOTE: this makes a DIRECT request from the API container to the
// source URL — the same request your browser would make if you clicked the
// link. It is only triggered by an explicit per-source "Summarize" action, and
// can be disabled entirely with ALLOW_PAGE_FETCH=false (then summaries use the
// SearXNG snippet only).

const MAX_BYTES = 600_000; // don't slurp huge pages
// Cap the text we feed the model. Bigger = better summary but much slower
// prompt-eval on CPU (~4.5k chars ≈ 1.1k tokens). Tune via SUMMARY_MAX_CHARS.
const MAX_CHARS = parseInt(process.env.SUMMARY_MAX_CHARS || '4500', 10);
const TIMEOUT_MS = 12_000;

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Fetch `url` and return up to MAX_CHARS of readable text.
 * @param {string} url
 * @param {{ signal?: AbortSignal }} opts
 * @returns {Promise<string>}
 */
export async function fetchReadable(url, { signal } = {}) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(url, {
    signal: combined,
    redirect: 'follow',
    headers: {
      // A generic desktop UA so sites return normal HTML.
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) PrivaSearch/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const ct = res.headers.get('content-type') || '';
  if (!/text|html|xml/i.test(ct)) throw new Error(`unsupported content type (${ct || 'unknown'})`);

  // Read the body but cap the number of bytes.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    html += decoder.decode(value, { stream: true });
    if (bytes >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }

  return htmlToText(html).slice(0, MAX_CHARS);
}
