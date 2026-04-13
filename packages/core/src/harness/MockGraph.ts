import type {
  ObligationNode,
  ConstraintNode,
  DefinitionNode,
  RelationType,
  GraphPath,
  Subgraph,
  ObligationExplanation,
  ObligationTree,
  ObligationDiff,
  CoverageMap,
} from '../graph/types.js';
import type { ObligationGraph } from '../graph/ObligationGraph.js';

/**
 * In-memory ObligationGraph for unit tests. Implements the same surface as
 * the Neo4j-backed graph without requiring a running database.
 */
export class MockGraph implements Pick<ObligationGraph,
  | 'ensureConstraints'
  | 'upsertObligation'
  | 'upsertConstraint'
  | 'upsertDefinition'
  | 'upsertRelationship'
  | 'deleteObligation'
  | 'getObligation'
  | 'getObligationsForProcess'
  | 'getRequiredEvidence'
  | 'getConstraints'
  | 'getDefinition'
  | 'findPath'
  | 'getSubgraph'
  | 'explainObligation'
  | 'getObligationTree'
  | 'getEffectiveObligations'
  | 'diffVersions'
  | 'getCoverageMap'
  | 'getOrphanedObligations'
> {
  private obligations = new Map<string, ObligationNode>();
  private constraints = new Map<string, ConstraintNode>();
  private definitions = new Map<string, DefinitionNode>();
  private relationships: { from: string; to: string; type: RelationType; props: Record<string, unknown> }[] = [];

  async ensureConstraints(): Promise<void> {}

  async upsertObligation(node: ObligationNode): Promise<void> {
    this.obligations.set(node.obligationId, node);
  }
  async upsertConstraint(node: ConstraintNode): Promise<void> {
    this.constraints.set(node.constraintId, node);
  }
  async upsertDefinition(node: DefinitionNode): Promise<void> {
    this.definitions.set(node.definitionId, node);
  }
  async upsertRelationship(from: string, to: string, type: RelationType, props: Record<string, unknown> = {}): Promise<void> {
    this.relationships.push({ from, to, type, props });
  }
  async deleteObligation(obligationId: string): Promise<void> {
    this.obligations.delete(obligationId);
    this.relationships = this.relationships.filter((r) => r.from !== obligationId && r.to !== obligationId);
  }

  async getObligation(id: string): Promise<ObligationNode | null> {
    return this.obligations.get(id) ?? null;
  }
  async getObligationsForProcess(processType: string, jurisdiction: string): Promise<ObligationNode[]> {
    return Array.from(this.obligations.values()).filter(
      (o) => o.processType === processType && (o.jurisdiction === jurisdiction || o.jurisdiction === 'GLOBAL'),
    );
  }
  async getRequiredEvidence(obligationId: string): Promise<string[]> {
    const o = this.obligations.get(obligationId);
    return o?.requiredEvidenceTypes ?? [];
  }
  async getConstraints(obligationId: string): Promise<ConstraintNode[]> {
    return Array.from(this.constraints.values()).filter((c) => c.appliesTo === obligationId);
  }
  async getDefinition(id: string): Promise<DefinitionNode | null> {
    return this.definitions.get(id) ?? null;
  }

  async findPath(_from: string, _to: string): Promise<GraphPath> {
    return { nodes: [], relationships: [] };
  }
  async getSubgraph(ids: string[]): Promise<Subgraph> {
    const nodes = ids.map((id) => this.obligations.get(id)).filter((n): n is ObligationNode => Boolean(n));
    const rels = this.relationships
      .filter((r) => ids.includes(r.from) && ids.includes(r.to))
      .map((r) => ({ from: r.from, to: r.to, type: r.type }));
    return { nodes, relationships: rels };
  }
  async explainObligation(id: string): Promise<ObligationExplanation> {
    const obligation = this.obligations.get(id);
    if (!obligation) throw new Error(`Obligation not found: ${id}`);
    const constraints = await this.getConstraints(id);
    const requiredEvidence = obligation.requiredEvidenceTypes;
    return {
      obligation,
      parents: [],
      constraints,
      requiredEvidence,
      crossReferences: [],
      plainEnglishChain: [
        `${obligation.sourceCitation}: ${obligation.title}`,
        obligation.text,
        ...(constraints.length ? [`Constraints: ${constraints.map((c) => c.text).join('; ')}`] : []),
      ],
    };
  }
  async getObligationTree(rootId: string): Promise<ObligationTree> {
    const root = this.obligations.get(rootId);
    if (!root) throw new Error(`Obligation not found: ${rootId}`);
    return { root, children: [] };
  }
  async getEffectiveObligations(jurisdiction: string, _asOfDate: Date): Promise<ObligationNode[]> {
    return Array.from(this.obligations.values()).filter(
      (o) => o.jurisdiction === jurisdiction || o.jurisdiction === 'GLOBAL',
    );
  }
  async diffVersions(_v1: string, _v2: string): Promise<ObligationDiff> {
    return { added: [], removed: [], changed: [] };
  }
  async getCoverageMap(processInstanceId: string): Promise<CoverageMap> {
    return {
      processInstanceId,
      total: this.obligations.size,
      covered: 0,
      uncovered: Array.from(this.obligations.keys()),
      byObligation: {},
    };
  }
  async getOrphanedObligations(): Promise<ObligationNode[]> {
    return [];
  }
}
