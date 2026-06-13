import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { ChainVerifier, InMemoryTraceService, type DecisionTraceEntry } from '@regground/core';
import { createPsurRouter, type PsurTraceService } from './psur.js';
import { CitationResolver, type CitationGraph } from '../psur/obligation-map.js';

// ---------------------------------------------------------------------------
// Fixtures: a scripted fake Python PSUR service injected as fetchImpl
// ---------------------------------------------------------------------------

const DEFAULTS_PAYLOAD = {
  period: { start: '2025-01-01', end: '2025-12-31' },
  inputs: {
    sales: {
      kind: 'table',
      columns: [
        { name: 'region', type: 'string', required: true },
        { name: 'units', type: 'integer', required: true },
      ],
      rows: [
        { region: 'EEA', units: 1200 },
        { region: 'UK', units: 300 },
      ],
    },
    device_context: {
      kind: 'json',
      value: { device_name: 'Acme Stapler', device_class: 'IIb' },
    },
  },
} as const;

const RUN_REQUEST = {
  period: { start: '2025-01-01', end: '2025-12-31' },
  inputs: {
    sales: { rows: [{ region: 'EEA', units: 1200 }] },
    device_context: { value: { device_name: 'Acme Stapler', device_class: 'IIb' } },
  },
} as const;

