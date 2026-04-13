import { describe, it, expect } from 'vitest';
import { TestHarness, MockGraph } from '@regground/core';
import { NewAgent } from './NewAgent.js';

describe('NewAgent', () => {
  it('runs the happy path', async () => {
    const graph = new MockGraph();
    await graph.upsertObligation({
      obligationId: 'TODO.OBL.001',
      jurisdiction: 'GLOBAL',
      artifactType: 'TODO',
      processType: 'TODO',
      kind: 'obligation',
      title: 'Demo',
      text: 't',
      sourceCitation: 'src',
      version: '1',
      mandatory: true,
      requiredEvidenceTypes: ['note'],
      metadata: {},
    });
    const harness = new TestHarness().withGraph(graph as any).withMockLLM([
      { pattern: 'Process trigger', response: '{"result":"ok","addressedObligations":["TODO.OBL.001"]}' },
    ]);
    const agent = new NewAgent(harness.buildDeps());
    const result = await harness.runAgent(agent, { triggerId: 'T-1' }, {
      processType: 'TODO',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: ['note'],
    });
    expect(result.agentResult.success).toBe(true);
    harness.assertTraceChainValid(result);
    harness.assertNoComplianceGaps(result);
  });
});
