import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ChainVerifier,
  InMemoryTraceService,
  TraceExporter,
} from '@regground/core';
import type { AppContext } from '../context.js';
import { createTracesRouter } from './traces.js';

const servers: Server[] = [];

const OWN_PROCESS = 'psur-demo-11111111-1111-4111-8111-111111111111';
const OTHER_PROCESS = 'psur-demo-22222222-2222-4222-8222-222222222222';

function fakeGraph() {
  return {
    async getObligation(id: string) {
      return {
        id,
        obligationId: id,
        title: 'Traceable obligation',
        sourceCitation: 'EU MDR Art. 86',
        jurisdiction: 'EU',
        mandatory: true,
      };
    },
  };
}

async function startHarness() {
  const traceService = new InMemoryTraceService();
  const ownCtx = await traceService.startTrace(OWN_PROCESS, 'tenant-a');
  await traceService.logEvent(ownCtx, {
    eventType: 'psur.decision',
    actor: 'psur-pipeline',
    decision: 'Own tenant decision',
    reasons: ['Owned by tenant-a'],
    regulatoryContext: { obligationIds: ['EU-MDR.PSUR.001'] },
  });
  const otherCtx = await traceService.startTrace(OTHER_PROCESS, 'tenant-b');
  await traceService.logEvent(otherCtx, {
    eventType: 'psur.decision',
    actor: 'psur-pipeline',
    decision: 'Other tenant decision',
    reasons: ['Owned by tenant-b'],
    regulatoryContext: { obligationIds: ['EU-MDR.PSUR.001'] },
  });

  const context = {
    graph: fakeGraph(),
    traceService,
    chainVerifier: new ChainVerifier(traceService as never),
    traceExporter: new TraceExporter(traceService as never),
  } as unknown as AppContext;

  const app = express();
  app.use((req, _res, next) => {
    const tenantId = req.header('x-test-tenant') ?? 'tenant-a';
    req.tenantId = tenantId;
    req.user = { sub: `${tenantId}-user`, tenantId, roles: ['member'] };
    next();
  });
  app.use('/api/traces', createTracesRouter({ context }));

  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}` };
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('trace tenant isolation', () => {
  it('returns only traces owned by the caller tenant', async () => {
    const h = await startHarness();

    const own = await fetch(`${h.baseUrl}/api/traces/${OWN_PROCESS}`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as Array<{ decision?: string; tenantId?: string }>;
    expect(ownBody.some((entry) => entry.decision === 'Own tenant decision')).toBe(true);
    expect(ownBody.every((entry) => entry.tenantId === 'tenant-a')).toBe(true);

    const other = await fetch(`${h.baseUrl}/api/traces/${OTHER_PROCESS}`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(other.status).toBe(404);
  });

  it('protects verification and audit-pack exports with the same tenant check', async () => {
    const h = await startHarness();

    const verifyOwn = await fetch(`${h.baseUrl}/api/traces/${OWN_PROCESS}/verify`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(verifyOwn.status).toBe(200);
    const verification = (await verifyOwn.json()) as { valid: boolean; verifiedEntries: number };
    expect(verification.valid).toBe(true);
    expect(verification.verifiedEntries).toBeGreaterThan(0);

    const packOwn = await fetch(`${h.baseUrl}/api/traces/${OWN_PROCESS}/audit-pack?format=markdown`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(packOwn.status).toBe(200);
    expect(await packOwn.text()).toContain('Traceable obligation');

    const verifyOther = await fetch(`${h.baseUrl}/api/traces/${OTHER_PROCESS}/verify`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(verifyOther.status).toBe(404);

    const packOther = await fetch(`${h.baseUrl}/api/traces/${OTHER_PROCESS}/audit-pack?format=markdown`, {
      headers: { 'x-test-tenant': 'tenant-a' },
    });
    expect(packOther.status).toBe(404);
  });
});
