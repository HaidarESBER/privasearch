// Renders results per category: image grid, video cards, or text list.
// Text results also get an inline "Summarize with AI" action.

export default function Results({
  results,
  category,
  page,
  hasMore,
  loading,
  error,
  onPrev,
  onNext,
  onSummarize,
  summaries,
  citedIndices,
}) {
  if (!results.length && !loading && !error) return null;

  const isImages = category === 'images';
  const isVideos = category === 'videos';

  return (
    <section className="results-list">
      <div className="results-header">
        <span>{isImages ? 'Images' : isVideos ? 'Videos' : 'Web results'}</span>
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
      ) : isImages ? (
        <ImageGrid results={results} />
      ) : isVideos ? (
        <VideoList results={results} />
      ) : (
        <TextList
          results={results}
          page={page}
          onSummarize={onSummarize}
          summaries={summaries}
          citedIndices={citedIndices}
        />
      )}

      <div className="pagination">
        <button onClick={onPrev} disabled={page <= 1 || loading}>← Prev</button>
        <span className="page-indicator">{loading ? 'Loading…' : `Page ${page}`}</span>
        <button onClick={onNext} disabled={!hasMore || loading}>Next →</button>
      </div>
    </section>
  );
}

function ImageGrid({ results }) {
  return (
    <div className="image-grid">
      {results.map((r, i) =>
        r.thumbnail ? (
          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="image-cell" title={r.title}>
            <img src={r.thumbnail} alt={r.title} loading="lazy" />
            <span className="image-cap">
              {r.title}
              {r.resolution && <em> · {r.resolution}</em>}
            </span>
          </a>
        ) : null,
      )}
    </div>
  );
}

function VideoList({ results }) {
  return (
    <ol className="video-items">
      {results.map((r, i) => (
        <li key={i} className="video-item">
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="video-thumb">
            {r.thumbnail ? <img src={r.thumbnail} alt={r.title} loading="lazy" /> : <span className="video-noimg">▶</span>}
            {r.length && <span className="video-len">{r.length}</span>}
          </a>
          <div className="result-body">
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="result-title">{r.title}</a>
            <div className="result-url">
              {r.author ? `${r.author} · ` : ''}{r.engine}
            </div>
            {r.snippet && <p className="result-snippet">{r.snippet}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

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

function TextList({ results, page, onSummarize, summaries, citedIndices }) {
  return (
    <ol className="result-items">
      {results.map((r, i) => {
        const sum = summaries[r.url];
        const cited = page === 1 && citedIndices?.has(i + 1);
        const num = String((page - 1) * results.length + i + 1).padStart(2, '0');
        const date = r.publishedDate
          ? new Date(r.publishedDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
          : null;
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
                <span className="result-engine">
                  via {r.engine}{date ? ` · ${date}` : ''}
                </span>
                <button className="summarize-btn" onClick={() => onSummarize(r)} disabled={sum?.status === 'streaming'}>
                  {sum?.status === 'streaming' ? '✦ Summarizing…' : '✦ Summarize'}
                </button>
              </div>

              {sum && (
                <div className="summary-box">
                  {sum.source === 'snippet' && <div className="summary-tag">from snippet (page not fetched)</div>}
                  {sum.notice && <div className="summary-notice">{sum.notice}</div>}
                  <div className="summary-text">
                    {sum.text}
                    {sum.status === 'streaming' && <span className="cursor" />}
                  </div>
                  {sum.status === 'error' && <div className="summary-notice">⚠ {sum.error}</div>}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
