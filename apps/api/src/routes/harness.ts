/**
 * Agent harness routes — list the shipped scenario suites and run them.
 *
 * The harness executes every grounded agent through its sealed lifecycle
 * against an in-memory graph seeded from the regulation YAML catalog and a
 * deterministic mock LLM. No Neo4j, Postgres or model provider is touched, so
 * a run is cheap, repeatable and safe to trigger from the UI.
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { listHarnessSuites, runHarnessSuites, type HarnessRunReport } from '@regground/sandbox';
import type { AuthedRequest } from '../middleware/auth.js';

const router: Router = express.Router();

/** Keep the most recent runs in memory so the UI can show history after a reload. */
export interface StoredHarnessRun {
  runId: string;
  tenantId: string | null;
  requestedSuiteIds: string[] | null;
  report: HarnessRunReport;
}
const RUNS: StoredHarnessRun[] = [];
const MAX_RUNS = 25;
let runCounter = 0;

function tenantOf(req: AuthedRequest): string | null {
  return req.tenantId ?? req.user?.tenantId ?? null;
}

function summariseRun(run: StoredHarnessRun) {
  return {
    runId: run.runId,
    startedAtIso: run.report.startedAtIso,
    finishedAtIso: run.report.finishedAtIso,
    durationMs: run.report.durationMs,
    summary: run.report.summary,
    requestedSuiteIds: run.requestedSuiteIds,
    suites: run.report.suites.map((s) => ({
      id: s.id,
      name: s.name,
      process: s.process,
      total: s.total,
      passed: s.passed,
      failed: s.failed,
      durationMs: s.durationMs,
    })),
  };
}

/* ── GET /api/sandbox/harness/suites ────────────────────────────────── */
router.get('/suites', (_req, res) => {
  const suites = listHarnessSuites().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    process: s.process,
    processId: s.processId,
    processName: s.processName,
    scenarioCount: s.scenarioCount,
    agents: s.agents,
    error: s.error,
  }));
  res.json({
    suites,
    totals: {
      suites: suites.length,
      scenarios: suites.reduce((n, s) => n + s.scenarioCount, 0),
      agents: new Set(suites.flatMap((s) => s.agents)).size,
    },
  });
});

/* ── POST /api/sandbox/harness/run ──────────────────────────────────── */
const RunBodySchema = z.object({
  /** Suite ids to run; omit for every suite. */
  suites: z.array(z.string().min(1)).max(100).optional(),
});

router.post('/run', async (req: AuthedRequest, res) => {
  const parsed = RunBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid run body', detail: parsed.error.flatten() });
  }
  const requested = parsed.data.suites ?? null;
  if (requested) {
    const known = new Set(listHarnessSuites().map((s) => s.id));
    const unknown = requested.filter((id) => !known.has(id));
    if (unknown.length) {
      return res.status(404).json({ error: 'unknown suite id', detail: { unknown } });
    }
  }
  try {
    const report = await runHarnessSuites(requested ? { suiteIds: requested } : {});
    runCounter += 1;
    const run: StoredHarnessRun = {
      runId: `harness-${Date.now().toString(36)}-${runCounter}`,
      tenantId: tenantOf(req),
      requestedSuiteIds: requested,
      report,
    };
    RUNS.unshift(run);
    if (RUNS.length > MAX_RUNS) RUNS.length = MAX_RUNS;
    res.status(200).json({ runId: run.runId, ...report });
  } catch (err) {
    res.status(500).json({ error: 'harness run failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

/* ── GET /api/sandbox/harness/runs/recent ───────────────────────────── */
router.get('/runs/recent', (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 10) || 10, 1), MAX_RUNS);
  const runs = RUNS.filter((r) => r.tenantId === tenantId).slice(0, limit).map(summariseRun);
  res.json({ runs });
});

/* ── GET /api/sandbox/harness/runs/:runId ───────────────────────────── */
router.get('/runs/:runId', (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const run = RUNS.find((r) => r.runId === req.params.runId && r.tenantId === tenantId);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json({ runId: run.runId, requestedSuiteIds: run.requestedSuiteIds, ...run.report });
});

/** Test hook: forget stored runs. */
export function resetHarnessRuns(): void {
  RUNS.length = 0;
}

export default router;
