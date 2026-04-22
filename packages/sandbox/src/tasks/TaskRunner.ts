/**
 * TaskRunner — runs a task agent in one lane (with-graph or without-graph)
 * or both lanes in compare mode. Streams plain-language `TaskEvent`s through
 * an SSEStream so the sandbox UI can show what the agent is doing.
 */

import { SSEStream } from '../runtime/SSEStream.js';
import {
  type DeterministicScore,
  type LaneResult,
  type RunResult,
  type TaskAgentDefinition,
  type TaskEvent,
  type TaskLane,
  type TaskObligation,
  newRunId,
  nowIso,
} from './types.js';

/** SSE multiplexer typed for `TaskEvent`. */
export class TaskEventStream {
  private listeners = new Set<(e: TaskEvent) => void>();
  publish(e: TaskEvent): void {
    for (const l of this.listeners) l(e);
  }
  subscribe(): AsyncIterable<TaskEvent> & { close: () => void } {
    const queue: TaskEvent[] = [];
    let resolve: ((v: IteratorResult<TaskEvent>) => void) | null = null;
    let closed = false;
    const listener = (e: TaskEvent) => {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: e, done: false });
      } else {
        queue.push(e);
      }
    };
    this.listeners.add(listener);
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            if (closed) return Promise.resolve({ value: undefined as never, done: true });
            if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
            return new Promise<IteratorResult<TaskEvent>>((r) => (resolve = r));
          },
          return: () => {
            closed = true;
            return Promise.resolve({ value: undefined as never, done: true });
          },
        };
      },
      close() {
        closed = true;
      },
    };
  }
}

export function taskEventToSSE(event: TaskEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Reuse the existing SSEStream-shaped contract for the API layer. */
export type AnyStream = SSEStream | TaskEventStream;

export interface RunOptions {
  mode: 'with-graph' | 'without-graph' | 'compare';
  stream: TaskEventStream;
  /** Slow the narration down so the UI can render each step. ms between graph steps. */
  paceMs?: number;
}

const DEFAULT_PACE_MS = 280;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function score(
  output: unknown,
  obligations: TaskObligation[],
  citationsConsulted: string[],
): DeterministicScore {
  const violations: string[] = [];
  let satisfied = 0;
  for (const ob of obligations) {
    try {
      if (ob.satisfiedBy(output)) {
        satisfied += 1;
      } else {
        violations.push(ob.obligationId);
      }
    } catch {
      violations.push(ob.obligationId);
    }
  }
  const total = obligations.length;
  return {
    coverage: total === 0 ? 0 : satisfied / total,
    citations: citationsConsulted.length,
    strictGatePass: violations.length === 0,
    violations,
    obligationsConsulted: new Set(citationsConsulted).size,
  };
}

async function runLane<TInput, TOutput>(
  def: TaskAgentDefinition<TInput, TOutput>,
  input: TInput,
  lane: TaskLane,
  runId: string,
  stream: TaskEventStream,
  paceMs: number,
): Promise<LaneResult<TOutput>> {
  const startedAt = Date.now();
  const startedIso = nowIso();
  stream.publish({ type: 'run.started', runId, taskId: def.id, lane, atIso: startedIso });

  const citations: string[] = [];
  const obligationsConsulted = new Set<string>();
  let output: TOutput | null = null;
  let error: string | undefined;

  try {
    if (lane === 'with-graph') {
      stream.publish({
        type: 'agent.thinking',
        lane,
        atIso: nowIso(),
        message: `Loading the obligation set for ${def.name.toLowerCase()}…`,
      });
      await sleep(paceMs);

      // Walk the curated graph script — these are the queries a real
      // GroundedAgent would issue against ObligationGraph during qualify().
      for (const step of def.graphScript) {
        stream.publish({
          type: 'graph.query',
          lane,
          atIso: nowIso(),
          method: step.method,
          args: step.args ?? {},
          resultCount: step.resultCount,
          message: step.message,
        });
        await sleep(paceMs);
        for (const id of step.citeObligationIds ?? []) {
          const ob = def.obligations.find((o) => o.obligationId === id);
          if (!ob) continue;
          citations.push(ob.citation);
          obligationsConsulted.add(ob.obligationId);
          stream.publish({
            type: 'graph.cite',
            lane,
            atIso: nowIso(),
            obligationId: ob.obligationId,
            citation: ob.citation,
            regulation: ob.regulation,
            summary: ob.summary,
          });
          await sleep(Math.round(paceMs * 0.6));
        }
      }

      stream.publish({
        type: 'agent.thinking',
        lane,
        atIso: nowIso(),
        message: `Composing output with ${citations.length} citations…`,
      });
      await sleep(paceMs);

      output = await def.runWithGraph(input);
    } else {
      stream.publish({
        type: 'agent.thinking',
        lane,
        atIso: nowIso(),
        message: 'Running without the obligation graph. No citations will be attached.',
      });
      await sleep(paceMs);
      output = await def.runWithoutGraph(input);
    }

    // Per-obligation satisfaction events
    for (const ob of def.obligations) {
      const ok = (() => {
        try {
          return ob.satisfiedBy(output);
        } catch {
          return false;
        }
      })();
      stream.publish({
        type: ok ? 'obligation.satisfied' : 'obligation.missed',
        lane,
        atIso: nowIso(),
        obligationId: ob.obligationId,
        reason: ok ? `${ob.citation} satisfied.` : `${ob.citation} not addressed in output.`,
      });
      await sleep(Math.round(paceMs * 0.4));
    }

    const det = score(output, def.obligations, citations);
    stream.publish({
      type: 'output.gated',
      lane,
      atIso: nowIso(),
      passed: det.strictGatePass,
      violations: det.violations,
    });

    const durationMs = Date.now() - startedAt;
    stream.publish({ type: 'run.completed', lane, runId, atIso: nowIso(), durationMs });

    return {
      lane,
      output,
      durationMs,
      citations,
      obligationsConsulted: Array.from(obligationsConsulted),
      score: det,
    };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    stream.publish({ type: 'run.error', lane, runId, atIso: nowIso(), message: error });
    return {
      lane,
      output,
      durationMs: Date.now() - startedAt,
      citations,
      obligationsConsulted: Array.from(obligationsConsulted),
      score: score(output, def.obligations, citations),
      error,
    };
  }
}

export class TaskRunner {
  async run<TInput, TOutput>(
    def: TaskAgentDefinition<TInput, TOutput>,
    input: TInput,
    opts: RunOptions,
  ): Promise<RunResult<TOutput>> {
    const runId = newRunId();
    const startedAtIso = nowIso();
    const paceMs = opts.paceMs ?? DEFAULT_PACE_MS;
    let withGraph: LaneResult<TOutput> | undefined;
    let withoutGraph: LaneResult<TOutput> | undefined;

    if (opts.mode === 'with-graph' || opts.mode === 'compare') {
      withGraph = await runLane(def, input, 'with-graph', runId, opts.stream, paceMs);
    }
    if (opts.mode === 'without-graph' || opts.mode === 'compare') {
      withoutGraph = await runLane(def, input, 'without-graph', runId, opts.stream, paceMs);
    }

    return {
      runId,
      taskId: def.id,
      startedAtIso,
      finishedAtIso: nowIso(),
      withGraph,
      withoutGraph,
    };
  }
}
