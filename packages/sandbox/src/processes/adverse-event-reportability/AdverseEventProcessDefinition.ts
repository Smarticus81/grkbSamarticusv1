import type { ProcessDefinition } from '@regground/core';
import {
  ReportabilityInputSchema,
  ReportabilityOutputSchema,
} from './agents/ReportabilityDecisionAgent.js';

export const ADVERSE_EVENT_PROCESS: ProcessDefinition = {
  id: 'adverse-event-reportability-v1',
  processId: 'adverse-event-reportability',
  name: 'Adverse Event Reportability',
  description:
    'Determines EU/US/UK reportability for an adverse event and emits the applicable reporting clock per jurisdiction.',
  version: '1.0.0',
  regulations: [
    { regulation: 'Regulation (EU) 2017/745', section: 'Article 87' },
    { regulation: '21 CFR §803', section: 'Medical Device Reporting' },
    { regulation: 'UK MDR 2002 (as amended)', section: 'Vigilance' },
  ],
  jurisdictions: ['EU_MDR', 'US_FDA', 'UK_MDR'],
  obligationIds: [
    'EUMDR.87.OBL.001',
    'EUMDR.87.OBL.002',
    'EUMDR.87.OBL.003',
    'CFR820.198.OBL.002',
    'UKMDR.2.OBL.001',
    'ISO13485.8.2.2.OBL.004',
  ],
  requiredEvidenceTypes: ['adverse_event_report'],
  requiredAgentTypes: ['ReportabilityDecisionAgent'],
  hitlGates: [
    {
      gateId: 'HITL.EUMDR.87.SeriousIncident',
      approverRole: 'vigilance_officer',
      description:
        'Mandatory human sign-off for serious-incident reportability decisions before submission.',
    },
  ],
  steps: [
    {
      id: 'decide-reportability',
      name: 'Decide reportability per jurisdiction',
      description:
        'Apply EU MDR Art. 87, 21 CFR §803, and UK MDR vigilance rules to emit a reportability decision and clock per market.',
      agentType: 'ReportabilityDecisionAgent',
      inputSchema: ReportabilityInputSchema,
      outputSchema: ReportabilityOutputSchema,
      obligationIds: [
        'EUMDR.87.OBL.001',
        'EUMDR.87.OBL.002',
        'EUMDR.87.OBL.003',
        'CFR820.198.OBL.002',
        'UKMDR.2.OBL.001',
        'ISO13485.8.2.2.OBL.004',
      ],
      dependsOn: [],
      hitlGate: {
        gateId: 'HITL.EUMDR.87.SeriousIncident',
        approverRole: 'vigilance_officer',
        description: 'Vigilance officer must approve serious-incident reportability before submission.',
      },
      timeoutMs: 30_000,
      retryPolicy: { maxRetries: 1, backoffMs: 2_000 },
    },
  ],
};
