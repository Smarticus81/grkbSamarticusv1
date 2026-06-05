import type { ObligationGraph } from './ObligationGraph.js';
import type { ObligationNode, ConstraintNode, DefinitionNode } from './types.js';

export type MatchSource = 'tag' | 'semantic' | 'both';

export interface ScoredObligation {
  obligation: ObligationNode;
  matchedBy: MatchSource;
  semanticScore?: number;
}

export interface DiscoveredScope {
  obligations: ObligationNode[];
  constraints: ConstraintNode[];
  definitions: DefinitionNode[];
  obligationIds: string[];
  requiredEvidenceTypes: string[];
  summary: string;
}

export interface HybridDiscoveredScope extends DiscoveredScope {
  /** Obligations annotated with how they were found (tag/semantic/both). */
  scored: ScoredObligation[];
  /** Semantic-only candidates NOT in the GOVERNED_BY tether — for exploration, not agent grounding. */
  candidates: ScoredObligation[];
}

/**
 * Auto-discovers the applicable regulatory obligations for a given set
 * of process types and jurisdictions by querying the Neo4j obligation graph.
 *
 * This replaces the pattern where each agent hardcodes its `requiredObligations`.
 * Instead, the platform discovers them from what's in the graph.
 */
export class ObligationDiscovery {
  constructor(private readonly graph: ObligationGraph) {}

  /**
   * Discover all obligations, constraints, definitions, and evidence requirements
   * for the given process types and jurisdictions.
   */
  async discover(
    processTypes: string[],
    jurisdictions: string[],
  ): Promise<DiscoveredScope> {
    const obligations: ObligationNode[] = [];
    const seen = new Set<string>();

    // Query for each combination of processType × jurisdiction
    for (const processType of processTypes) {
      for (const jurisdiction of jurisdictions) {
        const found = await this.graph.getObligationsForProcess(processType, jurisdiction);
        for (const obl of found) {
          if (!seen.has(obl.obligationId)) {
            seen.add(obl.obligationId);
            obligations.push(obl);
          }
        }
      }
    }

    // Gather constraints for all discovered obligations
    const constraints: ConstraintNode[] = [];
    const requiredEvidenceTypes = new Set<string>();
    for (const obl of obligations) {
      const cs = await this.graph.getConstraints(obl.obligationId);
      constraints.push(...cs);
      const evTypes = await this.graph.getRequiredEvidence(obl.obligationId);
      for (const et of evTypes) requiredEvidenceTypes.add(et);
    }

    // Gather definitions referenced by the obligations (best-effort via graph)
    const definitions: DefinitionNode[] = [];
    // Definitions are linked via DEFINES relationships in the graph.
    // We attempt to load them for each obligation.
    for (const obl of obligations) {
      const defs = await this.loadDefinitions(obl.obligationId);
      for (const d of defs) {
        if (!definitions.some((existing) => existing.definitionId === d.definitionId)) {
          definitions.push(d);
        }
      }
    }

    const obligationIds = obligations.map((o) => o.obligationId);

    const summary = this.buildSummary(obligations, constraints, definitions, jurisdictions);

    return {
      obligations,
      constraints,
      definitions,
      obligationIds,
      requiredEvidenceTypes: Array.from(requiredEvidenceTypes),
      summary,
    };
  }

  private async loadDefinitions(obligationId: string): Promise<DefinitionNode[]> {
    // ObligationGraph doesn't have a direct getDefinitionsForObligation method,
    // but definitions are seeded with graph relationships. We use a best-effort approach.
    try {
      const session = (this.graph as any).session();
      try {
        const result = await session.run(
          `MATCH (:Obligation { obligationId: $id })-[:DEFINES|REFERENCED_BY]-(d:Definition) RETURN d`,
          { id: obligationId },
        );
        return result.records.map((r: any) => {
          const p = r.get('d').properties;
          return {
            definitionId: p.definitionId,
            term: p.term,
            text: p.text,
            sourceCitation: p.sourceCitation,
            metadata: typeof p.metadata === 'string' ? JSON.parse(p.metadata) : (p.metadata ?? {}),
          };
        });
      } finally {
        await session.close();
      }
    } catch {
      return [];
    }
  }

  /**
   * Hybrid discovery: union of tag-based (processType × jurisdiction) results
   * with semantic top-k, de-duped and annotated with provenance.
   *
   * The GOVERNED_BY scope tether is preserved: semantic-only hits that fall
   * outside the process's tethered obligations are returned as `candidates`
   * (for exploration/search surfaces) rather than mixed into the main scope.
   */
  async discoverHybrid(
    processTypes: string[],
    jurisdictions: string[],
    queryVector: number[],
    semanticK = 20,
  ): Promise<HybridDiscoveredScope> {
    // 1. Standard tag-based discovery
    const tagScope = await this.discover(processTypes, jurisdictions);
    const tagIds = new Set(tagScope.obligationIds);

    // 2. Semantic search (unscoped — may return obligations from any process/jurisdiction)
    const semanticHits = await this.graph.semanticSearch(queryVector, semanticK);

    // 3. Merge: tag-matched obligations get 'tag' or 'both' provenance
    const scored: ScoredObligation[] = tagScope.obligations.map((o) => ({
      obligation: o,
      matchedBy: 'tag' as MatchSource,
    }));

    const candidates: ScoredObligation[] = [];

    for (const hit of semanticHits) {
      const id = hit.obligation.obligationId;
      if (tagIds.has(id)) {
        // Upgrade tag match to 'both'
        const existing = scored.find((s) => s.obligation.obligationId === id);
        if (existing) {
          existing.matchedBy = 'both';
          existing.semanticScore = hit.score;
        }
      } else {
        // Semantic-only — goes to candidates, NOT into main scope
        candidates.push({
          obligation: hit.obligation,
          matchedBy: 'semantic',
          semanticScore: hit.score,
        });
      }
    }

    return {
      ...tagScope,
      scored,
      candidates,
    };
  }

  /**
   * Pure semantic search for obligations. Use this for search/discovery UIs
   * rather than agent grounding.
   */
  async semanticSearch(
    queryVector: number[],
    k: number,
    filters?: {
      jurisdiction?: string;
      processType?: string;
      deviceClass?: string;
      operatorRole?: string;
    },
  ): Promise<ScoredObligation[]> {
    const hits = await this.graph.semanticSearch(queryVector, k, filters);
    return hits.map((h) => ({
      obligation: h.obligation,
      matchedBy: 'semantic' as MatchSource,
      semanticScore: h.score,
    }));
  }

  private buildSummary(
    obligations: ObligationNode[],
    constraints: ConstraintNode[],
    definitions: DefinitionNode[],
    jurisdictions: string[],
  ): string {
    const mandatory = obligations.filter((o) => o.mandatory).length;
    const sources = [...new Set(obligations.map((o) => o.sourceCitation))];
    return [
      `Discovered ${obligations.length} obligations (${mandatory} mandatory) across jurisdictions: ${jurisdictions.join(', ')}.`,
      `${constraints.length} constraints, ${definitions.length} definitions.`,
      `Source regulations: ${sources.join(', ') || 'none'}.`,
    ].join(' ');
  }
}
