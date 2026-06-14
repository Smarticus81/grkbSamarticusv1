/**
 * Sandbox routes — task agent catalog, runs, SSE streaming, eval, and
 * downloadable agent bundle.
 */

import express, { type Response, type Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  TaskRunner,
  TaskEventStream,
  taskEventToSSE,
  listTasks,
  getTask,
  judgeLane,
  type LaneResult,
  type RunResult,
  type TaskEvent,
} from '@regground/sandbox';
import { buildAgentBundle } from '../services/AgentBundler.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { getContext } from '../context.js';
import { graphObligationLookup } from './traces.js';
import {
  LLMAbstraction,
  getDB,
  schema,
  eq,
  and,
  withTenant,
  assembleAuditPack,
  renderAuditPackMarkdown,
  type AuditPackDecision,
  type TenantTransaction,
} from '@regground/core';

const { groundedRuns } = schema;

function tenantDb<T>(tenantId: string, fn: (db: TenantTransaction) => Promise<T>): Promise<T> {
  return withTenant(getDB(), tenantId, fn);
}

/** Lazy, cached LLM facade. Built on first run; graceful if no providers. */
let _llm: LLMAbstraction | null | undefined;
function getLLM(): LLMAbstraction | null {
  if (_llm !== undefined) return _llm;
  try {
    _llm = LLMAbstraction.fromEnv();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sandbox] LLM unavailable, will run deterministic-only:', err instanceof Error ? err.message : err);
    _llm = null;
  }
  return _llm;
}

const router: Router = express.Router();

/** In-memory store of recent runs. Sandbox is ephemeral by design. */
interface StoredRun {
  result: RunResult<unknown>;
  events: TaskEvent[];
  inputSnapshot: unknown;
  taskId: string;
  taskName: string;
  tenantId: string;
  mode: 'with-graph' | 'without-graph' | 'compare';
  createdAtIso: string;
}
const RUNS = new Map<string, StoredRun>();
const MAX_RUNS = 100;

function requestTenantId(req: AuthedRequest): string | null {
  return req.tenantId ?? req.user?.tenantId ?? null;
}

function requireTenantId(req: AuthedRequest, res: Response): string | null {
  const tenantId = requestTenantId(req);
  if (!tenantId) {
    res.status(403).json({ error: 'no tenant context' });
    return null;
  }
  return tenantId;
}

function ownedRun(runId: string, tenantId: string): StoredRun | null {
  const run = RUNS.get(runId);
  if (!run || run.tenantId !== tenantId) return null;
  return run;
}

export interface GroundedRunManifest {
  runId: string;
  taskId: string;
  taskName: string;
  tenantId: string;
  mode: StoredRun['mode'];
  createdAtIso: string;
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  obligationsConsulted: string[];
  citations: string[];
  validation: {
    coverage: number;
    citationCount: number;
    strictGatePass: boolean;
    violations: string[];
    obligationsConsulted: number;
  };
  trace: {
    entries: SandboxTraceEntry[];
    verification: SandboxVerification;
  };
  manifestHash: string;
}

function rememberRun(runId: string, run: StoredRun) {
  RUNS.set(runId, run);
  if (RUNS.size > MAX_RUNS) {
    const oldestKey = RUNS.keys().next().value;
    if (oldestKey) RUNS.delete(oldestKey);
  }
}

function laneSummary(lane: LaneResult | undefined): { satisfied: number; missed: number; passed: boolean } | undefined {
  if (!lane) return undefined;
  const total = lane.obligationsConsulted?.length ?? 0;
  const missed = lane.score?.violations?.length ?? 0;
  return {
    satisfied: Math.max(0, total - missed),
    missed,
    passed: lane.score?.strictGatePass ?? false,
  };
}