/** Scripted SSE event sequence for a successful run. */
const SCRIPTED_EVENTS: Array<Record<string, unknown>> = [
  { seq: 0, ts: 't0', kind: 'progress', phase: 'discovery', status: 'started' },
  { seq: 1, ts: 't1', kind: 'progress', phase: 'discovery', status: 'completed' },
  {
    seq: 2,
    ts: 't2',
    kind: 'decision',
    decision: 'PSUR cadence: annual',
    inputs_summary: { device_class: 'IIb' },
    output: { cadence: 'annual', report_type: 'PSUR' },
    reason: 'Class IIb devices require an annual PSUR.',
    regulatory_basis: ['UK MDR 2024 Reg 44ZM', 'MDCG 2022-21'],
  },
  {
    seq: 3,
    ts: 't3',
    kind: 'decision',
    decision: 'IMDRF auto-code complaint C-104',
    inputs_summary: { complaint_id: 'C-104' },
    output: { device_problem: 'A0701', harm: 'F0101' },
    reason: 'Narrative matches device breakage with no reported harm.',
    regulatory_basis: ['IMDRF Annex A', 'IMDRF Annex F'],
    section: 'D_information_on_serious_incidents',
  },
  {
    seq: 4,
    ts: 't4',
    kind: 'progress',
    phase: 'generation',
    status: 'completed',
    section: 'D_information_on_serious_incidents',
  },
  {
    seq: 5,
    ts: 't5',
    kind: 'complete',
    artifacts: [
      { name: 'PSUR_AcmeStapler_2025.docx', content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: 12345 },
      { name: 'PSUR_AcmeStapler_2025.json', content_type: 'application/json', size_bytes: 6789 },
    ],
    validation: { passed: true, error_count: 0 },
  },
];

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((e) => `event: ${String(e.kind)}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
}

interface FakeServiceOptions {
  runsResponse?: { status: number; body: unknown };
  events?: Array<Record<string, unknown>>;
}

interface FakeService {
  fetchImpl: typeof fetch;
  requests: Array<{ method: string; path: string; body: unknown }>;
}

function fakePsurService(options: FakeServiceOptions = {}): FakeService {
  const requests: FakeService['requests'] = [];
  const events = options.events ?? SCRIPTED_EVENTS;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path: url.pathname, body });

    if (method === 'GET' && url.pathname === '/defaults') {
      return Response.json(DEFAULTS_PAYLOAD);
    }
    if (method === 'POST' && url.pathname === '/runs') {
      const r = options.runsResponse ?? { status: 200, body: { run_id: 'run-001' } };
      return Response.json(r.body, { status: r.status });
    }
    if (method === 'GET' && /^\/runs\/[^/]+\/events$/.test(url.pathname)) {
      return new Response(toSse(events), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    if (method === 'GET' && /^\/runs\/[^/]+\/artifacts$/.test(url.pathname)) {
      return Response.json({
        artifacts: [
          { name: 'PSUR_AcmeStapler_2025.json', content_type: 'application/json', size_bytes: 6789 },
        ],
      });
    }
    if (method === 'GET' && /^\/runs\/[^/]+\/artifacts\/[^/]+$/.test(url.pathname)) {
      return new Response('{"psur": true}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="PSUR_AcmeStapler_2025.json"',
        },
      });
    }
    if (method === 'GET' && /^\/runs\/[^/]+$/.test(url.pathname)) {
      return Response.json({ run_id: url.pathname.split('/')[2], status: 'running' });
    }
    return Response.json({ detail: 'not found' }, { status: 404 });
  }) as typeof fetch;

  return { fetchImpl, requests };
}

/** Mock graph: MDCG + IMDRF resolve; UK MDR 2024 Part 4A terms do not. */
function mockGraph(): CitationGraph {
  const corpus = [
    { id: 'MDCG2022-21.1.OBL.001', hay: 'mdcg 2022-21 section 1; eu mdr article 86(1)' },
    {
      id: 'IMDRF.AET.OBL.001',
      hay: 'imdrf/ae wg/n43 final:2020 annexes a (medical device problem), f (health effects: health impact)',
    },
    { id: 'ISO14971.RISK.OBL.001', hay: 'iso 14971:2019 §4.1 risk management process' },
  ];
  return {
    async findObligationIdsByTerms(groups: string[][]): Promise<string[]> {
      return corpus
        .filter(({ hay }) => groups.every((g) => g.some((t) => hay.includes(t.toLowerCase()))))
        .map(({ id }) => id);
    },
  };
}

// ---------------------------------------------------------------------------
// Test app harness
// ---------------------------------------------------------------------------

interface Harness {
  baseUrl: string;
  trace: InMemoryTraceService;
  service: FakeService;
  close: () => Promise<void>;
}

const servers: Server[] = [];

async function startHarness(opts: {
  serviceOptions?: FakeServiceOptions;
} = {}): Promise<Harness> {
  const trace = new InMemoryTraceService();
  const service = fakePsurService(opts.serviceOptions);
  const app = express();
  app.use(
    '/api/psur',
    createPsurRouter({
      serviceUrl: 'http://psur-service.internal:8000',
      fetchImpl: service.fetchImpl,
      traceService: trace as unknown as PsurTraceService,
      resolver: new CitationResolver(mockGraph()),
    }),
  );
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    trace,
    service,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function postRun(baseUrl: string, body: unknown = RUN_REQUEST): Promise<Response> {
  return fetch(`${baseUrl}/api/psur/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface SseMessage {
  event: string;
  data: string;
}

async function readSse(res: Response): Promise<SseMessage[]> {
  const text = await res.text();
  const messages: SseMessage[] = [];
  for (const frame of text.split(/\r?\n\r?\n/)) {
    if (!frame.trim()) continue;
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) messages.push({ event, data: data.join('\n') });
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/psur/defaults', () => {
  it('proxies the Python service defaults', async () => {
    const h = await startHarness();
    const res = await fetch(`${h.baseUrl}/api/psur/defaults`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof DEFAULTS_PAYLOAD;
    expect(body.period).toEqual(DEFAULTS_PAYLOAD.period);
    expect(body.inputs.sales.kind).toBe('table');
    expect(h.service.requests[0]).toMatchObject({ method: 'GET', path: '/defaults' });
  });
});

describe('POST /api/psur/runs', () => {
  it('creates a run, starts a trace under the demo tenant, and returns ids', async () => {
    const h = await startHarness();
    const res = await postRun(h.baseUrl);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { runId: string; processInstanceId: string };
    expect(body.runId).toBe('run-001');
    expect(body.processInstanceId).toMatch(/^psur-demo-[0-9a-f-]{36}$/);

    const chain = await h.trace.getTraceChain(body.processInstanceId);
    expect(chain.map((e: { eventType: string }) => e.eventType)).toEqual([
      'PROCESS_STARTED',
      'psur.run.started',
    ]);

    // The edited payload was forwarded verbatim to the Python service.
    const forwarded = h.service.requests.find((r) => r.method === 'POST' && r.path === '/runs');
    expect(forwarded?.body).toEqual(RUN_REQUEST);
  });

  it('rejects malformed payloads (unknown input name) before touching the service', async () => {
    const h = await startHarness();
    const res = await postRun(h.baseUrl, {
      period: { start: '2025-01-01', end: '2025-12-31' },
      inputs: { not_a_real_input: { rows: [] } },
    });
    expect(res.status).toBe(400);
    expect(h.service.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('passes through 422 structural violations from the Python service', async () => {
    const detail = [
      { loc: ['inputs', 'sales', 'rows', 0, 'unit'], msg: "unknown column 'unit' — structure is locked" },
    ];
    const h = await startHarness({ serviceOptions: { runsResponse: { status: 422, body: { detail } } } });
    const res = await postRun(h.baseUrl);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail });
  });

  it('allows repeated and concurrent runs without any demo caps', async () => {
    const h = await startHarness();
    // No per-IP daily cap and no global concurrency cap: a user can run a PSUR
    // anytime, and many runs may be in flight at once.
    const results = await Promise.all([
      postRun(h.baseUrl),
      postRun(h.baseUrl),
      postRun(h.baseUrl),
    ]);
    for (const res of results) expect(res.status).toBe(202);
  });

  it('passes through upstream 409 demo_busy', async () => {
    const h = await startHarness({
      serviceOptions: { runsResponse: { status: 409, body: { detail: 'demo_busy' } } },
    });
    const res = await postRun(h.baseUrl);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ detail: 'demo_busy' });
  });
});

