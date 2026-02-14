// Category tabs + the SearXNG filters (time range, safesearch, language).

export const CATEGORIES = [
  { key: 'general', label: 'All' },
  { key: 'images', label: 'Images' },
  { key: 'videos', label: 'Videos' },
  { key: 'news', label: 'News' },
  { key: 'science', label: 'Science' },
  { key: 'music', label: 'Music' },
  { key: 'it', label: 'IT' },
  { key: 'files', label: 'Files' },
  { key: 'map', label: 'Map' },
];

// Categories where an AI answer makes sense (text results).
export const TEXT_CATEGORIES = new Set(['general', 'news', 'science', 'it']);

const TIME_RANGES = [
  { v: '', l: 'Any time' },
  { v: 'day', l: 'Past day' },
  { v: 'week', l: 'Past week' },
  { v: 'month', l: 'Past month' },
  { v: 'year', l: 'Past year' },
];

const SAFE = [
  { v: '1', l: 'Moderate' },
  { v: '0', l: 'Off' },
  { v: '2', l: 'Strict' },
];

const LANGS = [
  { v: '', l: 'Any language' },
  { v: 'en', l: 'English' },
  { v: 'fr', l: 'French' },
  { v: 'es', l: 'Spanish' },
  { v: 'de', l: 'German' },
  { v: 'ar', l: 'Arabic' },
];

export default function Filters({ filters, onChange, disabled, total }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <div className="filters">
      <div className="cat-tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`cat-tab ${filters.category === c.key ? 'active' : ''}`}
            onClick={() => set({ category: c.key })}
            disabled={disabled}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <div className="filter-selects">
          <label>
            <span className="filter-label">Time</span>
            <select value={filters.timeRange} onChange={(e) => set({ timeRange: e.target.value })} disabled={disabled}>
              {TIME_RANGES.map((t) => (
                <option key={t.v} value={t.v}>{t.l}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">Safe</span>
            <select value={filters.safesearch} onChange={(e) => set({ safesearch: e.target.value })} disabled={disabled}>
              {SAFE.map((s) => (
                <option key={s.v} value={s.v}>{s.l}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">Lang</span>
            <select value={filters.language} onChange={(e) => set({ language: e.target.value })} disabled={disabled}>
              {LANGS.map((l) => (
                <option key={l.v} value={l.v}>{l.l}</option>
              ))}
            </select>
          </label>
        </div>
        {total > 0 && <span className="result-count">about {total.toLocaleString()} results</span>}
      </div>
    </div>
  );
}