type SandboxTraceEntry = {
  id: string;
  sequenceNumber: number;
  eventType: string;
  actor: string;
  currentHash: string;
  previousHash: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

type SandboxVerification = {
  valid: boolean;
  verifiedEntries: number;
  totalEntries: number;
  signatureHash: string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function taskEventPayload(event: TaskEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (key === 'type' || key === 'atIso') continue;
    payload[key] = value;
  }
  return payload;
}

function sandboxTrace(runId: string, run: StoredRun): SandboxTraceEntry[] {
  let previousHash = '0'.repeat(64);
  return run.events.map((event, sequenceNumber) => {
    const payload = taskEventPayload(event);
    const currentHash = stableHash({ runId, sequenceNumber, previousHash, type: event.type, payload });
    const entry: SandboxTraceEntry = {
      id: `${runId}:${sequenceNumber}`,
      sequenceNumber,
      eventType: event.type,
      actor: run.taskName,
      currentHash,
      previousHash,
      timestamp: event.atIso,
      payload,
    };
    previousHash = currentHash;
    return entry;
  });
}

function sandboxVerification(entries: SandboxTraceEntry[]): SandboxVerification {
  return {
    valid: true,
    verifiedEntries: entries.length,
    totalEntries: entries.length,
    signatureHash: stableHash(entries.map((entry) => entry.currentHash)),
  };
}

function runLane(result: RunResult<unknown>): LaneResult | undefined {
  return result.withGraph ?? result.withoutGraph;
}

function manifestFromStoredRun(runId: string, run: StoredRun): GroundedRunManifest | null {
  const lane = runLane(run.result);
  if (!lane) return null;
  const entries = sandboxTrace(runId, run);
  const verification = sandboxVerification(entries);
  const manifestBase = {
    runId,
    taskId: run.taskId,
    taskName: run.taskName,
    tenantId: run.tenantId,
    mode: run.mode,
    createdAtIso: run.createdAtIso,
    inputSnapshot: run.inputSnapshot,
    outputSnapshot: lane.output,
    obligationsConsulted: lane.obligationsConsulted ?? [],
    citations: lane.citations ?? [],
    validation: {
      coverage: lane.score?.coverage ?? 0,
      citationCount: lane.score?.citations ?? 0,
      strictGatePass: lane.score?.strictGatePass ?? false,
      violations: lane.score?.violations ?? [],
      obligationsConsulted: lane.score?.obligationsConsulted ?? 0,
    },
    trace: {
      entries,
      verification,
    },
  };
  return {
    ...manifestBase,
    manifestHash: stableHash(manifestBase),
  };
}

export async function getGroundedRunManifest(runId: string, tenantId: string): Promise<GroundedRunManifest | null> {
  const inMemory = RUNS.get(runId);
  if (inMemory?.tenantId === tenantId) {
    const manifest = manifestFromStoredRun(runId, inMemory);
    if (manifest) return manifest;
  }

  const [row] = await tenantDb(tenantId, (db) => db
    .select()
    .from(groundedRuns)
    .where(and(eq(groundedRuns.runId, runId), eq(groundedRuns.tenantId, tenantId)))
    .limit(1));
  return (row?.manifest as unknown as GroundedRunManifest | undefined) ?? null;
}

async function persistGroundedRun(runId: string, run: StoredRun): Promise<void> {
  const manifest = manifestFromStoredRun(runId, run);
  if (!manifest) {
    throw new Error('Cannot persist grounded run without a lane result.');
  }
  await tenantDb(run.tenantId, (db) => db
    .insert(groundedRuns)
    .values({
      runId,
      tenantId: run.tenantId,
      taskId: run.taskId,
      taskName: run.taskName,
      mode: run.mode,
      inputSnapshot: run.inputSnapshot,
      resultSnapshot: run.result,
      eventLog: run.events,
      manifest: manifest as unknown as Record<string, unknown>,
      manifestHash: manifest.manifestHash,
    })
    .onConflictDoUpdate({
      target: groundedRuns.runId,
      set: {
        tenantId: run.tenantId,
        taskId: run.taskId,
        taskName: run.taskName,
        mode: run.mode,
        inputSnapshot: run.inputSnapshot,
        resultSnapshot: run.result,
        eventLog: run.events,
        manifest: manifest as unknown as Record<string, unknown>,
        manifestHash: manifest.manifestHash,
      },
    }));
}

/* ── GET /api/sandbox/tasks ─────────────────────────────────────────── */
router.get('/tasks', (_req, res) => {
  res.json({ tasks: listTasks() });
});

/* ── GET /api/sandbox/tasks/:id ─────────────────────────────────────── */
router.get('/tasks/:id', (req, res) => {
  const def = getTask(req.params.id);
  if (!def) return res.status(404).json({ error: 'task not found' });
  // Surface the sample data and the obligation summary, not the runners
  // (those are functions and aren't serializable).
  res.json({
    id: def.id,
    name: def.name,
    oneLiner: def.oneLiner,
    regulation: def.regulation,
    jurisdiction: def.jurisdiction,
    sampleData: def.sampleData,
    inputJsonSchema: zodToJsonSchema(def.inputSchema, { target: 'jsonSchema7' }),
    processId: def.processId,
    claimedObligationIds: def.claimedObligationIds,
    obligations: def.claimedObligationIds.map((id) => ({ obligationId: id })),
    chainHints: {
      upstream: def.chainHints?.upstream ?? [],
      downstream: def.chainHints?.downstream ?? [],
    },
  });
});

/* ── POST /api/sandbox/tasks/:id/run ────────────────────────────────── */
const RunBodySchema = z.object({
  input: z.unknown().optional(),
  mode: z.enum(['with-graph', 'without-graph', 'compare']).default('compare'),
  paceMs: z.number().int().min(0).max(2000).optional(),
  /** Optional per-run persona/context injected into the LLM system prompt. */
  agentContext: z.string().max(4000).optional(),
});

router.post('/tasks/:id/run', async (req: AuthedRequest, res) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const taskId = req.params.id;
  if (!taskId) return res.status(400).json({ error: 'task id required' });
  const def = getTask(taskId);
  if (!def) return res.status(404).json({ error: 'task not found' });

  const parsed = RunBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid run body', detail: parsed.error.flatten() });
  }
  const { mode, paceMs, agentContext } = parsed.data;
  const rawInput = parsed.data.input ?? def.sampleData;
  const inputParsed = def.inputSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return res.status(400).json({ error: 'invalid task input', detail: inputParsed.error.flatten() });
  }

  const stream = new TaskEventStream();
  const events: TaskEvent[] = [];
  // Capture every event for SSE replay.
  const originalPublish = stream.publish.bind(stream);
  stream.publish = (e: TaskEvent) => {
    events.push(e);
    originalPublish(e);
  };

  try {
    const runner = new TaskRunner(getContext().graph);
    const llm = getLLM();
    // Use a fast pace by default for HTTP runs — the SSE replay re-paces.
    const runResult = await runner.run(def, inputParsed.data, {
      mode,
      stream,
      paceMs: paceMs ?? 0,
      llm: llm ?? undefined,
      agentContext,
    });
    const storedRun: StoredRun = {
      result: runResult,
      events: [...events],
      inputSnapshot: inputParsed.data,
      taskId: def.id,
      taskName: def.name,
      tenantId,
      mode,
      createdAtIso: new Date().toISOString(),
    };
    rememberRun(runResult.runId, storedRun);
    await persistGroundedRun(runResult.runId, storedRun);
    res.status(202).json({ runId: runResult.runId, taskId: def.id, mode });
  } catch (err) {
    res.status(500).json({ error: 'run failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

/* ── GET /api/sandbox/runs/:runId/stream  (SSE) ─────────────────────── */
router.get('/runs/:runId/stream', (req: AuthedRequest, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const runId = req.params.runId;
  if (!runId) return res.status(400).json({ error: 'runId required' });
  const stored = ownedRun(runId, tenantId);
  if (!stored && RUNS.has(runId)) return res.status(404).json({ error: 'run not found' });
  // Replay-only stream: by the time the client subscribes, the run has
  // typically completed (it's fast). If not stored yet, poll briefly.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let cancelled = false;
  req.on('close', () => { cancelled = true; });

  const replay = async () => {
    let attempts = 0;
    let s = stored;
    while (!s && attempts < 60 && !cancelled) {
      await new Promise((r) => setTimeout(r, 100));
      s = ownedRun(runId, tenantId);
      attempts += 1;
    }
    if (!s) {
      res.write(taskEventToSSE({ type: 'run.error', lane: 'with-graph', runId, atIso: new Date().toISOString(), message: 'run not found' }));
      res.end();
      return;
    }
    for (const e of s.events) {
      if (cancelled) break;
      res.write(taskEventToSSE(e));
      // Pace the replay so it streams in the UI rather than dumping.
      await new Promise((r) => setTimeout(r, 60));
    }
    res.write(`event: stream.end\ndata: ${JSON.stringify({ runId })}\n\n`);
    res.end();
  };
  void replay();
});

/* ── GET /api/sandbox/runs/recent ──────────────────────────────────── */
router.get('/runs/recent', (req: AuthedRequest, res) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const limit = Math.min(Number(req.query.limit ?? 10), 50);
  const out: Array<{
    runId: string;
    taskId: string;
    taskName: string;
    mode: string;
    createdAtIso: string;
    withGraph?: ReturnType<typeof laneSummary>;
    withoutGraph?: ReturnType<typeof laneSummary>;
  }> = [];
  // RUNS is insertion-ordered; reverse-iterate for newest-first.
  const all = Array.from(RUNS.entries()).reverse();
  for (const [runId, run] of all) {
    if (run.tenantId !== tenantId) continue;
    out.push({
      runId,
      taskId: run.taskId,
      taskName: run.taskName,
      mode: run.mode,
      createdAtIso: run.createdAtIso,
      withGraph: laneSummary(run.result.withGraph),
      withoutGraph: laneSummary(run.result.withoutGraph),
    });
    if (out.length >= limit) break;
  }
  res.json({ runs: out });
});

/* ── GET /api/sandbox/runs/:runId/result ────────────────────────────── */
router.get('/runs/:runId/result', (req: AuthedRequest, res) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const runId = req.params.runId;
  if (!runId) return res.status(400).json({ error: 'runId required' });
  const s = ownedRun(runId, tenantId);
  if (!s) return res.status(404).json({ error: 'run not found' });
  res.json(s.result);
});

/* ── GET /api/sandbox/runs/:runId/trace ─────────────────────────────── */
router.get('/runs/:runId/trace', (req: AuthedRequest, res) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const runId = req.params.runId;
  if (!runId) return res.status(400).json({ error: 'runId required' });
  const s = ownedRun(runId, tenantId);
  if (!s) return res.status(404).json({ error: 'run not found' });
  res.json(sandboxTrace(runId, s));
});

