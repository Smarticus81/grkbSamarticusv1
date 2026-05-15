import type { ProcessDefinition } from '@regground/core';
import {
  MgmtReviewInputsInputSchema,
  MgmtReviewInputsOutputSchema,
} from './agents/MgmtReviewInputsAgent.js';
import {
  MgmtReviewDecisionInputSchema,
  MgmtReviewDecisionOutputSchema,
} from './agents/MgmtReviewDecisionAgent.js';

export const MGMT_REVIEW_PROCESS: ProcessDefinition = {
  id: 'management-review-v1',
  processId: 'management-review',
  name: 'Management Review',
  description:
    'Top-management review of the QMS at planned intervals per ISO 13485 §5.6.',
  version: '1.0.0',
  regulations: [{ regulation: 'ISO 13485:2016', section: '§5.6' }],
  jurisdictions: ['GLOBAL'],
  obligationIds: ['ISO13485.5.6.OBL.001', 'ISO13485.5.6.OBL.002'],
  requiredEvidenceTypes: ['management_review_record'],
  requiredAgentTypes: ['MgmtReviewInputsAgent', 'MgmtReviewDecisionAgent'],
  hitlGates: [],
  steps: [
    {
      id: 'aggregate-inputs',
      name: 'Aggregate §5.6.2 inputs',
      description: 'Aggregate the required management-review inputs and verify coverage.',
      agentType: 'MgmtReviewInputsAgent',
      inputSchema: MgmtReviewInputsInputSchema,
      outputSchema: MgmtReviewInputsOutputSchema,
      obligationIds: ['ISO13485.5.6.OBL.001'],
      dependsOn: [],
      timeoutMs: 30_000,
      retryPolicy: { maxRetries: 1, backoffMs: 2_000 },
    },
    {
      id: 'derive-decisions',
      name: 'Derive §5.6.3 outputs',
      description: 'Derive improvement, resource, and regulatory-response decisions.',
      agentType: 'MgmtReviewDecisionAgent',
      inputSchema: MgmtReviewDecisionInputSchema,
      outputSchema: MgmtReviewDecisionOutputSchema,
      obligationIds: ['ISO13485.5.6.OBL.001', 'ISO13485.5.6.OBL.002'],
      dependsOn: ['aggregate-inputs'],
      timeoutMs: 30_000,
      retryPolicy: { maxRetries: 1, backoffMs: 2_000 },
    },
  ],
};
