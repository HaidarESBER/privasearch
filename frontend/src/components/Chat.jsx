import { useEffect, useRef, useState } from 'react';
import { streamChatTurn } from '../api.js';

// A plain multi-turn chat with the local LLM. No search, no RAG — the
// conversation lives only in memory and is wiped on reload/clear.
export default function Chat() {
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput('');

    const history = [...messages, { role: 'user', content: text }];
    // Add the user's turn plus an empty assistant turn we stream into.
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamChatTurn(history, {
        signal: ac.signal,
        onToken: (t) =>
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + t };
            return next;
          }),
        onError: (e) => setError(e.message),
        onDone: () => {},
      });
    } catch (err) {
      if (err.name !== 'AbortError') setError(`Request failed: ${err.message}`);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  function clear() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setBusy(false);
    inputRef.current?.focus();
  }

  const lastEmpty = busy && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1].content;

  return (
    <section className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <svg className="chat-empty-icon" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <h2>
              Chat privately with<br />your local AI.
            </h2>
            <p>No search, no web, no RAG — just you and the model on this machine. Nothing leaves the device, and this conversation is wiped the moment you reload.</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble-row ${m.role}`}>
              <div className={`bubble ${m.role}`}>
                {m.content}
                {i === messages.length - 1 && m.role === 'assistant' && busy && <span className="cursor" />}
              </div>
            </div>
          ))
        )}
        {lastEmpty && <div className="chat-thinking">thinking…</div>}
        {error && <p className="notice chat-error">⚠ {error}</p>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Message your local model…  (Enter to send · Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {messages.length > 0 && (
          <button type="button" className="chat-clear" onClick={clear} title="Clear conversation">
            Clear
          </button>
        )}
        {busy ? (
          <button type="button" className="chat-send stop" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="chat-send" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  );
}
