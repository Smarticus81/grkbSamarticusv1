import type { Driver, Session } from 'neo4j-driver';
import { getNeo4j } from '../db/connection.js';
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
} from './types.js';
import { ObligationNodeSchema, ConstraintNodeSchema, DefinitionNodeSchema } from './types.js';

/**
 * Neo4j-backed obligation knowledge graph. Source of truth for obligations,
 * constraints, definitions, and their relationships across regulations.
 */
export class ObligationGraph {
  private driver: Driver;
  private database: string;

  constructor(driver?: Driver, database?: string) {
    this.driver = driver ?? getNeo4j();
    this.database = database ?? process.env.NEO4J_DATABASE ?? 'neo4j';
  }

  private session(): Session {
    return this.driver.session({ database: this.database });
  }

  // === Schema bootstrap ===
  async ensureConstraints(): Promise<void> {
    const session = this.session();
    try {
      await session.run(
        `CREATE CONSTRAINT obligation_id IF NOT EXISTS FOR (o:Obligation) REQUIRE o.obligationId IS UNIQUE`,
      );
      await session.run(
        `CREATE CONSTRAINT constraint_id IF NOT EXISTS FOR (c:Constraint) REQUIRE c.constraintId IS UNIQUE`,
      );
      await session.run(
        `CREATE CONSTRAINT definition_id IF NOT EXISTS FOR (d:Definition) REQUIRE d.definitionId IS UNIQUE`,
      );
      await session.run(
        `CREATE CONSTRAINT evidence_type IF NOT EXISTS FOR (e:EvidenceType) REQUIRE e.evidenceType IS UNIQUE`,
      );
    } finally {
      await session.close();
    }
  }

