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

import type { LLMAbstraction, ObligationGraph, ObligationNode } from '@regground/core';
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
  /** Optional LLM abstraction. When present, every agent that declares a
   *  systemPrompt runs LLM-driven (grounded on the loaded obligations). There
   *  is no deterministic fallback for those agents: if the model cannot
   *  produce schema-valid output the run fails honestly. Agents WITHOUT a
   *  systemPrompt are deterministic-by-design (e.g. structural audits). */
  llm?: LLMAbstraction;
  /** Optional per-run agent persona/context (system prompt addendum). */
  agentContext?: string;
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
      result.withGraph = await this.runLane(def, input, 'with-graph', runId, stream, paceMs, opts.llm, opts.agentContext);
    }
    if (opts.mode === 'without-graph' || opts.mode === 'compare') {
      result.withoutGraph = await this.runLane(def, input, 'without-graph', runId, stream, paceMs, undefined, undefined);
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
    llm: LLMAbstraction | undefined,
    agentContext: string | undefined,
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
      if (lane === 'with-graph') {
        const ctx: import('./types.js').WithGraphContext = { obligations: fetched, llm, agentContext };
        if (def.systemPrompt) {
          // Reasoning agents are LLM-driven by contract. There is NO
          // deterministic fallback — the platform's value is the model's
          // natural-language analysis and reasoning trace. If the model
          // cannot produce schema-valid output, surface an honest error
          // instead of a templated placeholder.
          if (!llm) {
            throw new Error(
              'This agent is LLM-driven and requires a configured model provider, but none is available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.',
            );
          }
          emit({
            type: 'agent.thinking',
            lane,
            atIso: nowIso(),
            message: 'Reasoning over the case against the grounded obligation set (LLM-driven).',
          });
          await pace();
          output = await generateViaLLM(def, input, fetched, llm, def.systemPrompt, agentContext);
        } else {
          // Deterministic-by-design agents (e.g. structural document audits).
          output = await def.runWithGraph(input, ctx);
        }
      } else {
        output = await def.runWithoutGraph(input);
      }
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
        // The decision-trail "why" is the agent's actual reasoning for this
        // obligation (LLM-generated when the agent runs through the LLM path),
        // falling back to the obligation title only when no reasoning exists.
        let reasoning: string | undefined;
        if (output != null && def.explainObligation) {
          try { reasoning = def.explainObligation(output, ob); } catch { reasoning = undefined; }
        }
        if (ok) {
          satisfiedIds.push(check.obligationId);
          emit({
            type: 'obligation.satisfied',
            lane,
            atIso: nowIso(),
            obligationId: check.obligationId,
            reason: reasoning ?? ob.title ?? ob.sourceCitation,
          });
        } else {
          unsatisfiedIds.push(check.obligationId);
          emit({
            type: 'obligation.missed',
            lane,
            atIso: nowIso(),
            obligationId: check.obligationId,
            reason: reasoning ?? 'Output did not satisfy obligation check.',
          });
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

    let gateReason: string | undefined;
    if (output != null && def.explainGate) {
      try { gateReason = def.explainGate(output); } catch { gateReason = undefined; }
    }
    emit({
      type: 'output.gated',
      lane,
      atIso: nowIso(),
      passed: score.strictGatePass,
      violations: score.violations,
      reason: gateReason,
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

/* ── LLM-driven generation (default execution path) ──────────────── */

async function generateViaLLM<TInput, TOutput>(
  def: TaskAgentDefinition<TInput, TOutput>,
  input: TInput,
  obligations: ObligationNode[],
  llm: LLMAbstraction,
  systemPrompt: string,
  agentContext: string | undefined,
): Promise<TOutput> {
  const citationsBlock = obligations.length
    ? obligations
        .map(
          (o) =>
            `- [${o.obligationId}] ${o.sourceCitation} \u2014 ${(o.title ?? '').slice(0, 160)}`,
        )
        .join('\n')
    : '(no obligations loaded)';

  const allowedCitations = obligations.map((o) => o.sourceCitation);
  const allowedObligationIds = obligations.map((o) => o.obligationId);

  const system = [
    systemPrompt.trim(),
    agentContext ? `\n## Agent Context\n${agentContext.trim()}` : '',
    `\n## Grounded Obligations (the ONLY citations you may use)\n${citationsBlock}`,
    [
      '\n## How to answer',
      '- Do the actual work. Analyse the SPECIFIC facts in the Input and reach concrete, substantive conclusions \u2014 the real technical/clinical finding for THIS case. Do NOT restate the input or merely describe the process.',
      '- Where the evidence supports an inference, make it and explain the mechanism plainly. Do not retreat to "insufficient evidence" when the Input contains a clear signal.',
      '- Ground every regulatory claim in the supplied obligations. The "citations" array MUST be a subset of the listed source citations \u2014 never invent one.',
      `- The "addressedObligations" array MUST be a subset of: ${allowedObligationIds.join(', ') || '(none)'}.`,
      '- Be specific and regulatorily precise. No filler, no boilerplate, no placeholders.',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Task: ${def.name} \u2014 ${def.oneLiner}`,
    `Process: ${def.processId}`,
    `Allowed citations (verbatim): ${JSON.stringify(allowedCitations)}`,
    `Allowed obligation IDs: ${JSON.stringify(allowedObligationIds)}`,
    `Input:\n${JSON.stringify(input, null, 2)}`,
  ].join('\n\n');

  const response = await llm.completeJSON<TOutput>(
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: 4096,
    },
    def.outputSchema,
    { structuredOutput: true, minContextTokens: obligations.length > 6 ? 32000 : undefined },
  );

  // Final validation pass to be safe \u2014 throws if the LLM drifted.
  return def.outputSchema.parse(response);
}