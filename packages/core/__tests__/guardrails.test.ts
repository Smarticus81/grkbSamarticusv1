import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { StrictGate } from '../src/guardrails/StrictGate.js';
import { ComplianceValidator } from '../src/guardrails/ComplianceValidator.js';
import { QualificationGate } from '../src/guardrails/QualificationGate.js';
import { MockGraph } from '../src/harness/MockGraph.js';
import { BOUNDARY_POLICIES } from '../src/guardrails/BoundaryPolicy.js';

describe('guardrails', () => {
  it('StrictGate validates and reports errors', () => {
    const gate = new StrictGate();
    const schema = z.object({ name: z.string() });
    expect(gate.validate({ name: 'a' }, schema).valid).toBe(true);
    expect(gate.validate({}, schema).valid).toBe(false);
  });

  it('ComplianceValidator marks gaps', () => {
    const validator = new ComplianceValidator();
    const obligations = [
      {
        obligationId: 'O1',
        jurisdiction: 'GLOBAL',
        artifactType: 'CAPA',
        processType: 'capa',
        kind: 'obligation' as const,
        title: 'O1',
        text: 't',
        sourceCitation: 'src',
        version: '1',
        mandatory: true,
        requiredEvidenceTypes: [],
        metadata: {},
      },
    ];
    const result = validator.validate(
      { addressedObligations: [] },
      obligations,
      { processType: 'capa', jurisdiction: 'GLOBAL', processInstanceId: 'pi', agentId: 'a' },
    );
    expect(result.valid).toBe(false);
    expect(result.unsatisfied).toContain('O1');
  });

  it('QualificationGate blocks when evidence missing', async () => {
    const graph = new MockGraph();
    await graph.upsertObligation({
      obligationId: 'O1',
      jurisdiction: 'GLOBAL',
      artifactType: 'CAPA',
      processType: 'capa',
      kind: 'obligation',
      title: 'Need atoms',
      text: 't',
      sourceCitation: 'src',
      version: '1',
      mandatory: true,
      requiredEvidenceTypes: ['complaint_record'],
      metadata: {},
    });
    const gate = new QualificationGate(graph as any);
    const result = await gate.check({
      processType: 'capa',
      jurisdiction: 'GLOBAL',
      availableEvidence: [],
      requiredObligations: ['O1'],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.missingEvidence).toContain('complaint_record');
  });

  it('boundary policies are sealed', () => {
    expect(BOUNDARY_POLICIES.length).toBeGreaterThanOrEqual(10);
    expect(() => {
      // @ts-expect-error frozen
      BOUNDARY_POLICIES.push({ id: 'X' as any, description: '', rationale: '' });
    }).toThrow();
  });
});
