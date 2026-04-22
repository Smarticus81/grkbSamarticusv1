/**
 * Task agent registry. Single source of truth for the sandbox catalog.
 */

import type { TaskAgentDefinition } from './types.js';
import { ComplaintCoderTask } from './agents/complaint-coder.js';
import { AeReportabilityTask } from './agents/ae-reportability.js';
import { TrendDeterminationTask } from './agents/trend-determination.js';
import { TemplateComplianceEvaluatorTask } from './agents/template-compliance-evaluator.js';
import { PsurSectionDrafterTask } from './agents/psur-section-drafter.js';

export const TASK_AGENTS: ReadonlyArray<TaskAgentDefinition<any, any>> = [
  ComplaintCoderTask,
  AeReportabilityTask,
  TrendDeterminationTask,
  TemplateComplianceEvaluatorTask,
  PsurSectionDrafterTask,
];

export interface TaskCatalogEntry {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  obligationCount: number;
}

export function listTasks(): TaskCatalogEntry[] {
  return TASK_AGENTS.map((t) => ({
    id: t.id,
    name: t.name,
    oneLiner: t.oneLiner,
    regulation: t.regulation,
    jurisdiction: t.jurisdiction,
    obligationCount: t.obligations.length,
  }));
}

export function getTask(id: string): TaskAgentDefinition<any, any> | undefined {
  return TASK_AGENTS.find((t) => t.id === id);
}
