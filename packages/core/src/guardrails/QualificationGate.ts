import type { ObligationGraph } from '../graph/ObligationGraph.js';
import type { QualificationInput, QualificationResult } from './types.js';

/**
 * Pre-execution gate. Asks: "given the available evidence, can this process
 * legally and competently begin?" Blocks if any mandatory obligation lacks
 * its required evidence types.
 */
export class QualificationGate {
  constructor(private readonly graph: ObligationGraph) {}

  async check(input: QualificationInput): Promise<QualificationResult> {
    const obligations = await this.graph.getObligationsForProcess(
      input.processType,
      input.jurisdiction,
    );
    const mandatory = obligations.filter((o) => o.mandatory);

    const missingObligations: string[] = [];
    const missingEvidence = new Set<string>();
    const blockingErrors: string[] = [];

    for (const obl of mandatory) {
      const required = obl.requiredEvidenceTypes ?? [];
      const fromGraph = await this.graph.getRequiredEvidence(obl.obligationId);
      const allRequired = Array.from(new Set([...required, ...fromGraph]));
      const missing = allRequired.filter((t) => !input.availableEvidence.includes(t));
      if (missing.length > 0) {
        missingObligations.push(obl.obligationId);
        for (const m of missing) missingEvidence.add(m);
        blockingErrors.push(
          `Obligation ${obl.obligationId} (${obl.sourceCitation}) missing evidence: ${missing.join(', ')}`,
        );
      }
    }

    // Collect constraints across mandatory obligations.
    const constraints = [];
    for (const obl of mandatory) {
      const cs = await this.graph.getConstraints(obl.obligationId);
      constraints.push(...cs);
    }

    const mandatoryCovered = mandatory.length - missingObligations.length;
    return {
      status: blockingErrors.length === 0 ? 'QUALIFIED' : 'BLOCKED',
      mandatoryTotal: mandatory.length,
      mandatoryCovered,
      missingObligations,
      missingEvidence: Array.from(missingEvidence),
      constraints,
      blockingErrors,
    };
  }
}
