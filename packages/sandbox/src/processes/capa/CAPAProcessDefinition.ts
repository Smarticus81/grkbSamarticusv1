import { z } from 'zod';
import type { ProcessDefinition } from '@regground/core';
import {
  CAPAInitiationInputSchema,
  CAPAInitiationOutputSchema,
} from './agents/CAPAInitiationAgent.js';
import { RootCauseInputSchema, RootCauseOutputSchema } from './agents/RootCauseAnalysisAgent.js';
import { ActionPlanInputSchema, ActionPlanOutputSchema } from './agents/ActionPlanAgent.js';
import {
  EffectivenessInputSchema,
  EffectivenessOutputSchema,
} from './agents/EffectivenessCheckAgent.js';
import { ClosureInputSchema, ClosureOutputSchema } from './agents/CAPAClosureAgent.js';

export const CAPA_PROCESS: ProcessDefinition = {
  id: 'capa-iso13485-v1',
  name: 'CAPA Process',
  description: 'Corrective and Preventive Action lifecycle per ISO 13485 §8.5.2/§8.5.3.',
  version: '1.0.0',
  regulations: [
    { regulation: 'ISO 13485:2016', section: '§8.5.2' },
    { regulation: 'ISO 13485:2016', section: '§8.5.3' },
  ],
  jurisdictions: ['GLOBAL'],
  obligationIds: [
    'ISO13485.8.5.2.OBL.001',
    'ISO13485.8.5.2.OBL.002',
    'ISO13485.8.5.2.OBL.003',
    'ISO13485.8.5.3.OBL.001',
  ],
  requiredEvidenceTypes: [
    'nonconformance_record',
    'complaint_record',
    'audit_finding',
    'capa_procedure',
    'investigation_record',
    'effectiveness_check_record',
  ],
  requiredAgentTypes: [
    'CAPAInitiationAgent',
    'RootCauseAnalysisAgent',
    'ActionPlanAgent',
    'EffectivenessCheckAgent',
    'CAPAClosureAgent',
  ],
  hitlGates: [
    {
      gateId: 'capa-action-plan-approval',
      approverRole: 'quality_manager',
      description: 'Approve corrective and preventive action plan before implementation.',
    },
  ],
  steps: [
    {
      id: 'initiation',
      name: 'Initiation',
      description: 'Classify trigger and decide if CAPA is required.',
      agentType: 'CAPAInitiationAgent',
      inputSchema: CAPAInitiationInputSchema,
      outputSchema: CAPAInitiationOutputSchema,
      obligationIds: ['ISO13485.8.5.2.OBL.001'],
      dependsOn: [],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 2, backoffMs: 5_000 },
    },
    {
      id: 'root-cause',
      name: 'Root Cause Analysis',
      description: 'Apply 5-Why / Ishikawa / fault tree.',
      agentType: 'RootCauseAnalysisAgent',
      inputSchema: RootCauseInputSchema,
      outputSchema: RootCauseOutputSchema,
      obligationIds: ['ISO13485.8.5.2.OBL.002'],
      dependsOn: ['initiation'],
      timeoutMs: 120_000,
      retryPolicy: { maxRetries: 2, backoffMs: 5_000 },
    },
    {
      id: 'action-plan',
      name: 'Action Plan',
      description: 'Propose corrective and preventive actions.',
      agentType: 'ActionPlanAgent',
      inputSchema: ActionPlanInputSchema,
      outputSchema: ActionPlanOutputSchema,
      obligationIds: ['ISO13485.8.5.2.OBL.002', 'ISO13485.8.5.3.OBL.001'],
      dependsOn: ['root-cause'],
      hitlGate: {
        gateId: 'capa-action-plan-approval',
        approverRole: 'quality_manager',
        description: 'Approve action plan',
      },
      timeoutMs: 90_000,
      retryPolicy: { maxRetries: 2, backoffMs: 5_000 },
    },
    {
      id: 'effectiveness-check',
      name: 'Effectiveness Check',
      description: 'Compare post-implementation metrics to baseline.',
      agentType: 'EffectivenessCheckAgent',
      inputSchema: EffectivenessInputSchema,
      outputSchema: EffectivenessOutputSchema,
      obligationIds: ['ISO13485.8.5.2.OBL.003'],
      dependsOn: ['action-plan'],
      timeoutMs: 90_000,
      retryPolicy: { maxRetries: 1, backoffMs: 5_000 },
    },
    {
      id: 'closure',
      name: 'Closure',
      description: 'Generate closure report and close the record.',
      agentType: 'CAPAClosureAgent',
      inputSchema: ClosureInputSchema,
      outputSchema: ClosureOutputSchema,
      obligationIds: ['ISO13485.8.5.2.OBL.003'],
      dependsOn: ['effectiveness-check'],
      timeoutMs: 30_000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
    },
  ],
};

// Avoid unused import warning for z when no inline schemas needed
void z;
