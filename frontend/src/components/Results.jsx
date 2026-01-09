// Renders the text results list with pagination.

function prettyUrl(u) {
  try {
    const { hostname, pathname } = new URL(u);
    const host = hostname.replace(/^www\./, '');
    const path = pathname.replace(/\/$/, '');
    return (host + path).slice(0, 64);
  } catch {
    return u;
  }
}

export default function Results({ results, page, hasMore, loading, error, onPrev, onNext, citedIndices }) {
  if (!results.length && !loading && !error) return null;

  return (
    <section className="results-list">
      <div className="results-header">
        <span>Web results</span>
        <span className="results-page">page {page}</span>
      </div>

      {error && <p className="notice">⚠ {error}</p>}

      {loading && !results.length ? (
        <div className="skel-list" aria-label="Loading results">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel-card">
              <span className="skel-dot" />
              <div className="skel-body">
                <span style={{ width: '45%' }} />
                <span style={{ width: '70%' }} />
                <span style={{ width: '88%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ol className="result-items">
          {results.map((r, i) => {
            const cited = page === 1 && citedIndices?.has(i + 1);
            const num = String((page - 1) * results.length + i + 1).padStart(2, '0');
            return (
              <li key={`${page}-${i}`} className="result-item">
                <span className="result-index">{num}</span>
                <div className="result-body">
                  <div className="result-domain-row">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="result-url">{prettyUrl(r.url)}</a>
                    {cited && <span className="cited-badge" title="Used in the AI answer">★ in answer</span>}
                  </div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="result-title">{r.title}</a>
                  {r.snippet && <p className="result-snippet">{r.snippet}</p>}
                  <div className="result-actions">
                    <span className="result-engine">via {r.engine}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="pagination">
        <button onClick={onPrev} disabled={page <= 1 || loading}>← Prev</button>
        <span className="page-indicator">{loading ? 'Loading…' : `Page ${page}`}</span>
        <button onClick={onNext} disabled={!hasMore || loading}>Next →</button>
      </div>
    </section>
  );
}
