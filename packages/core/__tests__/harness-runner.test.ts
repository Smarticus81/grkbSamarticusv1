import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BaseGroundedAgent, type BaseGroundedAgentDeps } from '../src/agents/BaseGroundedAgent.js';
import type { ObligationNode } from '../src/graph/types.js';
import { TestHarness, subsetMismatches } from '../src/harness/TestHarness.js';
import { HarnessRunner, formatHarnessReport, summarizeSuites } from '../src/harness/HarnessRunner.js';
import { catalogFromNodes } from '../src/harness/ObligationCatalog.js';
import { MockGraph } from '../src/harness/MockGraph.js';

const OutputSchema = z.object({
  summary: z.string(),
  addressedObligations: z.array(z.string()),
});
type Output = z.infer<typeof OutputSchema>;

function node(id: string, evidence: string[], processType = 'CAPA'): ObligationNode {
  return {
    obligationId: id,
    jurisdiction: 'GLOBAL',
    artifactType: 'CAPA',
    processType,
    kind: 'obligation',
    title: id,
    text: `text for ${id}`,
    sourceCitation: `cite:${id}`,
    version: '1',
    mandatory: true,
    requiredEvidenceTypes: evidence,
    applicability: {},
    metadata: {},
  };
}

class ClaimAgent extends BaseGroundedAgent<{ note: string }, Output> {
  constructor(deps: BaseGroundedAgentDeps, private readonly claims: string[], name = 'ClaimAgent') {
    super(
      {
        name,
        description: 'claims obligations',
        version: '1.0.0',
        persona: 'p',
        systemPrompt: 's',
        processTypes: ['CAPA'],
        requiredObligations: claims,
      },
      deps,
    );
  }
  protected getRequiredObligations() {
    return this.claims;
  }
  protected getOutputSchema() {
    return OutputSchema;
  }
  protected async execute(input: { note: string }): Promise<Output> {
    return { summary: `processed: ${input.note}`, addressedObligations: this.claims };
  }
}

class LLMAgent extends BaseGroundedAgent<{ note: string }, Output> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'LLMAgent',
        description: 'asks the model',
        version: '1.0.0',
        persona: 'p',
        systemPrompt: 's',
        processTypes: ['CAPA'],
        requiredObligations: ['O1'],
      },
      deps,
    );
  }
  protected getRequiredObligations() {
    return ['O1'];
  }
  protected getOutputSchema() {
    return OutputSchema;
  }
  protected async execute(input: { note: string }): Promise<Output> {
    const { content } = await this.invokeLLM({ userPrompt: `Summarise ${input.note}`, traceCtx: this._context!.traceCtx });
    return { summary: content, addressedObligations: ['O1'] };
  }
}

const catalog = catalogFromNodes([
  node('O1', ['complaint_record']),
  node('O2', ['capa_procedure']),
  node('O3', ['effectiveness_check_record']),
]);

function buildRunner(harness = new TestHarness()) {
  const deps = harness.buildDeps();
  const agents: Record<string, BaseGroundedAgent<any, any>> = {
    ClaimAgent: new ClaimAgent(deps, ['O1']),
    TwoClaimAgent: new ClaimAgent(deps, ['O1', 'O2'], 'TwoClaimAgent'),
    LLMAgent: new LLMAgent(deps),
  };
  const runner = new HarnessRunner(
    harness,
    (name) => {
      const a = agents[name];
      if (!a) throw new Error(`no agent ${name}`);
      return a;
    },
    { catalog, defaultObligationsFor: (agent) => (agent === 'TwoClaimAgent' ? ['O1', 'O2'] : undefined) },
  );
  return { runner, harness };
}

