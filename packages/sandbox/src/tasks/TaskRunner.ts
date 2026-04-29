/**
 * TaskRunner — executes a task agent in either lane (with-graph or
 * without-graph), streams the run as a TaskEvent vocabulary, and emits a
 * deterministic scorecard per lane.
 *
 * The with-graph lane is the source of truth: it queries the live
 * (:Process)-[:GOVERNED_BY]->(:Obligation) tether, never invents
 * citations, and fails the StrictGate if the agent claims an obligation
 * that the graph does not bind to its process.
 */

import type { ObligationGraph, ObligationNode } from '@regground/core';
import type {
  DeterministicScore,
  LaneResult,
  ObligationCheck,
  RunResult,
  TaskAgentDefinition,
  TaskEvent,
  TaskLane,
} from './types.js';
import { newRunId, nowIso } from './types.js';

/* ── Public stream (in-process pub/sub) ──────────────────────────────── */

type Listener = (e: TaskEvent) => void;

export class TaskEventStream {
  private readonly listeners = new Set<Listener>();
  publish(e: TaskEvent): void {
    for (const l of this.listeners) {
      try { l(e); } catch { /* listener errors must never break the run */ }
    }
  }
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export function taskEventToSSE(e: TaskEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

/* ── Runner ──────────────────────────────────────────────────────────── */

const DEFAULT_PACE_MS = 0;

export interface RunOptions {
  mode: 'with-graph' | 'without-graph' | 'compare';
  stream?: TaskEventStream;
  paceMs?: number;
}

export class TaskRunner {
  constructor(private readonly graph: ObligationGraph) {}

  async run<TInput, TOutput>(
    def: TaskAgentDefinition<TInput, TOutput>,
    input: TInput,
    opts: RunOptions,
  ): Promise<RunResult<TOutput>> {
    const runId = newRunId();
    const startedAtIso = nowIso();
    const startMs = Date.now();
    const paceMs = opts.paceMs ?? DEFAULT_PACE_MS;
    const stream = opts.stream;

    const result: RunResult<TOutput> = {
      runId,
      taskId: def.id,
      startedAtIso,
      finishedAtIso: startedAtIso,
    };

    if (opts.mode === 'with-graph' || opts.mode === 'compare') {
      result.withGraph = await this.runLane(def, input, 'with-graph', runId, stream, paceMs);
    }
    if (opts.mode === 'without-graph' || opts.mode === 'compare') {
      result.withoutGraph = await this.runLane(def, input, 'without-graph', runId, stream, paceMs);
    }

    result.finishedAtIso = nowIso();
    void startMs;
    return result;
  }

  private async runLane<TInput, TOutput>(
    def: TaskAgentDefinition<TInput, TOutput>,
    input: TInput,
    lane: TaskLane,
    runId: string,
    stream: TaskEventStream | undefined,
    paceMs: number,
  ): Promise<LaneResult<TOutput>> {
    const laneStartMs = Date.now();
    const emit = (e: TaskEvent) => stream?.publish(e);
    const pace = () => (paceMs > 0 ? new Promise<void>((r) => setTimeout(r, paceMs)) : Promise.resolve());

    emit({ type: 'run.started', runId, taskId: def.id, lane, atIso: nowIso() });
    await pace();

    const preGateViolations: string[] = [];
    let fetched: ObligationNode[] = [];
    const obligationsById = new Map<string, ObligationNode>();

    if (lane === 'with-graph') {
      emit({
        type: 'agent.thinking',
        lane,
        atIso: nowIso(),
        message: `Loading the ${def.claimedObligationIds.length} obligations the agent claims, scoped to process '${def.processId}'.`,
      });
      await pace();

      try {
        fetched = await this.graph.getProcessObligations(def.processId, def.claimedObligationIds);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: 'run.error', lane, runId, atIso: nowIso(), message: `Graph query failed: ${message}` });
        return errorLane<TOutput>(lane, laneStartMs, message);
      }

      emit({
        type: 'graph.query',
        lane,
        atIso: nowIso(),
        method: 'getProcessObligations',
        args: { processId: def.processId, claimedObligationIds: def.claimedObligationIds },
        resultCount: fetched.length,
        message: `Graph returned ${fetched.length} obligation(s) bound to process '${def.processId}'.`,
      });
      await pace();

      for (const ob of fetched) {
        obligationsById.set(ob.obligationId, ob);
      }

      // Surface any claimed ID NOT bound to this process in the graph.
      const fetchedIds = new Set(fetched.map((o) => o.obligationId));
      for (const claimed of def.claimedObligationIds) {
        if (!fetchedIds.has(claimed)) {
          const reason = `Claimed by agent but not bound to process '${def.processId}' in the graph.`;
          preGateViolations.push(claimed);
          emit({ type: 'obligation.missed', lane, atIso: nowIso(), obligationId: claimed, reason });
          await pace();
        }
      }

      for (const ob of fetched) {
        emit({
          type: 'graph.cite',
          lane,
          atIso: nowIso(),
          obligationId: ob.obligationId,
          citation: ob.sourceCitation,
          regulation: ob.jurisdiction ?? '',
          summary: ob.title ?? '',
        });
        await pace();
      }
    } else {
      emit({
        type: 'agent.thinking',
        lane,
        atIso: nowIso(),
        message: 'Running without the graph — no obligations loaded, no citations available.',
      });
      await pace();
    }

    let output: TOutput | null = null;
    let runErr: string | undefined;
    try {
      output = lane === 'with-graph'
        ? await def.runWithGraph(input, { obligations: fetched })
        : await def.runWithoutGraph(input);
    } catch (err) {
      runErr = err instanceof Error ? err.message : String(err);
      emit({ type: 'run.error', lane, runId, atIso: nowIso(), message: runErr });
      return errorLane<TOutput>(lane, laneStartMs, runErr);
    }

    // Output validation against the agent's Zod schema.
    const outputParsed = def.outputSchema.safeParse(output);
    const zodViolations: string[] = [];
    if (!outputParsed.success) {
      for (const issue of outputParsed.error.issues) {
        zodViolations.push(`output.${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }

    // Per-obligation checks (only for with-graph; without-graph has no obligations).
    const satisfiedIds: string[] = [];
    const unsatisfiedIds: string[] = [...preGateViolations];

    if (lane === 'with-graph') {
      for (const check of def.obligationChecks) {
        const ob = obligationsById.get(check.obligationId);
        if (!ob) {
          // Already accounted for in preGateViolations.
          continue;
        }
        let ok = false;
        try { ok = check.satisfiedBy(output, ob); } catch { ok = false; }
        if (ok) {
          satisfiedIds.push(check.obligationId);
          emit({ type: 'obligation.satisfied', lane, atIso: nowIso(), obligationId: check.obligationId, reason: ob.title ?? ob.sourceCitation });
        } else {
          unsatisfiedIds.push(check.obligationId);
          emit({ type: 'obligation.missed', lane, atIso: nowIso(), obligationId: check.obligationId, reason: 'Output did not satisfy obligation check.' });
        }
        await pace();
      }
    }

    const citations = extractCitations(output);

    const score = scoreLane({
      lane,
      claimedObligationIds: def.claimedObligationIds,
      satisfiedIds,
      unsatisfiedIds,
      zodViolations,
      citations,
    });

    emit({
      type: 'output.gated',
      lane,
      atIso: nowIso(),
      passed: score.strictGatePass,
      violations: score.violations,
    });
    await pace();

    const durationMs = Date.now() - laneStartMs;
    emit({ type: 'run.completed', lane, runId, atIso: nowIso(), durationMs });

    return {
      lane,
      output,
      durationMs,
      citations,
      obligationsConsulted: lane === 'with-graph' ? fetched.map((o) => o.obligationId) : [],
      score,
      error: runErr,
    };
  }
}

/* ── Scoring ─────────────────────────────────────────────────────────── */

interface ScoreInput {
  lane: TaskLane;
  claimedObligationIds: string[];
  satisfiedIds: string[];
  unsatisfiedIds: string[];
  zodViolations: string[];
  citations: string[];
}

function scoreLane(s: ScoreInput): DeterministicScore {
  const total = s.claimedObligationIds.length;
  const coverage = total === 0 ? 0 : s.satisfiedIds.length / total;
  const violations = [...s.zodViolations, ...s.unsatisfiedIds.map((id) => `obligation:${id}`)];
  const strictGatePass = violations.length === 0 && (s.lane === 'without-graph' ? true : s.satisfiedIds.length === total);
  return {
    coverage,
    citations: s.citations.length,
    strictGatePass,
    violations,
    obligationsConsulted: new Set(s.satisfiedIds.concat(s.unsatisfiedIds)).size,
  };
}

function extractCitations(output: unknown): string[] {
  if (!output || typeof output !== 'object') return [];
  const c = (output as { citations?: unknown }).citations;
  if (!Array.isArray(c)) return [];
  return c.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function errorLane<TOutput>(lane: TaskLane, startMs: number, message: string): LaneResult<TOutput> {
  return {
    lane,
    output: null,
    durationMs: Date.now() - startMs,
    citations: [],
    obligationsConsulted: [],
    score: { coverage: 0, citations: 0, strictGatePass: false, violations: [`run.error: ${message}`], obligationsConsulted: 0 },
    error: message,
  };
}

// Reference for tooling that may scan unused exports.
export type { ObligationCheck };