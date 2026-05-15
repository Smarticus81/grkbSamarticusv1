import type { ProcessDefinition } from '@regground/core';
import {
  IMDRFCodingInputSchema,
  IMDRFCodingOutputSchema,
} from './agents/IMDRFCodingAgent.js';
import {
  ReportabilityScreenInputSchema,
  ReportabilityScreenOutputSchema,
} from './agents/ReportabilityScreenAgent.js';

export const COMPLAINT_CLASSIFICATION_PROCESS: ProcessDefinition = {
  id: 'complaint-classification-v1',
  processId: 'complaint-classification',
  name: 'Complaint Classification (IMDRF Coding)',
  description:
    'Code complaint narratives into IMDRF Annex A–G terminology and screen for reportability escalation.',
  version: '1.0.0',
  regulations: [
    { regulation: 'IMDRF AET', section: 'Annex A–G' },
    { regulation: 'ISO 13485:2016', section: '§8.2.2' },
    { regulation: 'Regulation (EU) 2017/745', section: 'Article 87' },
    { regulation: '21 CFR §820.198', section: 'Complaint files' },
  ],
  jurisdictions: ['EU_MDR', 'US_FDA', 'UK_MDR', 'GLOBAL'],
  obligationIds: [
    'IMDRF.AET.OBL.001',
    'ISO13485.8.2.2.OBL.003',
    'ISO13485.8.2.2.OBL.004',
    'EUMDR.87.OBL.001',
    'EUMDR.87.OBL.003',
    'CFR820.198.OBL.002',
  ],
  requiredEvidenceTypes: ['complaint_record'],
  requiredAgentTypes: ['IMDRFCodingAgent', 'ReportabilityScreenAgent'],
  hitlGates: [],
  steps: [
    {
      id: 'imdrf-coding',
      name: 'IMDRF Annex A–G coding',
      description: 'Code the complaint narrative into IMDRF terminology.',
      agentType: 'IMDRFCodingAgent',
      inputSchema: IMDRFCodingInputSchema,
      outputSchema: IMDRFCodingOutputSchema,
      obligationIds: ['IMDRF.AET.OBL.001', 'ISO13485.8.2.2.OBL.003'],
      dependsOn: [],
      timeoutMs: 30_000,
      retryPolicy: { maxRetries: 1, backoffMs: 2_000 },
    },
    {
      id: 'reportability-screen',
      name: 'Reportability escalation screen',
      description: 'Decide whether the coded complaint must be sent to the reportability process.',
      agentType: 'ReportabilityScreenAgent',
      inputSchema: ReportabilityScreenInputSchema,
      outputSchema: ReportabilityScreenOutputSchema,
      obligationIds: [
        'ISO13485.8.2.2.OBL.004',
        'EUMDR.87.OBL.001',
        'EUMDR.87.OBL.003',
        'CFR820.198.OBL.002',
      ],
      dependsOn: ['imdrf-coding'],
      timeoutMs: 30_000,
      retryPolicy: { maxRetries: 1, backoffMs: 2_000 },
    },
  ],
};
