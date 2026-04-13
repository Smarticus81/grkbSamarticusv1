import type { ProcessDefinition } from '@regground/core';
import { NCClassifyInputSchema, NCClassifyOutputSchema } from './agents/NCClassificationAgent.js';
import {
  NCInvestigationInputSchema,
  NCInvestigationOutputSchema,
} from './agents/NCInvestigationAgent.js';
import {
  NCDispositionInputSchema,
  NCDispositionOutputSchema,
} from './agents/NCDispositionAgent.js';

export const NC_PROCESS: ProcessDefinition = {
  id: 'nc-iso13485-v1',
  name: 'Nonconformance Handling',
  description: 'Identification, classification, investigation, and disposition of nonconforming product.',
  version: '1.0.0',
  regulations: [{ regulation: 'ISO 13485:2016', section: '§8.3' }],
  jurisdictions: ['GLOBAL'],
  obligationIds: ['ISO13485.8.3.OBL.001', 'ISO13485.8.3.OBL.002', 'ISO13485.8.3.OBL.003'],
  requiredEvidenceTypes: ['nonconformance_record', 'disposition_record', 'concession_authorization'],
  requiredAgentTypes: ['NCClassificationAgent', 'NCInvestigationAgent', 'NCDispositionAgent'],
  hitlGates: [
    {
      gateId: 'nc-disposition-approval',
      approverRole: 'quality_manager',
      description: 'Approve disposition (especially concessions).',
    },
  ],
  steps: [
    {
      id: 'classify',
      name: 'Classification',
      description: 'Classify NC severity',
      agentType: 'NCClassificationAgent',
      inputSchema: NCClassifyInputSchema,
      outputSchema: NCClassifyOutputSchema,
      obligationIds: ['ISO13485.8.3.OBL.001'],
      dependsOn: [],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 1, backoffMs: 5_000 },
    },
    {
      id: 'investigate',
      name: 'Investigation',
      description: 'Investigate NC',
      agentType: 'NCInvestigationAgent',
      inputSchema: NCInvestigationInputSchema,
      outputSchema: NCInvestigationOutputSchema,
      obligationIds: ['ISO13485.8.3.OBL.002'],
      dependsOn: ['classify'],
      timeoutMs: 120_000,
      retryPolicy: { maxRetries: 1, backoffMs: 5_000 },
    },
    {
      id: 'disposition',
      name: 'Disposition',
      description: 'Choose disposition',
      agentType: 'NCDispositionAgent',
      inputSchema: NCDispositionInputSchema,
      outputSchema: NCDispositionOutputSchema,
      obligationIds: ['ISO13485.8.3.OBL.002', 'ISO13485.8.3.OBL.003'],
      dependsOn: ['investigate'],
      hitlGate: {
        gateId: 'nc-disposition-approval',
        approverRole: 'quality_manager',
        description: 'Approve disposition',
      },
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
    },
  ],
};
