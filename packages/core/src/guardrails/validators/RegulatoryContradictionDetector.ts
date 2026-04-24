import type { ObligationGraph } from '../../graph/ObligationGraph.js';
import type { ObligationNode } from '../../graph/types.js';
import type { ComplianceContext } from '../types.js';
import type { Validator, ValidationFinding } from './types.js';

/**
 * Checks output against known cross-reference and conflict relationships in the
 * obligation graph. Flags claims that satisfy one regulation while violating its
 * mapped twin (via CROSS_REFERENCES or CONFLICTS_WITH relationships).
 *
 * Logic:
 * 1. For each claimed obligation, find its cross-referenced obligations.
 * 2. If a cross-referenced obligation is mandatory but NOT claimed, emit a warning.
 * 3. If an obligation has a CONFLICTS_WITH relationship to another claimed
 *    obligation, emit a critical finding.
 */
export class RegulatoryContradictionDetector implements Validator {
  readonly name = 'RegulatoryContradictionDetector';

  constructor(private readonly graph: ObligationGraph) {}

  async validate(
    output: unknown,
    obligations: ObligationNode[],
    _context: ComplianceContext,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const claimed = this.extractClaims(output);

    if (claimed.length === 0) return findings;

    const claimedSet = new Set(claimed);
    const oblMap = new Map<string, ObligationNode>();
    for (const obl of obligations) {
      oblMap.set(obl.obligationId, obl);
    }

    // Track already-checked pairs to avoid duplicate findings.
    const checkedPairs = new Set<string>();

    for (const claimedId of claimed) {
      // Get the full explanation which includes cross-references.
      let explanation;
      try {
        explanation = await this.graph.explainObligation(claimedId);
      } catch {
        // Obligation not found in graph — other validators handle this.
        continue;
      }

      // Check cross-references: if a cross-referenced obligation is mandatory
      // and not claimed, warn about regulatory alignment gap.
      for (const xref of explanation.crossReferences) {
        const pairKey = [claimedId, xref.obligationId].sort().join('::');

        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        if (xref.mandatory && !claimedSet.has(xref.obligationId)) {
          findings.push({
            validator: this.name,
            severity: 'warning',
            obligationId: claimedId,
            message: `Obligation ${claimedId} has a cross-reference to mandatory obligation ${xref.obligationId} (${xref.sourceCitation}), which is not addressed in the output. This may indicate a regulatory alignment gap.`,
            remediation: `Review whether obligation ${xref.obligationId} should also be addressed to maintain cross-regulatory consistency.`,
          });
        }
      }

      // Check for CONFLICTS_WITH relationships via subgraph query.
      await this.checkConflicts(claimedId, claimedSet, checkedPairs, findings);
    }

    return findings;
  }

  /**
   * Checks if any claimed obligation conflicts with another claimed obligation
   * via CONFLICTS_WITH relationships in the graph.
   */
  private async checkConflicts(
    obligationId: string,
    claimedSet: Set<string>,
    checkedPairs: Set<string>,
    findings: ValidationFinding[],
  ): Promise<void> {
    // Use subgraph to find related obligations including conflict relationships.
    const allClaimed = Array.from(claimedSet);
    const subgraph = await this.graph.getSubgraph([obligationId, ...allClaimed]);

    for (const rel of subgraph.relationships) {
      if (rel.type !== 'CONFLICTS_WITH') continue;

      // Check if both ends of the conflict are claimed.
      const from = rel.from;
      const to = rel.to;
      const pairKey = [from, to].sort().join('::CONFLICT::');

      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);

      // We need to map neo4j internal IDs to obligation IDs from the subgraph nodes.
      // The subgraph returns nodes with obligationId fields, and relationships use
      // the internal IDs. Match by checking if both sides are in our claimed set.
      const fromNode = subgraph.nodes.find(
        (n) => n.obligationId === from || claimedSet.has(n.obligationId),
      );
      const toNode = subgraph.nodes.find(
        (n) => n.obligationId === to || claimedSet.has(n.obligationId),
      );

      if (fromNode && toNode && claimedSet.has(fromNode.obligationId) && claimedSet.has(toNode.obligationId)) {
        findings.push({
          validator: this.name,
          severity: 'critical',
          obligationId: fromNode.obligationId,
          message: `Regulatory contradiction detected: obligation ${fromNode.obligationId} (${fromNode.sourceCitation}) CONFLICTS_WITH ${toNode.obligationId} (${toNode.sourceCitation}). Both are claimed as satisfied, which may be contradictory.`,
          remediation: `Review the conflict between ${fromNode.obligationId} and ${toNode.obligationId}. Determine which takes precedence or whether both can be simultaneously satisfied under specific conditions.`,
        });
      }
    }
  }

  private extractClaims(output: unknown): string[] {
    if (!output || typeof output !== 'object') return [];
    const obj = output as Record<string, unknown>;
    const raw = obj.addressedObligations ?? obj.obligationsAddressed ?? obj.obligationIds;
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
    return [];
  }
}
