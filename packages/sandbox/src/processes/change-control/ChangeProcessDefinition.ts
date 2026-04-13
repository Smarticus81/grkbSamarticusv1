import type { ProcessDefinition } from '@regground/core';
import { ImpactInputSchema, ImpactOutputSchema } from './agents/ChangeImpactAgent.js';
import { VerifyInputSchema, VerifyOutputSchema } from './agents/ChangeVerificationAgent.js';

export const CHANGE_PROCESS: ProcessDefinition = {
  id: 'change-iso13485-v1',
  name: 'Change Control',
  description: 'Design and process change control per ISO 13485 §7.3.9.',
  version: '1.0.0',
  regulations: [{ regulation: 'ISO 13485:2016', section: '§7.3.9' }],
  jurisdictions: ['GLOBAL'],
  obligationIds: ['ISO13485.7.3.9.OBL.001', 'ISO13485.7.3.9.OBL.002'],
  requiredEvidenceTypes: ['change_request', 'impact_assessment', 'change_approval'],
  requiredAgentTypes: ['ChangeImpactAgent', 'ChangeVerificationAgent'],
  hitlGates: [
    {
      gateId: 'change-approval',
      approverRole: 'change_review_board',
      description: 'Approve change before implementation.',
    },
  ],
  steps: [
    {
      id: 'impact',
      name: 'Impact Assessment',
      description: 'Assess change impact',
      agentType: 'ChangeImpactAgent',
      inputSchema: ImpactInputSchema,
      outputSchema: ImpactOutputSchema,
      obligationIds: ['ISO13485.7.3.9.OBL.001', 'ISO13485.7.3.9.OBL.002'],
      dependsOn: [],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 1, backoffMs: 5_000 },
    },
    {
      id: 'verify',
      name: 'Verification',
      description: 'Verify change implementation',
      agentType: 'ChangeVerificationAgent',
      inputSchema: VerifyInputSchema,
      outputSchema: VerifyOutputSchema,
      obligationIds: ['ISO13485.7.3.9.OBL.001'],
      dependsOn: ['impact'],
      hitlGate: {
        gateId: 'change-approval',
        approverRole: 'change_review_board',
        description: 'Approve verified change',
      },
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
    },
  ],
};
