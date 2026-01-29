// Renders the streamed answer, turning inline [n] markers into clickable
// citation links that point at the matching source URL.
//
// Text lands inside React <span>/<a> children, which React auto-escapes,
// so there is no dangerouslySetInnerHTML and no XSS surface.

export default function Answer({ text, sources, streaming }) {
  if (!text) {
    return streaming ? <span className="cursor" /> : null;
  }

  const parts = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  let key = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    }
    const n = parseInt(m[1], 10);
    const src = sources.find((s) => s.index === n);
    if (src) {
      parts.push(
        <a
          key={key++}
          className="citation"
          href={src.url}
          target="_blank"
          rel="noopener noreferrer"
          title={src.title}
        >
          {n}
        </a>,
      );
    } else {
      parts.push(<span key={key++}>{m[0]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={key++}>{text.slice(last)}</span>);
  }

  return (
    <div className="answer">
      {parts}
      {streaming && <span className="cursor" />}
    </div>
  );
}
