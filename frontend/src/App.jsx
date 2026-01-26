import { useMemo, useRef, useState } from 'react';
import { fetchResults, streamAnswer } from './api.js';
import SearchBar from './components/SearchBar.jsx';
import Answer from './components/Answer.jsx';
import Results from './components/Results.jsx';

const SOURCE_COUNT = 5;

export default function App() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const [answer, setAnswer] = useState('');
  const [citationSources, setCitationSources] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | searching | streaming | done
  const [notice, setNotice] = useState(null);

  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);
  const pageAbort = useRef(null);
  const answerAbort = useRef(null);

  const citedIndices = useMemo(() => {
    const set = new Set();
    const re = /\[(\d+)\]/g;
    let m;
    while ((m = re.exec(answer)) !== null) set.add(parseInt(m[1], 10));
    return set;
  }, [answer]);

  async function generateAnswer(q, pool) {
    answerAbort.current?.abort();
    const ac = new AbortController();
    answerAbort.current = ac;
    const sources = pool.slice(0, SOURCE_COUNT).map((r, i) => ({
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

  async function loadPage(q, target) {
    pageAbort.current?.abort();
    const ac = new AbortController();
    pageAbort.current = ac;
    setLoading(true);
    setError(null);
    try {
      const { results: rs, hasMore: more } = await fetchResults(q, target, {}, ac.signal);
      setResults(rs);
      setHasMore(more);
      setPage(target);
      return rs;
    } catch (err) {
      if (err.name !== 'AbortError') setError(`Search failed: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function runSearch(q) {
    q = q.trim();
    if (!q) return;
    document.title = `${q} — PrivaSearch`;
    setSubmitted(q);
    setAnswer('');
    setCitationSources([]);
    setNotice(null);
    setResults([]);
    setPage(1);
    setStatus('searching');
    const rs = await loadPage(q, 1);
    if (rs && rs.length) generateAnswer(q, rs);
    else setStatus('done');
  }

  function goToPage(target) {
    if (target < 1 || loading) return;
    loadPage(submitted, target);
  }

  const answering = status === 'searching' || status === 'streaming';

  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">
          <span className="wm-lock">🔒</span> priva<span className="wm-accent">search</span>
        </span>
      </header>

      <main className="page">
        {!submitted && (
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

        <SearchBar
          ref={inputRef}
          value={query}
          onChange={setQuery}
          onSubmit={() => runSearch(query)}
          disabled={answering || loading}
        />

        {submitted && (
          <div className="results">
            <section className="answer-card">
              <div className="card-header">
                <span className="card-title">✦ AI answer</span>
                {answering && <span className="spinner" aria-label="loading" />}
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
            </section>

            <Results
              results={results}
              page={page}
              hasMore={hasMore}
              loading={loading}
              error={error}
              onPrev={() => goToPage(page - 1)}
              onNext={() => goToPage(page + 1)}
              citedIndices={citedIndices}
            />
          </div>
        )}

        <footer className="foot">No tracking · No query logging · 100% self-hosted</footer>
      </main>
    </div>
  );
}