describe('HarnessRunner', () => {
  it('seeds real obligations, derives evidence, and passes a happy-path scenario', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
name: happy
scenarios:
  - name: covers O1
    agent: ClaimAgent
    input: { note: hello }
    mockObligations: [O1]
    assertions:
      traceChainValid: true
      obligationsCovered: [O1]
      noComplianceGaps: true
      qualificationStatus: QUALIFIED
      hasEvents: [AGENT_COMPLETED]
      noEvents: [AGENT_FAILED]
      output: { summary: "processed: hello" }
      llmCalls: 0
`);
    expect(suite.failed).toBe(0);
    const r = suite.results[0]!;
    expect(r.ok).toBe(true);
    expect(r.qualificationStatus).toBe('QUALIFIED');
    expect(r.complianceScore).toBe(1);
    expect(r.obligationsSeeded).toEqual(['O1']);
    expect(r.traceEvents).toBeGreaterThan(2);
  });

  it('reports every failed assertion instead of stopping at the first', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
scenarios:
  - name: wrong expectations
    agent: ClaimAgent
    input: { note: hello }
    mockObligations: [O1]
    assertions:
      output: { summary: "something else" }
      llmCalls: 3
      hasEvents: [LLM_REQUEST_SENT]
`);
    const r = suite.results[0]!;
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(3);
    expect(r.error).toMatch(/output: Output mismatch: summary/);
    expect(r.error).toMatch(/llmCalls: Expected 3 LLM calls, got 0/);
    expect(r.error).toMatch(/hasEvents\(LLM_REQUEST_SENT\)/);
  });

  it('flags unknown obligation ids against the catalog', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
scenarios:
  - name: typo
    agent: ClaimAgent
    input: { note: x }
    mockObligations: [O1, NOPE.001]
`);
    expect(suite.results[0]!.ok).toBe(false);
    expect(suite.results[0]!.error).toContain('Unknown obligation "NOPE.001"');
  });

  it('blocks qualification when the scenario withholds evidence', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
scenarios:
  - name: no evidence
    agent: ClaimAgent
    input: { note: x }
    mockObligations: [O1]
    context: { availableEvidenceTypes: [] }
    assertions:
      qualificationStatus: BLOCKED
      errorMatches: "missing evidence: complaint_record"
      hasEvents: [QUALIFICATION_BLOCKED]
`);
    expect(suite.failed).toBe(0);
    expect(suite.results[0]!.success).toBe(false);
  });

  it('reports OUT_OF_SCOPE when nothing is seeded', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
scenarios:
  - name: empty graph
    agent: ClaimAgent
    input: { note: x }
    mockObligations: []
    assertions: { qualificationStatus: OUT_OF_SCOPE }
`);
    expect(suite.failed).toBe(0);
  });

  it('uses file defaults and per-agent fallbacks for obligations', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
defaults:
  mockObligations: [O1]
scenarios:
  - name: from defaults
    agent: ClaimAgent
    input: { note: a }
    assertions: { obligationsCovered: [O1] }
  - name: from agent fallback
    agent: TwoClaimAgent
    input: { note: b }
    assertions: { obligationsCovered: [O1, O2], noComplianceGaps: true }
`);
    // second scenario inherits defaults [O1] only, so O2 is *not* covered.
    expect(suite.results[0]!.ok).toBe(true);
    expect(suite.results[1]!.ok).toBe(false);
    expect(suite.results[1]!.error).toContain('Compliance missing obligations: O2');

    const fallback = await runner.runYaml(`
scenarios:
  - name: agent fallback wins without defaults
    agent: TwoClaimAgent
    input: { note: b }
    assertions: { obligationsCovered: [O1, O2], noComplianceGaps: true }
`);
    expect(fallback.results[0]!.ok).toBe(true);
    expect(fallback.results[0]!.obligationsSeeded).toEqual(['O1', 'O2']);
  });

  it('isolates canned LLM responses between scenarios', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
scenarios:
  - name: matched response
    agent: LLMAgent
    input: { note: alpha }
    mockObligations: [O1]
    mockLLM:
      - { pattern: "alpha", response: "ALPHA SUMMARY" }
    assertions:
      llmCalls: 1
      output: { summary: "ALPHA SUMMARY" }
      hasEvents: [LLM_REQUEST_SENT, LLM_RESPONSE_RECEIVED]
  - name: previous response must not leak
    agent: LLMAgent
    input: { note: alpha }
    mockObligations: [O1]
    assertions:
      llmCalls: 1
      output: { summary: "{}" }
`);
    expect(suite.failed).toBe(0);
  });

  it('rejects malformed scenario files with a schema error', () => {
    expect(() => HarnessRunner.parse('scenarios: []')).toThrow();
    expect(() => HarnessRunner.parse('scenarios:\n  - name: x\n    agent: A\n    input: {}\n    assertions: { qualificationStatus: MAYBE }')).toThrow();
  });

  it('summarises and formats a report', async () => {
    const { runner } = buildRunner();
    const suite = await runner.runYaml(`
name: report
scenarios:
  - name: ok
    agent: ClaimAgent
    input: { note: a }
    mockObligations: [O1]
  - name: not ok
    agent: ClaimAgent
    input: { note: a }
    mockObligations: [O1]
    assertions: { confidenceAbove: 2 }
`);
    const summary = summarizeSuites([suite]);
    expect(summary).toMatchObject({ suites: 1, total: 2, passed: 1, failed: 1, ok: false });
    const text = formatHarnessReport([suite]);
    expect(text).toContain('✗ report (1/2');
    expect(text).toContain('✓ ok [ClaimAgent]');
    expect(text).toContain('confidenceAbove: Confidence 1 below 2');
    expect(text).toContain('1/2 scenarios passed across 1 suite');
  });
});

describe('TestHarness timing and graph handle', () => {
  it('keeps agents bound to the harness graph after a swap', async () => {
    const harness = new TestHarness();
    const agent = new ClaimAgent(harness.buildDeps(), ['O1']);
    harness.withGraph(new MockGraph().seed([node('O1', ['complaint_record'])]));
    const result = await harness.runAgent(agent, { note: 'x' }, {
      processType: 'CAPA',
      availableEvidenceTypes: ['complaint_record'],
    });
    expect(result.agentResult.success).toBe(true);
    expect(result.timing.graphCalls).toBeGreaterThan(0);
    expect(result.timing.graphMs).toBeGreaterThanOrEqual(0);
    expect(result.obligationCoverage.covered).toBe(1);
    expect(result.obligationCoverage.byObligation['O1']).toMatchObject({ covered: true });
  });

  it('exposes process-scoped obligations from the mock graph', async () => {
    const graph = new MockGraph().seed([node('O1', []), node('O2', []), node('O3', [])]);
    graph.registerProcess('capa', ['O1', 'O2']);
    expect((await graph.getProcessObligations('capa')).map((o) => o.obligationId)).toEqual(['O1', 'O2']);
    expect((await graph.getProcessObligations('capa', ['O2', 'O3'])).map((o) => o.obligationId)).toEqual(['O2']);
    expect(await graph.getProcessObligations('unknown')).toEqual([]);
    expect((await graph.getOrphanedObligations()).map((o) => o.obligationId)).toEqual(['O3']);
  });
});

describe('subsetMismatches', () => {
  it('describes nested differences', () => {
    expect(subsetMismatches({ a: { b: 1, c: [1, 2] } }, { a: { b: 1, c: [1, 2] } }, '')).toEqual([]);
    expect(subsetMismatches({ a: { b: 1 } }, { a: { b: 2 } }, '')).toEqual(['a.b: expected 2, got 1']);
    expect(subsetMismatches({ a: [1] }, { a: [1, 2] }, '')).toEqual(['a: expected 2 items, got 1']);
    expect(subsetMismatches(undefined, { a: 1 }, '')).toEqual(['$: expected object, got undefined']);
  });
});
