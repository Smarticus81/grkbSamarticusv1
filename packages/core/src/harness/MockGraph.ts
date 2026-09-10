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
 *
 * Besides the graph surface it exposes a few harness-only helpers:
 *  - `seed()` / `clear()` to (re)load obligations synchronously
 *  - `registerProcess()` to model `(:Process)-[:GOVERNED_BY]->(:Obligation)`
 *    so agents that run with a `processId` see process-scoped obligations
 *  - `markCovered()` so `getCoverageMap()` reflects what a run addressed
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
  | 'getProcessObligations'
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
  private processes = new Map<string, Set<string>>();
  private covered = new Map<string, Set<string>>();

  // === Harness helpers (not part of the ObligationGraph surface) ===

  /** Synchronously load obligations. Later nodes with the same id win. */
  seed(nodes: ObligationNode[], constraints: ConstraintNode[] = []): this {
    for (const n of nodes) this.obligations.set(n.obligationId, n);
    for (const c of constraints) this.constraints.set(c.constraintId, c);
    return this;
  }

  /** Bind a process id to a set of obligations (process-first scoping). */
  registerProcess(processId: string, obligationIds: string[]): this {
    this.processes.set(processId, new Set(obligationIds));
    return this;
  }

  /** Record that a process instance addressed an obligation. */
  markCovered(processInstanceId: string, obligationIds: string[]): this {
    const set = this.covered.get(processInstanceId) ?? new Set<string>();
    for (const id of obligationIds) set.add(id);
    this.covered.set(processInstanceId, set);
    return this;
  }

  listObligations(): ObligationNode[] {
    return Array.from(this.obligations.values());
  }

  listProcessIds(): string[] {
    return Array.from(this.processes.keys());
  }

  /** Drop every node, relationship, process binding and coverage record. */
  clear(): this {
    this.obligations.clear();
    this.constraints.clear();
    this.definitions.clear();
    this.relationships = [];
    this.processes.clear();
    this.covered.clear();
    return this;
  }

  // === ObligationGraph surface ===

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
    for (const set of this.processes.values()) set.delete(obligationId);
  }

  async getObligation(id: string): Promise<ObligationNode | null> {
    return this.obligations.get(id) ?? null;
  }
  async getObligationsForProcess(processType: string, jurisdiction: string): Promise<ObligationNode[]> {
    return Array.from(this.obligations.values()).filter(
      (o) => o.processType === processType && (o.jurisdiction === jurisdiction || o.jurisdiction === 'GLOBAL'),
    );
  }
  /**
   * Process-first lookup. Mirrors the Neo4j query: obligations bound to the
   * process, optionally narrowed to the claimed ids. A process that was never
   * registered has no obligations (so qualification reports OUT_OF_SCOPE).
   */
  async getProcessObligations(processId: string, claimedObligationIds?: string[]): Promise<ObligationNode[]> {
    const bound = this.processes.get(processId);
    if (!bound) return [];
    const narrow = claimedObligationIds && claimedObligationIds.length > 0 ? new Set(claimedObligationIds) : null;
    return Array.from(bound)
      .filter((id) => !narrow || narrow.has(id))
      .map((id) => this.obligations.get(id))
      .filter((n): n is ObligationNode => Boolean(n))
      .sort((a, b) => a.obligationId.localeCompare(b.obligationId));
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

  async findPath(from: string, to: string): Promise<GraphPath> {
    // Breadth-first over the recorded relationships (either direction).
    const adjacency = new Map<string, { to: string; type: RelationType }[]>();
    for (const r of this.relationships) {
      adjacency.set(r.from, [...(adjacency.get(r.from) ?? []), { to: r.to, type: r.type }]);
    }
    const prev = new Map<string, { from: string; type: RelationType }>();
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === to) break;
      for (const edge of adjacency.get(cur) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        prev.set(edge.to, { from: cur, type: edge.type });
        queue.push(edge.to);
      }
    }
    if (from !== to && !prev.has(to)) return { nodes: [], relationships: [] };
    const ids = [to];
    const rels: { from: string; to: string; type: RelationType }[] = [];
    let cursor = to;
    while (cursor !== from) {
      const step = prev.get(cursor)!;
      rels.unshift({ from: step.from, to: cursor, type: step.type });
      ids.unshift(step.from);
      cursor = step.from;
    }
    const nodes = ids.map((id) => this.obligations.get(id)).filter((n): n is ObligationNode => Boolean(n));
    return { nodes, relationships: rels };
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
    const covered = this.covered.get(processInstanceId) ?? new Set<string>();
    const ids = Array.from(this.obligations.keys());
    const byObligation: CoverageMap['byObligation'] = {};
    for (const id of ids) byObligation[id] = { covered: covered.has(id), evidenceCount: covered.has(id) ? 1 : 0 };
    return {
      processInstanceId,
      total: ids.length,
      covered: ids.filter((id) => covered.has(id)).length,
      uncovered: ids.filter((id) => !covered.has(id)),
      byObligation,
    };
  }
  async getOrphanedObligations(): Promise<ObligationNode[]> {
    const referenced = new Set<string>();
    for (const set of this.processes.values()) for (const id of set) referenced.add(id);
    for (const r of this.relationships) {
      referenced.add(r.from);
      referenced.add(r.to);
    }
    if (referenced.size === 0) return [];
    return Array.from(this.obligations.values()).filter((o) => !referenced.has(o.obligationId));
  }
}
