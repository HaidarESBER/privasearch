// One-time setup: create .env and generate a random SearXNG secret_key.
// Cross-platform (Node), so it works on Windows/macOS/Linux without openssl.

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const envExample = resolve(root, '.env.example');
const PLACEHOLDER = 'PLACEHOLDER_SECRET_KEY_RUN_SETUP';

// Every SearXNG settings file that needs a secret (default + Tor variant).
const settingsFiles = ['searxng/settings.yml', 'searxng/settings-tor.yml'];

// 1) .env from template
if (!existsSync(envPath)) {
  copyFileSync(envExample, envPath);
  console.log('✔ Created .env from .env.example');
} else {
  console.log('• .env already exists — leaving it unchanged');
}

// 2) SearXNG secret_key (in each settings file that still has the placeholder)
for (const rel of settingsFiles) {
  const path = resolve(root, rel);
  if (!existsSync(path)) continue;
  let settings = readFileSync(path, 'utf8');
  if (settings.includes(PLACEHOLDER)) {
    const secret = randomBytes(32).toString('hex');
    settings = settings.replace(PLACEHOLDER, secret);
    writeFileSync(path, settings);
    console.log(`✔ Generated a random secret_key in ${rel}`);
  } else {
    console.log(`• secret_key already set in ${rel} — leaving it unchanged`);
  }
}

console.log('\nSetup complete. Next: pull the model, then start the stack.');