  // === Write ===
  async upsertObligation(node: ObligationNode): Promise<void> {
    const validated = ObligationNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (o:Obligation { obligationId: $obligationId })
         SET o += $props
         WITH o
         MERGE (j:Jurisdiction { name: $jurisdiction })
         MERGE (o)-[:APPLIES_TO]->(j)`,
        {
          obligationId: validated.obligationId,
          jurisdiction: validated.jurisdiction,
          props: {
            ...validated,
            effectiveFrom: validated.effectiveFrom?.toISOString() ?? null,
            metadata: JSON.stringify(validated.metadata),
            requiredEvidenceTypes: validated.requiredEvidenceTypes,
          },
        },
      );
      // Auto-create REQUIRES_EVIDENCE relationships
      for (const evType of validated.requiredEvidenceTypes) {
        await session.run(
          `MERGE (e:EvidenceType { evidenceType: $evType })
           WITH e
           MATCH (o:Obligation { obligationId: $obligationId })
           MERGE (o)-[:REQUIRES_EVIDENCE]->(e)
           MERGE (e)-[:SATISFIES]->(o)`,
          { evType, obligationId: validated.obligationId },
        );
      }
    } finally {
      await session.close();
    }
  }

  async upsertConstraint(node: ConstraintNode): Promise<void> {
    const validated = ConstraintNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (c:Constraint { constraintId: $constraintId })
         SET c += $props
         WITH c
         MATCH (o:Obligation { obligationId: $appliesTo })
         MERGE (o)-[:CONSTRAINED_BY]->(c)`,
        {
          constraintId: validated.constraintId,
          appliesTo: validated.appliesTo,
          props: { ...validated, metadata: JSON.stringify(validated.metadata) },
        },
      );
    } finally {
      await session.close();
    }
  }

  async upsertDefinition(node: DefinitionNode): Promise<void> {
    const validated = DefinitionNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (d:Definition { definitionId: $definitionId })
         SET d += $props`,
        {
          definitionId: validated.definitionId,
          props: { ...validated, metadata: JSON.stringify(validated.metadata) },
        },
      );
    } finally {
      await session.close();
    }
  }

  async upsertRelationship(
    from: string,
    to: string,
    type: RelationType,
    props: Record<string, unknown> = {},
  ): Promise<void> {
    const session = this.session();
    try {
      await session.run(
        `MATCH (a { obligationId: $from }), (b { obligationId: $to })
         MERGE (a)-[r:${type}]->(b)
         SET r += $props`,
        { from, to, props },
      );
    } finally {
      await session.close();
    }
  }

  async deleteObligation(obligationId: string): Promise<void> {
    const session = this.session();
    try {
      await session.run(
        `MATCH (o:Obligation { obligationId: $obligationId }) DETACH DELETE o`,
        { obligationId },
      );
    } finally {
      await session.close();
    }
  }

  // === Query ===
  async getObligation(obligationId: string): Promise<ObligationNode | null> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation { obligationId: $obligationId }) RETURN o`,
        { obligationId },
      );
      if (result.records.length === 0) return null;
      return this.recordToObligation(result.records[0]!.get('o').properties);
    } finally {
      await session.close();
    }
  }

  async getObligationsForProcess(
    processType: string,
    jurisdiction: string,
  ): Promise<ObligationNode[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation)
         WHERE o.processType = $processType
           AND (o.jurisdiction = $jurisdiction OR o.jurisdiction = 'GLOBAL')
         RETURN o
         ORDER BY o.obligationId`,
        { processType, jurisdiction },
      );
      return result.records.map((r) => this.recordToObligation(r.get('o').properties));
    } finally {
      await session.close();
    }
  }

  async getRequiredEvidence(obligationId: string): Promise<string[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (:Obligation { obligationId: $obligationId })-[:REQUIRES_EVIDENCE]->(e:EvidenceType)
         RETURN e.evidenceType AS evType`,
        { obligationId },
      );
      return result.records.map((r) => r.get('evType') as string);
    } finally {
      await session.close();
    }
  }

  async getConstraints(obligationId: string): Promise<ConstraintNode[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (:Obligation { obligationId: $obligationId })-[:CONSTRAINED_BY]->(c:Constraint)
         RETURN c`,
        { obligationId },
      );
      return result.records.map((r) => {
        const p = r.get('c').properties;
        return {
          constraintId: p.constraintId,
          appliesTo: p.appliesTo,
          text: p.text,
          expression: p.expression,
          severity: p.severity ?? 'hard',
          metadata: this.parseMetadata(p.metadata),
        };
      });
    } finally {
      await session.close();
    }
  }

  async getDefinition(definitionId: string): Promise<DefinitionNode | null> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (d:Definition { definitionId: $definitionId }) RETURN d`,
        { definitionId },
      );
      if (result.records.length === 0) return null;
      const p = result.records[0]!.get('d').properties;
      return {
        definitionId: p.definitionId,
        term: p.term,
        text: p.text,
        sourceCitation: p.sourceCitation,
        metadata: this.parseMetadata(p.metadata),
      };
    } finally {
      await session.close();
    }
  }

  // === Traversal ===
  async findPath(fromId: string, toId: string): Promise<GraphPath> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH p = shortestPath(
           (a:Obligation { obligationId: $fromId })-[*..10]-(b:Obligation { obligationId: $toId })
         )
         RETURN p`,
        { fromId, toId },
      );
      if (result.records.length === 0) return { nodes: [], relationships: [] };
      const path = result.records[0]!.get('p');
      return {
        nodes: path.segments
          .map((s: any) => this.recordToObligation(s.start.properties))
          .concat([this.recordToObligation(path.end.properties)]),
        relationships: path.segments.map((s: any) => ({
          from: s.start.properties.obligationId,
          to: s.end.properties.obligationId,
          type: s.relationship.type as RelationType,
        })),
      };
    } finally {
      await session.close();
    }
  }

  async getSubgraph(obligationIds: string[]): Promise<Subgraph> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation)
         WHERE o.obligationId IN $ids
         OPTIONAL MATCH (o)-[r]-(other:Obligation)
         WHERE other.obligationId IN $ids
         RETURN o, r, other`,
        { ids: obligationIds },
      );
      const nodes = new Map<string, ObligationNode>();
      const rels: { from: string; to: string; type: RelationType }[] = [];
      for (const rec of result.records) {
        const o = this.recordToObligation(rec.get('o').properties);
        nodes.set(o.obligationId, o);
        const r = rec.get('r');
        const other = rec.get('other');
        if (r && other) {
          const otherNode = this.recordToObligation(other.properties);
          nodes.set(otherNode.obligationId, otherNode);
          rels.push({
            from: r.start.toString(),
            to: r.end.toString(),
            type: r.type as RelationType,
          });
        }
      }
      return { nodes: Array.from(nodes.values()), relationships: rels };
    } finally {
      await session.close();
    }
  }

  async explainObligation(obligationId: string): Promise<ObligationExplanation> {
    const obligation = await this.getObligation(obligationId);
    if (!obligation) throw new Error(`Obligation not found: ${obligationId}`);

    const session = this.session();
    try {
      const parentsRes = await session.run(
        `MATCH (o:Obligation { obligationId: $id })-[:PART_OF]->(p:Obligation) RETURN p`,
        { id: obligationId },
      );
      const parents = parentsRes.records.map((r) =>
        this.recordToObligation(r.get('p').properties),
      );

      const xrefRes = await session.run(
        `MATCH (o:Obligation { obligationId: $id })-[:CROSS_REFERENCES]-(x:Obligation) RETURN DISTINCT x`,
        { id: obligationId },
      );
      const crossReferences = xrefRes.records.map((r) =>
        this.recordToObligation(r.get('x').properties),
      );

      const constraints = await this.getConstraints(obligationId);
      const requiredEvidence = await this.getRequiredEvidence(obligationId);

      const plainEnglishChain: string[] = [
        `${obligation.sourceCitation}: ${obligation.title}`,
        obligation.text,
      ];
      if (constraints.length > 0) {
        plainEnglishChain.push(
          `Constraints: ${constraints.map((c) => c.text).join('; ')}`,
        );
      }
      if (requiredEvidence.length > 0) {
        plainEnglishChain.push(`Required evidence: ${requiredEvidence.join(', ')}`);
      }
      if (parents.length > 0) {
        plainEnglishChain.push(
          `Part of: ${parents.map((p) => p.sourceCitation).join('; ')}`,
        );
      }

      return { obligation, parents, constraints, requiredEvidence, crossReferences, plainEnglishChain };
    } finally {
      await session.close();
    }
  }

  async getObligationTree(rootId: string): Promise<ObligationTree> {
    const root = await this.getObligation(rootId);
    if (!root) throw new Error(`Obligation not found: ${rootId}`);
    const session = this.session();
    try {
      const childRes = await session.run(
        `MATCH (c:Obligation)-[:PART_OF]->(:Obligation { obligationId: $id }) RETURN c`,
        { id: rootId },
      );
      const children: ObligationTree[] = [];
      for (const rec of childRes.records) {
        const childNode = this.recordToObligation(rec.get('c').properties);
        children.push(await this.getObligationTree(childNode.obligationId));
      }
      return { root, children };
    } finally {
      await session.close();
    }
  }

  // === Versioning ===
  async getEffectiveObligations(jurisdiction: string, asOfDate: Date): Promise<ObligationNode[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation)
         WHERE (o.jurisdiction = $jurisdiction OR o.jurisdiction = 'GLOBAL')
           AND (o.effectiveFrom IS NULL OR datetime(o.effectiveFrom) <= datetime($asOf))
           AND NOT EXISTS {
             MATCH (newer:Obligation)-[:SUPERSEDES]->(o)
             WHERE datetime(newer.effectiveFrom) <= datetime($asOf)
           }
         RETURN o`,
        { jurisdiction, asOf: asOfDate.toISOString() },
      );
      return result.records.map((r) => this.recordToObligation(r.get('o').properties));
    } finally {
      await session.close();
    }
  }

  async diffVersions(v1: string, v2: string): Promise<ObligationDiff> {
    const session = this.session();
    try {
      const a = await session.run(`MATCH (o:Obligation { version: $v }) RETURN o`, { v: v1 });
      const b = await session.run(`MATCH (o:Obligation { version: $v }) RETURN o`, { v: v2 });
      const aMap = new Map<string, ObligationNode>();
      for (const rec of a.records) {
        const n = this.recordToObligation(rec.get('o').properties);
        aMap.set(n.obligationId, n);
      }
      const bMap = new Map<string, ObligationNode>();
      for (const rec of b.records) {
        const n = this.recordToObligation(rec.get('o').properties);
        bMap.set(n.obligationId, n);
      }
      const added: string[] = [];
      const removed: string[] = [];
      const changed: { obligationId: string; before: ObligationNode; after: ObligationNode }[] = [];
      for (const [id, node] of bMap) {
        if (!aMap.has(id)) added.push(id);
        else if (JSON.stringify(aMap.get(id)) !== JSON.stringify(node))
          changed.push({ obligationId: id, before: aMap.get(id)!, after: node });
      }
      for (const id of aMap.keys()) if (!bMap.has(id)) removed.push(id);
      return { added, removed, changed };
    } finally {
      await session.close();
    }
  }

  // === Analytics ===
  async getCoverageMap(processInstanceId: string): Promise<CoverageMap> {
    // Computed by joining trace entries (in PG) against obligation graph.
    // Without a process instance loaded we return an empty map; the orchestrator
    // calls this with a populated trace store.
    return {
      processInstanceId,
      total: 0,
      covered: 0,
      uncovered: [],
      byObligation: {},
    };
  }

  async getOrphanedObligations(): Promise<ObligationNode[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation)
         WHERE NOT (o)-[:REQUIRES_EVIDENCE]->()
           AND NOT ()-[:CROSS_REFERENCES]->(o)
           AND NOT (o)-[:PART_OF]->()
         RETURN o`,
      );
      return result.records.map((r) => this.recordToObligation(r.get('o').properties));
    } finally {
      await session.close();
    }
  }

  // === Helpers ===
  private recordToObligation(p: Record<string, any>): ObligationNode {
    return {
      obligationId: p.obligationId,
      jurisdiction: p.jurisdiction,
      artifactType: p.artifactType,
      processType: p.processType,
      kind: p.kind,
      title: p.title,
      text: p.text,
      sourceCitation: p.sourceCitation,
      version: p.version,
      effectiveFrom: p.effectiveFrom ? new Date(p.effectiveFrom) : undefined,
      mandatory: p.mandatory ?? true,
      requiredEvidenceTypes: p.requiredEvidenceTypes ?? [],
      metadata: this.parseMetadata(p.metadata),
    };
  }

  private parseMetadata(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return {};
  }
}
