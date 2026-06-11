/**
 * Adversarial trust-bar suite. Every test here is an attack: an agent, forger,
 * or output that tries to bypass the qualification gate, the strict gate, the
 * compliance validators, or the hash-chained trace. The platform must defeat
 * each one — these tests fail if an attack succeeds.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BaseGroundedAgent } from '../src/agents/BaseGroundedAgent.js';
import type { GroundedAgentContext } from '../src/agents/types.js';
import { TestHarness, InMemoryTraceService } from '../src/harness/TestHarness.js';
import { MockGraph } from '../src/harness/MockGraph.js';
import { ChainVerifier } from '../src/traceability/ChainVerifier.js';
import { DecisionTraceService } from '../src/traceability/DecisionTraceService.js';
import type { DecisionTraceEntry } from '../src/traceability/types.js';
import type { ObligationNode, ObligationExplanation } from '../src/graph/types.js';
import { QualificationGate } from '../src/guardrails/QualificationGate.js';
import { CompliancePipeline } from '../src/guardrails/CompliancePipeline.js';
import { ClaimCoverageValidator } from '../src/guardrails/validators/ClaimCoverageValidator.js';
import { EvidenceBackedComplianceValidator } from '../src/guardrails/validators/EvidenceBackedComplianceValidator.js';
import { ConstraintEvaluator } from '../src/guardrails/validators/ConstraintEvaluator.js';
import { CitationVerifier } from '../src/guardrails/validators/CitationVerifier.js';
import { RegulatoryContradictionDetector } from '../src/guardrails/validators/RegulatoryContradictionDetector.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const OutputSchema = z.object({
  summary: z.string(),
  addressedObligations: z.array(z.string()),
});
type Output = z.infer<typeof OutputSchema>;

function obligation(overrides: Partial<ObligationNode> & { obligationId: string }): ObligationNode {
  return {
    jurisdiction: 'GLOBAL',
    artifactType: 'CAPA',
    processType: 'capa',
    kind: 'obligation',
    title: overrides.obligationId,
    text: 'requirement text',
    sourceCitation: `src:${overrides.obligationId}`,
    version: '1',
    mandatory: true,
    requiredEvidenceTypes: [],
    applicability: {},
    metadata: {},
    ...overrides,
  };
}

const AGENT_CONFIG = {
  name: 'adversary',
  description: 'attack agent',
  version: '1.0.0',
  persona: 'p',
  systemPrompt: 's',
  processTypes: ['capa'],
  requiredObligations: ['O1'],
};

class HonestAgent extends BaseGroundedAgent<{ note: string }, Output> {
  executeCalls = 0;
  protected getRequiredObligations(): string[] {
    return ['O1'];
  }
  protected getOutputSchema() {
    return OutputSchema;
  }
  protected async execute(input: { note: string }): Promise<Output> {
    this.executeCalls++;
    return { summary: input.note, addressedObligations: ['O1'] };
  }
}

async function graphWithO1(evidence: string[] = ['note']): Promise<MockGraph> {
  const graph = new MockGraph();
  await graph.upsertObligation(obligation({ obligationId: 'O1', requiredEvidenceTypes: evidence }));
  return graph;
}

// ---------------------------------------------------------------------------
// 1. Lifecycle bypass attacks
// ---------------------------------------------------------------------------

describe('attack: lifecycle bypass', () => {
  it('a subclass that overrides run() cannot even be constructed', async () => {
    class RogueAgent extends BaseGroundedAgent<{ note: string }, Output> {
      // Skip qualification, validation, and tracing entirely.
      override async run(): Promise<never> {
        throw new Error('rogue lifecycle executed');
      }
      protected getRequiredObligations(): string[] {
        return [];
      }
      protected getOutputSchema() {
        return OutputSchema;
      }
      protected async execute(): Promise<Output> {
        return { summary: 'rogue', addressedObligations: [] };
      }
    }
    const harness = new TestHarness().withGraph((await graphWithO1()) as never);
    expect(() => new RogueAgent(AGENT_CONFIG, harness.buildDeps())).toThrowError(/sealed/);
  });

  it('a class-field run replacement is rejected at construction', async () => {
    class FieldRogueAgent extends BaseGroundedAgent<{ note: string }, Output> {
      // Class fields initialize after super() — the sealed own property is
      // already non-configurable, so this definition must throw.
      override run = async (): Promise<never> => {
        throw new Error('rogue lifecycle executed');
      };
      protected getRequiredObligations(): string[] {
        return [];
      }
      protected getOutputSchema() {
        return OutputSchema;
      }
      protected async execute(): Promise<Output> {
        return { summary: 'rogue', addressedObligations: [] };
      }
    }
    const harness = new TestHarness().withGraph((await graphWithO1()) as never);
    expect(() => new FieldRogueAgent(AGENT_CONFIG, harness.buildDeps())).toThrow(TypeError);
  });

  it('run cannot be reassigned or redefined after construction', async () => {
    const harness = new TestHarness().withGraph((await graphWithO1()) as never);
    const agent = new HonestAgent(AGENT_CONFIG, harness.buildDeps());
    expect(() => {
      (agent as unknown as Record<string, unknown>)['run'] = async () => ({ success: true });
    }).toThrow(TypeError);
    expect(() => {
      Object.defineProperty(agent, 'run', { value: async () => ({ success: true }) });
    }).toThrow(TypeError);
  });

  it('execute() is unreachable when qualification blocks', async () => {
    const graph = await graphWithO1(['evidence_the_agent_does_not_have']);
    const harness = new TestHarness().withGraph(graph as never);
    const agent = new HonestAgent(AGENT_CONFIG, harness.buildDeps());
    const result = await harness.runAgent(agent, { note: 'x' }, {
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: [],
    });
    expect(result.agentResult.success).toBe(false);
    expect(result.agentResult.qualification?.status).toBe('BLOCKED');
    expect(agent.executeCalls).toBe(0);
    const eventTypes = result.traceChain.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain('QUALIFICATION_BLOCKED');
    expect(eventTypes).not.toContain('AGENT_SPAWNED');
  });

  it('lying about required obligations does not bypass the gate', async () => {
    // The gate discovers obligations from the graph by process type — an agent
    // declaring zero required obligations still faces every mandatory one.
    class LiarAgent extends HonestAgent {
      protected override getRequiredObligations(): string[] {
        return [];
      }
    }
    const graph = await graphWithO1(['evidence_the_agent_does_not_have']);
    const harness = new TestHarness().withGraph(graph as never);
    const agent = new LiarAgent(AGENT_CONFIG, harness.buildDeps());
    const result = await harness.runAgent(agent, { note: 'x' }, {
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: [],
    });
    expect(result.agentResult.success).toBe(false);
    expect(result.agentResult.qualification?.status).toBe('BLOCKED');
    expect(agent.executeCalls).toBe(0);
  });

  it('output that violates the schema is withheld and the failure is traced', async () => {
    class MalformedOutputAgent extends BaseGroundedAgent<{ note: string }, Output> {
      protected getRequiredObligations(): string[] {
        return ['O1'];
      }
      protected getOutputSchema() {
        return OutputSchema;
      }
      protected async execute(): Promise<Output> {
        // Smuggle junk past the type system.
        return { totally: 'wrong shape' } as unknown as Output;
      }
    }
    const harness = new TestHarness().withGraph((await graphWithO1()) as never);
    const agent = new MalformedOutputAgent(AGENT_CONFIG, harness.buildDeps());
    const result = await harness.runAgent(agent, { note: 'x' }, {
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: ['note'],
    });
    expect(result.agentResult.success).toBe(false);
    expect(result.agentResult.data).toBeUndefined();
    expect(result.agentResult.error).toMatch(/validation failed/i);
    const eventTypes = result.traceChain.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain('AGENT_FAILED');
    expect(eventTypes).not.toContain('AGENT_COMPLETED');
  });
});

// ---------------------------------------------------------------------------
// 2. Trace forgery attacks
// ---------------------------------------------------------------------------

async function forgeableChain(id: string): Promise<DecisionTraceEntry[]> {
  const svc = new InMemoryTraceService();
  const ctx = await svc.startTrace(id);
  await svc.logEvent(ctx, { eventType: 'QUALIFICATION_PASSED', actor: 'agent' });
  await svc.logEvent(ctx, {
    eventType: 'OBLIGATION_VIOLATED',
    actor: 'agent',
    entityType: 'obligation',
    entityId: 'O1',
    reasons: ['effectiveness check missing'],
  });
  await svc.logEvent(ctx, { eventType: 'AGENT_COMPLETED', actor: 'agent' });
  return (await svc.getTraceChain(id)) as DecisionTraceEntry[];
}

describe('attack: trace forgery', () => {
  const verifier = new ChainVerifier();

  it('tampering with a damaging entry is detected at the exact index', async () => {
    const chain = await forgeableChain('forge-1');
    // Soften the violation after the fact.
    chain[2]!.eventType = 'OBLIGATION_SATISFIED';
    chain[2]!.reasons = [];
    const result = verifier.verifyEntries(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('reordering entries breaks the chain', async () => {
    const chain = await forgeableChain('forge-2');
    const reordered = [chain[0]!, chain[2]!, chain[1]!, chain[3]!];
    expect(verifier.verifyEntries(reordered).valid).toBe(false);
  });

  it('deleting an incriminating entry breaks the chain', async () => {
    const chain = await forgeableChain('forge-3');
    const scrubbed = chain.filter((e) => e.eventType !== 'OBLIGATION_VIOLATED');
    expect(verifier.verifyEntries(scrubbed).valid).toBe(false);
  });

  it('inserting a fabricated entry breaks the chain', async () => {
    const chain = await forgeableChain('forge-4');
    const forged: DecisionTraceEntry = {
      ...chain[1]!,
      sequenceNumber: 99,
      eventType: 'OBLIGATION_SATISFIED',
      currentHash: 'a'.repeat(64),
      previousHash: chain[3]!.currentHash,
    };
    expect(verifier.verifyEntries([...chain, forged]).valid).toBe(false);
  });

  it('a smart forger who recomputes every hash is caught by the signature anchor', async () => {
    const chain = await forgeableChain('forge-5');
    const original = verifier.verifyEntries(chain);
    expect(original.valid).toBe(true);

    // Full recompute: alter entry 2, then rebuild every hash downstream so the
    // chain is internally consistent again.
    const forged = chain.map((e) => ({ ...e }));
    forged[2]!.eventType = 'OBLIGATION_SATISFIED';
    forged[2]!.reasons = [];
    let prev = forged[1]!.currentHash;
    for (let i = 2; i < forged.length; i++) {
      const e = forged[i]!;
      e.previousHash = prev;
      e.currentHash = DecisionTraceService.computeHash({
        processInstanceId: e.processInstanceId,
        traceId: e.traceId,
        sequenceNumber: e.sequenceNumber,
        previousHash: e.previousHash,
        eventType: e.eventType,
        actor: e.actor,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        decision: e.decision ?? null,
        inputData: e.inputData,
        outputData: e.outputData,
        reasons: e.reasons,
        humanSummary: e.humanSummary ?? null,
        regulatoryContext: e.regulatoryContext,
        evidenceJustification: e.evidenceJustification,
        complianceAssertion: e.complianceAssertion,
      });
      prev = e.currentHash;
    }

    // Internal consistency alone cannot catch this — that is expected for any
    // hash chain without an external anchor...
    const reverified = verifier.verifyEntries(forged);
    expect(reverified.valid).toBe(true);
    // ...but the chain signature recorded at attestation time (verification
    // reports, audit packs) no longer matches. The anchor is the defense.
    expect(reverified.signatureHash).not.toBe(original.signatureHash);
  });

  it('truncating the tail of the chain is caught by the signature anchor', async () => {
    const chain = await forgeableChain('forge-6');
    const original = verifier.verifyEntries(chain);
    const truncated = verifier.verifyEntries(chain.slice(0, 2));
    expect(truncated.valid).toBe(true); // internally consistent...
    expect(truncated.totalEntries).not.toBe(original.totalEntries);
    expect(truncated.signatureHash).not.toBe(original.signatureHash); // ...anchor catches it.
  });
});

// ---------------------------------------------------------------------------
// 3. Validation evasion attacks
// ---------------------------------------------------------------------------

async function attackGraph(): Promise<MockGraph> {
  const graph = new MockGraph();
  await graph.upsertObligation(
    obligation({ obligationId: 'O1', requiredEvidenceTypes: ['root_cause_analysis'] }),
  );
  await graph.upsertObligation(obligation({ obligationId: 'O2' }));
  await graph.upsertObligation(obligation({ obligationId: 'O3', mandatory: false }));
  await graph.upsertRelationship('O1', 'O3', 'CONFLICTS_WITH');
  return graph;
}

function buildPipeline(graph: MockGraph): CompliancePipeline {
  return new CompliancePipeline([
    new ClaimCoverageValidator(),
    new EvidenceBackedComplianceValidator(),
    new ConstraintEvaluator(graph as never),
    new CitationVerifier(graph as never),
    new RegulatoryContradictionDetector(graph as never),
  ]);
}

const COMPLIANCE_CTX = {
  processType: 'capa',
  jurisdiction: 'GLOBAL',
  processInstanceId: 'pi-attack',
  agentId: 'adversary@1.0.0',
};

describe('attack: validation evasion', () => {
  it('an empty output cannot pass by violating nothing', async () => {
    const graph = await attackGraph();
    const obligations = await graph.getObligationsForProcess('capa', 'GLOBAL');
    const report = await buildPipeline(graph).validate({}, obligations, COMPLIANCE_CTX);
    expect(report.passedHardChecks).toBe(false);
    expect(report.status).toBe('REQUIRES_REVIEW');
    const uncovered = report.findings.filter(
      (f) => f.validator === 'ClaimCoverageValidator' && f.severity === 'error',
    );
    expect(uncovered.map((f) => f.obligationId)).toEqual(expect.arrayContaining(['O1', 'O2']));
  });

  it('claiming compliance without the required evidence is rejected', async () => {
    const graph = await attackGraph();
    const obligations = await graph.getObligationsForProcess('capa', 'GLOBAL');
    const output = {
      summary: 'all good, trust me',
      addressedObligations: ['O1', 'O2'],
      evidence: [], // no root_cause_analysis provided
    };
    const report = await buildPipeline(graph).validate(output, obligations, COMPLIANCE_CTX);
    expect(report.passedHardChecks).toBe(false);
    const missing = report.findings.find(
      (f) => f.validator === 'EvidenceBackedComplianceValidator' && f.obligationId === 'O1',
    );
    expect(missing?.severity).toBe('error');
    expect(missing?.message).toContain('root_cause_analysis');
  });

  it('citing a nonexistent obligation is flagged', async () => {
    const graph = await attackGraph();
    const obligations = await graph.getObligationsForProcess('capa', 'GLOBAL');
    const output = {
      summary: 'see GHOST.ART.999 for justification',
      addressedObligations: ['O1', 'O2', 'GHOST.OBL.42'],
      evidence: ['root_cause_analysis'],
      citations: ['GHOST.ART.999'],
    };
    const report = await buildPipeline(graph).validate(output, obligations, COMPLIANCE_CTX);
    const fakeClaim = report.findings.find(
      (f) => f.validator === 'ClaimCoverageValidator' && f.obligationId === 'GHOST.OBL.42',
    );
    expect(fakeClaim?.severity).toBe('warning');
    const danglingCitations = report.findings.filter(
      (f) => f.validator === 'CitationVerifier' && f.message.includes('GHOST'),
    );
    expect(danglingCitations.length).toBeGreaterThan(0);
  });

  it('claiming two conflicting obligations is a critical failure', async () => {
    const graph = await attackGraph();
    const obligations = await graph.getObligationsForProcess('capa', 'GLOBAL');
    const output = {
      summary: 'satisfying everything at once',
      addressedObligations: ['O1', 'O2', 'O3'],
      evidence: ['root_cause_analysis'],
    };
    const report = await buildPipeline(graph).validate(output, obligations, COMPLIANCE_CTX);
    expect(report.status).toBe('FAIL');
    expect(report.requiresHumanReview).toBe(true);
    const conflict = report.findings.find(
      (f) => f.validator === 'RegulatoryContradictionDetector' && f.severity === 'critical',
    );
    expect(conflict?.message).toContain('CONFLICTS_WITH');
  });

  it('ignoring a mandatory cross-referenced obligation is flagged', async () => {
    class XrefGraph extends MockGraph {
      override async explainObligation(id: string): Promise<ObligationExplanation> {
        const base = await super.explainObligation(id);
        if (id === 'O1') {
          return {
            ...base,
            crossReferences: [obligation({ obligationId: 'XREG.TWIN.001', mandatory: true })],
          };
        }
        return base;
      }
    }
    const graph = new XrefGraph();
    await graph.upsertObligation(
      obligation({ obligationId: 'O1', requiredEvidenceTypes: ['root_cause_analysis'] }),
    );
    const obligations = await graph.getObligationsForProcess('capa', 'GLOBAL');
    const output = {
      summary: 'single-regulation tunnel vision',
      addressedObligations: ['O1'],
      evidence: ['root_cause_analysis'],
    };
    const report = await buildPipeline(graph).validate(output, obligations, COMPLIANCE_CTX);
    const gap = report.findings.find(
      (f) =>
        f.validator === 'RegulatoryContradictionDetector' && f.message.includes('XREG.TWIN.001'),
    );
    expect(gap?.severity).toBe('warning');
  });

  it('a hard constraint violation on a claimed obligation is critical', async () => {
    const graph = await attackGraph();
    await graph.upsertConstraint({
      constraintId: 'C1',
      appliesTo: 'O1',
      text: 'Root cause must name a verification step',
      expression: 'verificationStep',
      severity: 'hard',
      metadata: {},
    });
    const obligations = await graph.getObligationsForProcess('capa', 'GLOBAL');
    const output = {
      summary: 'no verification mentioned',
      addressedObligations: ['O1', 'O2'],
      evidence: ['root_cause_analysis'],
    };
    const report = await buildPipeline(graph).validate(output, obligations, COMPLIANCE_CTX);
    const constraintFinding = report.findings.find(
      (f) => f.validator === 'ConstraintEvaluator' && f.constraintId === 'C1',
    );
    expect(constraintFinding?.severity).toBe('critical');
    expect(report.status).toBe('FAIL');
  });
});

// ---------------------------------------------------------------------------
// 4. Qualification gate attacks
// ---------------------------------------------------------------------------

describe('attack: qualification gate', () => {
  it('evidence of the wrong type does not satisfy the gate', async () => {
    const graph = await graphWithO1(['root_cause_analysis']);
    const gate = new QualificationGate(graph as never);
    const result = await gate.check({
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidence: ['a_completely_different_document', 'note'],
      requiredObligations: ['O1'],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.missingEvidence).toContain('root_cause_analysis');
  });

  it('exactly 50% coverage stays BLOCKED — no rounding into human review', async () => {
    const graph = new MockGraph();
    await graph.upsertObligation(obligation({ obligationId: 'O1', requiredEvidenceTypes: ['a'] }));
    await graph.upsertObligation(obligation({ obligationId: 'O2', requiredEvidenceTypes: ['b'] }));
    const gate = new QualificationGate(graph as never);
    const result = await gate.check({
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidence: ['a'],
      requiredObligations: ['O1', 'O2'],
    });
    expect(result.coverageScore).toBe(0.5);
    expect(result.status).toBe('BLOCKED');
    expect(result.canProceedWithHumanApproval).toBe(false);
  });

  it('an unknown process type is OUT_OF_SCOPE and the agent does not run', async () => {
    const harness = new TestHarness().withGraph((await graphWithO1()) as never);
    const agent = new HonestAgent(AGENT_CONFIG, harness.buildDeps());
    const result = await harness.runAgent(agent, { note: 'x' }, {
      processType: 'process-that-does-not-exist',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: ['note'],
    });
    expect(result.agentResult.success).toBe(false);
    expect(result.agentResult.qualification?.status).toBe('OUT_OF_SCOPE');
    expect(agent.executeCalls).toBe(0);
  });
});
