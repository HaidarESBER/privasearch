import { useRef, useState } from 'react';
import { fetchResults } from './api.js';
import SearchBar from './components/SearchBar.jsx';
import Results from './components/Results.jsx';

export default function App() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);
  const abort = useRef(null);

  async function loadPage(q, target) {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setLoading(true);
    setError(null);
    try {
      const { results: rs, hasMore: more } = await fetchResults(q, target, {}, ac.signal);
      setResults(rs);
      setHasMore(more);
      setPage(target);
    } catch (err) {
      if (err.name !== 'AbortError') setError(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function runSearch(q) {
    q = q.trim();
    if (!q) return;
    document.title = `${q} — PrivaSearch`;
    setSubmitted(q);
    setResults([]);
    setPage(1);
    loadPage(q, 1);
  }

  function goToPage(target) {
    if (target < 1 || loading) return;
    loadPage(submitted, target);
  }

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
            <div className="eyebrow">Local · Private</div>
            <h1 className="display">
              <span className="d1">Search the whole web.</span>
              <span className="d2">Keep every keystroke.</span>
            </h1>
            <p className="lede">A private metasearch over SearXNG — no accounts, nothing logged.</p>
          </section>
        )}

        <SearchBar
          ref={inputRef}
          value={query}
          onChange={setQuery}
          onSubmit={() => runSearch(query)}
          disabled={loading}
        />

        {submitted && (
          <div className="results">
            <Results
              results={results}
              page={page}
              hasMore={hasMore}
              loading={loading}
              error={error}
              onPrev={() => goToPage(page - 1)}
              onNext={() => goToPage(page + 1)}
            />
          </div>
        )}

        <footer className="foot">No tracking · No query logging · 100% self-hosted</footer>
      </main>
    </div>
  );
}
