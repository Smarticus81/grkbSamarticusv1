import type { ObligationNode } from '../../graph/types.js';
import type { ComplianceContext } from '../types.js';
import type { Validator, ValidationFinding } from './types.js';

/**
 * Checks that output.addressedObligations covers all mandatory obligations.
 * Adapted from the original ComplianceValidator logic.
 */
export class ClaimCoverageValidator implements Validator {
  readonly name = 'ClaimCoverageValidator';

  async validate(
    output: unknown,
    obligations: ObligationNode[],
    _context: ComplianceContext,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const claimed = this.extractClaims(output);
    const oblIds = obligations.map((o) => o.obligationId);
    const mandatoryIds = obligations
      .filter((o) => o.mandatory)
      .map((o) => o.obligationId);

    // Check for uncovered mandatory obligations.
    for (const id of mandatoryIds) {
      if (!claimed.includes(id)) {
        findings.push({
          validator: this.name,
          severity: 'error',
          obligationId: id,
          message: `Mandatory obligation ${id} not addressed in output.`,
          remediation: `Add ${id} to the output's addressedObligations and provide supporting evidence.`,
        });
      }
    }

    // Warn about claims that reference unknown obligations.
    for (const id of claimed) {
      if (!oblIds.includes(id)) {
        findings.push({
          validator: this.name,
          severity: 'warning',
          obligationId: id,
          message: `Claimed obligation ${id} is not in the loaded obligation set for this process/jurisdiction.`,
          remediation: `Verify that ${id} is a valid obligation ID. Remove if erroneous.`,
        });
      }
    }

    // Info finding when all mandatory are covered.
    if (mandatoryIds.length > 0 && mandatoryIds.every((id) => claimed.includes(id))) {
      findings.push({
        validator: this.name,
        severity: 'info',
        message: `All ${mandatoryIds.length} mandatory obligations are addressed.`,
      });
    }

    return findings;
  }

  private extractClaims(output: unknown): string[] {
    if (!output || typeof output !== 'object') return [];
    const obj = output as Record<string, unknown>;
    const raw = obj.addressedObligations ?? obj.obligationsAddressed ?? obj.obligationIds;
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
    return [];
  }
}
