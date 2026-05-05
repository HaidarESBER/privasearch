import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchResults, streamAnswer, summarizeSource, fetchHealth } from './api.js';
import SearchBar from './components/SearchBar.jsx';
import Answer from './components/Answer.jsx';
import Results from './components/Results.jsx';
import Filters, { TEXT_CATEGORIES } from './components/Filters.jsx';
import Chat from './components/Chat.jsx';
import PrivacyBadge from './components/PrivacyBadge.jsx';

const DEFAULT_FILTERS = { category: 'general', timeRange: '', safesearch: '1', language: '' };

const TRY_QUERIES = [
  'how does end-to-end encryption work',
  'best local LLMs for a laptop',
  'is DNS-over-HTTPS enough',
  'privacy vs anonymity',
];

export default function App() {
  const [mode, setMode] = useState('search'); // search | chat
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [answer, setAnswer] = useState('');
  const [citationSources, setCitationSources] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | searching | streaming | done | skip
  const [notice, setNotice] = useState(null);

  const [page, setPage] = useState(1);
  const [pageResults, setPageResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [resultTotal, setResultTotal] = useState(0);

  const [summaries, setSummaries] = useState({});
  const [copied, setCopied] = useState(false);

  // How many sources the AI considers (user-adjustable).
  const [sourceCount, setSourceCount] = useState(5);
  const [maxSources, setMaxSources] = useState(15);

  const answerAbort = useRef(null);
  const pageAbort = useRef(null);
  const summaryAborts = useRef(new Map());
  const pagesCache = useRef(new Map());
  const citationPool = useRef([]); // page-1 results available to the answer
  const inputRef = useRef(null);

  // Apply + persist the light/dark theme.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Pick up default/max source counts from the API.
  useEffect(() => {
    const ac = new AbortController();
    fetchHealth(ac.signal)
      .then((h) => {
        if (h.resultCount) setSourceCount(h.resultCount);
        if (h.maxSources) setMaxSources(h.maxSources);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  // "/" focuses the search box (search mode only).
  useEffect(() => {
    if (mode !== 'search') return;
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode]);

  const citedIndices = useMemo(() => {
    const set = new Set();
    const re = /\[(\d+)\]/g;
    let m;
    while ((m = re.exec(answer)) !== null) set.add(parseInt(m[1], 10));
    return set;
  }, [answer]);

  const maxAvailable = Math.min(maxSources, citationPool.current.length || maxSources);

  function abortAll() {
    answerAbort.current?.abort();
    pageAbort.current?.abort();
    for (const ac of summaryAborts.current.values()) ac.abort();
    summaryAborts.current.clear();
  }

  // Generate (or regenerate) the AI answer over the first `n` pooled sources.
  async function generateAnswer(q, pool, n) {
    answerAbort.current?.abort();
    const ac = new AbortController();
    answerAbort.current = ac;

    const sources = pool.slice(0, n).map((r, i) => ({
      index: i + 1,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    }));
    setCitationSources(sources);
    setAnswer('');
    setNotice(null);
    setStatus('streaming');
    try {
      await streamAnswer(q, sources, {
        signal: ac.signal,
        onToken: (t) => setAnswer((prev) => prev + t),
        onError: (e) => setNotice(e.message),
        onDone: () => setStatus('done'),
      });
    } catch (err) {
      if (err.name !== 'AbortError') setNotice(`Request failed: ${err.message}`);
    } finally {
      setStatus((s) => (s === 'streaming' ? 'done' : s));
    }
  }

  async function loadResultsPage(q, f, target) {
    const cached = pagesCache.current.get(target);
    if (cached) {
      setPage(target);
      setPageResults(cached);
      setHasMore(cached.length > 0);
      return cached;
    }
    pageAbort.current?.abort();
    const ac = new AbortController();
    pageAbort.current = ac;
    setPageLoading(true);
    setPageError(null);
    try {
      const { results, hasMore: more, total } = await fetchResults(q, target, f, ac.signal);
      if (results.length === 0 && target > 1) {
        setHasMore(false);
        return null;
      }
      pagesCache.current.set(target, results);
      setPage(target);
      setPageResults(results);
      setHasMore(more);
      if (typeof total === 'number') setResultTotal(total);
      return results;
    } catch (err) {
      if (err.name !== 'AbortError') setPageError(`Couldn't load page ${target}: ${err.message}`);
      return null;
    } finally {
      setPageLoading(false);
    }
  }

  async function runSearch(q, f) {
    q = q.trim();
    if (!q) return;
    abortAll();
    pagesCache.current.clear();

    document.title = `${q} — PrivaSearch`;
    setSubmitted(q);
    setAnswer('');
    setCitationSources([]);
    setNotice(null);
    setSummaries({});
    setPage(1);
    setPageResults([]);
    setHasMore(false);
    setPageError(null);
    const isText = TEXT_CATEGORIES.has(f.category);
    setStatus(isText ? 'searching' : 'skip');

    const results = await loadResultsPage(q, f, 1);
    citationPool.current = results || [];
    if (isText && results && results.length) {
      generateAnswer(q, results, sourceCount);
    } else if (isText) {
      setStatus('done');
    }
  }

  function changeFilters(next) {
    setFilters(next);
    if (submitted) runSearch(submitted, next);
  }

  function goToPage(target) {
    if (target < 1 || pageLoading) return;
    loadResultsPage(submitted, filters, target);
  }

  function setCount(n) {
    setSourceCount(Math.max(1, Math.min(maxSources, n)));
  }

  function regenerate() {
    if (!citationPool.current.length) return;
    generateAnswer(submitted, citationPool.current, sourceCount);
  }

  function updateSummary(url, patch) {
    setSummaries((prev) => ({ ...prev, [url]: { ...prev[url], ...patch } }));
  }

  async function summarize(r) {
    summaryAborts.current.get(r.url)?.abort();
    const ac = new AbortController();
    summaryAborts.current.set(r.url, ac);
    updateSummary(r.url, { text: '', status: 'streaming', source: 'page', notice: '', error: '' });
    try {
      await summarizeSource(
        { url: r.url, title: r.title, snippet: r.snippet },
        {
          signal: ac.signal,
          onMeta: (d) => updateSummary(r.url, { source: d.source }),
          onNotice: (msg) => updateSummary(r.url, { notice: msg }),
          onToken: (t) =>
            setSummaries((prev) => ({ ...prev, [r.url]: { ...prev[r.url], text: (prev[r.url]?.text || '') + t } })),
          onError: (e) => updateSummary(r.url, { status: 'error', error: e.message }),
          onDone: () =>
            setSummaries((prev) =>
              prev[r.url]?.status === 'error' ? prev : { ...prev, [r.url]: { ...prev[r.url], status: 'done' } },
            ),
        },
      );
    } catch (err) {
      if (err.name !== 'AbortError') updateSummary(r.url, { status: 'error', error: err.message });
    }
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  function resetHome() {
    abortAll();
    setMode('search');
    setSubmitted('');
    setQuery('');
    setAnswer('');
    setCitationSources([]);
    setPageResults([]);
    setNotice(null);
    setStatus('idle');
    document.title = 'PrivaSearch';
  }

  const answering = status === 'searching' || status === 'streaming';
  const busy = answering || pageLoading;
  const showAnswer = submitted && TEXT_CATEGORIES.has(filters.category);

  return (
    <div className="app">
      <header className="topbar">
        <button className="wordmark" onClick={resetHome}>
          <span className="wm-lock">🔒</span> priva<span className="wm-accent">search</span>
        </button>
        <div className="topbar-right">
          <PrivacyBadge />
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="page">
        {mode === 'search' && !submitted && (
          <section className="hero">
            <div className="eyebrow">Local · Private · Cited</div>
            <h1 className="display">
              <span className="d1">Search the whole web.</span>
              <span className="d2">Keep every keystroke.</span>
            </h1>
            <p className="lede">
              An AI answer with real citations, synthesized by a model running on this machine. No
              cloud, no accounts, nothing logged.
            </p>
          </section>
        )}

        <nav className="mode-tabs">
          <button className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            Search
          </button>
          <button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Chat
          </button>
        </nav>

        {mode === 'chat' ? (
          <Chat />
        ) : (
          <>
            <SearchBar ref={inputRef} value={query} onChange={setQuery} onSubmit={() => runSearch(query, filters)} disabled={busy} />

            {!submitted && (
              <div className="try">
                <span className="try-label">Try —</span>
                {TRY_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setQuery(q);
                      runSearch(q, filters);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {submitted && <Filters filters={filters} onChange={changeFilters} disabled={busy} total={resultTotal} />}

            {submitted && (
              <div className="results">
              {showAnswer && (
                <section className="answer-card">
                  <div className="card-header">
                    <span className="card-title">✦ AI answer</span>
                    {answering && <span className="spinner" aria-label="loading" />}
                    {answer && status === 'done' && (
                      <button className="copy-btn" onClick={copyAnswer}>{copied ? '✓ Copied' : 'Copy'}</button>
                    )}
                  </div>

                  {status === 'searching' && !answer ? (
                    <div className="skeleton-lines" aria-label="Generating answer">
                      <span style={{ width: '92%' }} />
                      <span style={{ width: '78%' }} />
                      <span style={{ width: '55%' }} />
                    </div>
                  ) : (
                    <Answer text={answer} sources={citationSources} streaming={status === 'streaming'} />
                  )}
                  {notice && <p className="notice">⚠ {notice}</p>}

                  {(status === 'done' || status === 'streaming') && citationPool.current.length > 0 && (
                    <div className="source-control">
                      <span className="sc-label">
                        AI considered <strong>{citationSources.length}</strong> of {citationPool.current.length} sources
                      </span>
                      <div className="stepper">
                        <button onClick={() => setCount(sourceCount - 1)} disabled={sourceCount <= 1 || answering} aria-label="Fewer sources">−</button>
                        <span className="sc-n">{sourceCount}</span>
                        <button onClick={() => setCount(sourceCount + 1)} disabled={sourceCount >= maxAvailable || answering} aria-label="More sources">+</button>
                      </div>
                      <button className="regen-btn" onClick={regenerate} disabled={answering}>↻ Regenerate</button>
                    </div>
                  )}
                </section>
              )}

              <Results
                results={pageResults}
                category={filters.category}
                page={page}
                hasMore={hasMore}
                loading={pageLoading}
                error={pageError}
                onPrev={() => goToPage(page - 1)}
                onNext={() => goToPage(page + 1)}
                onSummarize={summarize}
                summaries={summaries}
                citedIndices={citedIndices}
              />
              </div>
            )}
          </>
        )}

        <footer className="foot">No tracking · No query logging · 100% self-hosted</footer>
      </main>
    </div>
  );
}
