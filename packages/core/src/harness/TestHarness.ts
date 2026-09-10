import type { ZodSchema } from 'zod';
import type { BaseGroundedAgent } from '../agents/BaseGroundedAgent.js';
import type { GroundedAgentContext, GroundedAgentResult } from '../agents/types.js';
import type { ObligationNode } from '../graph/types.js';
import type { ObligationGraph } from '../graph/ObligationGraph.js';
import { MockGraph } from './MockGraph.js';
import { MockLLM } from './MockLLM.js';
import type { HarnessResult, MockLLMResponse, MockEvidenceAtom, QualificationStatus } from './types.js';
import { TraceAssertions } from './TraceAssertions.js';
import { ComplianceAssertions } from './ComplianceAssertions.js';
import { LLMAbstraction } from '../llm/LLMAbstraction.js';
import { DecisionTraceService } from '../traceability/DecisionTraceService.js';
import { QualificationGate } from '../guardrails/QualificationGate.js';
import { ComplianceValidator } from '../guardrails/ComplianceValidator.js';
import { StrictGate } from '../guardrails/StrictGate.js';
import { PromptComposer } from '../agents/PromptComposer.js';

/**
 * Agent test harness. Wires up an in-memory graph + mock LLM + in-memory trace
 * service so agents can be tested without external dependencies while still
 * exercising the full sealed lifecycle (qualification, validation, compliance).
 *
 * The graph handed to agents (via `buildDeps()`) is a stable forwarding handle:
 * `withGraph()` / `withMockGraph()` swap the *target* so agents constructed
 * earlier keep seeing the current graph. That is what lets `HarnessRunner`
 * re-seed the graph between scenarios without rebuilding every agent. The
 * handle also times every graph call for `HarnessResult.timing`.
 */
export class TestHarness {
  private graphTarget: MockGraph | ObligationGraph = new MockGraph();
  private graphStats = { ms: 0, calls: 0 };
  private readonly graphHandle: ObligationGraph = this.createGraphHandle();
  private readonly mockLLM = new MockLLM();
  private mockAtoms: MockEvidenceAtom[] = [];
  private readonly inMemoryTrace = new InMemoryTraceService();
  private llm: LLMAbstraction = new LLMAbstraction([this.mockLLM]);

  /** Seed a fresh in-memory graph with the given obligations. */
  withMockGraph(obligations: ObligationNode[]): this {
    this.graphTarget = new MockGraph().seed(obligations);
    return this;
  }

  withGraph(graph: ObligationGraph | MockGraph): this {
    this.graphTarget = graph;
    return this;
  }

  /** Append canned responses. Pass `{ replace: true }` to start from a clean slate. */
  withMockLLM(responses: MockLLMResponse[], options: { replace?: boolean } = {}): this {
    if (options.replace) this.mockLLM.setResponses(responses);
    else for (const r of responses) this.mockLLM.addResponse(r);
    return this;
  }

  withMockEvidence(atoms: MockEvidenceAtom[]): this {
    this.mockAtoms = atoms;
    return this;
  }

  withRealLLM(llm: LLMAbstraction): this {
    this.llm = llm;
    return this;
  }

  /** The graph currently backing the handle. Returns the MockGraph when one is in use. */
  get mockGraph(): MockGraph | null {
    return this.graphTarget instanceof MockGraph ? this.graphTarget : null;
  }

  get llmMock(): MockLLM {
    return this.mockLLM;
  }

  get traceService(): InMemoryTraceService {
    return this.inMemoryTrace;
  }

  buildDeps() {
    return {
      graph: this.graphHandle,
      traceService: this.inMemoryTrace as unknown as DecisionTraceService,
      qualificationGate: new QualificationGate(this.graphHandle),
      complianceValidator: new ComplianceValidator(),
      strictGate: new StrictGate(),
      promptComposer: new PromptComposer(),
      llm: this.llm,
    };
  }

