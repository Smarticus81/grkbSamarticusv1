import type { ObligationGraph } from './ObligationGraph.js';
import type { ObligationNode, ObligationDiff } from './types.js';

export interface AmendmentRecord {
  /** Identifier for the amending regulation (e.g. "(EU) 2025/2457"). */
  amendmentId: string;
  /** Date the amendment takes effect. */
  effectiveFrom: Date;
  /** Old obligation IDs being replaced. */
  supersededIds: string[];
  /** New obligation IDs that replace them. */
  replacementIds: string[];
}

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

  /**
   * Apply an amendment: create SUPERSEDES edges from each replacement ID to
   * its superseded ID, with the amendment metadata on the edge. The old
   * obligations are NOT deleted — they remain in the graph for historical
   * queries; `effectiveAsOf` filters them out for post-amendment dates.
   */
  async applyAmendment(record: AmendmentRecord): Promise<void> {
    for (let i = 0; i < record.supersededIds.length; i++) {
      const oldId = record.supersededIds[i]!;
      const newId = record.replacementIds[i] ?? record.replacementIds[0]!;
      await this.graph.upsertRelationship(newId, oldId, 'SUPERSEDES', {
        effectiveFrom: record.effectiveFrom.toISOString(),
        amendmentId: record.amendmentId,
      });
    }
  }

  /**
   * List all supersession chains for a given obligation (both directions).
   */
  async getSupersessionChain(
    obligationId: string,
  ): Promise<{ current: string; supersedes: string[]; supersededBy: string[] }> {
    const session = (this.graph as any).session();
    try {
      const fwd = await session.run(
        `MATCH (a:Obligation { obligationId: $id })-[:SUPERSEDES*]->(b:Obligation)
         RETURN b.obligationId AS id`,
        { id: obligationId },
      );
      const bwd = await session.run(
        `MATCH (a:Obligation)-[:SUPERSEDES*]->(b:Obligation { obligationId: $id })
         RETURN a.obligationId AS id`,
        { id: obligationId },
      );
      return {
        current: obligationId,
        supersedes: fwd.records.map((r: any) => r.get('id') as string),
        supersededBy: bwd.records.map((r: any) => r.get('id') as string),
      };
    } finally {
      await session.close();
    }
  }
}
