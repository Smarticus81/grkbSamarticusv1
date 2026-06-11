#!/usr/bin/env node
/**
 * Smoke test for the built MCP server.
 *
 * Spawns dist/index.js in stdio mode with dummy Neo4j credentials (the driver
 * connects lazily, so initialize + tools/list never touch the database),
 * performs the MCP handshake, and asserts that all 12 tools are registered.
 *
 * Run with: npm run smoke   (requires npm run build first)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '../dist/index.js');

const EXPECTED_TOOLS = [
  'regground_discover_obligations',
  'regground_get_obligation',
  'regground_explain_obligation',
  'regground_search_obligations',
  'regground_get_evidence_requirements',
  'regground_find_obligation_path',
  'regground_check_qualification',
  'regground_validate_compliance',
  'regground_get_graph_stats',
  'regground_list_process_types',
  'regground_list_jurisdictions',
  'regground_get_definition',
];

const TIMEOUT_MS = 15000;

function fail(message, stderr) {
  console.error(`SMOKE FAIL: ${message}`);
  if (stderr) console.error(`--- server stderr ---\n${stderr}`);
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath], {
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USER: 'smoke-test',
    NEO4J_PASSWORD: 'smoke-test',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdoutBuffer = '';
let stderrBuffer = '';
let done = false;

const timer = setTimeout(() => {
  if (done) return;
  child.kill();
  fail(`timed out after ${TIMEOUT_MS}ms waiting for tools/list response`, stderrBuffer);
}, TIMEOUT_MS);

child.stderr.on('data', (chunk) => {
  stderrBuffer += chunk.toString();
});

child.on('error', (err) => {
  if (done) return;
  clearTimeout(timer);
  fail(`failed to spawn server: ${err.message}. Did you run "npm run build"?`);
});

child.on('exit', (code) => {
  if (done) return;
  clearTimeout(timer);
  fail(`server exited early with code ${code}`, stderrBuffer);
});

child.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString();
  // MCP stdio transport frames messages as newline-delimited JSON.
  const lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    handleMessage(message);
  }
});

function send(message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'regground-smoke', version: '0.0.0' },
  },
});

function handleMessage(message) {
  if (message.id === 1) {
    if (message.error) {
      finish(() => fail(`initialize failed: ${JSON.stringify(message.error)}`, stderrBuffer));
      return;
    }
    const serverName = message.result?.serverInfo?.name;
    console.log(`initialized: ${serverName} (protocol ${message.result?.protocolVersion})`);
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    return;
  }

  if (message.id === 2) {
    if (message.error) {
      finish(() => fail(`tools/list failed: ${JSON.stringify(message.error)}`, stderrBuffer));
      return;
    }
    const tools = (message.result?.tools ?? []).map((t) => t.name);
    const missing = EXPECTED_TOOLS.filter((name) => !tools.includes(name));
    const unexpected = tools.filter((name) => !EXPECTED_TOOLS.includes(name));

    if (missing.length > 0) {
      finish(() => fail(`missing tools: ${missing.join(', ')}`, stderrBuffer));
      return;
    }
    if (unexpected.length > 0) {
      finish(() =>
        fail(
          `unexpected tools (update EXPECTED_TOOLS in scripts/smoke.mjs and the README): ${unexpected.join(', ')}`,
          stderrBuffer,
        ),
      );
      return;
    }

    finish(() => {
      console.log(`SMOKE PASS: ${tools.length}/${EXPECTED_TOOLS.length} tools registered over stdio`);
      process.exit(0);
    });
  }
}

function finish(report) {
  done = true;
  clearTimeout(timer);
  child.kill();
  report();
}