  async runAgent<I, O>(
    agent: BaseGroundedAgent<I, O>,
    input: I,
    context: Partial<GroundedAgentContext> = {},
  ): Promise<HarnessResult<O>> {
    const processInstanceId = context.processInstanceId ?? 'pi-test';
    const ctx: GroundedAgentContext = {
      processInstanceId,
      workspaceId: context.workspaceId ?? 'ws-test',
      processId: context.processId,
      processType: context.processType ?? 'GENERIC',
      jurisdiction: context.jurisdiction ?? 'GLOBAL',
      availableEvidenceTypes:
        context.availableEvidenceTypes ?? this.mockAtoms.map((a) => a.evidenceType),
      traceCtx:
        context.traceCtx ?? (await this.inMemoryTrace.startTrace(processInstanceId, 'tenant-test')),
      metadata: context.metadata,
    };

    const llmCallsBefore = this.mockLLM.callLog.length;
    const graphBefore = { ...this.graphStats };
    const start = performance.now();
    const agentResult: GroundedAgentResult<O> = await agent.run(input, ctx);
    const totalMs = performance.now() - start;

    const callsThisRun = this.mockLLM.callLog.slice(llmCallsBefore);
    if (agentResult.compliance && this.mockGraph) {
      this.mockGraph.markCovered(processInstanceId, agentResult.compliance.satisfied);
    }

    const traceChain = await this.inMemoryTrace.getTraceChain(ctx.processInstanceId);
    return {
      agentResult,
      traceChain,
      mockLLMCallLog: this.mockLLM.callLog,
      obligationCoverage: await this.graphHandle.getCoverageMap(ctx.processInstanceId),
      timing: {
        totalMs,
        llmMs: callsThisRun.reduce((sum, c) => sum + c.durationMs, 0),
        graphMs: this.graphStats.ms - graphBefore.ms,
        graphCalls: this.graphStats.calls - graphBefore.calls,
      },
    };
  }

  // === Assertions ===
  private traceA = new TraceAssertions();
  private complianceA = new ComplianceAssertions();

  assertTraceChainValid(result: HarnessResult): void {
    this.traceA.assertChainValid(result.traceChain);
  }
  assertHasEvent(result: HarnessResult, eventType: string): void {
    this.traceA.assertHasEvent(result.traceChain, eventType);
  }
  assertNoEvent(result: HarnessResult, eventType: string): void {
    this.traceA.assertNoEvent(result.traceChain, eventType);
  }
  assertObligationsCovered(result: HarnessResult, obligationIds: string[]): void {
    if (!result.agentResult.compliance) throw new Error('No compliance result');
    this.complianceA.assertCovers(result.agentResult.compliance, obligationIds);
  }
  assertNoComplianceGaps(result: HarnessResult): void {
    if (!result.agentResult.compliance) throw new Error('No compliance result');
    this.complianceA.assertNoGaps(result.agentResult.compliance);
  }
  assertComplianceScoreAbove(result: HarnessResult, threshold: number): void {
    if (!result.agentResult.compliance) throw new Error('No compliance result');
    this.complianceA.assertScoreAbove(result.agentResult.compliance, threshold);
  }
  assertLLMCallCount(expected: number): void {
    if (this.mockLLM.callLog.length !== expected) {
      throw new Error(`Expected ${expected} LLM calls, got ${this.mockLLM.callLog.length}`);
    }
  }
  assertConfidenceAbove(result: HarnessResult, threshold: number): void {
    const c = result.agentResult.confidence ?? 0;
    if (c < threshold) throw new Error(`Confidence ${c} below ${threshold}`);
  }
  assertSuccess(result: HarnessResult): void {
    if (!result.agentResult.success) {
      throw new Error(`Expected agent success but it failed: ${result.agentResult.error ?? 'unknown error'}`);
    }
  }
  assertFailed(result: HarnessResult, errorPattern?: string | RegExp): void {
    if (result.agentResult.success) throw new Error('Expected agent failure but it succeeded');
    if (errorPattern) {
      const re = typeof errorPattern === 'string' ? new RegExp(errorPattern, 'i') : errorPattern;
      const message = result.agentResult.error ?? '';
      if (!re.test(message)) throw new Error(`Error "${message}" does not match ${re}`);
    }
  }
  assertQualificationStatus(result: HarnessResult, expected: QualificationStatus): void {
    const actual = result.agentResult.qualification?.status;
    if (actual !== expected) throw new Error(`Expected qualification ${expected}, got ${actual ?? 'none'}`);
  }
  /** Deep-subset match: every key in `expected` must equal the output's value. */
  assertOutputMatches(result: HarnessResult, expected: Record<string, unknown>): void {
    const mismatches = subsetMismatches(result.agentResult.data, expected, '');
    if (mismatches.length) throw new Error(`Output mismatch: ${mismatches.join('; ')}`);
  }

