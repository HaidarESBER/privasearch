import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchReadable } from '../src/fetchPage.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockPage(body, contentType = 'text/html; charset=utf-8', status = 200) {
  globalThis.fetch = async () => ({
    ok: status < 400,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    body: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(body));
        c.close();
      },
    }),
  });
}

test('fetchReadable strips scripts, styles, comments and tags; decodes entities', async () => {
  mockPage(
    '<html><head><style>p{color:red}</style><script>alert(1)</script></head>' +
      '<body><!-- hidden --><h1>Title</h1><p>Fish &amp; chips &lt;3 &quot;yum&quot;</p></body></html>',
  );
  const text = await fetchReadable('https://example.test');
  for (const junk of ['alert', 'color:red', 'hidden', '<h1>', '<p>']) assert.ok(!text.includes(junk), junk);
  assert.match(text, /Title\s+Fish & chips <3 "yum"/);
});

test('fetchReadable rejects non-text content types', async () => {
  mockPage('%PDF', 'application/pdf');
  await assert.rejects(fetchReadable('https://example.test/a.pdf'), /unsupported content type/);
});

test('fetchReadable rejects HTTP errors and truncates long pages', async () => {
  mockPage('nope', 'text/html', 404);
  await assert.rejects(fetchReadable('https://example.test'), /HTTP 404/);
  mockPage('<p>' + 'a'.repeat(20000) + '</p>');
  const text = await fetchReadable('https://example.test');
  assert.equal(text.length, 4500);
});
