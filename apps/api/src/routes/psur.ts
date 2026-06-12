/**
 * PSUR demo bridge — public routes (no Clerk/JWT) mounted at /api/psur.
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
  type DecisionTraceEntry,
  type TraceContext,
  type TraceEventInput,
} from '@regground/core';
import { getContext } from '../context.js';
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

/** All demo runs are traced under this tenant. */
export const PSUR_DEMO_TENANT = 'psur-demo';

/** Stale-run safety net: a slot held longer than this is reclaimed. */
const RUN_TTL_MS = 30 * 60 * 1000;
/** Cap on remembered runs (demo is ephemeral by design). */
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
  /** Per-IP daily run cap. Default: env DEMO_RUNS_PER_IP_PER_DAY or 5. */
  runsPerIpPerDay?: number;
  /** Global concurrent run cap. Default: env DEMO_MAX_CONCURRENT_RUNS or 1. */
  maxConcurrentRuns?: number;
  /** Clock (injectable for tests). */
  now?: () => Date;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
  createdAtMs: number;
  /** Holds a concurrency slot until terminal event / TTL. */
  active: boolean;
  /** Highest decision `seq` already appended (guards SSE replay duplicates). */
  tracedSeq: number;
  completionLogged: boolean;
  failureLogged: boolean;
}

export function createPsurRouter(opts: PsurRouterOptions = {}): Router {
  const router: Router = express.Router();

  // Self-contained body parsing (no-op when the app already parsed JSON).
  router.use(express.json({ limit: '10mb' }));

  const serviceUrl = () =>
    (opts.serviceUrl ?? process.env.PSUR_SERVICE_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
  const doFetch: typeof fetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const runsPerIpPerDay = () => opts.runsPerIpPerDay ?? envInt('DEMO_RUNS_PER_IP_PER_DAY', 5);
  const maxConcurrentRuns = () => opts.maxConcurrentRuns ?? envInt('DEMO_MAX_CONCURRENT_RUNS', 1);

  const getTrace = (): PsurTraceService => opts.traceService ?? getContext().traceService;
  let resolver: CitationResolver | null = opts.resolver ?? null;
  const getResolver = (): CitationResolver => {
    if (!resolver) resolver = new CitationResolver(getContext().graph);
    return resolver;
  };
  const verifier = new ChainVerifier();

  /** runId → record. Insertion-ordered; oldest evicted past the cap. */
  const runs = new Map<string, RunRecord>();
  /** ip → { day, count } for the per-IP daily cap. */
  const ipDailyCounts = new Map<string, { day: string; count: number }>();

  function clientIp(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  function sweepStaleRuns(): void {
    const cutoff = now().getTime() - RUN_TTL_MS;
    for (const rec of runs.values()) {
      if (rec.active && rec.createdAtMs < cutoff) rec.active = false;
    }
  }

  function activeRunCount(): number {
    sweepStaleRuns();
    let n = 0;
    for (const rec of runs.values()) if (rec.active) n += 1;
    return n;
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

  /** Returns null when allowed; an error payload when the IP hit its daily cap. */
  function checkIpAllowance(ip: string): { error: string } | null {
    const day = now().toISOString().slice(0, 10);
    const entry = ipDailyCounts.get(ip);
    const count = entry && entry.day === day ? entry.count : 0;
    if (count >= runsPerIpPerDay()) {
      return {
        error: `Demo limit reached: ${runsPerIpPerDay()} runs per day per visitor. Please come back tomorrow.`,
      };
    }
    return null;
  }

  function recordIpRun(ip: string): void {
    const day = now().toISOString().slice(0, 10);
    const entry = ipDailyCounts.get(ip);
    if (entry && entry.day === day) entry.count += 1;
    else ipDailyCounts.set(ip, { day, count: 1 });
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
  // POST /runs — start a run under the demo tenant
  // -------------------------------------------------------------------------
  router.post('/runs', async (req, res) => {
    const parsed = RunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid run payload', detail: parsed.error.flatten() });
    }

    const ip = clientIp(req);
    const capped = checkIpAllowance(ip);
    if (capped) return res.status(429).json(capped);

    if (activeRunCount() >= maxConcurrentRuns()) {
      return res.status(409).json({
        detail: 'demo_busy',
        error: 'The demo is busy with another run right now. Please try again in a few minutes.',
      });
    }

    // Start the hash chain BEFORE the pipeline so the run is traced from birth.
    const processInstanceId = `psur-demo-${randomUUID()}`;
    let ctx: TraceContext;
    try {
      ctx = await getTrace().startTrace(processInstanceId, PSUR_DEMO_TENANT);
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
      createdAtMs: now().getTime(),
      active: true,
      tracedSeq: -1,
      completionLogged: false,
      failureLogged: false,
    };
    rememberRun(rec);
    recordIpRun(ip);

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
  // GET /runs/:id — status proxy
  // -------------------------------------------------------------------------
  router.get('/runs/:id', async (req, res) => {
    const rec = runs.get(req.params.id!);
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
          if (!rec.completionLogged) await appendCompletion(rec, complete);
          releaseRun(rec);
        } else if (event.kind === 'error') {
          const message =
            (typeof event.message === 'string' && event.message) ||
            (typeof event.detail === 'string' && event.detail) ||
            'pipeline error';
          if (!rec.failureLogged) await appendFailure(rec, message);
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
    const rec = runs.get(req.params.id!);
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
    const rec = runs.get(req.params.id!);
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
    const rec = runs.get(req.params.id!);
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
    const rec = runs.get(req.params.id!);
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
