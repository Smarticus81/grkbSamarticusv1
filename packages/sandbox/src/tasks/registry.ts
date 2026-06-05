/**
 * Task agent registry. Single source of truth for the sandbox catalog.
 *
 * Tasks are deliberately narrow — each does ONE piece of real QMS work
 * and produces a structured artifact. `chainHints` on each task declare
 * which other tasks it naturally combines with (upstream/downstream),
 * so users can build longer processes by chaining tasks.
 */

import type { TaskAgentDefinition } from './types.js';
import { ComplaintCoderTask } from './agents/complaint-coder.js';
import { AeReportabilityTask } from './agents/ae-reportability.js';
import { TrendDeterminationTask } from './agents/trend-determination.js';
import {
  TemplateComplianceEvaluatorTask,
  PsurTemplateReviewerTask,
} from './agents/template-compliance-evaluator.js';
import {
  RootCauseInvestigatorTask,
  CapaPlanDrafterTask,
  NonconformanceDispositionerTask,
  ChangeImpactAssessorTask,
  MirDrafterTask,
  AuditFindingDrafterTask,
} from './agents/production-tasks.js';

export const TASK_AGENTS: ReadonlyArray<TaskAgentDefinition<any, any>> = [
  // Complaint handling chain
  ComplaintCoderTask,
  AeReportabilityTask,
  MirDrafterTask,
  // CAPA chain
  RootCauseInvestigatorTask,
  CapaPlanDrafterTask,
  // Nonconformance + change control
  NonconformanceDispositionerTask,
  ChangeImpactAssessorTask,
  // Surveillance + governance
  TrendDeterminationTask,
  AuditFindingDrafterTask,
  // PSUR (EU MDR Art. 86 / MDCG 2022-21)
  PsurTemplateReviewerTask,
  TemplateComplianceEvaluatorTask,
];

export interface TaskChainHintEntry {
  taskId: string;
  via: string;
}

export interface TaskCatalogEntry {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  processId: string;
  obligationCount: number;
  upstream: TaskChainHintEntry[];
  downstream: TaskChainHintEntry[];
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
    upstream: t.chainHints?.upstream?.map((h) => ({ taskId: h.taskId, via: h.via })) ?? [],
    downstream: t.chainHints?.downstream?.map((h) => ({ taskId: h.taskId, via: h.via })) ?? [],
  }));
}

export function getTask(id: string): TaskAgentDefinition<any, any> | undefined {
  return TASK_AGENTS.find((t) => t.id === id);
}