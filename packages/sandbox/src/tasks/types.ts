/**
 * Task agent type system.
 *
 * A task agent is a single-step, input-in/output-out agent that runs against
 * the live obligation graph. Distinct from the multi-step processes in
 * `packages/sandbox/src/processes/`, task agents demonstrate the
 * with-graph vs without-graph delta in the sandbox.
 *
 * PROCESS-FIRST CONTRACT
 * ----------------------
 * Every task agent declares:
 *   - `processId`               — a (:Process) node already seeded in the graph.
 *   - `claimedObligationIds[]`  — obligation IDs the agent claims to honor.
 *
 * At runtime the TaskRunner queries the graph for
 *   (:Process {processId})-[:GOVERNED_BY]->(:Obligation)
 *   WHERE o.obligationId IN $claimedObligationIds
 * Any claimed ID NOT returned is flagged as `obligation.missed` ("not in
 * graph for this process") and the StrictGate fails. This is the runtime
 * tether: an agent can never claim coverage for an obligation outside its
 * process bundle, and can never invent a citation.
 */

import { z } from 'zod';
import type { LLMAbstraction, ObligationNode } from '@regground/core';

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
      /** Human reasoning for the overall release/withhold decision. */
      reason?: string;
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

/* ── Per-task obligation check (graph-resolved at run time) ──────────── */

export interface ObligationCheck {
  /** Obligation ID — MUST be in the bound process bundle. */
  obligationId: string;
  /**
   * Output validator. Receives the agent output and the live ObligationNode
   * fetched from the graph. Returns true if the output satisfies the
   * obligation. Implementations should be pure and deterministic.
   */
  satisfiedBy: (output: unknown, obligation: ObligationNode) => boolean;
}

/* ── Run context the agent receives in the with-graph lane ───────────── */

export interface WithGraphContext {
  /** Obligations fetched from the graph for this process+claimed IDs.
   *  ALL citations the agent emits MUST come from this set. */
  obligations: ObligationNode[];
  /** Optional LLM abstraction. When present, the TaskRunner prefers LLM-
   *  driven generation grounded on the obligation set and falls back to the
   *  deterministic body only on failure. */
  llm?: LLMAbstraction;
  /** Optional per-run agent persona/context (system prompt addendum) —
   *  typically synthesized at agent creation time and passed through at
   *  launch. */
  agentContext?: string;
}

/* ── Composition hints (declared chains, not enforced) ────────────── */

export interface ChainHint {
  /** Task ID this task naturally receives input from. */
  taskId: string;
  /** One-line explanation of what flows. */
  via: string;
}

export interface ChainHints {
  upstream?: ChainHint[];
  downstream?: ChainHint[];
}

/* ── Task agent definition (process-tethered) ────────────────────────── */

export interface TaskAgentDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  oneLiner: string;
  /** Headline regulation tag — shown on the catalog card. */
  regulation: string;
  jurisdiction: string;
  /** Process bundle ID this agent is bound to. The runner will query
   *  (:Process {processId})-[:GOVERNED_BY]->(:Obligation) and constrain
   *  the agent's view of the world to that set. */
  processId: string;
  /** Obligation IDs the agent claims to address. Each MUST be in the
   *  process bundle or the run fails StrictGate at the load step. */
  claimedObligationIds: string[];
  /** Per-obligation output checks evaluated against live graph nodes. */
  obligationChecks: ObligationCheck[];
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  /** Pre-loaded sample data the user can run immediately. */
  sampleData: TInput;
  /** Declared composition with other tasks — informational, not enforced. */
  chainHints?: ChainHints;
  /** Persona/system prompt used by the LLM-driven execution path. When set
   *  and an LLM is available at run time, the runner calls the LLM with this
   *  prompt + obligation citations + the user's per-agent context and asks
   *  for a JSON object matching `outputSchema`. */
  systemPrompt?: string;
  /**
   * Decision-trail reasoning for a single obligation. Given the agent output
   * and the live ObligationNode, return the human "why" that explains the
   * decision in terms of the facts AND the regulation — e.g. "Serious injury
   * → reportable under EU MDR Article 87; 15-day clock applies." This is what
   * the Decision Trail surfaces as the per-decision "why". When omitted, the
   * runner falls back to the obligation title.
   */
  explainObligation?: (output: TOutput, obligation: ObligationNode) => string | undefined;
  /**
   * Decision-trail reasoning for the overall gate (release/withhold). Usually
   * the output's summary/recommendation. When omitted, the runner uses a
   * generic message.
   */
  explainGate?: (output: TOutput) => string | undefined;
  /** Run the agent with the graph (graph-fetched obligations injected). */
  runWithGraph: (input: TInput, ctx: WithGraphContext) => Promise<TOutput>;
  /** Run the agent without the graph (no obligations, no citations). */
  runWithoutGraph: (input: TInput) => Promise<TOutput>;
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
