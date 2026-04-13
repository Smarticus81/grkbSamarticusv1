/**
 * Neo4j graph client for the Regulatory Ground obligation knowledge graph.
 * This is a standalone client that talks directly to Neo4j — no dependency
 * on the monorepo core package, so the MCP server can be deployed independently.
 */
import neo4j, { Driver, Session } from 'neo4j-driver';
import { createHash } from 'node:crypto';

// ---- Types ----

export interface ObligationNode {
  obligationId: string;
  jurisdiction: string;
  artifactType: string;
  processType: string;
  kind: string;
  title: string;
  text: string;
  sourceCitation: string;
  version: string;
  mandatory: boolean;
  requiredEvidenceTypes: string[];
  regulation: string;
  section: string;
}

export interface ConstraintNode {
  constraintId: string;
  appliesTo: string;
  text: string;
  expression: string;
  severity: 'hard' | 'soft';
}

export interface DefinitionNode {
  definitionId: string;
  term: string;
  text: string;
  sourceCitation: string;
}

export interface ObligationExplanation {
  obligation: ObligationNode;
  parents: ObligationNode[];
  constraints: ConstraintNode[];
  requiredEvidence: string[];
  crossReferences: ObligationNode[];
  plainEnglishChain: string[];
}

export interface DiscoveredScope {
  obligations: ObligationNode[];
  constraints: ConstraintNode[];
  definitions: DefinitionNode[];
  evidenceTypes: string[];
  summary: string;
}

export interface QualificationResult {
  status: 'QUALIFIED' | 'BLOCKED';
  mandatoryTotal: number;
  mandatoryCovered: number;
  missingObligations: Array<{ obligationId: string; title: string; missingEvidence: string[] }>;
  blockingErrors: string[];
}

export interface ComplianceResult {
  valid: boolean;
  score: number;
  satisfied: string[];
  unsatisfied: string[];
  warnings: string[];
  signatureHash: string;
}

export interface GraphStats {
  obligationCount: number;
  constraintCount: number;
  definitionCount: number;
  evidenceTypeCount: number;
  jurisdictions: string[];
  processTypes: string[];
  regulations: string[];
}

// ---- Client ----

export class GraphClient {
  private driver: Driver;
  private database: string;

