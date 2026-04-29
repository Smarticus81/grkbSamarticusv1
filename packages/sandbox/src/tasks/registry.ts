/**
 * Task agent registry. Single source of truth for the sandbox catalog.
 *
 * The PSUR Section Drafter has been retired in favor of the Template
 * Compliance Evaluator, which is tethered to the `psur-compilation`
 * process bundle in the graph.
 */

import type { TaskAgentDefinition } from './types.js';
import { ComplaintCoderTask } from './agents/complaint-coder.js';
import { AeReportabilityTask } from './agents/ae-reportability.js';
import { TrendDeterminationTask } from './agents/trend-determination.js';
import { TemplateComplianceEvaluatorTask } from './agents/template-compliance-evaluator.js';
import {
  CapaReviewTask,
  ChangeControlReviewTask,
  ComplaintHandlingReviewTask,
  InternalAuditReviewTask,
  ManagementReviewTask,
  NonconformanceReviewTask,
} from './agents/process-review.js';

export const TASK_AGENTS: ReadonlyArray<TaskAgentDefinition<any, any>> = [
  ComplaintHandlingReviewTask,
  ComplaintCoderTask,
  AeReportabilityTask,
  CapaReviewTask,
  NonconformanceReviewTask,
  ChangeControlReviewTask,
  TrendDeterminationTask,
  InternalAuditReviewTask,
  ManagementReviewTask,
  TemplateComplianceEvaluatorTask,
];

export interface TaskCatalogEntry {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  processId: string;
  obligationCount: number;
}

export function listTasks(): TaskCatalogEntry[] {
  return TASK_AGENTS.map((t) => ({
    id: t.id,
    name: t.name,
    oneLiner: t.oneLiner,
    regulation: t.regulation,
    jurisdiction: t.jurisdiction,
    processId: t.processId,
    obligationCount: t.claimedObligationIds.length,
  }));
}

export function getTask(id: string): TaskAgentDefinition<any, any> | undefined {
  return TASK_AGENTS.find((t) => t.id === id);
}