  /** Clears the LLM call log and every trace chain. Canned responses and the graph are kept. */
  reset(): void {
    this.mockLLM.reset();
    this.inMemoryTrace.reset();
    this.graphStats = { ms: 0, calls: 0 };
  }

  private createGraphHandle(): ObligationGraph {
    return new Proxy({} as ObligationGraph, {
      get: (_target, prop) => {
        const target = this.graphTarget as unknown as Record<PropertyKey, unknown>;
        const value = target[prop];
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          const started = performance.now();
          const record = () => {
            this.graphStats.ms += performance.now() - started;
            this.graphStats.calls += 1;
          };
          const out = (value as (...a: unknown[]) => unknown).apply(target, args);
          if (out instanceof Promise) return out.finally(record);
          record();
          return out;
        };
      },
      has: (_target, prop) => prop in (this.graphTarget as object),
    });
  }
}

/** Returns human-readable descriptions of where `expected` is not a subset of `actual`. */
export function subsetMismatches(actual: unknown, expected: unknown, path: string): string[] {
  const here = path || '$';
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${here}: expected array, got ${describe(actual)}`];
    if (actual.length !== expected.length) {
      return [`${here}: expected ${expected.length} items, got ${actual.length}`];
    }
    return expected.flatMap((item, i) => subsetMismatches(actual[i], item, `${here}[${i}]`));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
      return [`${here}: expected object, got ${describe(actual)}`];
    }
    const a = actual as Record<string, unknown>;
    return Object.entries(expected as Record<string, unknown>).flatMap(([key, value]) =>
      subsetMismatches(a[key], value, path ? `${path}.${key}` : key),
    );
  }
  return Object.is(actual, expected) ? [] : [`${here}: expected ${describe(expected)}, got ${describe(actual)}`];
}

function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * In-memory replacement for DecisionTraceService that has the same shape used
 * by BaseGroundedAgent (startTrace + logEvent + getTraceChain), without
 * requiring Postgres.
 */
export class InMemoryTraceService {
  private chains = new Map<string, any[]>();
  private byTraceId = new Map<string, any[]>();
  private seqByTrace = new Map<string, number>();

  async startTrace(processInstanceId: string, tenantId: string = 'tenant-test') {
    const traceId = `trace-${processInstanceId}-${Math.random().toString(36).slice(2, 8)}`;
    this.chains.set(processInstanceId, []);
    this.byTraceId.set(traceId, []);
    this.seqByTrace.set(traceId, 0);
    const ctx = { processInstanceId, traceId, tenantId };
    await this.logEvent(ctx, { eventType: 'PROCESS_STARTED', actor: 'system' });
    return ctx;
  }

  async logEvent(ctx: { processInstanceId: string; traceId: string; tenantId?: string }, event: any) {
    const seq = this.seqByTrace.get(ctx.traceId) ?? 0;
    const chain = this.chains.get(ctx.processInstanceId) ?? [];
    const previousHash = seq === 0 ? '0'.repeat(64) : chain[chain.length - 1].currentHash;
    const payload = {
      processInstanceId: ctx.processInstanceId,
      traceId: ctx.traceId,
      sequenceNumber: seq,
      previousHash,
      eventType: event.eventType,
      actor: event.actor,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      decision: event.decision ?? null,
      inputData: event.inputData ?? {},
      outputData: event.outputData ?? {},
      reasons: event.reasons ?? [],
      humanSummary: event.humanSummary ?? null,
      regulatoryContext: event.regulatoryContext ?? {},
      evidenceJustification: event.evidenceJustification ?? {},
      complianceAssertion: event.complianceAssertion ?? {},
    };
    const currentHash = DecisionTraceService.computeHash(payload);
    const entry = { ...payload, tenantId: ctx.tenantId, currentHash, createdAt: new Date(), id: chain.length };
    chain.push(entry);
    this.chains.set(ctx.processInstanceId, chain);
    this.byTraceId.set(ctx.traceId, chain);
    this.seqByTrace.set(ctx.traceId, seq + 1);
    return entry;
  }

  async getTraceChain(processInstanceId: string) {
    return this.chains.get(processInstanceId) ?? [];
  }

  reset(): void {
    this.chains.clear();
    this.byTraceId.clear();
    this.seqByTrace.clear();
  }
}

// Re-export for harness consumers that want a direct dep
export { ZodSchema };
