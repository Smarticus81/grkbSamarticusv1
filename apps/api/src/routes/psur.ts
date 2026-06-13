/**
 * PSUR generator bridge — mounted at /api/psur BEHIND the auth+tenancy
 * middleware (see apps/api/src/index.ts). The real pipeline requires sign-in;
 * signed-out visitors get a client-side simulated run in the web app instead.
 *
 * Proxies the Python PSUR service (env PSUR_SERVICE_URL) and acts as the ONLY
 * writer of decision-trace entries for demo runs:
 *
 *   GET  /api/psur/defaults                  — mock-input pack from the Python service
 *   POST /api/psur/runs                      — start a run (trace started under the demo tenant)
 *   GET  /api/psur/runs/:id                  — run status proxy
 *   GET  /api/psur/runs/:id/stream           — SSE relay; decision events appended to the hash chain
 *   GET  /api/psur/runs/:id/artifacts        — artifact list proxy
 *   GET  /api/psur/runs/:id/artifacts/:name  — artifact download proxy
 *   GET  /api/psur/runs/:id/trace            — chain entries + verification
 *   GET  /api/psur/runs/:id/verification     — ChainVerifier result only (public badge)
 *
 * The trace is sacred: entries are appended live in arrival order, never
 * back-filled, never mutated, never synthesized. If trace persistence fails we
 * surface an `error` SSE event — we do not fabricate entries.
 */
import express, { type Request, type Response, type Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ChainVerifier,
  getDB,
  schema,
  eq,
  and,
  desc,
  type DecisionTraceEntry,
  type TraceContext,
  type TraceEventInput,
} from '@regground/core';
import { getContext } from '../context.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { CitationResolver } from '../psur/obligation-map.js';
import {
  ArtifactListSchema,
  CompleteEventSchema,
  DecisionEventSchema,
  DefaultsResponseSchema,
  PipelineEventSchema,
  RunCreatedSchema,
  RunRequestSchema,
  type CompleteEvent,
  type DecisionEvent,
} from '../psur/schemas.js';

// ---------------------------------------------------------------------------
// Constants & injectable dependencies
// ---------------------------------------------------------------------------

/**
 * Fallback tenant for runs without an auth context (router unit tests mount
 * the router standalone). In the deployed app, auth+tenancy run first and
 * every run is traced under the signed-in caller's tenant.
 */
export const PSUR_DEMO_TENANT = 'psur-demo';

/** Cap on remembered runs kept in memory (durable history lives in Postgres). */
const MAX_REMEMBERED_RUNS = 200;

/** Structural subset of DecisionTraceService used by the bridge (mockable). */
export interface PsurTraceService {
  startTrace(processInstanceId: string, tenantId: string): Promise<TraceContext>;
  logEvent(ctx: TraceContext, event: TraceEventInput): Promise<DecisionTraceEntry>;
  getTraceChain(processInstanceId: string): Promise<DecisionTraceEntry[]>;
}

export interface PsurRouterOptions {
  /** Base URL of the Python PSUR service. Default: env PSUR_SERVICE_URL or http://localhost:8000 */
  serviceUrl?: string;
  /** fetch implementation (injectable for tests). */
  fetchImpl?: typeof fetch;
  /** Trace service (defaults to the app-context DecisionTraceService). */
  traceService?: PsurTraceService;
  /** Citation resolver (defaults to one backed by the app-context graph). */
  resolver?: CitationResolver;
  /** Clock (injectable for tests). */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// SSE plumbing
// ---------------------------------------------------------------------------

interface SseFrame {
  event: string;
  data: string;
}

/** Incrementally parse an SSE byte stream into frames, invoking onFrame per frame. */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = async (rawFrame: string) => {
    const lines = rawFrame.split(/\r?\n/);
    let event = 'message';
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) await onFrame({ event, data: data.join('\n') });
  };

  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (frame.trim()) await dispatch(frame);
      }
    }
    const trailing = buffer.trim();
    if (trailing) await dispatch(trailing);
  } finally {
    reader.releaseLock();
  }
}

function writeSse(res: Response, event: string, data: string): void {
  for (const chunk of [`event: ${event}\n`, ...data.split('\n').map((l) => `data: ${l}\n`), '\n']) {
    res.write(chunk);
  }
}

