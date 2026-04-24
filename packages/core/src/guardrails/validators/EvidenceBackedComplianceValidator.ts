import type { ObligationNode } from '../../graph/types.js';
import type { ComplianceContext } from '../types.js';
import type { Validator, ValidationFinding } from './types.js';

/**
 * For each obligation claimed by the output, verifies that the output's
 * evidence field contains atoms matching the obligation's required evidence types.
 * Emits findings for missing evidence backing.
 */
export class EvidenceBackedComplianceValidator implements Validator {
  readonly name = 'EvidenceBackedComplianceValidator';

  async validate(
    output: unknown,
    obligations: ObligationNode[],
    _context: ComplianceContext,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const claimed = this.extractClaims(output);
    const evidenceMap = this.extractEvidence(output);

    // Build a lookup from obligationId to its required evidence types.
    const oblMap = new Map<string, ObligationNode>();
    for (const obl of obligations) {
      oblMap.set(obl.obligationId, obl);
    }

    for (const claimedId of claimed) {
      const obl = oblMap.get(claimedId);
      if (!obl) continue; // Unknown obligation — handled by ClaimCoverageValidator.

      const requiredTypes = obl.requiredEvidenceTypes ?? [];
      if (requiredTypes.length === 0) continue; // No evidence requirements for this obligation.

      const providedForObligation = evidenceMap.get(claimedId) ?? new Set<string>();
      // Also check global evidence (not keyed to a specific obligation).
      const globalEvidence = evidenceMap.get('*') ?? new Set<string>();
      const allProvided = new Set([...providedForObligation, ...globalEvidence]);

      for (const reqType of requiredTypes) {
        if (!allProvided.has(reqType)) {
          findings.push({
            validator: this.name,
            severity: 'error',
            obligationId: claimedId,
            message: `Obligation ${claimedId} claims compliance but is missing evidence type "${reqType}".`,
            remediation: `Provide evidence of type "${reqType}" to back the compliance claim for ${claimedId}.`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Extract claimed obligation IDs from output.
   */
  private extractClaims(output: unknown): string[] {
    if (!output || typeof output !== 'object') return [];
    const obj = output as Record<string, unknown>;
    const raw = obj.addressedObligations ?? obj.obligationsAddressed ?? obj.obligationIds;
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
    return [];
  }

  /**
   * Extract evidence map from output. Supports two shapes:
   *
   * 1. `evidence: Record<obligationId, string[]>` — evidence keyed per obligation.
   * 2. `evidence: string[]` — flat list of evidence types (treated as global, key '*').
   * 3. `evidence: Array<{ obligationId?: string; evidenceType: string }>` — structured atoms.
   */
  private extractEvidence(output: unknown): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    if (!output || typeof output !== 'object') return map;
    const obj = output as Record<string, unknown>;
    const evidence = obj.evidence;

    if (!evidence) return map;

    // Shape 3: Array of evidence atoms.
    if (Array.isArray(evidence)) {
      for (const item of evidence) {
        if (typeof item === 'string') {
          // Flat list → global.
          if (!map.has('*')) map.set('*', new Set());
          map.get('*')!.add(item);
        } else if (item && typeof item === 'object') {
          const atom = item as Record<string, unknown>;
          const evType = atom.evidenceType ?? atom.type;
          const oblId = atom.obligationId ?? '*';
          if (typeof evType === 'string' && typeof oblId === 'string') {
            if (!map.has(oblId)) map.set(oblId, new Set());
            map.get(oblId)!.add(evType);
          }
        }
      }
      return map;
    }

    // Shape 1: Record<obligationId, string[]>.
    if (typeof evidence === 'object') {
      const rec = evidence as Record<string, unknown>;
      for (const [key, value] of Object.entries(rec)) {
        if (Array.isArray(value)) {
          const types = value.filter((x): x is string => typeof x === 'string');
          map.set(key, new Set(types));
        }
      }
    }

    return map;
  }
}
