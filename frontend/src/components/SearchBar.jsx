import { forwardRef } from 'react';

const SearchBar = forwardRef(function SearchBar({ value, onChange, onSubmit, disabled }, ref) {
  return (
    <form
      className="searchbar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="search-field">
        <span className="search-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
        </span>
        <input
          ref={ref}
          type="text"
          placeholder="Ask anything…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        {value && (
          <button type="button" className="clear-btn" onClick={() => onChange('')} aria-label="Clear search">
            ×
          </button>
        )}
        <kbd className="slash-hint">/</kbd>
      </div>
      <button type="submit" className="search-submit" disabled={disabled}>
        {disabled ? <span className="btn-spinner" /> : 'Search'}
      </button>
    </form>
  );
});

export default SearchBar;
