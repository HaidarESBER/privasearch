import { useState } from 'react';

export default function Sources({ sources }) {
  const [open, setOpen] = useState(true);
  if (!sources.length) return null;

  return (
    <section className="sources">
      <button className="sources-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Sources ({sources.length})
      </button>

      {open && (
        <ol className="source-list">
          {sources.map((s) => (
            <li key={s.index} id={`src-${s.index}`}>
              <span className="source-index">{s.index}</span>
              <div className="source-body">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="source-title">
                  {s.title}
                </a>
                <div className="source-url">{s.url}</div>
                {s.snippet && <p className="source-snippet">{s.snippet}</p>}
                <span className="source-engine">{s.engine}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
