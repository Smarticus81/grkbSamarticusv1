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
import { LLMAbstraction } from '@regground/core';

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
  taskId: string;
  taskName: string;
  tenantId: string;
  mode: 'with-graph' | 'without-graph' | 'compare';
  createdAtIso: string;
}
const RUNS = new Map<string, StoredRun>();
const MAX_RUNS = 100;

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
    rememberRun(runResult.runId, {
      result: runResult,
      events: [...events],
      taskId: def.id,
      taskName: def.name,
      tenantId: req.tenantId ?? req.user?.tenantId ?? 'dev',
      mode,
      createdAtIso: new Date().toISOString(),
    });
    res.status(202).json({ runId: runResult.runId, taskId: def.id, mode });
  } catch (err) {
    res.status(500).json({ error: 'run failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

/* ── GET /api/sandbox/runs/:runId/stream  (SSE) ─────────────────────── */
router.get('/runs/:runId/stream', (req, res: Response) => {
  const runId = req.params.runId;
  const stored = RUNS.get(runId);
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
      s = RUNS.get(runId);
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
  const tenantId = req.tenantId ?? req.user?.tenantId ?? 'dev';
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
router.get('/runs/:runId/result', (req, res) => {
  const runId = req.params.runId;
  const s = RUNS.get(runId);
  if (!s) return res.status(404).json({ error: 'run not found' });
  res.json(s.result);
});

/* ── GET /api/sandbox/runs/:runId/trace ─────────────────────────────── */
router.get('/runs/:runId/trace', (req, res) => {
  const runId = req.params.runId;
  const s = RUNS.get(runId);
  if (!s) return res.status(404).json({ error: 'run not found' });
  res.json(sandboxTrace(runId, s));
});

/* ── GET /api/sandbox/runs/:runId/trace/verify ──────────────────────── */
router.get('/runs/:runId/trace/verify', (req, res) => {
  const runId = req.params.runId;
  const s = RUNS.get(runId);
  if (!s) return res.status(404).json({ error: 'run not found' });
  res.json(sandboxVerification(sandboxTrace(runId, s)));
});

/* ── POST /api/sandbox/runs/:runId/judge ────────────────────────────── */
router.post('/runs/:runId/judge', async (req, res) => {
  const runId = req.params.runId;
  const s = RUNS.get(runId);
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
  const taskId = req.params.id;
  if (!taskId) return res.status(400).json({ error: 'taskId required' });
  const def = getTask(taskId);
  if (!def) return res.status(404).json({ error: 'task not found' });
  const tenantId = req.user?.tenantId ?? 'dev';
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
