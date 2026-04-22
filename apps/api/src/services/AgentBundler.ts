/**
 * AgentBundler — packages a task agent definition into a downloadable ZIP
 * the user can run locally. The bundle ships a small HTML/JS runner that
 * relays runs back to the Smarticus API; it does NOT contain any model
 * weights or local agent logic. Without a valid `signature` (HMAC over
 * taskId+tenantId+apiKey+issuedAt), the API will reject calls — so the
 * agent is functionally bound to the Smarticus knowledge graph.
 */

import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import type { TaskAgentDefinition } from '@regground/sandbox';
import { buildZip } from './zip.js';

interface BundleInput {
  def: TaskAgentDefinition<any, any>;
  tenantId: string;
  apiKey: string;
  baseUrl: string;
}

interface BundleOutput {
  buffer: Buffer;
  filename: string;
}

export interface BundleManifest {
  taskId: string;
  taskName: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  obligations: Array<{ obligationId: string; citation: string; regulation: string; summary: string }>;
  sampleData: unknown;
  apiBaseUrl: string;
  apiKey: string;
  tenantId: string;
  issuedAtIso: string;
  signature: string;
  signatureVersion: 'v1';
  /** Human-readable note about graph binding. */
  notice: string;
}

function signManifest(parts: { taskId: string; tenantId: string; apiKey: string; issuedAtIso: string }): string {
  const secret = process.env.JWT_SECRET ?? 'change-me';
  const payload = `${parts.taskId}|${parts.tenantId}|${parts.apiKey}|${parts.issuedAtIso}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyManifestSignature(parts: {
  taskId: string;
  tenantId: string;
  apiKey: string;
  issuedAtIso: string;
  signature: string;
}): boolean {
  return signManifest(parts) === parts.signature;
}

export async function buildAgentBundle(input: BundleInput): Promise<BundleOutput> {
  const { def, tenantId, apiKey, baseUrl } = input;
  const issuedAtIso = new Date().toISOString();
  const signature = signManifest({ taskId: def.id, tenantId, apiKey, issuedAtIso });

  const manifest: BundleManifest = {
    taskId: def.id,
    taskName: def.name,
    oneLiner: def.oneLiner,
    regulation: def.regulation,
    jurisdiction: def.jurisdiction,
    obligations: def.obligations.map((o) => ({
      obligationId: o.obligationId,
      citation: o.citation,
      regulation: o.regulation,
      summary: o.summary,
    })),
    sampleData: def.sampleData,
    apiBaseUrl: baseUrl,
    apiKey,
    tenantId,
    issuedAtIso,
    signature,
    signatureVersion: 'v1',
    notice:
      'This agent is bound to the Smarticus regulatory knowledge graph. ' +
      'It cannot reason about regulations on its own — every run is relayed to ' +
      'the Smarticus API for grounded execution.',
  };

  const html = renderHtml(def);
  const runner = renderRunner();
  const readme = renderReadme(def, baseUrl);
  const license = `Smarticus by Thinkertons — sandbox agent bundle.\nIssued ${issuedAtIso}.\nFor internal evaluation only.\n`;

  const buffer = buildZip([
    { path: 'index.html', content: html },
    { path: 'runner.js', content: runner },
    { path: 'agent.json', content: JSON.stringify(manifest, null, 2) },
    { path: 'README.txt', content: readme },
    { path: 'LICENSE.txt', content: license },
  ]);

  return { buffer, filename: `smarticus-${def.id}.zip` };
}

function renderHtml(def: TaskAgentDefinition<any, any>): string {
  const escapedName = escapeHtml(def.name);
  const escapedTagline = escapeHtml(def.oneLiner);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapedName} · Smarticus by Thinkertons</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --ink: #0E2A47; --ink-2: #2C3E55; --ink-3: #5C6B7A;
      --paper: #F1EFE9; --paper-2: #E8E4DA; --rule: #0E2A471A;
      --orange: #FA500F; --orange-deep: #E04408;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0; background: var(--paper); color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
      font-size: 14px; line-height: 1.55;
    }
    .shell { max-width: 980px; margin: 0 auto; padding: 48px 32px 80px; }
    header { border-bottom: 1px solid var(--rule); padding-bottom: 28px; margin-bottom: 32px; }
    .eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 14px; }
    h1 { margin: 0 0 8px 0; font-size: 32px; letter-spacing: -0.01em; font-weight: 600; }
    .sub { color: var(--ink-2); font-size: 15px; max-width: 56ch; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
    .card { background: #fff; border: 1px solid var(--rule); padding: 22px; }
    .card h2 { margin: 0 0 14px 0; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-3); font-weight: 600; }
    pre { background: var(--paper-2); padding: 14px; overflow: auto; font-size: 12px; line-height: 1.5; margin: 0; max-height: 320px; }
    button {
      background: var(--orange); color: #fff; border: 0; padding: 14px 24px;
      font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600;
      cursor: pointer; transition: background 0.15s ease;
    }
    button:hover { background: var(--orange-deep); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .stream { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px;
              background: var(--ink); color: #F1EFE9; padding: 18px; min-height: 240px;
              max-height: 420px; overflow: auto; white-space: pre-wrap; }
    .stream .cite { color: #FF7A3D; }
    .stream .ok { color: #6FCF97; }
    .stream .miss { color: #FF7A3D; }
    .banner {
      background: var(--ink); color: #F1EFE9; padding: 14px 18px; margin-bottom: 24px;
      font-size: 12px; letter-spacing: 0.06em;
    }
    .banner .dot { display: inline-block; width: 8px; height: 8px; background: var(--orange);
                   border-radius: 50%; margin-right: 10px; vertical-align: middle; }
    .err { background: #B00020; }
    footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--rule);
             color: var(--ink-3); font-size: 11px; letter-spacing: 0.14em;
             text-transform: uppercase; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="eyebrow">Smarticus · downloadable agent</div>
      <h1>${escapedName}</h1>
      <p class="sub">${escapedTagline}</p>
    </header>

    <div id="banner" class="banner">
      <span class="dot"></span>Bound to the Smarticus knowledge graph. Every run is relayed to the Smarticus API.
    </div>

    <div class="grid">
      <div class="card">
        <h2>Sample input</h2>
        <pre id="sample"></pre>
        <div style="margin-top: 18px;">
          <button id="run">Run agent</button>
        </div>
      </div>
      <div class="card">
        <h2>Live activity</h2>
        <div id="stream" class="stream">Idle. Press “Run agent”.</div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <h2>Result</h2>
      <pre id="result">No run yet.</pre>
    </div>

    <footer>
      <div>Smarticus · ${escapeHtml(def.regulation)}</div>
      <div>Built by Thinkertons</div>
    </footer>
  </div>
  <script src="runner.js"></script>
</body>
</html>
`;
}

