import { createHash } from 'node:crypto';
import type { ObligationNode } from '../graph/types.js';
import type { ComplianceContext, ComplianceResult } from './types.js';

/**
 * Post-step validator. Inspects an agent's output for explicit obligation
 * coverage claims (`addressedObligations: string[]`) and validates them
 * against the obligations the agent declared as required.
 */
export class ComplianceValidator {
  validate(
    output: unknown,
    obligations: ObligationNode[],
    context: ComplianceContext,
  ): ComplianceResult {
    const claimed = this.extractClaims(output);
    const oblIds = obligations.map((o) => o.obligationId);
    const mandatoryIds = obligations.filter((o) => o.mandatory).map((o) => o.obligationId);

    const satisfied: string[] = [];
    const unsatisfied: string[] = [];
    const warnings: string[] = [];

    for (const id of mandatoryIds) {
      if (claimed.includes(id)) satisfied.push(id);
      else unsatisfied.push(id);
    }
    for (const id of claimed) {
      if (!oblIds.includes(id)) {
        warnings.push(`Claimed obligation ${id} is not in the loaded obligation set.`);
      }
    }

    const score = mandatoryIds.length === 0 ? 1 : satisfied.length / mandatoryIds.length;
    const valid = unsatisfied.length === 0;

    const assertionPayload = {
      agentId: context.agentId,
      obligationsClaimed: claimed,
      obligationsSatisfied: satisfied,
      attestedAt: new Date().toISOString(),
    };
    const signature = createHash('sha256')
      .update(JSON.stringify(assertionPayload))
      .digest('hex');

    return {
      valid,
      score,
      satisfied,
      unsatisfied,
      warnings,
      assertion: { ...assertionPayload, signature },
      summary: valid
        ? `All ${mandatoryIds.length} mandatory obligations satisfied.`
        : `${unsatisfied.length} of ${mandatoryIds.length} mandatory obligations unsatisfied.`,
    };
  }

  private extractClaims(output: unknown): string[] {
    if (!output || typeof output !== 'object') return [];
    const obj = output as Record<string, unknown>;
    const raw = obj.addressedObligations ?? obj.obligationsAddressed ?? obj.obligationIds;
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
    return [];
  }
}
