import type { ZodSchema } from 'zod';
import type { BaseGroundedAgent } from '../agents/BaseGroundedAgent.js';
import type { GroundedAgentContext, GroundedAgentResult } from '../agents/types.js';
import type { ObligationNode } from '../graph/types.js';
import type { ObligationGraph } from '../graph/ObligationGraph.js';
import { MockGraph } from './MockGraph.js';
import { MockLLM } from './MockLLM.js';
import type { HarnessResult, MockLLMResponse, MockEvidenceAtom } from './types.js';
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
 */
export class TestHarness {
  private graph: any = new MockGraph();
  private mockLLM = new MockLLM();
  private mockAtoms: MockEvidenceAtom[] = [];
  private inMemoryTrace = new InMemoryTraceService();
  private llm: LLMAbstraction = new LLMAbstraction([this.mockLLM]);

  withMockGraph(obligations: ObligationNode[]): this {
    const g = new MockGraph();
    Promise.all(obligations.map((o) => g.upsertObligation(o)));
    this.graph = g;
    return this;
  }

  withGraph(graph: ObligationGraph): this {
    this.graph = graph;
    return this;
  }

  withMockLLM(responses: MockLLMResponse[]): this {
    for (const r of responses) this.mockLLM.addResponse(r);
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

  buildDeps() {
    return {
      graph: this.graph,
      traceService: this.inMemoryTrace as unknown as DecisionTraceService,
      qualificationGate: new QualificationGate(this.graph),
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
    const ctx: GroundedAgentContext = {
      processInstanceId: context.processInstanceId ?? 'pi-test',
      workspaceId: context.workspaceId ?? 'ws-test',
      processType: context.processType ?? 'GENERIC',
      jurisdiction: context.jurisdiction ?? 'GLOBAL',
      availableEvidenceTypes:
        context.availableEvidenceTypes ?? this.mockAtoms.map((a) => a.evidenceType),
      traceCtx:
        context.traceCtx ?? (await this.inMemoryTrace.startTrace('pi-test')),
      metadata: context.metadata,
    };

    const start = Date.now();
    const agentResult: GroundedAgentResult<O> = await agent.run(input, ctx);
    const totalMs = Date.now() - start;

    const traceChain = await this.inMemoryTrace.getTraceChain(ctx.processInstanceId);
    return {
      agentResult,
      traceChain,
      mockLLMCallLog: this.mockLLM.callLog,
      obligationCoverage: await this.graph.getCoverageMap(ctx.processInstanceId),
      timing: { totalMs, llmMs: 0, graphMs: 0 },
    };
  }

  // === Assertions ===
  private traceA = new TraceAssertions();
  private complianceA = new ComplianceAssertions();

  assertTraceChainValid(result: HarnessResult): void {
    this.traceA.assertChainValid(result.traceChain);
  }
  assertObligationsCovered(result: HarnessResult, obligationIds: string[]): void {
    if (!result.agentResult.compliance) throw new Error('No compliance result');
    this.complianceA.assertCovers(result.agentResult.compliance, obligationIds);
  }
  assertNoComplianceGaps(result: HarnessResult): void {
    if (!result.agentResult.compliance) throw new Error('No compliance result');
    this.complianceA.assertNoGaps(result.agentResult.compliance);
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

  reset(): void {
    this.mockLLM.reset();
    this.inMemoryTrace.reset();
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

  async startTrace(processInstanceId: string) {
    const traceId = `trace-${processInstanceId}-${Math.random().toString(36).slice(2, 8)}`;
    this.chains.set(processInstanceId, []);
    this.byTraceId.set(traceId, []);
    this.seqByTrace.set(traceId, 0);
    const ctx = { processInstanceId, traceId };
    await this.logEvent(ctx, { eventType: 'PROCESS_STARTED', actor: 'system' });
    return ctx;
  }

  async logEvent(ctx: { processInstanceId: string; traceId: string }, event: any) {
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
    const entry = { ...payload, currentHash, createdAt: new Date(), id: chain.length };
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
