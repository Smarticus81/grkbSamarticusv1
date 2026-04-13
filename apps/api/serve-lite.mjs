/**
 * Lightweight standalone API server — uses Node built-in http + neo4j-driver only.
 * No express, no monorepo deps.
 * Run: node apps/api/serve-lite.mjs
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
try {
  const envPath = resolve(__dirname, '../../.env');
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* no .env */ }

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD;

if (!uri || !password) {
  console.error('Missing NEO4J_URI or NEO4J_PASSWORD');
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

// Verify connection
try {
  const session = driver.session({ database: 'neo4j' });
  const result = await session.run('MATCH (n) RETURN count(n) AS count');
  const count = result.records[0].get('count').toNumber?.() ?? result.records[0].get('count');
  console.log(`Connected to Neo4j — ${count} nodes`);
  await session.close();
} catch (e) {
  console.error('Failed to connect to Neo4j:', e.message);
  process.exit(1);
}

async function runQuery(cypher, params = {}) {
  const session = driver.session({ database: 'neo4j' });
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

function toNum(v) { return v?.toNumber?.() ?? v ?? 0; }

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

// Route handler
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  try {
    // Health
    if (path === '/health') {
      return json(res, { status: 'ok', service: 'smarticus-api', version: '0.1.0' });
    }

    // GET /api/graph/obligations-by-regulation
    if (path === '/api/graph/obligations-by-regulation' && method === 'GET') {
      const result = await runQuery(
        `MATCH (o:Obligation)
         RETURN o.obligationId AS id, o.title AS title, o.text AS text,
                o.sourceCitation AS citation, o.jurisdiction AS jurisdiction,
                o.processType AS processType, o.artifactType AS artifactType,
                o.kind AS kind, o.mandatory AS mandatory
         ORDER BY o.obligationId`
      );
      const obligations = result.records.map((r) => ({
        id: r.get('id'),
        title: r.get('title'),
        text: r.get('text'),
        citation: r.get('citation'),
        jurisdiction: r.get('jurisdiction'),
        processType: r.get('processType'),
        artifactType: r.get('artifactType'),
        kind: r.get('kind'),
        mandatory: r.get('mandatory') ?? true,
      }));

      // Derive regulation key from citation + jurisdiction
      function deriveRegKey(o) {
        const cit = (o.citation || '').toLowerCase();
        const jur = (o.jurisdiction || '').toUpperCase();
        if (cit.includes('21 cfr') || jur === 'FDA') return 'CFR_820';
        if (cit.includes('mdcg 2022-21')) return 'MDCG_2022_21';
        if (cit.includes('regulation (eu) 2017/745') || jur === 'EU_MDR') return 'EU_MDR';
        if (cit.includes('iso 14971')) return 'ISO_14971';
        if (cit.includes('iso 13485')) return 'ISO_13485';
        if (cit.includes('uk mdr') || jur === 'UK_MHRA') return 'UK_MDR';
        if (cit.includes('imdrf') && (cit.includes('coding') || o.artifactType === 'CODING')) return 'IMDRF_CODING';
        if (cit.includes('imdrf')) return 'IMDRF_AE';
        // Fallback: use jurisdiction or artifactType
        if (jur === 'EU') return 'EU_MDR';
        return o.artifactType || 'UNKNOWN';
      }

      const grouped = {};
      for (const o of obligations) {
        const key = deriveRegKey(o);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(o);
      }
      return json(res, { regulations: grouped, total: obligations.length });
    }

    // GET /api/graph/stats
    if (path === '/api/graph/stats' && method === 'GET') {
      const [countRes, jurRes, procRes] = await Promise.all([
        runQuery('MATCH (o:Obligation) RETURN count(o) AS total'),
        runQuery('MATCH (o:Obligation) RETURN o.jurisdiction AS jurisdiction, count(o) AS count ORDER BY count DESC'),
        runQuery('MATCH (o:Obligation) RETURN o.processType AS processType, count(o) AS count ORDER BY count DESC'),
      ]);
      return json(res, {
        total: toNum(countRes.records[0]?.get('total')),
        jurisdictions: jurRes.records.map((r) => ({ jurisdiction: r.get('jurisdiction'), count: toNum(r.get('count')) })),
        processTypes: procRes.records.map((r) => ({ processType: r.get('processType'), count: toNum(r.get('count')) })),
      });
    }

    // GET /api/graph/process-types
    if (path === '/api/graph/process-types' && method === 'GET') {
      const result = await runQuery('MATCH (o:Obligation) RETURN DISTINCT o.processType AS pt ORDER BY pt');
      return json(res, { processTypes: result.records.map((r) => r.get('pt')).filter(Boolean) });
    }

    // GET /api/graph/obligations
    if (path === '/api/graph/obligations' && method === 'GET') {
      const processType = url.searchParams.get('processType') ?? '';
      const jurisdiction = url.searchParams.get('jurisdiction') ?? 'GLOBAL';
      if (!processType) return json(res, { error: 'processType required' }, 400);
      const result = await runQuery(
        `MATCH (o:Obligation)
         WHERE o.processType = $processType AND (o.jurisdiction = $jurisdiction OR o.jurisdiction = 'GLOBAL')
         RETURN o.obligationId AS id, o.title AS title, o.text AS text,
                o.sourceCitation AS citation, o.mandatory AS mandatory
         ORDER BY o.obligationId`,
        { processType, jurisdiction }
      );
      return json(res, {
        obligations: result.records.map((r) => ({
          obligationId: r.get('id'), title: r.get('title'), text: r.get('text'),
          sourceCitation: r.get('citation'), mandatory: r.get('mandatory') ?? true,
        })),
      });
    }

    // GET /api/graph/obligations/:id
    const oblMatch = path.match(/^\/api\/graph\/obligations\/([^/]+)$/);
    if (oblMatch && method === 'GET') {
      const result = await runQuery(
        `MATCH (o:Obligation {obligationId: $id})
         RETURN o.obligationId AS id, o.title AS title, o.text AS text,
                o.sourceCitation AS citation, o.jurisdiction AS jurisdiction,
                o.processType AS processType, o.artifactType AS artifactType,
                o.kind AS kind, o.mandatory AS mandatory LIMIT 1`,
        { id: oblMatch[1] }
      );
      if (!result.records.length) return json(res, { error: 'not found' }, 404);
      const r = result.records[0];
      return json(res, {
        obligationId: r.get('id'), title: r.get('title'), text: r.get('text'),
        sourceCitation: r.get('citation'), jurisdiction: r.get('jurisdiction'),
        processType: r.get('processType'), artifactType: r.get('artifactType'),
        kind: r.get('kind'), mandatory: r.get('mandatory') ?? true,
      });
    }

    // GET /api/api-keys
    if (path === '/api/api-keys' && method === 'GET') {
      return json(res, [{
        id: 'demo-key-1', keyPrefix: 'sk-demo', name: 'Demo API Key',
        status: 'active', createdAt: new Date().toISOString(), lastUsed: null,
      }]);
    }

    // POST /api/api-keys
    if (path === '/api/api-keys' && method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: 'new-key-' + Date.now(),
        key: 'sk-smarticus-' + Math.random().toString(36).slice(2, 18),
        name: body?.name ?? 'New Key',
      }, 201);
    }

    // GET /api/traces/:pid
    const traceMatch = path.match(/^\/api\/traces\/([^/]+)$/);
    if (traceMatch && method === 'GET') {
      const pid = traceMatch[1];
      return json(res, [
        {
          id: 'trace-1', processId: pid, timestamp: new Date().toISOString(),
          agentId: 'psur-generator', action: 'qualify', decision: 'PASS',
          reasoning: 'All prerequisites met for PSUR generation',
          obligationId: 'EU_MDR_ART_86_PSUR_SCOPE',
          payload: { processType: 'psur_generation', jurisdiction: 'EU', sectionsPlanned: 8 },
        },
        {
          id: 'trace-2', processId: pid, timestamp: new Date(Date.now() + 1000).toISOString(),
          agentId: 'psur-generator', action: 'validate', decision: 'PASS',
          reasoning: 'Section 1 — Scope and Introduction complies with EU MDR Art 86 and MDCG 2022-21',
          obligationId: 'EU_MDR_ART_86_PSUR_SCOPE',
          payload: { section: 'Scope and Introduction', requirementsChecked: 4, allSatisfied: true },
        },
        {
          id: 'trace-3', processId: pid, timestamp: new Date(Date.now() + 2000).toISOString(),
          agentId: 'psur-generator', action: 'validate', decision: 'PASS',
          reasoning: 'Section 2 — Benefit-Risk Analysis complies with ISO 14971 and EU MDR Art 86',
          obligationId: 'ISO_14971_RISK_BENEFIT',
          payload: { section: 'Benefit-Risk Analysis', requirementsChecked: 6, allSatisfied: true },
        },
        {
          id: 'trace-4', processId: pid, timestamp: new Date(Date.now() + 3000).toISOString(),
          agentId: 'psur-generator', action: 'validate', decision: 'PASS',
          reasoning: 'Section 3 — Post-Market Surveillance Data Review meets vigilance reporting requirements',
          obligationId: 'EU_MDR_ART_87_VIGILANCE',
          payload: { section: 'PMS Data Review', requirementsChecked: 5, allSatisfied: true },
        },
        {
          id: 'trace-5', processId: pid, timestamp: new Date(Date.now() + 4000).toISOString(),
          agentId: 'psur-generator', action: 'trace', decision: 'COMPLETE',
          reasoning: 'PSUR generation complete — all 4 sections validated against 15 requirements across EU MDR, ISO 14971, MDCG 2022-21',
          obligationId: null,
          payload: { totalSections: 4, totalRequirements: 15, result: 'compliant' },
        },
      ]);
    }

    // GET /api/traces/:pid/verify
    const verifyMatch = path.match(/^\/api\/traces\/([^/]+)\/verify$/);
    if (verifyMatch && method === 'GET') {
      return json(res, {
        processId: verifyMatch[1], valid: true, chainLength: 5,
        verifiedAt: new Date().toISOString(),
      });
    }

    // 404
    json(res, { error: 'not found' }, 404);
  } catch (e) {
    console.error(`Error: ${method} ${path}`, e.message);
    json(res, { error: e.message }, 500);
  }
}

const port = Number(process.env.API_PORT ?? 4000);
const server = createServer(handleRequest);
server.listen(port, '0.0.0.0', () => {
  console.log(`Smarticus API listening on http://0.0.0.0:${port}`);
  console.log('Routes: /api/graph/*, /api/traces/*, /api/api-keys, /health');
});
