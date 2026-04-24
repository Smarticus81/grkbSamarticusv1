import type { ObligationNode } from '../graph/types.js';
import type { ComplianceContext } from './types.js';
import type { Validator, ValidationFinding, ValidationReport } from './validators/types.js';

/**
 * Orchestrator that runs an ordered list of validators against agent output.
 * Each validator returns ValidationFinding[]. The pipeline aggregates all
 * findings into a unified ValidationReport with severity counts, status
 * determination, and human review flags.
 */
export class CompliancePipeline {
  private readonly validators: Validator[];

  constructor(validators: Validator[]) {
    this.validators = validators;
  }

  async validate(
    output: unknown,
    obligations: ObligationNode[],
    context: ComplianceContext,
  ): Promise<ValidationReport> {
    const allFindings: ValidationFinding[] = [];

    // Run validators sequentially (order may matter for some validators that
    // depend on graph state or context set by earlier validators).
    for (const validator of this.validators) {
      const findings = await validator.validate(output, obligations, context);
      allFindings.push(...findings);
    }

    return this.buildReport(allFindings);
  }

  /**
   * Aggregate findings into a report with severity counts and status determination.
   */
  private buildReport(findings: ValidationFinding[]): ValidationReport {
    // Count severities.
    const severityCounts: Record<string, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };
    for (const f of findings) {
      severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
    }

    const hasCritical = (severityCounts['critical'] ?? 0) > 0;
    const hasError = (severityCounts['error'] ?? 0) > 0;
    const hasWarning = (severityCounts['warning'] ?? 0) > 0;

    // Hard checks fail if there are any critical or error-level findings.
    const passedHardChecks = !hasCritical && !hasError;

    // Determine overall status.
    let status: ValidationReport['status'];
    let requiresHumanReview: boolean;

    if (hasCritical) {
      // Critical findings always result in FAIL.
      status = 'FAIL';
      requiresHumanReview = true;
    } else if (hasError) {
      // Error-level findings require human review — they might be resolvable.
      status = 'REQUIRES_REVIEW';
      requiresHumanReview = true;
    } else if (hasWarning) {
      // Warnings only — pass but flag for attention.
      status = 'PASS_WITH_WARNINGS';
      requiresHumanReview = false;
    } else {
      // Clean pass.
      status = 'PASS';
      requiresHumanReview = false;
    }

    return {
      status,
      severityCounts,
      findings,
      passedHardChecks,
      requiresHumanReview,
    };
  }
}
