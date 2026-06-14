#!/usr/bin/env node
/**
 * Production smoke test for deployed Regulatory Ground services.
 *
 * Required:
 *   API_URL=https://<api-domain>
 *   WEB_URL=https://<web-domain>
 *
 * Optional:
 *   MCP_URL=https://<mcp-domain>
 *   SMOKE_SKIP_DEEP=1   # skip /ready?deep=1
 */

const TIMEOUT_MS = 15_000;

function usage() {
  console.log(`Usage:
  API_URL=https://api.example.com WEB_URL=https://app.example.com MCP_URL=https://mcp.example.com pnpm smoke:prod

Environment:
  API_URL          Required. Public API base URL.
  WEB_URL          Required. Public web app base URL.
  MCP_URL          Optional. Public MCP HTTP base URL.
  SMOKE_SKIP_DEEP  Optional. Set to 1 to skip API /ready?deep=1.
`);
}

function normalizeBaseUrl(raw, name) {
  if (!raw || raw.trim() === '') throw new Error(`${name} is required`);
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`${name} must use https:// for production smoke tests`);
  }
  return url.toString().replace(/\/+$/, '');
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(url) {
  const response = await fetchWithTimeout(url, {
    headers: { accept: 'application/json' },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${url} did not return JSON. Status ${response.status}.`);
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkApiHealth(apiUrl) {
  const url = `${apiUrl}/health`;
  const { response, body } = await readJson(url);
  assert(response.ok, `${url} returned ${response.status}`);
  assert(body?.status === 'ok', `${url} did not report status ok`);
  return 'API /health ok';
}

async function checkApiReady(apiUrl, deep) {
  const path = deep ? '/ready?deep=1' : '/ready';
  const url = `${apiUrl}${path}`;
  const { response, body } = await readJson(url);
  assert(response.ok, `${url} returned ${response.status}: ${body?.status ?? 'unknown'}`);
  assert(body?.status === 'ready', `${url} reported ${body?.status ?? 'unknown'}`);
  assert(Array.isArray(body?.checks), `${url} did not include readiness checks`);
  const failed = body.checks.filter((check) => !check.ok).map((check) => check.id);
  assert(failed.length === 0, `${url} has failed checks: ${failed.join(', ')}`);
  return deep ? 'API /ready?deep=1 ready' : 'API /ready ready';
}

async function checkMcpHealth(mcpUrl) {
  const url = `${mcpUrl}/health`;
  const { response } = await readJson(url);
  assert(response.ok, `${url} returned ${response.status}`);
  return 'MCP /health ok';
}

async function checkApiGraphStats(apiUrl) {
  const url = `${apiUrl}/api/graph/stats`;
  const { response, body } = await readJson(url);
  assert(response.ok, `${url} returned ${response.status}`);
  const hasKnownStat = ['obligations', 'obligationCount', 'regulations', 'jurisdictions']
    .some((key) => Object.prototype.hasOwnProperty.call(body ?? {}, key));
  assert(hasKnownStat, `${url} did not include graph stats`);
  return 'API public graph stats ok';
}

async function checkClerkWebhookEndpoint(apiUrl) {
  const url = `${apiUrl}/api/clerk-webhook`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'smoke.unsigned', data: {} }),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${url} did not return JSON. Status ${response.status}.`);
  }
  assert(response.status === 400, `${url} should reject unsigned smoke payloads with 400, returned ${response.status}`);
  assert(body?.error === 'Webhook verification failed', `${url} did not reject with the expected verification error`);
  return 'API Clerk webhook endpoint rejects unsigned payloads';
}

async function checkWebRoute(webUrl, path, label) {
  const url = `${webUrl}${path}`;
  const response = await fetchWithTimeout(url, {
    headers: { accept: 'text/html' },
  });
  const text = await response.text();
  assert(response.ok, `${url} returned ${response.status}`);
  assert(/<html/i.test(text), `${url} did not return HTML`);
  assert(/id=["']root["']/.test(text), `${url} did not include the React root`);
  return `Web ${label} route ok`;
}

async function run() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const apiUrl = normalizeBaseUrl(process.env.API_URL, 'API_URL');
  const webUrl = normalizeBaseUrl(process.env.WEB_URL, 'WEB_URL');
  const mcpUrl = process.env.MCP_URL ? normalizeBaseUrl(process.env.MCP_URL, 'MCP_URL') : null;
  const skipDeep = process.env.SMOKE_SKIP_DEEP === '1' || process.env.SMOKE_SKIP_DEEP === 'true';

  const checks = [
    () => checkApiHealth(apiUrl),
    () => checkApiReady(apiUrl, false),
    ...(skipDeep ? [] : [() => checkApiReady(apiUrl, true)]),
    () => checkApiGraphStats(apiUrl),
    () => checkClerkWebhookEndpoint(apiUrl),
    () => checkWebRoute(webUrl, '/', 'root'),
    () => checkWebRoute(webUrl, '/demo/psur', 'public PSUR simulation'),
    () => checkWebRoute(webUrl, '/app', 'protected app'),
    () => checkWebRoute(webUrl, '/app/psur/build', 'protected PSUR builder'),
    () => checkWebRoute(webUrl, '/pricing', 'pricing'),
    ...(mcpUrl ? [() => checkMcpHealth(mcpUrl)] : []),
  ];

  for (const check of checks) {
    const message = await check();
    console.log(`PASS ${message}`);
  }
  console.log('Production smoke test passed.');
}

run().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
