import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthedRequest } from '../middleware/auth.js';
import harness, { resetHarnessRuns } from './harness.js';

const servers: Server[] = [];

async function start(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const tenantId = req.header('x-test-tenant');
    if (tenantId) {
      (req as AuthedRequest).user = { sub: `${tenantId}-user`, tenantId, roles: ['member'] };
      req.tenantId = tenantId;
    }
    next();
  });
  app.use('/api/sandbox/harness', harness);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

beforeEach(() => resetHarnessRuns());
afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()!;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
});

type SuiteList = { suites: { id: string; scenarioCount: number; agents: string[]; error?: string }[]; totals: { suites: number; scenarios: number } };
type RunResponse = {
  runId: string;
  summary: { total: number; passed: number; failed: number; ok: boolean; suites: number };
  suites: { id: string; results: { name: string; ok: boolean; qualificationStatus?: string }[] }[];
  catalog: { obligations: number };
};

describe('harness routes', () => {
  it('lists every shipped suite with parsed metadata', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/sandbox/harness/suites`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SuiteList;
    expect(body.totals.suites).toBeGreaterThanOrEqual(10);
    expect(body.totals.scenarios).toBeGreaterThanOrEqual(50);
    const capa = body.suites.find((s) => s.id === 'capa/capa-scenarios');
    expect(capa?.agents).toContain('CAPAInitiationAgent');
    expect(body.suites.every((s) => !s.error)).toBe(true);
  });

  it('runs a selected suite and stores the run per tenant', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/sandbox/harness/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-tenant': 'acme' },
      body: JSON.stringify({ suites: ['capa/capa-scenarios'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunResponse;
    expect(body.summary.suites).toBe(1);
    expect(body.summary.failed).toBe(0);
    expect(body.catalog.obligations).toBeGreaterThan(100);
    expect(body.suites[0]!.results.some((r) => r.qualificationStatus === 'BLOCKED')).toBe(true);

    const mine = await fetch(`${base}/api/sandbox/harness/runs/recent`, { headers: { 'x-test-tenant': 'acme' } });
    const mineBody = (await mine.json()) as { runs: { runId: string }[] };
    expect(mineBody.runs.map((r) => r.runId)).toEqual([body.runId]);

    const other = await fetch(`${base}/api/sandbox/harness/runs/recent`, { headers: { 'x-test-tenant': 'globex' } });
    expect(((await other.json()) as { runs: unknown[] }).runs).toEqual([]);

    const detail = await fetch(`${base}/api/sandbox/harness/runs/${body.runId}`, { headers: { 'x-test-tenant': 'globex' } });
    expect(detail.status).toBe(404);
    const own = await fetch(`${base}/api/sandbox/harness/runs/${body.runId}`, { headers: { 'x-test-tenant': 'acme' } });
    expect(own.status).toBe(200);
  });

  it('rejects unknown suite ids and malformed bodies', async () => {
    const base = await start();
    const unknown = await fetch(`${base}/api/sandbox/harness/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suites: ['nope/none'] }),
    });
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { detail: { unknown: string[] } }).detail.unknown).toEqual(['nope/none']);

    const bad = await fetch(`${base}/api/sandbox/harness/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suites: 'capa' }),
    });
    expect(bad.status).toBe(400);
  });
});
