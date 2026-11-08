import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, buildSummaryMessages } from '../src/prompt.js';

test('buildMessages returns a system + user pair', () => {
  const msgs = buildMessages('what is rust?', [
    { index: 1, title: 'Rust', url: 'https://rust-lang.org', snippet: 'A language.' },
  ]);
  assert.deepEqual(msgs.map((m) => m.role), ['system', 'user']);
});

test('buildMessages numbers sources, collapses whitespace and omits URLs', () => {
  const [, user] = buildMessages('q', [
    { index: 1, title: '  Spaced \n title ', url: 'https://a.example', snippet: 'one\n\ntwo' },
    { index: 2, title: 'No snippet', url: 'https://b.example', snippet: '' },
  ]);
  assert.match(user.content, /\[1\] Spaced title — one two/);
  assert.match(user.content, /\[2\] No snippet(\n|$)/);
  assert.ok(!user.content.includes('https://'));
  assert.ok(user.content.startsWith('Question: q'));
});

test('system prompt forces citations and a fixed fallback answer', () => {
  const [system] = buildMessages('q', []);
  assert.match(system.content, /square brackets/);
  assert.match(system.content, /Insufficient information in the results\./);
});

test('buildSummaryMessages includes title, url and content', () => {
  const [, user] = buildSummaryMessages({ title: 'T', url: 'https://x.example', text: 'body' });
  assert.match(user.content, /Title: T/);
  assert.match(user.content, /URL: https:\/\/x\.example/);
  assert.match(user.content, /body$/);
});
