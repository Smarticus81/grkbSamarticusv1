import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/auth.js';

const tenantScopes: string[] = [];
let runCounter = 0;

vi.mock('@regground/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@regground/core')>();
  const fakeDb = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  };
  return {
    ...actual,
    getDB: vi.fn(() => fakeDb),
    withTenant: vi.fn(async (_db: unknown, tenantId: string, fn: (db: typeof fakeDb) => Promise<unknown>) => {
      tenantScopes.push(tenantId);
      return fn(fakeDb);
    }),
    LLMAbstraction: {
      fromEnv: vi.fn(() => {
        throw new Error('no model provider in route test');
      }),
    },
    assembleAuditPack: vi.fn(async (input: unknown) => input),
    renderAuditPackMarkdown: vi.fn(() => '# audit pack'),
  };
});

vi.mock('@regground/sandbox', () => {
  const task = {
    id: 'mock-task',
    name: 'Mock agent task',
    oneLiner: 'Exercise sandbox route isolation.',
    regulation: 'EU MDR',
    jurisdiction: 'EU',
    processId: 'mock-process',
    sampleData: { message: 'hello' },
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ ok: z.boolean(), citations: z.array(z.string()) }),
    claimedObligationIds: ['OBL-1'],
    obligationChecks: [],
    runWithGraph: vi.fn(),
    runWithoutGraph: vi.fn(),
  };

  class TaskEventStream {
    publish(_event: unknown): void {
      // The router wraps publish to capture events before replay.
    }
  }

  class TaskRunner {
    async run(def: typeof task, input: unknown, opts: { stream?: { publish(event: unknown): void }; mode: string }) {
      runCounter += 1;
      const runId = `sandbox-run-${runCounter}`;
      const atIso = `2026-06-13T00:00:0${runCounter}.000Z`;
      opts.stream?.publish({ type: 'run.started', lane: 'with-graph', runId, taskId: def.id, atIso });
      opts.stream?.publish({ type: 'run.completed', lane: 'with-graph', runId, atIso, durationMs: 1 });
      return {
        runId,
        taskId: def.id,
        startedAtIso: atIso,
        finishedAtIso: atIso,
        withGraph: {
          lane: 'with-graph',
          output: { ok: true, citations: ['EU MDR Art. 86'] },
          durationMs: 1,
          citations: ['EU MDR Art. 86'],
          obligationsConsulted: ['OBL-1'],
          score: {
            coverage: 1,
            citations: 1,
            strictGatePass: true,
            violations: [],
            obligationsConsulted: 1,
          },
        },
      };
      void input;
      void opts.mode;
    }
  }

  return {
    TaskRunner,
    TaskEventStream,
    taskEventToSSE: (event: unknown) => `event: ${(event as { type?: string }).type ?? 'message'}\ndata: ${JSON.stringify(event)}\n\n`,
    listTasks: () => [task],
    getTask: (id: string) => (id === task.id ? task : undefined),
    judgeLane: vi.fn(async () => ({ passed: true, rationale: 'tenant-owned run only' })),
  };
});

const sandbox = (await import('./sandbox.js')).default;

const servers: Server[] = [];

async function startHarness(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
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
  app.use('/api/sandbox', sandbox);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  tenantScopes.length = 0;
});

async function startRun(baseUrl: string, tenantId: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/sandbox/tasks/mock-task/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-tenant': tenantId },
    body: JSON.stringify({ input: { message: tenantId }, mode: 'with-graph' }),
  });
  expect(res.status).toBe(202);
  const body = (await res.json()) as { runId: string };
  return body.runId;
}

describe('sandbox run workspace isolation', () => {
  it('keeps run history and replay endpoints scoped to the caller tenant', async () => {
    const h = await startHarness();
    const runA = await startRun(h.baseUrl, 'tenant-a');
    const runB = await startRun(h.baseUrl, 'tenant-b');

    const recentA = await fetch(`${h.baseUrl}/api/sandbox/runs/recent`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(recentA.status).toBe(200);
    const recentBody = (await recentA.json()) as { runs: Array<{ runId: string }> };
    expect(recentBody.runs.map((run) => run.runId)).toContain(runA);
    expect(recentBody.runs.map((run) => run.runId)).not.toContain(runB);

    const protectedGetEndpoints = [
      `/api/sandbox/runs/${runB}/result`,
      `/api/sandbox/runs/${runB}/trace`,
      `/api/sandbox/runs/${runB}/trace/verify`,
      `/api/sandbox/runs/${runB}/audit-pack`,
    ];
    for (const path of protectedGetEndpoints) {
      const res = await fetch(`${h.baseUrl}${path}`, { headers: { 'x-test-tenant': 'tenant-a' } });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'run not found' });
    }

    const crossTenantJudge = await fetch(`${h.baseUrl}/api/sandbox/runs/${runB}/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-tenant': 'tenant-a' },
      body: JSON.stringify({}),
    });
    expect(crossTenantJudge.status).toBe(404);
    expect(await crossTenantJudge.json()).toEqual({ error: 'run not found' });

    const ownerResult = await fetch(`${h.baseUrl}/api/sandbox/runs/${runB}/result`, {
      headers: { 'x-test-tenant': 'tenant-b' },
    });
    expect(ownerResult.status).toBe(200);

    const crossTenantStream = await fetch(`${h.baseUrl}/api/sandbox/runs/${runB}/stream`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(crossTenantStream.status).toBe(404);
    expect(await crossTenantStream.json()).toEqual({ error: 'run not found' });

    expect(tenantScopes).toEqual(expect.arrayContaining(['tenant-a', 'tenant-b']));
  });

  it('rejects sandbox run access when no tenant context is attached', async () => {
    const h = await startHarness();
    const res = await fetch(`${h.baseUrl}/api/sandbox/tasks/mock-task/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { message: 'no tenant' } }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no tenant context' });
  });
});
