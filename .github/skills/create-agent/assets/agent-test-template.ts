import { describe, it, expect } from 'vitest';
import { TestHarness } from '@regground/core';
import { NewAgent } from './NewAgent.js';

const OBLIGATION = {
  obligationId: 'TODO.OBL.001',
  jurisdiction: 'GLOBAL',
  artifactType: 'TODO',
  processType: 'TODO',
  kind: 'obligation' as const,
  title: 'Demo',
  text: 't',
  sourceCitation: 'src',
  version: '1',
  mandatory: true,
  requiredEvidenceTypes: ['note'],
  applicability: {},
  metadata: {},
};

describe('NewAgent', () => {
  it('runs the happy path', async () => {
    const harness = new TestHarness().withMockGraph([OBLIGATION]).withMockLLM([
      { pattern: 'Process trigger', response: '{"result":"ok","addressedObligations":["TODO.OBL.001"]}' },
    ]);
    const agent = new NewAgent(harness.buildDeps());
    const result = await harness.runAgent(agent, { triggerId: 'T-1' }, {
      processType: 'TODO',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: ['note'],
    });
    harness.assertSuccess(result);
    harness.assertQualificationStatus(result, 'QUALIFIED');
    harness.assertTraceChainValid(result);
    harness.assertNoComplianceGaps(result);
    harness.assertHasEvent(result, 'AGENT_COMPLETED');
    harness.assertOutputMatches(result, { result: 'ok' });
    expect(result.timing.graphCalls).toBeGreaterThan(0);
  });

  it('is blocked when the required evidence is missing', async () => {
    const harness = new TestHarness().withMockGraph([OBLIGATION]);
    const agent = new NewAgent(harness.buildDeps());
    const result = await harness.runAgent(agent, { triggerId: 'T-2' }, {
      processType: 'TODO',
      jurisdiction: 'GLOBAL',
      availableEvidenceTypes: [],
    });
    harness.assertFailed(result, /missing evidence/);
    harness.assertQualificationStatus(result, 'BLOCKED');
    harness.assertNoEvent(result, 'AGENT_SPAWNED');
  });
});
