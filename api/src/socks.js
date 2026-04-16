// Minimal, dependency-free SOCKS5 client — just enough to make one plain-HTTP
// GET through the Tor container's SOCKS proxy. Used to discover the Tor exit
// IP *through the tunnel itself*, so the lookup is anonymous too.

import net from 'node:net';

/**
 * HTTP GET `http://host/path` via a SOCKS5 proxy. Returns the response body.
 * @param {{proxyHost:string, proxyPort:number, host:string, path:string, timeoutMs?:number}} o
 * @returns {Promise<string>}
 */
export function socksHttpGet({ proxyHost, proxyPort, host, path, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, proxyHost);
    let stage = 0; // 0=greeting 1=connect 2=http
    let buf = Buffer.alloc(0);
    let settled = false;

    const fail = (msg) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      reject(new Error(msg));
    };
    sock.setTimeout(timeoutMs, () => fail('socks timeout'));
    sock.on('error', (e) => fail(e.message));

    sock.on('connect', () => {
      sock.write(Buffer.from([0x05, 0x01, 0x00])); // SOCKS5, 1 method: no-auth
    });

    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 0 && buf.length >= 2) {
        if (buf[0] !== 0x05 || buf[1] !== 0x00) return fail('socks: auth rejected');
        buf = buf.subarray(2);
        stage = 1;
        const h = Buffer.from(host); // ATYP=3 (domain) → proxy resolves DNS: no DNS leak
        sock.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, h.length]), h, Buffer.from([0x00, 0x50])])); // port 80
      } else if (stage === 1 && buf.length >= 10) {
        if (buf[1] !== 0x00) return fail(`socks: connect failed (code ${buf[1]})`);
        buf = Buffer.alloc(0);
        stage = 2;
        sock.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: PrivaSearch/1.0\r\nAccept: application/json\r\nConnection: close\r\n\r\n`);
      }
    });

    sock.on('close', () => {
      if (settled) return;
      if (stage < 2) return fail('socks: closed early');
      settled = true;
      const s = buf.toString('utf8');
      const i = s.indexOf('\r\n\r\n');
      if (i < 0) return reject(new Error('bad http response'));
      let body = s.slice(i + 4);
      if (/transfer-encoding:\s*chunked/i.test(s.slice(0, i))) {
        // Strip chunk-size lines (fine for small JSON bodies).
        body = body.replace(/^[0-9a-fA-F]+\r\n/gm, '').replace(/\r\n0\s*$/, '').replace(/\r\n/g, '');
      }
      resolve(body.trim());
    });
  });
}
