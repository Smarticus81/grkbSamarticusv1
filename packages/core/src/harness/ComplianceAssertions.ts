import type { ComplianceResult } from '../guardrails/types.js';

export class ComplianceAssertions {
  assertCovers(compliance: ComplianceResult, obligationIds: string[]): void {
    const missing = obligationIds.filter((id) => !compliance.satisfied.includes(id));
    if (missing.length > 0) {
      throw new Error(`Compliance missing obligations: ${missing.join(', ')}`);
    }
  }

  assertNoGaps(compliance: ComplianceResult): void {
    if (compliance.unsatisfied.length > 0) {
      throw new Error(`Compliance gaps: ${compliance.unsatisfied.join(', ')}`);
    }
  }

  assertScoreAbove(compliance: ComplianceResult, threshold: number): void {
    if (compliance.score < threshold) {
      throw new Error(`Compliance score ${compliance.score} below threshold ${threshold}`);
    }
  }
}