/* ── GET /api/sandbox/runs/:runId/trace/verify ──────────────────────── */
router.get('/runs/:runId/trace/verify', (req: AuthedRequest, res) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const runId = req.params.runId;
  if (!runId) return res.status(400).json({ error: 'runId required' });
  const s = ownedRun(runId, tenantId);
  if (!s) return res.status(404).json({ error: 'run not found' });
  res.json(sandboxVerification(sandboxTrace(runId, s)));
});

/* ── GET /api/sandbox/runs/:runId/audit-pack ────────────────────────── */

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function decisionFromSandboxEntry(entry: SandboxTraceEntry): AuditPackDecision {
  const p = entry.payload ?? {};
  const decision: AuditPackDecision = {
    sequenceNumber: entry.sequenceNumber,
    eventType: entry.eventType,
    actor: entry.actor,
    timestamp: entry.timestamp,
    currentHash: entry.currentHash,
    previousHash: entry.previousHash,
    reasons: [],
  };
  const reason = str(p['reason']) ?? str(p['message']);
  if (reason) decision.reasons = [reason];
  const summary = str(p['summary']);
  if (summary) decision.humanSummary = summary;
  const obligationId = str(p['obligationId']);
  if (obligationId) decision.obligationId = obligationId;
  const citation = str(p['citation']);
  if (citation) decision.citation = citation;
  const regulation = str(p['regulation']);
  if (regulation) decision.regulation = regulation;
  return decision;
}

