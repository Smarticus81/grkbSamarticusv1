import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BaseGroundedAgent } from '../src/agents/BaseGroundedAgent.js';
import { TestHarness } from '../src/harness/TestHarness.js';
import { MockGraph } from '../src/harness/MockGraph.js';

const OutputSchema = z.object({
  summary: z.string(),
  addressedObligations: z.array(z.string()),
});
type Output = z.infer<typeof OutputSchema>;

class DemoAgent extends BaseGroundedAgent<{ note: string }, Output> {
  protected getRequiredObligations(): string[] {
    return ['O1'];
  }
  protected getOutputSchema() {
    return OutputSchema;
  }
  protected async execute(input: { note: string }): Promise<Output> {
    return { summary: `processed: ${input.note}`, addressedObligations: ['O1'] };
  }
}

describe('BaseGroundedAgent sealed lifecycle', () => {
  it('runs full lifecycle and produces a valid trace + compliance', async () => {
    const graph = new MockGraph();
    await graph.upsertObligation({
      obligationId: 'O1',
      jurisdiction: 'GLOBAL',
      artifactType: 'CAPA',
      processType: 'capa',
      kind: 'obligation',
      title: 'Demo',
      text: 'demo obligation',
      sourceCitation: 'demo:1',
      version: '1',
      mandatory: true,
      requiredEvidenceTypes: ['note'],
      metadata: {},
    });
    const harness = new TestHarness().withGraph(graph as any);
    const deps = harness.buildDeps();
    const agent = new DemoAgent(
      {
        name: 'demo',
        description: 'demo',
        version: '1.0.0',
        persona: 'a demo agent',
        systemPrompt: 'do the demo',
        processTypes: ['capa'],
        requiredObligations: ['O1'],
      },
      deps,
    );
    const result = await harness.runAgent(agent, { note: 'hello' }, {
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: ['note'],
    });

    expect(result.agentResult.success).toBe(true);
    expect(result.agentResult.data?.summary).toBe('processed: hello');
    harness.assertTraceChainValid(result);
    harness.assertNoComplianceGaps(result);
    expect(result.agentResult.compliance?.satisfied).toContain('O1');
  });

  it('blocks when qualification fails', async () => {
    const graph = new MockGraph();
    await graph.upsertObligation({
      obligationId: 'O1',
      jurisdiction: 'GLOBAL',
      artifactType: 'CAPA',
      processType: 'capa',
      kind: 'obligation',
      title: 'Demo',
      text: 'demo',
      sourceCitation: 'demo:1',
      version: '1',
      mandatory: true,
      requiredEvidenceTypes: ['missing_evidence'],
      metadata: {},
    });
    const harness = new TestHarness().withGraph(graph as any);
    const deps = harness.buildDeps();
    const agent = new DemoAgent(
      {
        name: 'demo',
        description: 'demo',
        version: '1.0.0',
        persona: 'p',
        systemPrompt: 's',
        processTypes: ['capa'],
        requiredObligations: ['O1'],
      },
      deps,
    );
    const result = await harness.runAgent(agent, { note: 'x' }, {
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: [],
    });
    expect(result.agentResult.success).toBe(false);
    expect(result.agentResult.qualification?.status).toBe('BLOCKED');
  });
});
