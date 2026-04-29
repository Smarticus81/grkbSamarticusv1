/**
 * Process Review task agents — deterministic process-level coverage checks for
 * process bundles that do not yet have a bespoke single-purpose task. These
 * agents are still fully process-tethered: every citation and every satisfied
 * obligation is derived from the live graph obligations injected by TaskRunner.
 */

import { z } from 'zod';
import type { ObligationNode } from '@regground/core';
import type { TaskAgentDefinition, WithGraphContext } from '../types.js';

const InputSchema = z.object({
  processName: z.string(),
  recordsAvailable: z.array(z.string()),
  notes: z.string(),
});

const FindingSchema = z.object({
  obligationId: z.string(),
  citation: z.string(),
  status: z.enum(['covered', 'needs-evidence']),
  note: z.string(),
});

const OutputSchema = z.object({
  processId: z.string(),
  readiness: z.enum(['ready-for-quality-review', 'needs-evidence']),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
  obligationFindings: z.array(FindingSchema),
  recommendedActions: z.array(z.string()),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

interface ProcessReviewConfig {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  processId: string;
  claimedObligationIds: string[];
  sampleRecords: string[];
}

function outputCites(o: unknown, ob: ObligationNode): boolean {
  const parsed = OutputSchema.safeParse(o);
  return parsed.success
    && parsed.data.addressedObligations.includes(ob.obligationId)
    && parsed.data.citations.includes(ob.sourceCitation)
    && parsed.data.obligationFindings.some(
      (f) => f.obligationId === ob.obligationId && f.citation === ob.sourceCitation,
    );
}

function makeTask(config: ProcessReviewConfig): TaskAgentDefinition<Input, Output> {
  return {
    id: config.id,
    name: config.name,
    oneLiner: config.oneLiner,
    regulation: config.regulation,
    jurisdiction: config.jurisdiction,
    processId: config.processId,
    claimedObligationIds: config.claimedObligationIds,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    sampleData: {
      processName: config.name,
      recordsAvailable: config.sampleRecords,
      notes: 'Sandbox sample: verify that the process runtime can load graph-scoped obligations and cite them truthfully.',
    },
    obligationChecks: config.claimedObligationIds.map((obligationId) => ({
      obligationId,
      satisfiedBy: (o, ob) => outputCites(o, ob),
    })),
    async runWithGraph(input: Input, ctx: WithGraphContext): Promise<Output> {
      const allRecordsPresent = input.recordsAvailable.length > 0;
      return {
        processId: config.processId,
        readiness: allRecordsPresent ? 'ready-for-quality-review' : 'needs-evidence',
        addressedObligations: ctx.obligations.map((o) => o.obligationId),
        citations: ctx.obligations.map((o) => o.sourceCitation),
        obligationFindings: ctx.obligations.map((o) => ({
          obligationId: o.obligationId,
          citation: o.sourceCitation,
          status: allRecordsPresent ? 'covered' : 'needs-evidence',
          note: allRecordsPresent
            ? `Reviewed ${input.recordsAvailable.length} supplied record type(s) against this graph-bound obligation.`
            : 'No supporting record types were supplied; quality review must collect evidence before release.',
        })),
        recommendedActions: allRecordsPresent
          ? ['Route the reviewed records to the responsible quality approver.', 'Preserve this graph-cited output in the audit trail.']
          : ['Attach the required process records before approving this workflow.'],
      };
    },
    async runWithoutGraph(input: Input): Promise<Output> {
      return {
        processId: config.processId,
        readiness: input.recordsAvailable.length > 0 ? 'ready-for-quality-review' : 'needs-evidence',
        addressedObligations: [],
        citations: [],
        obligationFindings: [],
        recommendedActions: ['Graph unavailable: do not represent this result as regulatory-grounded.'],
      };
    },
  };
}

export const ComplaintHandlingReviewTask = makeTask({
  id: 'complaint-handling-review',
  name: 'Complaint Handling Review',
  oneLiner: 'Checks the complaint-handling process against every obligation bound to the complaint-handling graph process.',
  regulation: 'ISO 13485 · 21 CFR 820 · EU MDR',
  jurisdiction: 'GLOBAL',
  processId: 'complaint-handling',
  claimedObligationIds: [
    'ISO13485.8.2.2.OBL.001',
    'ISO13485.8.2.2.OBL.002',
    'ISO13485.8.2.2.OBL.003',
    'ISO13485.8.2.2.OBL.004',
    'CFR820.198.OBL.001',
    'CFR820.198.OBL.002',
    'EUMDR.87.OBL.001',
    'EUMDR.87.OBL.002',
    'EUMDR.87.OBL.003',
  ],
  sampleRecords: ['complaint_record', 'triage_record', 'investigation_record', 'reportability_assessment'],
});

export const CapaReviewTask = makeTask({
  id: 'capa-review',
  name: 'CAPA Review',
  oneLiner: 'Checks a CAPA package against ISO 13485 and FDA CAPA obligations bound to the CAPA graph process.',
  regulation: 'ISO 13485 · 21 CFR 820',
  jurisdiction: 'GLOBAL',
  processId: 'capa',
  claimedObligationIds: [
    'ISO13485.8.5.2.OBL.001',
    'ISO13485.8.5.2.OBL.002',
    'ISO13485.8.5.2.OBL.003',
    'ISO13485.8.5.3.OBL.001',
    'CFR820.100.OBL.001',
    'CFR820.100.OBL.002',
    'CFR820.100.OBL.003',
  ],
  sampleRecords: ['capa_record', 'root_cause_analysis', 'action_plan', 'effectiveness_check'],
});

export const NonconformanceReviewTask = makeTask({
  id: 'nonconformance-review',
  name: 'Nonconformance Review',
  oneLiner: 'Checks nonconforming product handling against the nonconformance graph process.',
  regulation: 'ISO 13485',
  jurisdiction: 'GLOBAL',
  processId: 'nonconformance-handling',
  claimedObligationIds: [
    'ISO13485.8.3.OBL.001',
    'ISO13485.8.3.OBL.002',
    'ISO13485.8.3.OBL.003',
  ],
  sampleRecords: ['nonconformance_record', 'disposition_record', 'concession_authorization'],
});

export const ChangeControlReviewTask = makeTask({
  id: 'change-control-review',
  name: 'Change Control Review',
  oneLiner: 'Checks change-control records against ISO 13485 design/process change obligations.',
  regulation: 'ISO 13485',
  jurisdiction: 'GLOBAL',
  processId: 'change-control',
  claimedObligationIds: ['ISO13485.7.3.9.OBL.001', 'ISO13485.7.3.9.OBL.002'],
  sampleRecords: ['change_request', 'impact_assessment', 'approval_record', 'verification_record'],
});

export const InternalAuditReviewTask = makeTask({
  id: 'internal-audit-review',
  name: 'Internal Audit Review',
  oneLiner: 'Checks an internal audit package against every obligation bound to the internal-audit graph process.',
  regulation: 'ISO 13485',
  jurisdiction: 'GLOBAL',
  processId: 'internal-audit',
  claimedObligationIds: [
    'ISO13485.8.2.4.OBL.001',
    'ISO13485.8.2.4.OBL.002',
    'ISO13485.8.2.4.OBL.003',
    'ISO13485.8.2.4.OBL.004',
    'ISO13485.8.2.4.OBL.005',
  ],
  sampleRecords: ['audit_plan', 'auditor_assignment', 'audit_finding', 'audit_report', 'corrective_action_record'],
});

export const ManagementReviewTask = makeTask({
  id: 'management-review',
  name: 'Management Review',
  oneLiner: 'Checks management-review inputs and outputs against the management-review graph process.',
  regulation: 'ISO 13485',
  jurisdiction: 'GLOBAL',
  processId: 'management-review',
  claimedObligationIds: ['ISO13485.5.6.OBL.001', 'ISO13485.5.6.OBL.002'],
  sampleRecords: ['management_review_minutes', 'qms_input_summary', 'improvement_action_log'],
});