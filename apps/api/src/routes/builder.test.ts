import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Predicate = (row: Record<string, unknown>) => boolean;
type Field = { __table: string; __key: string };
type Table = { __name: string } & Record<string, Field | string>;

const fixtures = vi.hoisted(() => {
  function makeTable(name: string, keys: string[]): Table {
    const table: Record<string, Field | string> = { __name: name };
    for (const key of keys) table[key] = { __table: name, __key: key };
    return table as Table;
  }

  const schema = {
    builderAgents: makeTable('builderAgents', [
      'id',
      'tenantId',
      'createdBy',
      'name',
      'processId',
      'processTitle',
      'taskId',
      'regulations',
      'evidenceStatus',
      'attachedData',
      'guardrails',
      'outputFormat',
      'deployTarget',
      'riskBand',
      'description',
      'providerRuntime',
      'createdAt',
      'updatedAt',
    ]),
    managedAgentRuns: makeTable('managedAgentRuns', [
      'id',
      'tenantId',
      'builderAgentId',
      'provider',
      'externalAgentId',
      'externalAgentVersion',
      'externalEnvironmentId',
      'externalSessionId',
      'status',
      'inputSnapshot',
      'outputSnapshot',
      'eventLog',
      'finishedAt',
      'createdAt',
    ]),
    processWorkflows: makeTable('processWorkflows', [
      'id',
      'tenantId',
      'name',
      'processType',
      'jurisdiction',
      'description',
      'draft',
      'source',
      'sourceTemplateId',
      'createdAt',
      'updatedAt',
    ]),
  };

  class FakeQuery {
    private predicate: Predicate | null = null;
    private maxRows: number | null = null;
    private ordering: { field: Field; direction: 'desc' } | null = null;
    private table: Table | null = null;

    constructor(
      private readonly data: Record<string, Record<string, unknown>[]>,
      private readonly projection?: Record<string, Field>,
    ) {}

    from(table: Table) {
      this.table = table;
      return this;
    }
    where(predicate: Predicate) {
      this.predicate = predicate;
      return this;
    }
    orderBy(ordering?: { field: Field; direction: 'desc' }) {
      this.ordering = ordering ?? null;
      return this;
    }
    limit(n: number) {
      this.maxRows = n;
      return this;
    }
    private resolve(): Record<string, unknown>[] {
      if (!this.table) throw new Error('from(table) was not called');
      let rows = [...(this.data[this.table.__name] ?? [])];
      if (this.predicate) rows = rows.filter(this.predicate);
      if (this.ordering) {
        const key = this.ordering.field.__key;
        rows.sort((a, b) => String(b[key] ?? '').localeCompare(String(a[key] ?? '')));
      }
      if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
      if (!this.projection) return rows.map((row) => ({ ...row }));
      return rows.map((row) => Object.fromEntries(
        Object.entries(this.projection!).map(([alias, field]) => [alias, row[field.__key]]),
      ));
    }
    then<TResult1 = Record<string, unknown>[], TResult2 = never>(
      onfulfilled?: ((value: Record<string, unknown>[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
    }
  }

  class FakeInsert {
    private pendingValues: Record<string, unknown> = {};
    private conflictUpdate: { set: Record<string, unknown> } | null = null;
    constructor(private readonly table: Table, private readonly data: Record<string, Record<string, unknown>[]>) {}
    values(value: Record<string, unknown>) {
      this.pendingValues = value;
      return this;
    }
    onConflictDoUpdate(config: { set: Record<string, unknown> }) {
      this.conflictUpdate = config;
      return this;
    }
    async returning() {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const rows = this.data[this.table.__name] ??= [];
      if (this.conflictUpdate) {
        const existing = rows.find((row) => (
          row.tenantId === this.pendingValues.tenantId
          && row.name === this.pendingValues.name
        ));
        if (existing) {
          Object.assign(existing, this.conflictUpdate.set);
          return [{ ...existing }];
        }
      }
      const row = {
        id: typeof this.pendingValues.id === 'string' ? this.pendingValues.id : `${this.table.__name}-${rows.length + 1}`,
        createdAt: now,
        updatedAt: now,
        ...this.pendingValues,
      };
      rows.push(row);
      return [{ ...row }];
    }
  }

  class FakeUpdate {
    private patch: Record<string, unknown> = {};
    private predicate: Predicate = () => true;
    constructor(private readonly table: Table, private readonly data: Record<string, Record<string, unknown>[]>) {}
    set(patch: Record<string, unknown>) {
      this.patch = patch;
      return this;
    }
    where(predicate: Predicate) {
      this.predicate = predicate;
      return this;
    }
    async returning() {
      const rows = (this.data[this.table.__name] ?? []).filter(this.predicate);
      for (const row of rows) Object.assign(row, this.patch);
      return rows.map((row) => ({ ...row }));
    }
  }

  class FakeDelete {
    private predicate: Predicate = () => true;
    constructor(private readonly table: Table, private readonly data: Record<string, Record<string, unknown>[]>) {}
    where(predicate: Predicate) {
      this.predicate = predicate;
      return this;
    }
    async returning() {
      const kept: Record<string, unknown>[] = [];
      const removed: Record<string, unknown>[] = [];
      for (const row of this.data[this.table.__name] ?? []) {
        if (this.predicate(row)) removed.push(row);
        else kept.push(row);
      }
      this.data[this.table.__name] = kept;
      return removed.map((row) => ({ ...row }));
    }
  }

  class FakeDb {
    data: Record<string, Record<string, unknown>[]> = {
      builderAgents: [],
      managedAgentRuns: [],
      processWorkflows: [],
    };
    select(projection?: Record<string, Field>) {
      return new FakeQuery(this.data, projection);
    }
    insert(table: Table) { return new FakeInsert(table, this.data); }
    update(table: Table) { return new FakeUpdate(table, this.data); }
    delete(table: Table) { return new FakeDelete(table, this.data); }
  }

  const fakeDb = new FakeDb();

  const tenantScopes: string[] = [];

  return { schema, fakeDb, tenantScopes };
});

vi.mock('@regground/core', () => ({
  schema: fixtures.schema,
  getDB: () => fixtures.fakeDb,
  withTenant: async (
    db: typeof fixtures.fakeDb,
    tenantId: string,
    fn: (tx: typeof fixtures.fakeDb) => Promise<unknown>,
  ) => {
    fixtures.tenantScopes.push(tenantId);
    return fn(db);
  },
  eq: (field: Field, value: unknown): Predicate => (row) => row[field.__key] === value,
  and: (...predicates: Predicate[]): Predicate => (row) => predicates.every((predicate) => predicate(row)),
  desc: (field: Field) => ({ field, direction: 'desc' as const }),
  ObligationGraph: class {},
  KBCatalog: class {
    snapshot = vi.fn().mockResolvedValue({});
  },
  ProcessBuilderAgent: class {},
  LLMAbstraction: { fromEnv: vi.fn(() => ({})) },
  EmbeddingClient: { fromEnv: vi.fn(() => ({})) },
  SemanticContextBroker: class {},
  templateToWorkflowDraft: vi.fn(() => ({})),
  summarizeTemplate: vi.fn((definition: { id: string }) => definition),
  ManagedAgentError: class ManagedAgentError extends Error {
    statusCode = 500;
    body = '{}';
  },
  ManagedAgentClient: {
    fromEnv: vi.fn(() => ({
      config: { defaultTools: [] },
      createAgent: vi.fn(),
      createEnvironment: vi.fn(),
      deleteAgent: vi.fn(),
      createSession: vi.fn(),
      streamEvents: vi.fn(),
      sendEvents: vi.fn(),
    })),
  },
}));

vi.mock('@regground/sandbox', () => ({
  listTasks: () => [],
  getTask: () => null,
  ProcessRegistry: class {
    list() { return []; }
    get() { return null; }
  },
  registerAllProcesses: (registry: unknown) => registry,
}));

vi.mock('../services/AgentContextSynthesizer.js', () => ({
  synthesizeAgentContext: vi.fn(async () => ({
    systemPrompt: 'Grounded test prompt',
    personaSummary: 'Test persona',
    regulatoryFocus: ['EU MDR'],
    practicesIncorporated: ['Trace decisions'],
    generatedAt: '2026-01-01T00:00:00.000Z',
    model: null,
    source: 'deterministic',
  })),
}));

vi.mock('../services/ManagedAgentPromptManifest.js', () => ({
  buildPromptManifest: vi.fn(() => ({
    agentName: 'test-agent',
    model: 'claude-test',
    system: 'system prompt',
  })),
}));

vi.mock('./sandbox.js', () => ({
  getGroundedRunManifest: vi.fn(async (runId: string, tenantId: string) => ({
    runId,
    taskId: 'complaint-coder',
    taskName: 'Complaint coder',
    tenantId,
    mode: 'template',
    createdAtIso: '2026-01-01T00:00:00.000Z',
    inputSnapshot: { complaint: 'C-1' },
    outputSnapshot: { decision: 'pass' },
    obligationsConsulted: ['EU-MDR-86'],
    citations: ['EU MDR Art. 86'],
    validation: {
      coverage: 1,
      citationCount: 1,
      strictGatePass: true,
      violations: [],
      obligationsConsulted: 1,
    },
    trace: {
      entries: [],
      verification: { valid: true, verifiedEntries: 0, totalEntries: 0, signatureHash: 'hash' },
    },
    manifestHash: `manifest-${tenantId}-${runId}`,
  })),
}));

const builder = (await import('./builder.js')).default;
const managedAgents = (await import('./managed-agents.js')).default;

function app() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const tenantId = req.header('x-test-tenant') ?? 'tenant-a';
    req.tenantId = tenantId;
    req.user = { sub: `${tenantId}-user`, tenantId, roles: ['member'] };
    next();
  });
  app.use('/api/builder', builder);
  app.use('/api/builder', managedAgents);
  return app;
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

interface Harness {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startHarness(): Promise<Harness> {
  const server: Server = createServer(app());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function tenantHeaders(tenantId: string): HeadersInit {
  return { 'x-test-tenant': tenantId, 'Content-Type': 'application/json' };
}

async function postAgent(baseUrl: string, tenantId: string, body: Record<string, unknown> = agentPayload) {
  return fetch(`${baseUrl}/api/builder/agents`, {
    method: 'POST',
    headers: tenantHeaders(tenantId),
    body: JSON.stringify(body),
  });
}

async function postWorkflow(baseUrl: string, tenantId: string, body: Record<string, unknown> = workflowPayload) {
  return fetch(`${baseUrl}/api/builder/workflows`, {
    method: 'POST',
    headers: tenantHeaders(tenantId),
    body: JSON.stringify(body),
  });
}

const agentPayload = {
  name: 'Complaint Triage Agent',
  processId: 'complaint-triage',
  processTitle: 'Complaint Review Assistant',
  taskId: 'complaint-coder',
  regulations: ['EU MDR', 'ISO 13485'],
  evidenceStatus: { complaint: 'missing' },
  guardrails: { strictGate: true },
  outputFormat: 'json',
  riskBand: 'high',
  description: 'Tenant scoped test agent',
};

const workflowPayload = {
  name: 'Complaint intake workflow',
  processType: 'complaints',
  jurisdiction: 'EU',
  description: 'Tenant scoped process workflow',
  draft: {
    nodes: [
      { id: 'intake', kind: 'input', label: 'Complaint intake' },
      { id: 'triage', kind: 'agent', label: 'Reportability triage' },
    ],
    edges: [{ from: 'intake', to: 'triage' }],
  },
  source: 'manual',
};

describe('builder agent workspace tenant isolation', () => {
  beforeEach(() => {
    fixtures.fakeDb.data.builderAgents = [];
    fixtures.fakeDb.data.managedAgentRuns = [];
    fixtures.fakeDb.data.processWorkflows = [];
    fixtures.tenantScopes.length = 0;
  });

  it('keeps saved agent configurations scoped to the caller tenant', async () => {
    const h = await startHarness();
    try {
      const createdA = await postAgent(h.baseUrl, 'tenant-a');
      const createdB = await postAgent(h.baseUrl, 'tenant-b', {
        ...agentPayload,
        description: 'Same user-facing name, different tenant workspace.',
      });
      expect(createdA.status).toBe(201);
      expect(createdB.status).toBe(201);
      const agentA = await json(createdA);
      const agentB = await json(createdB);
      expect(agentA.tenantId).toBe('tenant-a');
      expect(agentB.tenantId).toBe('tenant-b');
      expect(agentA.id).not.toBe(agentB.id);

      const listA = await fetch(`${h.baseUrl}/api/builder/agents`, { headers: tenantHeaders('tenant-a') });
      expect(listA.status).toBe(200);
      const rowsA = await listA.json() as Array<Record<string, unknown>>;
      expect(rowsA.map((row) => row.id)).toEqual([agentA.id]);
      expect(rowsA.every((row) => row.tenantId === 'tenant-a')).toBe(true);

      const crossTenantFetch = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}`, {
        headers: tenantHeaders('tenant-a'),
      });
      expect(crossTenantFetch.status).toBe(404);

      const crossTenantRename = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}`, {
        method: 'PATCH',
        headers: tenantHeaders('tenant-a'),
        body: JSON.stringify({ name: 'Stolen agent name' }),
      });
      expect(crossTenantRename.status).toBe(404);

      const crossTenantAttach = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}/attach`, {
        method: 'PATCH',
        headers: tenantHeaders('tenant-a'),
        body: JSON.stringify({
          slot: 'complaint',
          filename: 'complaint.json',
          content: '{"complaint":"C-1"}',
          contentType: 'application/json',
        }),
      });
      expect(crossTenantAttach.status).toBe(404);

      const crossTenantDelete = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}`, {
        method: 'DELETE',
        headers: tenantHeaders('tenant-a'),
      });
      expect(crossTenantDelete.status).toBe(404);

      const stillThereForOwner = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}`, {
        headers: tenantHeaders('tenant-b'),
      });
      expect(stillThereForOwner.status).toBe(200);
      expect(fixtures.tenantScopes).toEqual(
        expect.arrayContaining(['tenant-a', 'tenant-b']),
      );
    } finally {
      await h.close();
    }
  });

  it('protects system-managed agent metadata slots from user attachments', async () => {
    const h = await startHarness();
    try {
      const created = await postAgent(h.baseUrl, 'tenant-a');
      expect(created.status).toBe(201);
      const agent = await json(created);

      const reservedAttach = await fetch(`${h.baseUrl}/api/builder/agents/${agent.id}/attach`, {
        method: 'PATCH',
        headers: tenantHeaders('tenant-a'),
        body: JSON.stringify({
          slot: '__input',
          filename: 'input.json',
          content: '{"unsafe":"overwrite"}',
          contentType: 'application/json',
        }),
      });
      expect(reservedAttach.status).toBe(400);
      expect(await json(reservedAttach)).toMatchObject({
        errors: expect.arrayContaining([
          expect.objectContaining({ message: 'slot names starting with "__" are reserved for system metadata' }),
        ]),
      });

      const reservedDelete = await fetch(`${h.baseUrl}/api/builder/agents/${agent.id}/attach/__context`, {
        method: 'DELETE',
        headers: tenantHeaders('tenant-a'),
      });
      expect(reservedDelete.status).toBe(400);
      expect(await json(reservedDelete)).toEqual({
        error: 'slot names starting with "__" are reserved for system metadata',
      });

      const fetched = await fetch(`${h.baseUrl}/api/builder/agents/${agent.id}`, {
        headers: tenantHeaders('tenant-a'),
      });
      expect(fetched.status).toBe(200);
      const body = await json(fetched);
      expect((body.attachedData as Record<string, unknown>).__context).toBeDefined();
      expect((body.attachedData as Record<string, unknown>).__input).toBeUndefined();
    } finally {
      await h.close();
    }
  });

  it('keeps managed-agent run history scoped by tenant and agent', async () => {
    const h = await startHarness();
    try {
      const createdA = await postAgent(h.baseUrl, 'tenant-a', {
        ...agentPayload,
        name: 'Tenant A managed agent',
        sourceRunId: 'run-a',
        deployTarget: 'claude-managed-agents',
      });
      const createdB = await postAgent(h.baseUrl, 'tenant-b', {
        ...agentPayload,
        name: 'Tenant B managed agent',
        sourceRunId: 'run-b',
        deployTarget: 'claude-managed-agents',
      });
      expect(createdA.status).toBe(201);
      expect(createdB.status).toBe(201);
      const agentA = await json(createdA);
      const agentB = await json(createdB);

      (fixtures.fakeDb.data.managedAgentRuns ??= []).push(
        {
          id: 'run-row-a',
          tenantId: 'tenant-a',
          builderAgentId: agentA.id,
          provider: 'claude-managed-agents',
          externalSessionId: 'session-a',
          status: 'completed',
          inputSnapshot: { message: 'tenant-a request' },
          outputSnapshot: { text: 'tenant-a answer' },
          eventLog: [],
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          finishedAt: new Date('2026-01-02T00:01:00.000Z'),
        },
        {
          id: 'run-row-b',
          tenantId: 'tenant-b',
          builderAgentId: agentB.id,
          provider: 'claude-managed-agents',
          externalSessionId: 'session-b',
          status: 'completed',
          inputSnapshot: { message: 'tenant-b request' },
          outputSnapshot: { text: 'tenant-b answer' },
          eventLog: [],
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
          finishedAt: new Date('2026-01-03T00:01:00.000Z'),
        },
      );

      const listA = await fetch(`${h.baseUrl}/api/builder/agents/${agentA.id}/runs`, {
        headers: tenantHeaders('tenant-a'),
      });
      expect(listA.status).toBe(200);
      const runsA = await listA.json() as Array<Record<string, unknown>>;
      expect(runsA.map((row) => row.id)).toEqual(['run-row-a']);
      expect(runsA.every((row) => row.tenantId === 'tenant-a')).toBe(true);

      const crossTenantRun = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}/runs/run-row-b`, {
        headers: tenantHeaders('tenant-a'),
      });
      expect(crossTenantRun.status).toBe(404);

      const crossTenantRunList = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}/runs`, {
        headers: tenantHeaders('tenant-a'),
      });
      expect(crossTenantRunList.status).toBe(200);
      expect(await crossTenantRunList.json()).toEqual([]);

      const ownerRun = await fetch(`${h.baseUrl}/api/builder/agents/${agentB.id}/runs/run-row-b`, {
        headers: tenantHeaders('tenant-b'),
      });
      expect(ownerRun.status).toBe(200);
      expect((await json(ownerRun)).tenantId).toBe('tenant-b');
      expect(fixtures.tenantScopes).toEqual(
        expect.arrayContaining(['tenant-a', 'tenant-b']),
      );
    } finally {
      await h.close();
    }
  });

  it('keeps saved process workflows scoped to the caller tenant', async () => {
    const h = await startHarness();
    try {
      const createdA = await postWorkflow(h.baseUrl, 'tenant-a');
      const createdB = await postWorkflow(h.baseUrl, 'tenant-b', {
        ...workflowPayload,
        description: 'Same workflow name in another tenant.',
      });
      expect(createdA.status).toBe(201);
      expect(createdB.status).toBe(201);
      const workflowA = await json(createdA);
      const workflowB = await json(createdB);
      expect(workflowA.tenantId).toBe('tenant-a');
      expect(workflowB.tenantId).toBe('tenant-b');
      expect(workflowA.id).not.toBe(workflowB.id);

      const listA = await fetch(`${h.baseUrl}/api/builder/workflows`, { headers: tenantHeaders('tenant-a') });
      expect(listA.status).toBe(200);
      const rowsA = await listA.json() as Array<Record<string, unknown>>;
      expect(rowsA.map((row) => row.id)).toEqual([workflowA.id]);
      expect(rowsA.every((row) => row.tenantId === undefined)).toBe(true);

      const crossTenantFetch = await fetch(`${h.baseUrl}/api/builder/workflows/${workflowB.id}`, {
        headers: tenantHeaders('tenant-a'),
      });
      expect(crossTenantFetch.status).toBe(404);

      const crossTenantUpdate = await fetch(`${h.baseUrl}/api/builder/workflows/${workflowB.id}`, {
        method: 'PATCH',
        headers: tenantHeaders('tenant-a'),
        body: JSON.stringify({ name: 'Cross tenant overwrite' }),
      });
      expect(crossTenantUpdate.status).toBe(404);

      const crossTenantDelete = await fetch(`${h.baseUrl}/api/builder/workflows/${workflowB.id}`, {
        method: 'DELETE',
        headers: tenantHeaders('tenant-a'),
      });
      expect(crossTenantDelete.status).toBe(404);

      const ownerFetch = await fetch(`${h.baseUrl}/api/builder/workflows/${workflowB.id}`, {
        headers: tenantHeaders('tenant-b'),
      });
      expect(ownerFetch.status).toBe(200);
      expect((await json(ownerFetch)).tenantId).toBe('tenant-b');
      expect(fixtures.tenantScopes).toEqual(
        expect.arrayContaining(['tenant-a', 'tenant-b']),
      );
    } finally {
      await h.close();
    }
  });
});
