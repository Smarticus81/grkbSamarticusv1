import type { ObligationGraph } from './ObligationGraph.js';
import type { ObligationNode, ObligationDiff } from './types.js';

export class GraphVersioning {
  constructor(private readonly graph: ObligationGraph) {}

  async effectiveAsOf(jurisdiction: string, date: Date): Promise<ObligationNode[]> {
    return this.graph.getEffectiveObligations(jurisdiction, date);
  }

  async diff(fromVersion: string, toVersion: string): Promise<ObligationDiff> {
    return this.graph.diffVersions(fromVersion, toVersion);
  }

  async supersede(oldId: string, newId: string, effectiveFrom: Date): Promise<void> {
    await this.graph.upsertRelationship(newId, oldId, 'SUPERSEDES', {
      effectiveFrom: effectiveFrom.toISOString(),
    });
  }
}