function renderRunner(): string {
  return `(async function () {
  const manifest = await fetch('agent.json').then((r) => r.json());
  const sampleEl  = document.getElementById('sample');
  const streamEl  = document.getElementById('stream');
  const resultEl  = document.getElementById('result');
  const runBtn    = document.getElementById('run');
  const bannerEl  = document.getElementById('banner');

  sampleEl.textContent = JSON.stringify(manifest.sampleData, null, 2);

  function append(line, cls) {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = line + '\\n';
    streamEl.appendChild(span);
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  function laymanLine(e) {
    switch (e.type) {
      case 'run.started':           return '> Run started · lane: ' + e.lane;
      case 'agent.thinking':        return '· ' + e.message;
      case 'graph.query':           return '? graph.' + e.method + ' → ' + e.resultCount + ' result(s) · ' + e.message;
      case 'graph.cite':            return ['cite', '✓ ' + e.citation + ' — ' + e.summary];
      case 'obligation.satisfied':  return ['ok',   '✓ satisfied · ' + e.obligationId];
      case 'obligation.missed':     return ['miss', '✗ missed · ' + e.obligationId];
      case 'output.gated':          return e.passed ? ['ok', '✓ StrictGate passed'] : ['miss', '✗ StrictGate failed: ' + e.violations.join(', ')];
      case 'run.completed':         return '> Run completed in ' + e.durationMs + 'ms · lane: ' + e.lane;
      case 'run.error':             return ['miss', '✗ Error: ' + e.message];
      default:                       return '· ' + e.type;
    }
  }

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    streamEl.textContent = '';
    resultEl.textContent = 'Running…';
    try {
      const startResp = await fetch(manifest.apiBaseUrl + '/api/sandbox/tasks/' + manifest.taskId + '/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + manifest.apiKey,
          'X-Smarticus-Signature':   manifest.signature,
          'X-Smarticus-Tenant':       manifest.tenantId,
          'X-Smarticus-Issued-At':    manifest.issuedAtIso,
        },
        body: JSON.stringify({ input: manifest.sampleData, mode: 'with-graph' }),
      });
      if (startResp.status === 401 || startResp.status === 403) {
        bannerEl.classList.add('err');
        bannerEl.innerHTML = '<span class="dot"></span>This agent requires the Smarticus knowledge graph to function.';
        resultEl.textContent = 'Rejected by Smarticus API: ' + startResp.status;
        runBtn.disabled = false;
        return;
      }
      if (!startResp.ok) throw new Error('start failed: ' + startResp.status);
      const start = await startResp.json();

      const es = new EventSource(manifest.apiBaseUrl + '/api/sandbox/runs/' + start.runId + '/stream');
      const seen = ['run.started','agent.thinking','graph.query','graph.cite','obligation.satisfied','obligation.missed','output.gated','run.completed','run.error'];
      seen.forEach((t) => es.addEventListener(t, (ev) => {
        const data = JSON.parse(ev.data);
        const line = laymanLine(data);
        if (Array.isArray(line)) append(line[1], line[0]); else append(line);
      }));
      es.addEventListener('stream.end', async () => {
        es.close();
        const r = await fetch(manifest.apiBaseUrl + '/api/sandbox/runs/' + start.runId + '/result', {
          headers: { 'Authorization': 'Bearer ' + manifest.apiKey },
        }).then((x) => x.json());
        resultEl.textContent = JSON.stringify(r, null, 2);
        runBtn.disabled = false;
      });
    } catch (err) {
      append('✗ ' + (err && err.message ? err.message : String(err)), 'miss');
      resultEl.textContent = 'Run failed.';
      runBtn.disabled = false;
    }
  });
})();
`;
}

function renderReadme(def: TaskAgentDefinition<any, any>, baseUrl: string): string {
  return [
    `${def.name} — Smarticus by Thinkertons`,
    `${def.oneLiner}`,
    ``,
    `HOW TO RUN`,
    `  1. Double-click index.html (or open it in any modern browser).`,
    `  2. Click "Run agent".`,
    ``,
    `WHAT'S INSIDE`,
    `  - index.html       Brand-styled UI for the agent`,
    `  - runner.js        Vanilla JS that relays runs to the Smarticus API`,
    `  - agent.json       Signed manifest (taskId, sampleData, signature)`,
    `  - README.txt       This file`,
    `  - LICENSE.txt`,
    ``,
    `IMPORTANT`,
    `  This agent is bound to the Smarticus knowledge graph.`,
    `  Every run is relayed to: ${baseUrl}/api/sandbox`,
    `  Without a valid Smarticus signature the API will refuse the call.`,
    ``,
    `REGULATION SCOPE`,
    `  ${def.regulation} (${def.jurisdiction})`,
    ``,
  ].join('\r\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
