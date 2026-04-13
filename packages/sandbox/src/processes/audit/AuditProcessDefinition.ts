import type { ProcessDefinition } from '@regground/core';
import { PlanInputSchema, PlanOutputSchema } from './agents/AuditPlanningAgent.js';
import { FindingInputSchema, FindingOutputSchema } from './agents/AuditFindingAgent.js';
import { ReportInputSchema, ReportOutputSchema } from './agents/AuditReportAgent.js';

export const AUDIT_PROCESS: ProcessDefinition = {
  id: 'audit-iso13485-v1',
  name: 'Internal Audit',
  description: 'Internal QMS audit per ISO 13485 §8.2.4.',
  version: '1.0.0',
  regulations: [{ regulation: 'ISO 13485:2016', section: '§8.2.4' }],
  jurisdictions: ['GLOBAL'],
  obligationIds: ['ISO13485.8.2.4.OBL.001', 'ISO13485.8.2.4.OBL.002', 'ISO13485.8.2.4.OBL.003'],
  requiredEvidenceTypes: ['audit_plan', 'audit_finding', 'audit_report', 'auditor_assignment'],
  requiredAgentTypes: ['AuditPlanningAgent', 'AuditFindingAgent', 'AuditReportAgent'],
  hitlGates: [],
  steps: [
    {
      id: 'plan',
      name: 'Planning',
      description: 'Plan the audit',
      agentType: 'AuditPlanningAgent',
      inputSchema: PlanInputSchema,
      outputSchema: PlanOutputSchema,
      obligationIds: ['ISO13485.8.2.4.OBL.001', 'ISO13485.8.2.4.OBL.003'],
      dependsOn: [],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 1, backoffMs: 3_000 },
    },
    {
      id: 'findings',
      name: 'Findings',
      description: 'Record findings',
      agentType: 'AuditFindingAgent',
      inputSchema: FindingInputSchema,
      outputSchema: FindingOutputSchema,
      obligationIds: ['ISO13485.8.2.4.OBL.002'],
      dependsOn: ['plan'],
      timeoutMs: 120_000,
      retryPolicy: { maxRetries: 1, backoffMs: 5_000 },
    },
    {
      id: 'report',
      name: 'Report',
      description: 'Generate audit report',
      agentType: 'AuditReportAgent',
      inputSchema: ReportInputSchema,
      outputSchema: ReportOutputSchema,
      obligationIds: ['ISO13485.8.2.4.OBL.002'],
      dependsOn: ['findings'],
      timeoutMs: 60_000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
    },
  ],
};
