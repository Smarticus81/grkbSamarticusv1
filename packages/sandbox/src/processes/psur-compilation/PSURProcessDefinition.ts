import type { ProcessDefinition } from '@regground/core';
import {
  PSURStructureInputSchema,
  PSURStructureOutputSchema,
} from './agents/PSURStructureAgent.js';
import {
  PSURContentInputSchema,
  PSURContentOutputSchema,
} from './agents/PSURContentAgent.js';

export const PSUR_PROCESS: ProcessDefinition = {
  id: 'psur-compilation-v1',
  processId: 'psur-compilation',
  name: 'PSUR Compilation',
  description:
    'Compile a Periodic Safety Update Report per EU MDR Art. 86 and MDCG 2022-21 §1–2.',
  version: '1.0.0',
  regulations: [
    { regulation: 'Regulation (EU) 2017/745', section: 'Article 86' },
    { regulation: 'MDCG 2022-21', section: '§1–2' },
  ],
  jurisdictions: ['EU_MDR'],
  obligationIds: [
    'EUMDR.86.OBL.001',
    'EUMDR.86.PSUR.OBL.001',
    'EUMDR.86.PSUR.OBL.002',
    'MDCG2022-21.1.OBL.001',
    'MDCG2022-21.1.OBL.002',
    'MDCG2022-21.1.OBL.003',
    'MDCG2022-21.2.OBL.001',
    'MDCG2022-21.2.OBL.002',
    'MDCG2022-21.2.OBL.003',
    'MDCG2022-21.2.OBL.004',
    'MDCG2022-21.2.OBL.005',
    'MDCG2022-21.2.OBL.006',
    'MDCG2022-21.2.OBL.007',
  ],
  requiredEvidenceTypes: ['psur_document'],
  requiredAgentTypes: ['PSURStructureAgent', 'PSURContentAgent'],
  hitlGates: [
    {
      gateId: 'HITL.EUMDR.86.PSURApproval',
      approverRole: 'quality_manager',
      description: 'Mandatory human approval before PSUR submission.',
    },
  ],
  steps: [
    {
      id: 'structure-check',
      name: 'PSUR structural compliance',
      description: 'Validate PSUR section coverage against MDCG 2022-21 §1–2.',
      agentType: 'PSURStructureAgent',
      inputSchema: PSURStructureInputSchema,
      outputSchema: PSURStructureOutputSchema,
      obligationIds: [
        'EUMDR.86.OBL.001',
        'EUMDR.86.PSUR.OBL.001',
        'MDCG2022-21.1.OBL.001',
        'MDCG2022-21.1.OBL.002',
        'MDCG2022-21.1.OBL.003',
      ],
      dependsOn: [],
      timeoutMs: 30_000,
      retryPolicy: { maxRetries: 1, backoffMs: 2_000 },
    },
    {
      id: 'content-compile',
      name: 'Compile PSUR content sections',
      description: 'Compose §2 content sections from aggregated PMS data.',
      agentType: 'PSURContentAgent',
      inputSchema: PSURContentInputSchema,
      outputSchema: PSURContentOutputSchema,
      obligationIds: [
        'EUMDR.86.PSUR.OBL.001',
        'EUMDR.86.PSUR.OBL.002',
        'MDCG2022-21.2.OBL.001',
        'MDCG2022-21.2.OBL.002',
        'MDCG2022-21.2.OBL.003',
        'MDCG2022-21.2.OBL.004',
        'MDCG2022-21.2.OBL.005',
        'MDCG2022-21.2.OBL.006',
        'MDCG2022-21.2.OBL.007',
      ],
      dependsOn: ['structure-check'],
      hitlGate: {
        gateId: 'HITL.EUMDR.86.PSURApproval',
        approverRole: 'quality_manager',
        description: 'Quality manager must approve PSUR before submission.',
      },
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 1, backoffMs: 3_000 },
    },
  ],
};
