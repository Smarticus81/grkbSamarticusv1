import { z } from 'zod';
import type { ObligationNode } from '../../graph/types.js';
import type { ComplianceContext } from '../types.js';

// --- Zod schemas for boundary validation ---

export const ValidationFindingSchema = z.object({
  validator: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  obligationId: z.string().optional(),
  constraintId: z.string().optional(),
  message: z.string().min(1),
  remediation: z.string().optional(),
});

export type ValidationFinding = z.infer<typeof ValidationFindingSchema>;

export const ValidationReportSchema = z.object({
  status: z.enum(['PASS', 'PASS_WITH_WARNINGS', 'FAIL', 'REQUIRES_REVIEW']),
  severityCounts: z.record(z.string(), z.number()),
  findings: z.array(ValidationFindingSchema),
  passedHardChecks: z.boolean(),
  requiresHumanReview: z.boolean(),
});

export type ValidationReport = z.infer<typeof ValidationReportSchema>;

/**
 * Validator interface. Each validator inspects agent output against
 * a set of obligations and produces zero or more findings.
 */
export interface Validator {
  readonly name: string;
  validate(
    output: unknown,
    obligations: ObligationNode[],
    context: ComplianceContext,
  ): Promise<ValidationFinding[]>;
}
