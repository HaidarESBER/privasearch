import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchPage } from '../src/searxng.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockJson(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return { ok, status, json: async () => payload };
  };
  return calls;
}

test('searchPage builds the SearXNG query with filters', async () => {
  const calls = mockJson({ results: [] });
  await searchPage('rust lang', { page: 3, category: 'news', timeRange: 'week', safesearch: 0, language: 'fr' });
  const p = calls[0].url.searchParams;
  assert.equal(calls[0].url.pathname, '/search');
  assert.equal(p.get('q'), 'rust lang');
  assert.equal(p.get('format'), 'json');
  assert.equal(p.get('pageno'), '3');
  assert.equal(p.get('categories'), 'news');
  assert.equal(p.get('safesearch'), '0');
  assert.equal(p.get('time_range'), 'week');
  assert.equal(p.get('language'), 'fr');
});

test('searchPage omits optional filters when unset', async () => {
  const calls = mockJson({ results: [] });
  await searchPage('x');
  const p = calls[0].url.searchParams;
  assert.equal(p.get('categories'), 'general');
  assert.equal(p.has('time_range'), false);
  assert.equal(p.has('language'), false);
});

test('searchPage drops incomplete results and normalizes the rest', async () => {
  mockJson({
    number_of_results: '42',
    results: [
      { title: ' Good ', url: 'https://a.example', content: ' hello ', engines: ['duckduckgo'] },
      { title: 'No url' },
      { url: 'https://no-title.example' },
      null,
    ],
  });
  const { results, total } = await searchPage('q');
  assert.equal(total, 42);
  assert.equal(results.length, 1);
  assert.deepEqual(
    { title: results[0].title, snippet: results[0].snippet, engine: results[0].engine, template: results[0].template },
    { title: 'Good', snippet: 'hello', engine: 'duckduckgo', template: 'default.html' },
  );
});

test('thumbnails are rewritten to go through the local image proxy', async () => {
  mockJson({
    results: [
      { title: 'a', url: 'https://a.example', thumbnail_src: '/image_proxy?url=abc&h=sig' },
      { title: 'b', url: 'https://b.example', thumbnail: 'https://cdn.example/x y.png' },
      { title: 'c', url: 'https://c.example', img_src: 'http://img.example/full.jpg' },
      { title: 'd', url: 'https://d.example', thumbnail: 'javascript:alert(1)' },
    ],
  });
  const { results } = await searchPage('q');
  assert.equal(results[0].thumbnail, '/api/image_proxy?url=abc&h=sig');
  assert.equal(results[1].thumbnail, '/api/image_proxy?url=' + encodeURIComponent('https://cdn.example/x y.png'));
  assert.equal(results[2].thumbnail, '/api/image_proxy?url=' + encodeURIComponent('http://img.example/full.jpg'));
  assert.equal(results[3].thumbnail, null);
});

test('searchPage throws on a non-OK SearXNG response', async () => {
  mockJson({}, { ok: false, status: 503 });
  await assert.rejects(searchPage('q'), /HTTP 503/);
});