  constructor(uri: string, user: string, password: string, database = 'neo4j') {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 15000,
    });
    this.database = database;
  }

  private session(): Session {
    return this.driver.session({ database: this.database });
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  // ---- Graph Query Tools ----

  async getObligationsForProcess(processType: string, jurisdiction: string): Promise<ObligationNode[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation)
         WHERE (o.processType = $processType OR o.processType = 'GENERIC')
           AND (o.jurisdiction = $jurisdiction OR o.jurisdiction = 'GLOBAL')
         RETURN o ORDER BY o.obligationId`,
        { processType, jurisdiction }
      );
      return result.records.map(r => this.toObligation(r.get('o').properties));
    } finally {
      await session.close();
    }
  }

  async getObligation(obligationId: string): Promise<ObligationNode | null> {
    const session = this.session();
    try {
      const result = await session.run(
        'MATCH (o:Obligation { obligationId: $obligationId }) RETURN o',
        { obligationId }
      );
      if (result.records.length === 0) return null;
      return this.toObligation(result.records[0].get('o').properties);
    } finally {
      await session.close();
    }
  }

  async explainObligation(obligationId: string): Promise<ObligationExplanation | null> {
    const session = this.session();
    try {
      // Get the obligation
      const oblResult = await session.run(
        'MATCH (o:Obligation { obligationId: $obligationId }) RETURN o',
        { obligationId }
      );
      if (oblResult.records.length === 0) return null;
      const obligation = this.toObligation(oblResult.records[0].get('o').properties);

      // Get parents (PART_OF)
      const parentResult = await session.run(
        `MATCH (o:Obligation { obligationId: $obligationId })-[:PART_OF]->(p:Obligation) RETURN p`,
        { obligationId }
      );
      const parents = parentResult.records.map(r => this.toObligation(r.get('p').properties));

      // Get constraints
      const conResult = await session.run(
        `MATCH (o:Obligation { obligationId: $obligationId })-[:CONSTRAINED_BY]->(c:Constraint) RETURN c`,
        { obligationId }
      );
      const constraints = conResult.records.map(r => this.toConstraint(r.get('c').properties));

      // Get evidence types
      const evResult = await session.run(
        `MATCH (o:Obligation { obligationId: $obligationId })-[:REQUIRES_EVIDENCE]->(e:EvidenceType) RETURN e.evidenceType as et`,
        { obligationId }
      );
      const requiredEvidence = evResult.records.map(r => r.get('et') as string);

      // Get cross-references
      const xrefResult = await session.run(
        `MATCH (o:Obligation { obligationId: $obligationId })-[:CROSS_REFERENCES]->(x:Obligation) RETURN x`,
        { obligationId }
      );
      const crossReferences = xrefResult.records.map(r => this.toObligation(r.get('x').properties));

      // Build plain English chain
      const plainEnglishChain = [
        `${obligation.title} (${obligation.sourceCitation})`,
        `Jurisdiction: ${obligation.jurisdiction} | Process: ${obligation.processType}`,
        obligation.mandatory ? 'This is a MANDATORY obligation.' : 'This is an advisory obligation.',
        `Full text: ${obligation.text}`,
      ];
      if (constraints.length > 0) {
        plainEnglishChain.push(`Constrained by: ${constraints.map(c => `[${c.severity}] ${c.text}`).join('; ')}`);
      }
      if (requiredEvidence.length > 0) {
        plainEnglishChain.push(`Required evidence: ${requiredEvidence.join(', ')}`);
      }
      if (crossReferences.length > 0) {
        plainEnglishChain.push(`Cross-references: ${crossReferences.map(x => `${x.obligationId} (${x.title})`).join(', ')}`);
      }

      return { obligation, parents, constraints, requiredEvidence, crossReferences, plainEnglishChain };
    } finally {
      await session.close();
    }
  }

  async discoverObligations(processTypes: string[], jurisdictions: string[]): Promise<DiscoveredScope> {
    const session = this.session();
    try {
      // Get obligations
      const oblResult = await session.run(
        `MATCH (o:Obligation)
         WHERE (o.processType IN $processTypes OR o.processType = 'GENERIC')
           AND (o.jurisdiction IN $jurisdictions OR o.jurisdiction = 'GLOBAL')
         RETURN o ORDER BY o.regulation, o.obligationId`,
        { processTypes, jurisdictions }
      );
      const obligations = oblResult.records.map(r => this.toObligation(r.get('o').properties));
      const oblIds = obligations.map(o => o.obligationId);

      // Get constraints for these obligations
      const conResult = await session.run(
        `MATCH (o:Obligation)-[:CONSTRAINED_BY]->(c:Constraint)
         WHERE o.obligationId IN $oblIds
         RETURN DISTINCT c`,
        { oblIds }
      );
      const constraints = conResult.records.map(r => this.toConstraint(r.get('c').properties));

      // Get definitions relevant to jurisdictions
      const defResult = await session.run(
        `MATCH (d:Definition) RETURN d LIMIT 200`
      );
      const definitions = defResult.records.map(r => this.toDefinition(r.get('d').properties));

      // Collect all evidence types
      const evidenceTypes = [...new Set(obligations.flatMap(o => o.requiredEvidenceTypes))].sort();

      const mandatory = obligations.filter(o => o.mandatory).length;
      const summary = `Discovered ${obligations.length} obligations (${mandatory} mandatory) across ${[...new Set(obligations.map(o => o.regulation))].length} regulations, requiring ${evidenceTypes.length} evidence types. Jurisdictions: ${[...new Set(obligations.map(o => o.jurisdiction))].join(', ')}.`;

      return { obligations, constraints, definitions, evidenceTypes, summary };
    } finally {
      await session.close();
    }
  }

  async getEvidenceRequirements(processType: string, jurisdiction: string): Promise<{ obligationId: string; title: string; evidenceTypes: string[] }[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation)-[:REQUIRES_EVIDENCE]->(e:EvidenceType)
         WHERE (o.processType = $processType OR o.processType = 'GENERIC')
           AND (o.jurisdiction = $jurisdiction OR o.jurisdiction = 'GLOBAL')
           AND o.mandatory = true
         RETURN o.obligationId as oblId, o.title as title, collect(e.evidenceType) as evTypes
         ORDER BY o.obligationId`,
        { processType, jurisdiction }
      );
      return result.records.map(r => ({
        obligationId: r.get('oblId') as string,
        title: r.get('title') as string,
        evidenceTypes: r.get('evTypes') as string[],
      }));
    } finally {
      await session.close();
    }
  }

  async findObligationPath(fromId: string, toId: string): Promise<{ path: string[]; relationships: string[] } | null> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH path = shortestPath(
           (a:Obligation { obligationId: $fromId })-[*..6]-(b:Obligation { obligationId: $toId })
         )
         RETURN [n IN nodes(path) | n.obligationId] as nodeIds,
                [r IN relationships(path) | type(r)] as relTypes`,
        { fromId, toId }
      );
      if (result.records.length === 0) return null;
      return {
        path: result.records[0].get('nodeIds') as string[],
        relationships: result.records[0].get('relTypes') as string[],
      };
    } finally {
      await session.close();
    }
  }

  async searchObligations(query: string, limit = 20): Promise<ObligationNode[]> {
    const session = this.session();
    try {
      const result = await session.run(
        `MATCH (o:Obligation)
         WHERE toLower(o.title) CONTAINS toLower($query)
            OR toLower(o.text) CONTAINS toLower($query)
            OR toLower(o.obligationId) CONTAINS toLower($query)
            OR toLower(o.sourceCitation) CONTAINS toLower($query)
         RETURN o ORDER BY o.obligationId LIMIT $limit`,
        { query, limit: neo4j.int(limit) }
      );
      return result.records.map(r => this.toObligation(r.get('o').properties));
    } finally {
      await session.close();
    }
  }

  // ---- Guardrail Tools ----

  async checkQualification(
    processType: string,
    jurisdiction: string,
    availableEvidence: string[]
  ): Promise<QualificationResult> {
    const obligations = await this.getObligationsForProcess(processType, jurisdiction);
    const mandatory = obligations.filter(o => o.mandatory);
    const availableSet = new Set(availableEvidence);

    const missingObligations: QualificationResult['missingObligations'] = [];

    for (const obl of mandatory) {
      const missing = obl.requiredEvidenceTypes.filter(et => !availableSet.has(et));
      if (missing.length > 0) {
        missingObligations.push({
          obligationId: obl.obligationId,
          title: obl.title,
          missingEvidence: missing,
        });
      }
    }

    return {
      status: missingObligations.length === 0 ? 'QUALIFIED' : 'BLOCKED',
      mandatoryTotal: mandatory.length,
      mandatoryCovered: mandatory.length - missingObligations.length,
      missingObligations,
      blockingErrors: missingObligations.map(
        m => `${m.obligationId}: missing evidence types: ${m.missingEvidence.join(', ')}`
      ),
    };
  }

  async validateCompliance(
    addressedObligationIds: string[],
    processType: string,
    jurisdiction: string
  ): Promise<ComplianceResult> {
    const obligations = await this.getObligationsForProcess(processType, jurisdiction);
    const mandatory = obligations.filter(o => o.mandatory);
    const addressedSet = new Set(addressedObligationIds);

    const satisfied = mandatory.filter(o => addressedSet.has(o.obligationId)).map(o => o.obligationId);
    const unsatisfied = mandatory.filter(o => !addressedSet.has(o.obligationId)).map(o => o.obligationId);

    const warnings: string[] = [];
    // Check for unknown obligation IDs
    const validIds = new Set(obligations.map(o => o.obligationId));
    for (const id of addressedObligationIds) {
      if (!validIds.has(id)) {
        warnings.push(`${id}: not found in obligation graph for ${processType}/${jurisdiction}`);
      }
    }

    const score = mandatory.length > 0 ? satisfied.length / mandatory.length : 1;

    // Compute signature over assertion
    const assertion = JSON.stringify({ satisfied, unsatisfied, score, processType, jurisdiction, timestamp: new Date().toISOString() });
    const signatureHash = createHash('sha256').update(assertion).digest('hex');

    return { valid: unsatisfied.length === 0, score, satisfied, unsatisfied, warnings, signatureHash };
  }

  // ---- Stats ----

  async getStats(): Promise<GraphStats> {
    const session = this.session();
    try {
      const result = await session.run(`
        MATCH (o:Obligation) WITH count(o) as oblCount, collect(DISTINCT o.jurisdiction) as jurisdictions, collect(DISTINCT o.processType) as processTypes, collect(DISTINCT o.regulation) as regulations
        MATCH (c:Constraint) WITH oblCount, jurisdictions, processTypes, regulations, count(c) as conCount
        MATCH (d:Definition) WITH oblCount, conCount, jurisdictions, processTypes, regulations, count(d) as defCount
        MATCH (e:EvidenceType) RETURN oblCount, conCount, defCount, count(e) as evCount, jurisdictions, processTypes, regulations
      `);
      const row = result.records[0];
      return {
        obligationCount: (row.get('oblCount') as any).toNumber?.() ?? row.get('oblCount'),
        constraintCount: (row.get('conCount') as any).toNumber?.() ?? row.get('conCount'),
        definitionCount: (row.get('defCount') as any).toNumber?.() ?? row.get('defCount'),
        evidenceTypeCount: (row.get('evCount') as any).toNumber?.() ?? row.get('evCount'),
        jurisdictions: (row.get('jurisdictions') as string[]).filter(Boolean).sort(),
        processTypes: (row.get('processTypes') as string[]).filter(Boolean).sort(),
        regulations: (row.get('regulations') as string[]).filter(Boolean).sort(),
      };
    } finally {
      await session.close();
    }
  }

  async listProcessTypes(): Promise<string[]> {
    const session = this.session();
    try {
      const result = await session.run(
        'MATCH (o:Obligation) RETURN DISTINCT o.processType as pt ORDER BY pt'
      );
      return result.records.map(r => r.get('pt') as string).filter(Boolean);
    } finally {
      await session.close();
    }
  }

  async listJurisdictions(): Promise<string[]> {
    const session = this.session();
    try {
      const result = await session.run(
        'MATCH (j:Jurisdiction) RETURN j.name as name ORDER BY name'
      );
      return result.records.map(r => r.get('name') as string).filter(Boolean);
    } finally {
      await session.close();
    }
  }

  // ---- Helpers ----

  private toObligation(props: Record<string, unknown>): ObligationNode {
    return {
      obligationId: String(props.obligationId ?? ''),
      jurisdiction: String(props.jurisdiction ?? ''),
      artifactType: String(props.artifactType ?? ''),
      processType: String(props.processType ?? ''),
      kind: String(props.kind ?? 'obligation'),
      title: String(props.title ?? ''),
      text: String(props.text ?? ''),
      sourceCitation: String(props.sourceCitation ?? ''),
      version: String(props.version ?? ''),
      mandatory: props.mandatory !== false,
      requiredEvidenceTypes: Array.isArray(props.requiredEvidenceTypes) ? props.requiredEvidenceTypes.map(String) : [],
      regulation: String(props.regulation ?? ''),
      section: String(props.section ?? ''),
    };
  }

  private toConstraint(props: Record<string, unknown>): ConstraintNode {
    return {
      constraintId: String(props.constraintId ?? ''),
      appliesTo: String(props.appliesTo ?? ''),
      text: String(props.text ?? ''),
      expression: String(props.expression ?? ''),
      severity: (props.severity === 'soft' ? 'soft' : 'hard'),
    };
  }

  private toDefinition(props: Record<string, unknown>): DefinitionNode {
    return {
      definitionId: String(props.definitionId ?? ''),
      term: String(props.term ?? ''),
      text: String(props.text ?? ''),
      sourceCitation: String(props.sourceCitation ?? ''),
    };
  }
}