function writeSseError(res: Response, message: string, extra: Record<string, unknown> = {}): void {
  writeSse(res, 'error', JSON.stringify({ kind: 'error', message, ...extra }));
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

interface RunRecord {
  runId: string;
  processInstanceId: string;
  ctx: TraceContext;
  ip: string;
  /** Owner of the run — scopes the durable history list and per-id access. */
  userId: string | null;
  tenantId: string;
  createdAtMs: number;
  /** Kept for in-memory eviction ordering (no longer a concurrency gate). */
  active: boolean;
  /** Highest decision `seq` already appended (guards SSE replay duplicates). */
  tracedSeq: number;
  completionLogged: boolean;
  failureLogged: boolean;
}

/** Identity of the caller, derived from the auth+tenancy middleware. */
function caller(req: Request): { userId: string | null; tenantId: string } {
  const user = (req as AuthedRequest).user;
  const tenantId = user?.tenantId ?? (req as { tenantId?: string }).tenantId ?? PSUR_DEMO_TENANT;
  return { userId: user?.sub ?? null, tenantId };
}

export function createPsurRouter(opts: PsurRouterOptions = {}): Router {
  const router: Router = express.Router();

  // Self-contained body parsing (no-op when the app already parsed JSON).
  router.use(express.json({ limit: '10mb' }));

  const serviceUrl = () =>
    (opts.serviceUrl ?? process.env.PSUR_SERVICE_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
  const doFetch: typeof fetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());

  const getTrace = (): PsurTraceService => opts.traceService ?? getContext().traceService;
  let resolver: CitationResolver | null = opts.resolver ?? null;
  const getResolver = (): CitationResolver => {
    if (!resolver) resolver = new CitationResolver(getContext().graph);
    return resolver;
  };
  const verifier = new ChainVerifier();

  /** runId → record. Insertion-ordered; oldest inactive evicted past the cap. */
  const runs = new Map<string, RunRecord>();

  function clientIp(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  function releaseRun(rec: RunRecord): void {
    rec.active = false;
  }

  function rememberRun(rec: RunRecord): void {
    runs.set(rec.runId, rec);
    if (runs.size > MAX_REMEMBERED_RUNS) {
      for (const [key, value] of runs) {
        if (!value.active) {
          runs.delete(key);
          break;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Durable per-user run history (Postgres). Best-effort: a persistence
  // failure is logged but never aborts a run — the hash-chained trace remains
  // the source of truth, this table is the user-facing index.
  // -------------------------------------------------------------------------

  async function persistRunStart(rec: RunRecord, period: { start: string; end: string }): Promise<void> {
    try {
      await getDB()
        .insert(schema.psurRuns)
        .values({
          runId: rec.runId,
          processInstanceId: rec.processInstanceId,
          traceId: rec.ctx.traceId,
          tenantId: rec.tenantId,
          userId: rec.userId ?? 'anonymous',
          status: 'running',
          periodStart: period.start,
          periodEnd: period.end,
        })
        .onConflictDoNothing();
    } catch (err) {
      console.warn('[psur] failed to persist run start:', err instanceof Error ? err.message : err);
    }
  }

  /** Enrich a run row with device/report metadata from the Python status (best-effort). */
  async function fetchRunMeta(runId: string): Promise<{ deviceName: string | null; reportType: string | null }> {
    try {
      const upstream = await doFetch(`${serviceUrl()}/runs/${encodeURIComponent(runId)}`);
      if (!upstream.ok) return { deviceName: null, reportType: null };
      const body = (await upstream.json()) as { device_name?: unknown; report_type?: unknown };
      return {
        deviceName: typeof body.device_name === 'string' ? body.device_name : null,
        reportType: typeof body.report_type === 'string' ? body.report_type : null,
      };
    } catch {
      return { deviceName: null, reportType: null };
    }
  }

  async function persistRunCompletion(rec: RunRecord, event: CompleteEvent): Promise<void> {
    const meta = await fetchRunMeta(rec.runId);
    try {
      await getDB()
        .update(schema.psurRuns)
        .set({
          status: 'completed',
          validationPassed: event.validation.passed,
          errorCount: event.validation.error_count,
          artifacts: event.artifacts,
          deviceName: meta.deviceName,
          reportType: meta.reportType,
          updatedAt: now(),
          finishedAt: now(),
        })
        .where(eq(schema.psurRuns.runId, rec.runId));
    } catch (err) {
      console.warn('[psur] failed to persist run completion:', err instanceof Error ? err.message : err);
    }
  }

  async function persistRunFailure(rec: RunRecord, message: string): Promise<void> {
    try {
      await getDB()
        .update(schema.psurRuns)
        .set({ status: 'failed', error: message, updatedAt: now(), finishedAt: now() })
        .where(eq(schema.psurRuns.runId, rec.runId));
    } catch (err) {
      console.warn('[psur] failed to persist run failure:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * Self-heal a persisted history row stuck at `running`. Completion is normally
   * written by the live SSE relay, but a closed browser tab or an API restart
   * can leave the row mid-flight. This reconciles the user-facing history row
   * (NOT the hash chain — the trace stays exactly as it was appended live) by
   * asking the Python service for the run's terminal state. Best-effort; on any
   * error the row is returned unchanged. Only `running` rows trigger a call.
   */
  async function reconcileRow<
    T extends {
      runId: string;
      status: string;
      deviceName: string | null;
      reportType: string | null;
      validationPassed: boolean | null;
      errorCount: number | null;
      artifacts: Array<{ name: string; content_type: string; size_bytes: number }>;
      error: string | null;
      finishedAt: Date | null;
    },
  >(row: T): Promise<T> {
    if (row.status !== 'running') return row;

    let py: {
      status?: unknown;
      device_name?: unknown;
      report_type?: unknown;
      error?: unknown;
      validation?: { passed?: unknown; error_count?: unknown };
    };
    try {
      const upstream = await doFetch(`${serviceUrl()}/runs/${encodeURIComponent(row.runId)}`);
      if (!upstream.ok) return row;
      py = (await upstream.json()) as typeof py;
    } catch {
      return row;
    }

    const finishedAt = now();

    if (py.status === 'completed') {
      let artifacts = row.artifacts;
      try {
        const a = await doFetch(`${serviceUrl()}/runs/${encodeURIComponent(row.runId)}/artifacts`);
        if (a.ok) {
          const parsed = ArtifactListSchema.safeParse(await a.json());
          if (parsed.success) artifacts = parsed.data.artifacts;
        }
      } catch {
        /* keep whatever was stored */
      }
      const patch = {
        status: 'completed' as const,
        validationPassed: typeof py.validation?.passed === 'boolean' ? py.validation.passed : null,
        errorCount: typeof py.validation?.error_count === 'number' ? py.validation.error_count : null,
        artifacts,
        deviceName: typeof py.device_name === 'string' ? py.device_name : null,
        reportType: typeof py.report_type === 'string' ? py.report_type : null,
        finishedAt,
      };
      try {
        await getDB()
          .update(schema.psurRuns)
          .set({ ...patch, updatedAt: finishedAt })
          .where(and(eq(schema.psurRuns.runId, row.runId), eq(schema.psurRuns.status, 'running')));
      } catch (err) {
        console.warn('[psur] failed to reconcile completed run:', err instanceof Error ? err.message : err);
      }
      return { ...row, ...patch };
    }

    if (py.status === 'failed') {
      const message = typeof py.error === 'string' && py.error ? py.error : 'run failed';
      const patch = { status: 'failed' as const, error: message, finishedAt };
      try {
        await getDB()
          .update(schema.psurRuns)
          .set({ ...patch, updatedAt: finishedAt })
          .where(and(eq(schema.psurRuns.runId, row.runId), eq(schema.psurRuns.status, 'running')));
      } catch (err) {
        console.warn('[psur] failed to reconcile failed run:', err instanceof Error ? err.message : err);
      }
      return { ...row, ...patch };
    }

    return row;
  }

  /**
   * Resolve a run for a read endpoint, scoped to the caller. Checks the live
   * in-memory map first (with an ownership guard), then falls back to the
   * durable Postgres history so runs survive an API restart. Returns null when
   * the run is unknown or belongs to a different user.
   */
  async function resolveRun(
    req: Request,
    id: string,
  ): Promise<{ runId: string; processInstanceId: string } | null> {
    const { userId, tenantId } = caller(req);
    const rec = runs.get(id);
    if (rec) {
      if (userId && rec.userId && rec.userId !== userId) return null;
      return { runId: rec.runId, processInstanceId: rec.processInstanceId };
    }
    try {
      const conds = [eq(schema.psurRuns.runId, id), eq(schema.psurRuns.tenantId, tenantId)];
      if (userId) conds.push(eq(schema.psurRuns.userId, userId));
      const rows = await getDB()
        .select({ runId: schema.psurRuns.runId, processInstanceId: schema.psurRuns.processInstanceId })
        .from(schema.psurRuns)
        .where(and(...conds))
        .limit(1);
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Trace appenders (append-only, arrival order — never back-filled)
  // -------------------------------------------------------------------------

  async function appendDecision(rec: RunRecord, event: DecisionEvent): Promise<void> {
    const basis = await getResolver().resolve(event.regulatory_basis);
    const regulatoryContext = getResolver().toRegulatoryContext(basis);
    if (event.section) regulatoryContext.section = event.section;
    await getTrace().logEvent(rec.ctx, {
      eventType: 'psur.decision',
      actor: 'psur-pipeline',
      decision: event.decision,
      reasons: [event.reason],
      humanSummary: event.reason,
      inputData: event.inputs_summary,
      outputData: event.output,
      regulatoryContext,
    });
    rec.tracedSeq = event.seq;
  }

  async function appendCompletion(rec: RunRecord, event: CompleteEvent): Promise<void> {
    await getTrace().logEvent(rec.ctx, {
      eventType: 'psur.run.completed',
      actor: 'psur-pipeline',
      humanSummary: `PSUR demo run ${rec.runId} completed: ${event.artifacts.length} artifact(s), validation ${event.validation.passed ? 'passed' : 'failed'} (${event.validation.error_count} error(s)).`,
      outputData: {
        artifacts: event.artifacts,
        validation: event.validation,
      },
    });
    rec.completionLogged = true;
  }

  async function appendFailure(rec: RunRecord, message: string): Promise<void> {
    await getTrace().logEvent(rec.ctx, {
      eventType: 'psur.run.failed',
      actor: 'psur-pipeline',
      humanSummary: `PSUR demo run ${rec.runId} reported an error: ${message}`,
      outputData: { message },
    });
    rec.failureLogged = true;
  }

  // -------------------------------------------------------------------------
  // GET /defaults — proxy the mock-input pack
  // -------------------------------------------------------------------------
  router.get('/defaults', async (_req, res) => {
    try {
      const upstream = await doFetch(`${serviceUrl()}/defaults`);
      if (!upstream.ok) {
        return res
          .status(502)
          .json({ error: `PSUR service returned ${upstream.status} for /defaults` });
      }
      const parsed = DefaultsResponseSchema.safeParse(await upstream.json());
      if (!parsed.success) {
        return res
          .status(502)
          .json({ error: 'PSUR service /defaults response failed validation', detail: parsed.error.flatten() });
      }
      res.json(parsed.data);
    } catch (err) {
      res.status(502).json({
        error: 'PSUR service unreachable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /runs — start a run for the signed-in caller
  // -------------------------------------------------------------------------
  router.post('/runs', async (req, res) => {
    const parsed = RunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid run payload', detail: parsed.error.flatten() });
    }

    const ip = clientIp(req);
    const { userId, tenantId } = caller(req);

    // No per-IP or global concurrency caps: every user can run a PSUR anytime,
    // and many users (and runs) may proceed concurrently.

    // Start the hash chain BEFORE the pipeline so the run is traced from birth.
    // Runs belong to the signed-in caller's tenant (auth+tenancy middleware);
    // the demo tenant is only the standalone-router fallback.
    const processInstanceId = `psur-demo-${randomUUID()}`;
    let ctx: TraceContext;
    try {
      ctx = await getTrace().startTrace(processInstanceId, tenantId);
    } catch (err) {
      return res.status(503).json({
        error: 'decision trace unavailable — refusing to run untraced',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    let upstream: globalThis.Response;
    try {
      upstream = await doFetch(`${serviceUrl()}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
    } catch (err) {
      return res.status(502).json({
        error: 'PSUR service unreachable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    if (upstream.status === 422 || upstream.status === 409) {
      // Structural violation / saturation — relay the Python service's own
      // per-field messages or demo_busy detail verbatim.
      const body: unknown = await upstream.json().catch(() => ({ detail: 'request rejected' }));
      return res.status(upstream.status).json(body);
    }
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `PSUR service returned ${upstream.status} for POST /runs` });
    }

    const created = RunCreatedSchema.safeParse(await upstream.json().catch(() => null));
    if (!created.success) {
      return res.status(502).json({ error: 'PSUR service run-created response failed validation' });
    }

    const rec: RunRecord = {
      runId: created.data.run_id,
      processInstanceId,
      ctx,
      ip,
      userId,
      tenantId,
      createdAtMs: now().getTime(),
      active: true,
      tracedSeq: -1,
      completionLogged: false,
      failureLogged: false,
    };
    rememberRun(rec);
    await persistRunStart(rec, parsed.data.period);

    try {
      await getTrace().logEvent(ctx, {
        eventType: 'psur.run.started',
        actor: 'psur-bridge',
        humanSummary: `PSUR demo run ${rec.runId} started (period ${parsed.data.period.start} → ${parsed.data.period.end}).`,
        inputData: {
          period: parsed.data.period,
          inputNames: Object.keys(parsed.data.inputs),
        },
      });
    } catch (err) {
      console.warn('[psur] failed to log run-start trace entry:', err instanceof Error ? err.message : err);
    }

    res.status(202).json({ runId: rec.runId, processInstanceId });
  });

  // -------------------------------------------------------------------------
  // GET /runs — durable history for the signed-in caller (newest first)
  // -------------------------------------------------------------------------
  router.get('/runs', async (req, res) => {
    const { userId, tenantId } = caller(req);
    try {
      const conds = [eq(schema.psurRuns.tenantId, tenantId)];
      if (userId) conds.push(eq(schema.psurRuns.userId, userId));
      const rows = await getDB()
        .select({
          runId: schema.psurRuns.runId,
          processInstanceId: schema.psurRuns.processInstanceId,
          status: schema.psurRuns.status,
          deviceName: schema.psurRuns.deviceName,
          reportType: schema.psurRuns.reportType,
          periodStart: schema.psurRuns.periodStart,
          periodEnd: schema.psurRuns.periodEnd,
          validationPassed: schema.psurRuns.validationPassed,
          errorCount: schema.psurRuns.errorCount,
          artifacts: schema.psurRuns.artifacts,
          error: schema.psurRuns.error,
          createdAt: schema.psurRuns.createdAt,
          finishedAt: schema.psurRuns.finishedAt,
        })
        .from(schema.psurRuns)
        .where(and(...conds))
        .orderBy(desc(schema.psurRuns.createdAt))
        .limit(100);
      // Self-heal any rows left at `running` (closed tab / API restart) so the
      // saved history reflects the run's true terminal state.
      const reconciled = await Promise.all(rows.map((row) => reconcileRow(row)));
      res.json({ runs: reconciled });
    } catch (err) {
      res.status(500).json({
        error: 'could not load run history',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /runs/:id — status proxy
  // -------------------------------------------------------------------------
  router.get('/runs/:id', async (req, res) => {
    const rec = await resolveRun(req, req.params.id!);
    if (!rec) return res.status(404).json({ error: 'run not found' });
    try {
      const upstream = await doFetch(`${serviceUrl()}/runs/${encodeURIComponent(rec.runId)}`);
      if (!upstream.ok) {
        return res.status(502).json({ error: `PSUR service returned ${upstream.status}` });
      }
      const body: unknown = await upstream.json();
      res.json(body);
    } catch (err) {
      res.status(502).json({
        error: 'PSUR service unreachable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /runs/:id/stream — SSE relay + live trace writing
  // -------------------------------------------------------------------------
  router.get('/runs/:id/stream', async (req, res) => {
    const rec = runs.get(req.params.id!);
    if (!rec) return res.status(404).json({ error: 'run not found' });
    const { userId } = caller(req);
    if (userId && rec.userId && rec.userId !== userId) {
      return res.status(404).json({ error: 'run not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    let upstream: globalThis.Response;
    try {
      upstream = await doFetch(`${serviceUrl()}/runs/${encodeURIComponent(rec.runId)}/events`, {
        headers: { Accept: 'text/event-stream' },
        signal: abort.signal,
      });
    } catch (err) {
      writeSseError(res, 'PSUR service unreachable', {
        detail: err instanceof Error ? err.message : String(err),
      });
      return res.end();
    }

    if (upstream.status === 409) {
      writeSseError(res, 'demo is busy', { detail: 'demo_busy' });
      return res.end();
    }
    if (!upstream.ok || !upstream.body) {
      writeSseError(res, `PSUR service returned ${upstream.status} for the event stream`);
      return res.end();
    }

    const handleFrame = async (frame: SseFrame): Promise<void> => {
      // 1. Relay the upstream frame to the browser as-is (named event preserved).
      writeSse(res, frame.event, frame.data);

      // 2. Parse the envelope; non-JSON or unknown frames are relayed only.
      let raw: unknown;
      try {
        raw = JSON.parse(frame.data);
      } catch {
        return;
      }
      const parsed = PipelineEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const event = parsed.data;

      // 3. Append trace entries in arrival order. The Python stream replays
      //    from the start on reconnect, so `tracedSeq` / logged flags guard
      //    against duplicate entries — never back-fill, never mutate.
      try {
        if (event.kind === 'decision') {
          const decision = DecisionEventSchema.parse(event);
          if (decision.seq > rec.tracedSeq) await appendDecision(rec, decision);
        } else if (event.kind === 'complete') {
          const complete = CompleteEventSchema.parse(event);
          if (!rec.completionLogged) {
            await appendCompletion(rec, complete);
            await persistRunCompletion(rec, complete);
          }
          releaseRun(rec);
        } else if (event.kind === 'error') {
          const message =
            (typeof event.message === 'string' && event.message) ||
            (typeof event.detail === 'string' && event.detail) ||
            'pipeline error';
          if (!rec.failureLogged) {
            await appendFailure(rec, message);
            await persistRunFailure(rec, message);
          }
          releaseRun(rec);
        }
      } catch (err) {
        // Trace persistence failed — surface it, keep relaying, never fabricate.
        writeSseError(res, 'trace persistence failed for an event; the chain may be incomplete', {
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    };

    try {
      await readSseStream(upstream.body, handleFrame, abort.signal);
      if (!abort.signal.aborted) {
        writeSse(res, 'stream.end', JSON.stringify({ runId: rec.runId }));
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        writeSseError(res, 'event stream interrupted', {
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      res.end();
    }
  });

  // -------------------------------------------------------------------------
  // GET /runs/:id/artifacts — list proxy
  // -------------------------------------------------------------------------
  router.get('/runs/:id/artifacts', async (req, res) => {
    const rec = await resolveRun(req, req.params.id!);
    if (!rec) return res.status(404).json({ error: 'run not found' });
    try {
      const upstream = await doFetch(`${serviceUrl()}/runs/${encodeURIComponent(rec.runId)}/artifacts`);
      if (!upstream.ok) {
        return res.status(502).json({ error: `PSUR service returned ${upstream.status}` });
      }
      const parsed = ArtifactListSchema.safeParse(await upstream.json());
      if (!parsed.success) {
        return res.status(502).json({ error: 'PSUR service artifact list failed validation' });
      }
      res.json(parsed.data);
    } catch (err) {
      res.status(502).json({
        error: 'PSUR service unreachable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /runs/:id/artifacts/:name — file download proxy
  // -------------------------------------------------------------------------
  const ArtifactNameSchema = z.string().regex(/^[A-Za-z0-9._-]+$/, 'invalid artifact name');

  router.get('/runs/:id/artifacts/:name', async (req, res) => {
    const rec = await resolveRun(req, req.params.id!);
    if (!rec) return res.status(404).json({ error: 'run not found' });
    const name = ArtifactNameSchema.safeParse(req.params.name);
    if (!name.success) return res.status(400).json({ error: 'invalid artifact name' });

    try {
      const upstream = await doFetch(
        `${serviceUrl()}/runs/${encodeURIComponent(rec.runId)}/artifacts/${encodeURIComponent(name.data)}`,
      );
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status === 404 ? 404 : 502).json({
          error: upstream.status === 404 ? 'artifact not found' : `PSUR service returned ${upstream.status}`,
        });
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        upstream.headers.get('content-disposition') ?? `attachment; filename="${name.data}"`,
      );
      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({
          error: 'PSUR service unreachable',
          detail: err instanceof Error ? err.message : String(err),
        });
      } else {
        res.end();
      }
    }
  });

  // -------------------------------------------------------------------------
  // GET /runs/:id/trace — chain entries + verification (public demo viewer)
  // -------------------------------------------------------------------------
  router.get('/runs/:id/trace', async (req, res) => {
    const rec = await resolveRun(req, req.params.id!);
    if (!rec) return res.status(404).json({ error: 'run not found' });
    try {
      const entries = await getTrace().getTraceChain(rec.processInstanceId);
      const verification = verifier.verifyEntries(entries);
      res.json({ processInstanceId: rec.processInstanceId, entries, verification });
    } catch (err) {
      res.status(500).json({
        error: 'could not load trace',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /runs/:id/verification — minimal public hash-chain verification badge
  // -------------------------------------------------------------------------
  router.get('/runs/:id/verification', async (req, res) => {
    const rec = await resolveRun(req, req.params.id!);
    if (!rec) return res.status(404).json({ error: 'run not found' });
    try {
      const entries = await getTrace().getTraceChain(rec.processInstanceId);
      const verification = verifier.verifyEntries(entries);
      res.json({ processInstanceId: rec.processInstanceId, verification });
    } catch (err) {
      res.status(500).json({
        error: 'could not verify trace',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

const router: Router = createPsurRouter();
export default router;
