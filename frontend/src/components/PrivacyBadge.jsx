import { useEffect, useRef, useState } from 'react';
import { fetchPrivacy } from '../api.js';

const MODE_LABEL = {
  direct: { text: 'Direct', tone: 'warn' },
  vpn: { text: 'via VPN', tone: 'good' },
  tor: { text: 'via Tor', tone: 'good' },
};

const MODES = [
  { k: 'direct', l: 'Direct', cmd: 'make up' },
  { k: 'tor', l: 'via Tor', cmd: 'make up-tor' },
  { k: 'vpn', l: 'via VPN', cmd: 'make up-vpn' },
];

const POSTURE = [
  ['The AI runs on your machine.', 'Answers are synthesized by a local model — no cloud inference, no prompt leaves the device.'],
  ['No logs, ever.', 'Queries, results and answers are held in memory and gone the instant you close the tab.'],
  ['Nothing is exposed.', 'There is no account, no sync, no telemetry beacon to phone home.'],
  ['Zero tracking.', 'No cookies, no fingerprinting, no third-party scripts anywhere on the page.'],
  ['Hide even from the engines.', 'Route search through Tor or a VPN so the sources never see your real address.'],
  ["Images can't track you.", 'Thumbnails are proxied locally, so a remote server never learns you looked.'],
  ['You stay in control.', 'Full-page fetches for summaries are strictly opt-in, one result at a time.'],
  ['Grounded, not guessing.', 'Every claim is tied to a numbered source you can click and verify.'],
];

export default function PrivacyBadge() {
  const [loc, setLoc] = useState(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchPrivacy(ac.signal)
      .then(setLoc)
      .catch(() => setLoc({ enabled: true, mode: 'direct', error: 'unavailable' }));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const mode = MODE_LABEL[loc?.mode] || MODE_LABEL.direct;
  const exit = loc?.exit;
  const isTunnel = loc?.mode === 'tor' || loc?.mode === 'vpn';

  // Values for the exit card (differ between direct and tunnelled modes).
  const cc = isTunnel ? exit?.cc : loc?.countryCode;
  const place = isTunnel
    ? exit
      ? `${exit.city ? exit.city + ', ' : ''}${exit.country || 'Tor exit'}`
      : loc?.mode === 'vpn'
        ? 'Masked via VPN'
        : 'Masked via Tor'
    : loc?.city && loc?.country
      ? `${loc.city}, ${loc.country}`
      : loc?.country || 'Location';
  const ip = isTunnel ? exit?.ip : loc?.ip;

  // Pill label
  const pillFlag = isTunnel ? '🧅' : loc?.flag || '🌍';
  const pillPlace = isTunnel
    ? exit
      ? `Exit: ${exit.city || exit.country || 'Tor'}`
      : 'Masked'
    : loc?.city && loc?.country
      ? `${loc.city}, ${loc.country}`
      : loc?.country || (loc?.error ? 'Location hidden' : 'Locating…');

  const routeNote = () => {
    if (loc?.mode === 'tor')
      return `Routed through the Tor network — engines see a random exit node${exit?.country ? ' in ' + exit.country : ''}, never your real address.`;
    if (loc?.mode === 'vpn')
      return 'Routed through a VPN tunnel — engines see the VPN exit, never your real address.';
    return 'This is your real region — the engines see it directly. Turn on Tor or a VPN to mask it.';
  };

  return (
    <div className="privacy" ref={ref}>
      <button className="privacy-pill" onClick={() => setOpen((o) => !o)} title="Your privacy posture">
        <span className="privacy-mode-dot" data-tone={mode.tone} />
        <span className={`privacy-mode mode-${mode.tone}`}>{mode.text}</span>
        <span className="privacy-place">{cc ? `${cc} · ${pillPlace.replace(/^Exit:\s*/, '')}` : pillPlace}</span>
      </button>

      {open && (
        <aside className="privacy-panel">
          <button className="pp-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          <div className="pp-eyebrow">Your privacy posture</div>
          <h2 className="pp-title">As close to anonymous as a self-hosted search gets.</h2>

          {/* Exit card */}
          <div className="pp-exit">
            <div className="pp-exit-top">
              <span className="pp-cc">{cc || '··'}</span>
              <div className="pp-exit-id">
                <div className="pp-exit-place">{place}</div>
                {ip && <div className="pp-exit-ip">{ip}</div>}
              </div>
              <span className={`pp-badge mode-${mode.tone}`}>{mode.text}</span>
            </div>
            <p className="pp-exit-note">{routeNote()}</p>
            <div className="pp-modes">
              {MODES.map((m) => (
                <button
                  key={m.k}
                  className={`pp-mode-btn ${loc?.mode === m.k ? 'active' : ''}`}
                  onClick={async () => {
                    if (loc?.mode === m.k) {
                      setHint(null);
                      return;
                    }
                    try {
                      await navigator.clipboard.writeText(m.cmd);
                      setHint({ ...m, copied: true });
                    } catch {
                      setHint(m);
                    }
                  }}
                >
                  {m.l}
                </button>
              ))}
            </div>
            {hint && (
              <div className="pp-hint">
                {hint.copied ? '✓ Copied — paste ' : 'Run '}
                <code>{hint.cmd}</code> in your terminal, then reload. Egress is set at startup, so
                switching restarts the stack (~30s).
              </div>
            )}
          </div>

          {/* Numbered posture list */}
          <ol className="pp-posture">
            {POSTURE.map(([lead, rest], i) => (
              <li key={i}>
                <span className="pp-num">{String(i + 1).padStart(2, '0')}</span>
                <p>
                  <b>{lead}</b> {rest}
                </p>
              </li>
            ))}
          </ol>

          {/* Honest limits */}
          <div className="pp-limits">
            <div className="pp-limits-label">Honest limits</div>
            <p>
              Your ISP can still see that you connected to something, and one geo lookup happens to
              place your exit on the map. We'd rather tell you than pretend otherwise.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
