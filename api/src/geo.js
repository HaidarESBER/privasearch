// Reports the EXIT identity — what the outside world sees when this tool
// searches on your behalf.
//
//   direct → one cached geo-IP lookup (ipwho.is) showing YOUR egress.
//   tor    → the lookup is made THROUGH the Tor tunnel itself (via our tiny
//            SOCKS5 client), so it reveals the TOR EXIT's IP/location — never
//            yours — and the lookup itself is anonymous.
//   vpn    → reported as masked (the API container isn't inside the tunnel,
//            so probing from here would show your real IP — we don't).
//
// Disable everything with SHOW_LOCATION=false.

import { socksHttpGet } from './socks.js';

const TTL_MS = 30 * 60 * 1000; // direct-mode cache
const TOR_TTL_MS = 5 * 60 * 1000; // Tor circuits rotate ~10 min; refresh oftener
const MODE = process.env.EGRESS_MODE || 'direct'; // direct | vpn | tor
const ENABLED = (process.env.SHOW_LOCATION || 'true').toLowerCase() !== 'false';
const TOR_PROXY_HOST = process.env.TOR_PROXY_HOST || 'tor';
const TOR_PROXY_PORT = parseInt(process.env.TOR_PROXY_PORT || '9050', 10);

let cache = null; // { data, at }
let torCache = null;

function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':…';
  const p = ip.split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : ip;
}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '🌍';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

async function torExit() {
  if (torCache && Date.now() - torCache.at < TOR_TTL_MS) return torCache.data;
  // Plain-HTTP JSON API, queried through Tor — the request never leaves the
  // tunnel, and the answer describes the exit relay, not the user.
  const raw = await socksHttpGet({
    proxyHost: TOR_PROXY_HOST,
    proxyPort: TOR_PROXY_PORT,
    host: 'ip-api.com',
    path: '/json/?fields=status,query,country,countryCode,city',
  });
  const j = JSON.parse(raw);
  if (j.status !== 'success') throw new Error('exit lookup failed');
  const data = {
    enabled: true,
    mode: 'tor',
    masked: true,
    exit: {
      ip: j.query, // the FULL exit IP — it's a public Tor relay, not you
      city: j.city || null,
      country: j.country || null,
      cc: (j.countryCode || '').toUpperCase() || null,
      flag: flagEmoji(j.countryCode),
    },
  };
  torCache = { data, at: Date.now() };
  return data;
}

export async function getExitLocation({ signal } = {}) {
  if (!ENABLED) return { enabled: false, mode: MODE };
  if (MODE === 'tor') {
    try {
      return await torExit();
    } catch {
      return { enabled: true, mode: 'tor', masked: true }; // tunnel up, exit unknown
    }
  }
  if (MODE !== 'direct') return { enabled: true, mode: MODE, masked: true };

  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const res = await fetch('https://ipwho.is/', { signal });
  if (!res.ok) throw new Error(`geo lookup HTTP ${res.status}`);
  const j = await res.json();
  if (j.success === false) throw new Error(j.message || 'geo lookup failed');
  const data = {
    enabled: true,
    mode: MODE,
    ip: maskIp(j.ip),
    city: j.city || null,
    region: j.region || null,
    country: j.country || null,
    countryCode: j.country_code || null,
    flag: j.flag?.emoji || '🌍',
    isp: j.connection?.isp || j.connection?.org || null,
  };
  cache = { data, at: Date.now() };
  return data;
}