router.get('/runs/:runId/audit-pack', async (req: AuthedRequest, res) => {
  const runId = req.params.runId!;
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const format = req.query.format === 'markdown' ? 'markdown' : 'json';
  const includeMarkdown = req.query.include === 'markdown';
  const download = req.query.download === '1' || req.query.download === 'true';

  try {
    const manifest = await getGroundedRunManifest(runId, tenantId);
    if (!manifest) return res.status(404).json({ error: 'run not found' });

    const v = manifest.trace.verification;
    const pack = await assembleAuditPack(
      {
        packType: 'sandbox-run',
        subjectId: runId,
        decisions: manifest.trace.entries.map(decisionFromSandboxEntry),
        verification: {
          valid: v.valid,
          totalEntries: v.totalEntries,
          verifiedEntries: v.verifiedEntries,
          verifiedAt: new Date(),
          signatureHash: v.signatureHash,
        },
        notes: [
          `Task: ${manifest.taskName} (${manifest.taskId}) · mode ${manifest.mode} · started ${manifest.createdAtIso}.`,
          `Validation: coverage ${(manifest.validation.coverage * 100).toFixed(0)}%, ` +
            `${manifest.validation.citationCount} citations, strict gate ` +
            `${manifest.validation.strictGatePass ? 'passed' : 'FAILED'}` +
            (manifest.validation.violations.length > 0
              ? `, violations: ${manifest.validation.violations.join('; ')}`
              : '') +
            '.',
        ],
      },
      graphObligationLookup(),
      manifest.obligationsConsulted,
    );

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      if (download) {
        res.setHeader('Content-Disposition', `attachment; filename="audit-pack-${runId}.md"`);
      }
      return res.send(renderAuditPackMarkdown(pack));
    }
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="audit-pack-${runId}.json"`);
    }
    if (includeMarkdown) {
      return res.json({ ...pack, markdown: renderAuditPackMarkdown(pack) });
    }
    return res.json(pack);
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Could not build audit pack.' });
  }
});

/* ── POST /api/sandbox/runs/:runId/judge ────────────────────────────── */
router.post('/runs/:runId/judge', async (req: AuthedRequest, res) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const runId = req.params.runId;
  if (!runId) return res.status(400).json({ error: 'runId required' });
  const s = ownedRun(runId, tenantId);
  if (!s) return res.status(404).json({ error: 'run not found' });
  const def = getTask(s.taskId);
  if (!def) return res.status(404).json({ error: 'task not found' });

  const useLiveLLM = req.body?.useLiveLLM === true;
  const out: { withGraph?: unknown; withoutGraph?: unknown } = {};
  const lanes: Array<['withGraph' | 'withoutGraph', LaneResult | undefined]> = [
    ['withGraph',    s.result.withGraph],
    ['withoutGraph', s.result.withoutGraph],
  ];
  for (const [k, lane] of lanes) {
    if (!lane) continue;
    const judge = await judgeLane(def, lane, { useLiveLLM });
    lane.judge = judge;
    out[k] = judge;
  }
  res.json({ runId, judges: out });
});

/* ── GET /api/sandbox/tasks/:id/download ────────────────────────────── */
router.get('/tasks/:id/download', async (req: AuthedRequest, res) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;

  const taskId = req.params.id;
  if (!taskId) return res.status(400).json({ error: 'taskId required' });
  const def = getTask(taskId);
  if (!def) return res.status(404).json({ error: 'task not found' });
  const apiKey = (req.header('x-bundle-api-key') ?? 'sandbox-demo-key');
  const baseUrl: string = req.header('x-bundle-base-url') ?? `${req.protocol}://${req.get('host') ?? 'localhost:4000'}`;

  const { buffer, filename } = await buildAgentBundle({
    def,
    tenantId,
    apiKey,
    baseUrl,
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export default router;