describe('GET /api/psur/runs/:id/stream', () => {
  it('relays the scripted SSE sequence and appends decision trace entries in order', async () => {
    const h = await startHarness();
    const created = (await (await postRun(h.baseUrl)).json()) as {
      runId: string;
      processInstanceId: string;
    };

    const res = await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/stream`, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(res.status).toBe(200);
    const messages = await readSse(res);

    // Every upstream event relayed, in order, with named events preserved.
    const relayed = messages.filter((m) => m.event !== 'stream.end');
    expect(relayed.map((m) => m.event)).toEqual([
      'progress',
      'progress',
      'decision',
      'decision',
      'progress',
      'complete',
    ]);
    expect(JSON.parse(relayed[2]!.data)).toMatchObject({ decision: 'PSUR cadence: annual' });
    expect(messages.at(-1)?.event).toBe('stream.end');

    // Decision + lifecycle entries were appended live, in arrival order.
    const chain = (await h.trace.getTraceChain(created.processInstanceId)) as DecisionTraceEntry[];
    expect(chain.map((e) => e.eventType)).toEqual([
      'PROCESS_STARTED',
      'psur.run.started',
      'psur.decision',
      'psur.decision',
      'psur.run.completed',
    ]);

    const cadence = chain[2]!;
    expect(cadence.decision).toBe('PSUR cadence: annual');
    expect(cadence.reasons).toEqual(['Class IIb devices require an annual PSUR.']);
    expect(cadence.regulatoryContext.citations).toEqual(['UK MDR 2024 Reg 44ZM', 'MDCG 2022-21']);
    expect(cadence.regulatoryContext.obligationIds).toEqual(['MDCG2022-21.1.OBL.001']);
    expect(cadence.regulatoryContext.unresolved_citation).toEqual(['UK MDR 2024 Reg 44ZM']);

    const imdrf = chain[3]!;
    expect(imdrf.regulatoryContext.obligationIds).toEqual(['IMDRF.AET.OBL.001']);
    expect(imdrf.regulatoryContext.unresolved_citation).toBeUndefined();
    expect(imdrf.regulatoryContext.section).toBe('D_information_on_serious_incidents');

    const completion = chain[4]!;
    expect(completion.outputData).toMatchObject({
      validation: { passed: true, error_count: 0 },
    });
  });

  it('does not duplicate trace entries when the replay-from-start stream reconnects', async () => {
    const h = await startHarness();
    const created = (await (await postRun(h.baseUrl)).json()) as {
      runId: string;
      processInstanceId: string;
    };

    await readSse(await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/stream`));
    await readSse(await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/stream`));

    const chain = (await h.trace.getTraceChain(created.processInstanceId)) as DecisionTraceEntry[];
    expect(chain.filter((e) => e.eventType === 'psur.decision')).toHaveLength(2);
    expect(chain.filter((e) => e.eventType === 'psur.run.completed')).toHaveLength(1);
  });

  it('returns 404 for unknown runs', async () => {
    const h = await startHarness();
    const res = await fetch(`${h.baseUrl}/api/psur/runs/nope/stream`);
    expect(res.status).toBe(404);
  });
});

describe('artifacts proxy', () => {
  it('lists and streams artifacts through the bridge', async () => {
    const h = await startHarness();
    const created = (await (await postRun(h.baseUrl)).json()) as { runId: string };

    const list = await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/artifacts`);
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { artifacts: Array<{ name: string }> };
    expect(listBody.artifacts[0]?.name).toBe('PSUR_AcmeStapler_2025.json');

    const file = await fetch(
      `${h.baseUrl}/api/psur/runs/${created.runId}/artifacts/PSUR_AcmeStapler_2025.json`,
    );
    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toContain('PSUR_AcmeStapler_2025.json');
    expect(await file.json()).toEqual({ psur: true });
  });

  it('rejects suspicious artifact names', async () => {
    const h = await startHarness();
    const created = (await (await postRun(h.baseUrl)).json()) as { runId: string };
    const res = await fetch(
      `${h.baseUrl}/api/psur/runs/${created.runId}/artifacts/${encodeURIComponent('../secrets')}`,
    );
    expect(res.status).toBe(400);
  });
});

