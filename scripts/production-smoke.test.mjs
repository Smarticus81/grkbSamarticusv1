import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const smokeScript = readFileSync(new URL('./production-smoke.mjs', import.meta.url), 'utf8');

test('production smoke covers public and protected PSUR entrypoints', () => {
  assert.match(smokeScript, /checkWebRoute\(webUrl, '\/demo\/psur', 'public PSUR simulation'\)/);
  assert.match(smokeScript, /checkWebRoute\(webUrl, '\/app\/psur\/build', 'protected PSUR builder'\)/);
});

test('production smoke keeps the protected app shell route covered', () => {
  assert.match(smokeScript, /checkWebRoute\(webUrl, '\/app', 'protected app'\)/);
});

test('production smoke verifies the Clerk webhook endpoint path', () => {
  assert.match(smokeScript, /checkClerkWebhookEndpoint\(apiUrl\)/);
  assert.match(smokeScript, /\/api\/clerk-webhook/);
  assert.match(smokeScript, /Webhook verification failed/);
});
