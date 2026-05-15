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
  AgentRoleNode,
  HITLGateNode,
  GovernancePolicyNode,
  ObservabilitySLONode,
  ProcessTriggerNode,
} from './types.js';
import {
  ObligationNodeSchema,
  ConstraintNodeSchema,
  DefinitionNodeSchema,
  AgentRoleNodeSchema,
  HITLGateNodeSchema,
  GovernancePolicyNodeSchema,
  ObservabilitySLONodeSchema,
  ProcessTriggerNodeSchema,
} from './types.js';
import { ProcessNodeSchema, type ProcessNode } from './ProcessNode.js';

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
      await session.run(
        `CREATE CONSTRAINT process_id IF NOT EXISTS FOR (p:Process) REQUIRE p.processId IS UNIQUE`,
      );
      // === AgentOS node uniqueness (Phase 0) ===
      await session.run(
        `CREATE CONSTRAINT agentrole_id IF NOT EXISTS FOR (a:AgentRole) REQUIRE a.agentRoleId IS UNIQUE`,
      );
      await session.run(
        `CREATE CONSTRAINT hitlgate_id IF NOT EXISTS FOR (h:HITLGate) REQUIRE h.gateId IS UNIQUE`,
      );
      await session.run(
        `CREATE CONSTRAINT govpolicy_id IF NOT EXISTS FOR (p:GovernancePolicy) REQUIRE p.policyId IS UNIQUE`,
      );
      await session.run(
        `CREATE CONSTRAINT obsslo_id IF NOT EXISTS FOR (s:ObservabilitySLO) REQUIRE s.sloId IS UNIQUE`,
      );
      await session.run(
        `CREATE CONSTRAINT proctrigger_id IF NOT EXISTS FOR (t:ProcessTrigger) REQUIRE t.triggerId IS UNIQUE`,
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

  // ===========================================================================
  // AgentOS node upserts (Phase 0)
  //
  // Each method MERGEs the node by its primary ID and re-binds the canonical
  // edge to its subject (Obligation, Process, etc.). Maps + nested objects are
  // serialized to JSON because Neo4j only stores primitive properties.
  // ===========================================================================

  async upsertAgentRole(node: AgentRoleNode): Promise<void> {
    const v = AgentRoleNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (a:AgentRole { agentRoleId: $agentRoleId })
         SET a += $props`,
        {
          agentRoleId: v.agentRoleId,
          props: {
            ...v,
            processIds: v.processIds,
            obligationScope: v.obligationScope,
            llmCapabilities: v.llmCapabilities,
            metadata: JSON.stringify(v.metadata),
          },
        },
      );
      // EXECUTES edges to processes
      for (const processId of v.processIds) {
        await session.run(
          `MATCH (a:AgentRole { agentRoleId: $aid })
           MERGE (p:Process { processId: $pid })
           MERGE (a)-[:EXECUTES]->(p)`,
          { aid: v.agentRoleId, pid: processId },
        );
      }
    } finally {
      await session.close();
    }
  }

  async upsertHITLGate(node: HITLGateNode): Promise<void> {
    const v = HITLGateNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (h:HITLGate { gateId: $gateId })
         SET h += $props
         WITH h
         MATCH (o:Obligation { obligationId: $appliesTo })
         MERGE (o)-[:REQUIRES_HITL]->(h)`,
        {
          gateId: v.gateId,
          appliesTo: v.appliesTo,
          props: { ...v, metadata: JSON.stringify(v.metadata) },
        },
      );
    } finally {
      await session.close();
    }
  }

  async upsertGovernancePolicy(node: GovernancePolicyNode): Promise<void> {
    const v = GovernancePolicyNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (p:GovernancePolicy { policyId: $policyId })
         SET p += $props`,
        {
          policyId: v.policyId,
          props: {
            ...v,
            appliesTo: v.appliesTo,
            rule: JSON.stringify(v.rule),
            metadata: JSON.stringify(v.metadata),
          },
        },
      );
      // BOUND_BY_POLICY edges to either Obligation or Process subjects.
      // We try both labels because a single policy may bind heterogeneous nodes.
      for (const subjectId of v.appliesTo) {
        await session.run(
          `MATCH (p:GovernancePolicy { policyId: $pid })
           OPTIONAL MATCH (o:Obligation { obligationId: $sid })
           OPTIONAL MATCH (proc:Process { processId: $sid })
           FOREACH (_ IN CASE WHEN o IS NULL THEN [] ELSE [1] END | MERGE (o)-[:BOUND_BY_POLICY]->(p))
           FOREACH (_ IN CASE WHEN proc IS NULL THEN [] ELSE [1] END | MERGE (proc)-[:BOUND_BY_POLICY]->(p))`,
          { pid: v.policyId, sid: subjectId },
        );
      }
    } finally {
      await session.close();
    }
  }

  async upsertObservabilitySLO(node: ObservabilitySLONode): Promise<void> {
    const v = ObservabilitySLONodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (s:ObservabilitySLO { sloId: $sloId })
         SET s += $props`,
        {
          sloId: v.sloId,
          props: { ...v, metadata: JSON.stringify(v.metadata) },
        },
      );
      // MEASURED_BY may target either Obligation or Process
      await session.run(
        `MATCH (s:ObservabilitySLO { sloId: $sid })
         OPTIONAL MATCH (o:Obligation { obligationId: $aid })
         OPTIONAL MATCH (p:Process { processId: $aid })
         FOREACH (_ IN CASE WHEN o IS NULL THEN [] ELSE [1] END | MERGE (o)-[:MEASURED_BY]->(s))
         FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (p)-[:MEASURED_BY]->(s))`,
        { sid: v.sloId, aid: v.appliesTo },
      );
    } finally {
      await session.close();
    }
  }

  async upsertProcessTrigger(node: ProcessTriggerNode): Promise<void> {
    const v = ProcessTriggerNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (t:ProcessTrigger { triggerId: $triggerId })
         SET t += $props
         WITH t
         MERGE (p:Process { processId: $processId })
         MERGE (p)-[:STARTED_BY]->(t)`,
        {
          triggerId: v.triggerId,
          processId: v.processId,
          props: {
            ...v,
            filter: v.filter ? JSON.stringify(v.filter) : null,
            metadata: JSON.stringify(v.metadata),
          },
        },
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Generic relationship upsert. Matches endpoints across any of the known
   * primary-ID properties (obligationId, constraintId, definitionId, processId,
   * agentRoleId, gateId, policyId, sloId, triggerId, evidenceType). This is
   * what allows AgentOS edges (EXECUTES, REQUIRES_HITL, BOUND_BY_POLICY,
   * MEASURED_BY, STARTED_BY) to span heterogeneous node types.
   */
  async upsertRelationship(
    from: string,
    to: string,
    type: RelationType,
    props: Record<string, unknown> = {},
  ): Promise<void> {
    const session = this.session();
    try {
      await session.run(
        `MATCH (a) WHERE a.obligationId = $from OR a.constraintId = $from
            OR a.definitionId = $from OR a.processId = $from
            OR a.agentRoleId = $from OR a.gateId = $from
            OR a.policyId = $from OR a.sloId = $from
            OR a.triggerId = $from OR a.evidenceType = $from
         MATCH (b) WHERE b.obligationId = $to OR b.constraintId = $to
            OR b.definitionId = $to OR b.processId = $to
            OR b.agentRoleId = $to OR b.gateId = $to
            OR b.policyId = $to OR b.sloId = $to
            OR b.triggerId = $to OR b.evidenceType = $to
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

  // === Process bundles (process-first scope tether) ===

  /**
   * Upsert a process node. Idempotent.
   */
  async upsertProcess(node: ProcessNode): Promise<void> {
    const validated = ProcessNodeSchema.parse(node);
    const session = this.session();
    try {
      await session.run(
        `MERGE (p:Process { processId: $processId })
         SET p += $props`,
        {
          processId: validated.processId,
          props: {
            ...validated,
            jurisdictions: validated.jurisdictions,
          },
        },
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Bind a process to a set of obligation IDs via [:GOVERNED_BY] edges.
   * Returns the IDs that did NOT resolve to existing obligations — caller
   * must treat these as a hard error so we never silently bind a process
   * to a phantom obligation.
   */
  async bindProcessObligations(
    processId: string,
    obligationIds: string[],
  ): Promise<{ bound: string[]; missing: string[] }> {
    if (obligationIds.length === 0) return { bound: [], missing: [] };
    const session = this.session();
    try {
      // Find which IDs actually exist.
      const existing = await session.run(
        `MATCH (o:Obligation) WHERE o.obligationId IN $ids RETURN o.obligationId AS id`,
        { ids: obligationIds },
      );
      const found = new Set<string>(existing.records.map((r) => r.get('id') as string));
      const missing = obligationIds.filter((id) => !found.has(id));
      const bound = obligationIds.filter((id) => found.has(id));
      if (bound.length > 0) {
        await session.run(
          `MATCH (p:Process { processId: $processId })
           MATCH (o:Obligation) WHERE o.obligationId IN $bound
           MERGE (p)-[:GOVERNED_BY]->(o)`,
          { processId, bound },
        );
      }
      return { bound, missing };
    } finally {
      await session.close();
    }
  }

  /**
   * Replace the [:GOVERNED_BY] set for a process. Removes edges to any
   * obligation not in the new set. Used by the seeder so deletes propagate.
   */
  async replaceProcessObligations(
    processId: string,
    obligationIds: string[],
  ): Promise<{ bound: string[]; missing: string[] }> {
    const session = this.session();
    try {
      await session.run(
        `MATCH (p:Process { processId: $processId })-[r:GOVERNED_BY]->() DELETE r`,
        { processId },
      );
    } finally {
      await session.close();
    }
    return this.bindProcessObligations(processId, obligationIds);
  }

  /**
   * Real Cypher query — return only obligations [:GOVERNED_BY] this process,
   * filtered to the IDs the caller is claiming. The intersection IS the
   * scope tether: any claimed ID outside the process bundle won't come back.
   */
  async getProcessObligations(
    processId: string,
    claimedObligationIds?: string[],
  ): Promise<ObligationNode[]> {
    const session = this.session();
    try {
      const cypher = claimedObligationIds && claimedObligationIds.length > 0
        ? `MATCH (p:Process { processId: $processId })-[:GOVERNED_BY]->(o:Obligation)
           WHERE o.obligationId IN $ids
           RETURN o ORDER BY o.obligationId`
        : `MATCH (p:Process { processId: $processId })-[:GOVERNED_BY]->(o:Obligation)
           RETURN o ORDER BY o.obligationId`;
      const result = await session.run(cypher, {
        processId,
        ids: claimedObligationIds ?? [],
      });
      return result.records.map((r) => this.recordToObligation(r.get('o').properties));
    } finally {
      await session.close();
    }
  }

  /**
   * List all seeded processes (catalog).
   */
  async listProcesses(): Promise<ProcessNode[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (p:Process) RETURN p ORDER BY p.processId`,
      );
      return result.records.map((r) => {
        const x = r.get('p').properties;
        return {
          processId: x.processId,
          name: x.name,
          description: x.description,
          category: x.category,
          jurisdictions: Array.isArray(x.jurisdictions) ? x.jurisdictions : [],
          version: x.version ?? '1.0.0',
        } satisfies ProcessNode;
      });
    } finally {
      await session.close();
    }
  }

  async getProcess(processId: string): Promise<ProcessNode | null> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (p:Process { processId: $processId }) RETURN p`,
        { processId },
      );
      if (result.records.length === 0) return null;
      const x = result.records[0]!.get('p').properties;
      return {
        processId: x.processId,
        name: x.name,
        description: x.description,
        category: x.category,
        jurisdictions: Array.isArray(x.jurisdictions) ? x.jurisdictions : [],
        version: x.version ?? '1.0.0',
      };
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
