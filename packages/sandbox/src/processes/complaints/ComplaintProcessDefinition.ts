import type { ProcessDefinition } from '@regground/core';
import { IntakeInputSchema, IntakeOutputSchema } from './agents/ComplaintIntakeAgent.js';
import { TriageInputSchema, TriageOutputSchema } from './agents/ComplaintTriageAgent.js';
import {
  InvestigationInputSchema,
  InvestigationOutputSchema,
} from './agents/ComplaintInvestigationAgent.js';
import { TrendInputSchema, TrendOutputSchema } from './agents/TrendDetectionAgent.js';

export const COMPLAINT_PROCESS: ProcessDefinition = {
  id: 'complaint-iso13485-v1',
  name: 'Complaint Handling',
  description: 'Complaint intake → triage → investigation → trend detection → closure.',
  version: '1.0.0',
  regulations: [
    { regulation: 'ISO 13485:2016', section: '§8.2.2' },
    { regulation: '21 CFR 820', section: '§820.198' },
  ],
  jurisdictions: ['GLOBAL'],
  obligationIds: [
    'ISO13485.8.2.2.OBL.001',
    'ISO13485.8.2.2.OBL.002',
    'ISO13485.8.2.2.OBL.003',
    'ISO13485.8.2.2.OBL.004',
  ],
  requiredEvidenceTypes: [
    'complaint_record',
    'complaint_procedure',
    'triage_record',
    'reportability_assessment',
  ],
  requiredAgentTypes: [
    'ComplaintIntakeAgent',
    'ComplaintTriageAgent',
    'ComplaintInvestigationAgent',
    'TrendDetectionAgent',
  ],
  hitlGates: [
    {
      gateId: 'complaint-closure',
      approverRole: 'quality_manager',
      description: 'Approve complaint closure.',
    },
  ],
  steps: [
    {
      id: 'intake',
      name: 'Intake',
      description: 'Receive and record complaint',
      agentType: 'ComplaintIntakeAgent',
      inputSchema: IntakeInputSchema,
      outputSchema: IntakeOutputSchema,
      obligationIds: ['ISO13485.8.2.2.OBL.001', 'ISO13485.8.2.2.OBL.002'],
      dependsOn: [],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 2, backoffMs: 5_000 },
    },
    {
      id: 'triage',
      name: 'Triage',
      description: 'Determine severity and reportability',
      agentType: 'ComplaintTriageAgent',
      inputSchema: TriageInputSchema,
      outputSchema: TriageOutputSchema,
      obligationIds: ['ISO13485.8.2.2.OBL.003', 'ISO13485.8.2.2.OBL.004'],
      dependsOn: ['intake'],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 2, backoffMs: 5_000 },
    },
    {
      id: 'investigation',
      name: 'Investigation',
      description: 'Investigate the complaint',
      agentType: 'ComplaintInvestigationAgent',
      inputSchema: InvestigationInputSchema,
      outputSchema: InvestigationOutputSchema,
      obligationIds: ['ISO13485.8.2.2.OBL.003'],
      dependsOn: ['triage'],
      timeoutMs: 120_000,
      retryPolicy: { maxRetries: 2, backoffMs: 5_000 },
    },
    {
      id: 'trend-detection',
      name: 'Trend Detection',
      description: 'Detect signals via control chart',
      agentType: 'TrendDetectionAgent',
      inputSchema: TrendInputSchema,
      outputSchema: TrendOutputSchema,
      obligationIds: ['EUMDR.83.OBL.001'],
      dependsOn: ['investigation'],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 1, backoffMs: 5_000 },
    },
  ],
};
