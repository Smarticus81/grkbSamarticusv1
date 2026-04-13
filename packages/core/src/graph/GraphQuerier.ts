import type { ObligationGraph } from './ObligationGraph.js';
import type { ObligationNode, ObligationExplanation } from './types.js';

/**
 * Higher-level convenience query API on top of ObligationGraph. Provides
 * commonly-used traversals for agents and the API layer.
 */
export class GraphQuerier {
  constructor(private readonly graph: ObligationGraph) {}

  async obligationsForProcess(
    processType: string,
    jurisdiction: string,
  ): Promise<ObligationNode[]> {
    return this.graph.getObligationsForProcess(processType, jurisdiction);
  }

  async mandatoryObligations(
    processType: string,
    jurisdiction: string,
  ): Promise<ObligationNode[]> {
    const all = await this.graph.getObligationsForProcess(processType, jurisdiction);
    return all.filter((o) => o.mandatory);
  }

  async explain(obligationId: string): Promise<ObligationExplanation> {
    return this.graph.explainObligation(obligationId);
  }

  async requiredEvidenceForProcess(
    processType: string,
    jurisdiction: string,
  ): Promise<string[]> {
    const obligations = await this.graph.getObligationsForProcess(processType, jurisdiction);
    const types = new Set<string>();
    for (const o of obligations) {
      for (const t of o.requiredEvidenceTypes) types.add(t);
      const more = await this.graph.getRequiredEvidence(o.obligationId);
      for (const t of more) types.add(t);
    }
    return Array.from(types);
  }
}
