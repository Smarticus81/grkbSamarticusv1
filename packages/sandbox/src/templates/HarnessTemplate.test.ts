import { describe, expect, it } from 'vitest';
import { HarnessRunner } from '@regground/core';
import { generateHarnessYAML } from './HarnessTemplate.js';
import { CAPA_PROCESS } from '../processes/capa/CAPAProcessDefinition.js';

describe('generateHarnessYAML', () => {
  it('emits a scenario file the HarnessRunner accepts, with obligations rendered verbatim', () => {
    const yaml = generateHarnessYAML({
      processDefinition: CAPA_PROCESS,
      agents: [
        { agentType: 'CAPAInitiationAgent', version: '1.0.0', description: '', processTypes: ['CAPA'], factory: () => null as never },
        { agentType: 'RootCauseAnalysisAgent', version: '1.0.0', description: '', processTypes: ['CAPA'], factory: () => null as never },
      ],
      mockObligations: ['ISO13485.8.5.2.OBL.001', 'CFR820.100.OBL.001'],
    });
    const parsed = HarnessRunner.parse(yaml);
    expect(parsed.name).toBe('CAPA Process');
    expect(parsed.defaults.mockObligations).toEqual(['ISO13485.8.5.2.OBL.001', 'CFR820.100.OBL.001']);
    expect(parsed.scenarios.map((s) => s.agent)).toEqual([
      'CAPAInitiationAgent',
      'CAPAInitiationAgent',
      'RootCauseAnalysisAgent',
      'RootCauseAnalysisAgent',
    ]);
    expect(parsed.scenarios[0]!.assertions.qualificationStatus).toBe('QUALIFIED');
    expect(parsed.scenarios[1]!.context.availableEvidenceTypes).toEqual([]);
    expect(parsed.scenarios[1]!.assertions.qualificationStatus).toBe('BLOCKED');
    expect(yaml).not.toContain('[object Object]');
  });
});