describe('trace + verification (the hero artifact)', () => {
  it('a completed run produces a chain that passes ChainVerifier and grounds every decision', async () => {
    const h = await startHarness();
    const created = (await (await postRun(h.baseUrl)).json()) as {
      runId: string;
      processInstanceId: string;
    };
    await readSse(await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/stream`));

    const res = await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/trace`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      processInstanceId: string;
      entries: DecisionTraceEntry[];
      verification: { valid: boolean; verifiedEntries: number; totalEntries: number };
    };
    expect(body.processInstanceId).toBe(created.processInstanceId);

    // Verify the chain independently with ChainVerifier.verifyEntries.
    const chain = (await h.trace.getTraceChain(created.processInstanceId)) as DecisionTraceEntry[];
    const verification = new ChainVerifier().verifyEntries(chain);
    expect(verification.valid).toBe(true);
    expect(verification.verifiedEntries).toBe(chain.length);
    expect(body.verification.valid).toBe(true);
    expect(body.verification.verifiedEntries).toBe(body.entries.length);

    // Every decision entry carries ≥1 resolved obligation ID or an explicit
    // unresolved_citation marker — never an ungrounded citation.
    const decisions = chain.filter((e) => e.eventType === 'psur.decision');
    expect(decisions.length).toBeGreaterThan(0);
    for (const entry of decisions) {
      const ctx = entry.regulatoryContext as {
        obligationIds?: string[];
        unresolved_citation?: string[];
      };
      const grounded = (ctx.obligationIds?.length ?? 0) > 0;
      const explicitlyUnresolved = (ctx.unresolved_citation?.length ?? 0) > 0;
      expect(grounded || explicitlyUnresolved).toBe(true);
    }
  });

  it('exposes a public verification badge endpoint', async () => {
    const h = await startHarness();
    const created = (await (await postRun(h.baseUrl)).json()) as { runId: string };
    await readSse(await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/stream`));

    const res = await fetch(`${h.baseUrl}/api/psur/runs/${created.runId}/verification`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verification: { valid: boolean } };
    expect(body.verification.valid).toBe(true);
  });
});
