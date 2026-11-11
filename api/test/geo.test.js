import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getExitLocation } from '../src/geo.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('direct mode masks the IP and never exposes the full address', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      success: true,
      ip: '203.0.113.77',
      city: 'Paris',
      country: 'France',
      country_code: 'FR',
      flag: { emoji: '🇫🇷' },
      connection: { isp: 'ExampleNet' },
    }),
  });
  const loc = await getExitLocation();
  assert.equal(loc.mode, 'direct');
  assert.equal(loc.ip, '203.0.113.x');
  assert.equal(loc.city, 'Paris');
  assert.equal(loc.flag, '🇫🇷');
  assert.ok(!JSON.stringify(loc).includes('203.0.113.77'));
});
