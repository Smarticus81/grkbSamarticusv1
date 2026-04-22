/**
 * Task agent type system.
 *
 * A task agent is a single-step, input-in/output-out agent that runs against
 * the Smarticus knowledge graph. Distinct from the multi-step processes in
 * `packages/sandbox/src/processes/`, task agents are designed to demo the
 * with-graph vs without-graph delta in the sandbox.
 */

import { z } from 'zod';

/* ── Public event vocabulary streamed during a run ───────────────────── */

export type TaskEvent =
  | {
      type: 'run.started';
      runId: string;
      taskId: string;
      lane: TaskLane;
      atIso: string;
    }
  | {
      type: 'agent.thinking';
      lane: TaskLane;
      atIso: string;
      /** Layman one-liner. */
      message: string;
    }
  | {
      type: 'graph.query';
      lane: TaskLane;
      atIso: string;
      method: string;
      args: Record<string, unknown>;
      resultCount: number;
      /** Layman one-liner. */
      message: string;
    }
  | {
      type: 'graph.cite';
      lane: TaskLane;
      atIso: string;
      obligationId: string;
      citation: string;
      regulation: string;
      summary: string;
    }
  | {
      type: 'obligation.satisfied';
      lane: TaskLane;
      atIso: string;
      obligationId: string;
      reason: string;
    }
  | {
      type: 'obligation.missed';
      lane: TaskLane;
      atIso: string;
      obligationId: string;
      reason: string;
    }
  | {
      type: 'output.gated';
      lane: TaskLane;
      atIso: string;
      passed: boolean;
      violations: string[];
    }
  | {
      type: 'run.completed';
      lane: TaskLane;
      runId: string;
      atIso: string;
      durationMs: number;
    }
  | {
      type: 'run.error';
      lane: TaskLane;
      runId: string;
      atIso: string;
      message: string;
    };

export type TaskLane = 'with-graph' | 'without-graph';

/* ── Per-task obligation snapshot ─────────────────────────────────────── */

export interface TaskObligation {
  obligationId: string;
  regulation: string;
  citation: string;
  summary: string;
  /** What the output must include for this obligation to be satisfied. */
  satisfiedBy: (output: unknown) => boolean;
}

/* ── Task agent definition ────────────────────────────────────────────── */

export interface TaskAgentDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  oneLiner: string;
  /** Headline regulation tag — shown on the catalog card. */
  regulation: string;
  jurisdiction: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  /** Pre-loaded sample data the user can run immediately. */
  sampleData: TInput;
  /** Curated obligation set the agent is graded against. */
  obligations: TaskObligation[];
  /** Run the agent with the graph (full obligation injection + citations). */
  runWithGraph: (input: TInput) => Promise<TOutput>;
  /** Run the agent without the graph (no obligations, no citations). */
  runWithoutGraph: (input: TInput) => Promise<TOutput>;
  /** Layman script of "graph queries" the with-graph lane will narrate. */
  graphScript: Array<{
    after?: 'start' | 'load-obligations';
    method: string;
    args?: Record<string, unknown>;
    message: string;
    resultCount: number;
    citeObligationIds?: string[];
  }>;
}

/* ── Run result + eval scorecard ──────────────────────────────────────── */

export interface DeterministicScore {
  /** Obligations satisfied / total obligations. 0..1. */
  coverage: number;
  /** Total citations the agent attached to its output. */
  citations: number;
  /** Did the StrictGate (Zod + obligation completeness) pass? */
  strictGatePass: boolean;
  /** Names of obligations that failed `satisfiedBy(output)`. */
  violations: string[];
  /** Number of distinct obligations referenced in the output. */
  obligationsConsulted: number;
}

export interface LLMJudgeScore {
  accuracy: number;            // 0..10
  citations: number;           // 0..10
  regulatoryAwareness: number; // 0..10
  completeness: number;        // 0..10
  rationale: string;
}

export interface LaneResult<TOutput = unknown> {
  lane: TaskLane;
  output: TOutput | null;
  durationMs: number;
  citations: string[];
  obligationsConsulted: string[];
  score: DeterministicScore;
  judge?: LLMJudgeScore;
  error?: string;
}

export interface RunResult<TOutput = unknown> {
  runId: string;
  taskId: string;
  startedAtIso: string;
  finishedAtIso: string;
  withGraph?: LaneResult<TOutput>;
  withoutGraph?: LaneResult<TOutput>;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

export function nowIso(): string {
  return new Date().toISOString();
}

export function newRunId(): string {
  // Crypto-quality not required for sandbox run identifiers.
  return 'run_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
