import type { Driver, Session } from 'neo4j-driver';
import { getNeo4j } from '../db/connection.js';
import type { ObligationGraph } from './ObligationGraph.js';
import type { ObligationNode } from './types.js';

/**
 * KBCatalog — read-only enumeration of every Neo4j node type that the
 * ProcessBuilderAgent is allowed to reference when composing a workflow.
 *
 * The builder agent must NEVER fabricate IDs. Anything it places in a
 * WorkflowDraft must come from one of these enumerations; the API layer
 * re-validates each refId against this catalog before persisting.
 */

export interface CatalogObligation {
  obligationId: string;
  regulation: string;
  section: string;
  jurisdiction: string;
  processType: string;
  text: string;
  mandatory: boolean;
  requiredEvidenceTypes: string[];
}

export interface CatalogAgentRole {
  agentRoleId: string;
  name: string;
  description: string;
  processIds: string[];
  obligationScope: string[];
}

export interface CatalogHITLGate {
  gateId: string;
  appliesTo: string;
  approverRole: string;
  description: string;
  slaHours: number | null;
}

export interface CatalogPolicy {
  policyId: string;
  policyClass: string;
  appliesTo: string[];
  description: string;
}

export interface CatalogSLO {
  sloId: string;
  appliesTo: string;
  metric: string;
  threshold: number;
  unit: string;
  description: string;
}

export interface CatalogTrigger {
  triggerId: string;
  processId: string;
  triggerType: string;
  schedule: string | null;
  eventType: string | null;
  description: string;
}

export interface CatalogProcess {
  processId: string;
  processType: string;
  description: string;
}

export interface CatalogEvidenceType {
  evidenceType: string;
  satisfiesObligationCount: number;
}

export interface KBCatalogSnapshot {
  obligations: CatalogObligation[];
  agentRoles: CatalogAgentRole[];
  hitlGates: CatalogHITLGate[];
  policies: CatalogPolicy[];
  slos: CatalogSLO[];
  triggers: CatalogTrigger[];
  processes: CatalogProcess[];
  evidenceTypes: CatalogEvidenceType[];
  jurisdictions: string[];
  processTypes: string[];
}

export interface CatalogFilter {
  jurisdiction?: string;
  processType?: string;
}

export class KBCatalog {
  private readonly driver: Driver;
  private readonly database: string;

  constructor(private readonly graph: ObligationGraph, driver?: Driver, database?: string) {
    this.driver = driver ?? getNeo4j();
    this.database = database ?? process.env.NEO4J_DATABASE ?? 'neo4j';
  }

  private session(): Session {
    return this.driver.session({ database: this.database });
  }

  async snapshot(filter: CatalogFilter = {}): Promise<KBCatalogSnapshot> {
    const [
      obligations,
      agentRoles,
      hitlGates,
      policies,
      slos,
      triggers,
      processes,
      evidenceTypes,
      jurisdictions,
      processTypes,
    ] = await Promise.all([
      this.listObligations(filter),
      this.listAgentRoles(),
      this.listHITLGates(),
      this.listPolicies(),
      this.listSLOs(),
      this.listTriggers(),
      this.listProcesses(),
      this.listEvidenceTypes(),
      this.listJurisdictions(),
      this.listProcessTypes(),
    ]);
    return {
      obligations,
      agentRoles,
      hitlGates,
      policies,
      slos,
      triggers,
      processes,
      evidenceTypes,
      jurisdictions,
      processTypes,
    };
  }

  async listObligations(filter: CatalogFilter = {}): Promise<CatalogObligation[]> {
    const session = this.session();
    try {
      const where: string[] = [];
      const params: Record<string, string> = {};
      if (filter.jurisdiction) {
        where.push('o.jurisdiction = $jurisdiction');
        params.jurisdiction = filter.jurisdiction;
      }
      if (filter.processType) {
        where.push('(o.processType = $processType OR o.processType = "GENERIC")');
        params.processType = filter.processType;
      }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const r = await session.run(
        `MATCH (o:Obligation) ${whereClause}
         RETURN o.obligationId AS obligationId, o.regulation AS regulation,
                o.section AS section, o.jurisdiction AS jurisdiction,
                o.processType AS processType, o.text AS text,
                o.mandatory AS mandatory,
                coalesce(o.requiredEvidenceTypes, []) AS requiredEvidenceTypes
         ORDER BY o.obligationId
         LIMIT 1000`,
        params,
      );
      return r.records.map((rec) => ({
        obligationId: rec.get('obligationId'),
        regulation: rec.get('regulation') ?? '',
        section: rec.get('section') ?? '',
        jurisdiction: rec.get('jurisdiction') ?? '',
        processType: rec.get('processType') ?? 'GENERIC',
        text: rec.get('text') ?? '',
        mandatory: Boolean(rec.get('mandatory')),
        requiredEvidenceTypes: rec.get('requiredEvidenceTypes') as string[],
      }));
    } finally {
      await session.close();
    }
  }

  async listAgentRoles(): Promise<CatalogAgentRole[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (a:AgentRole)
         RETURN a.agentRoleId AS agentRoleId, a.name AS name,
                a.description AS description,
                coalesce(a.processIds, []) AS processIds,
                coalesce(a.obligationScope, []) AS obligationScope
         ORDER BY a.agentRoleId`,
      );
      return r.records.map((rec) => ({
        agentRoleId: rec.get('agentRoleId'),
        name: rec.get('name') ?? '',
        description: rec.get('description') ?? '',
        processIds: rec.get('processIds') as string[],
        obligationScope: rec.get('obligationScope') as string[],
      }));
    } finally {
      await session.close();
    }
  }

  async listHITLGates(): Promise<CatalogHITLGate[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (h:HITLGate)
         RETURN h.gateId AS gateId, h.appliesTo AS appliesTo,
                h.approverRole AS approverRole, h.description AS description,
                h.slaHours AS slaHours
         ORDER BY h.gateId`,
      );
      return r.records.map((rec) => ({
        gateId: rec.get('gateId'),
        appliesTo: rec.get('appliesTo') ?? '',
        approverRole: rec.get('approverRole') ?? '',
        description: rec.get('description') ?? '',
        slaHours: rec.get('slaHours') as number | null,
      }));
    } finally {
      await session.close();
    }
  }

  async listPolicies(): Promise<CatalogPolicy[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (p:GovernancePolicy)
         RETURN p.policyId AS policyId, p.policyClass AS policyClass,
                coalesce(p.appliesTo, []) AS appliesTo,
                p.description AS description
         ORDER BY p.policyId`,
      );
      return r.records.map((rec) => ({
        policyId: rec.get('policyId'),
        policyClass: rec.get('policyClass') ?? '',
        appliesTo: rec.get('appliesTo') as string[],
        description: rec.get('description') ?? '',
      }));
    } finally {
      await session.close();
    }
  }

  async listSLOs(): Promise<CatalogSLO[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (s:ObservabilitySLO)
         RETURN s.sloId AS sloId, s.appliesTo AS appliesTo, s.metric AS metric,
                s.threshold AS threshold, s.unit AS unit,
                s.description AS description
         ORDER BY s.sloId`,
      );
      return r.records.map((rec) => ({
        sloId: rec.get('sloId'),
        appliesTo: rec.get('appliesTo') ?? '',
        metric: rec.get('metric') ?? '',
        threshold: Number(rec.get('threshold') ?? 0),
        unit: rec.get('unit') ?? '',
        description: rec.get('description') ?? '',
      }));
    } finally {
      await session.close();
    }
  }

  async listTriggers(): Promise<CatalogTrigger[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (t:ProcessTrigger)
         RETURN t.triggerId AS triggerId, t.processId AS processId,
                t.triggerType AS triggerType, t.schedule AS schedule,
                t.eventType AS eventType, t.description AS description
         ORDER BY t.triggerId`,
      );
      return r.records.map((rec) => ({
        triggerId: rec.get('triggerId'),
        processId: rec.get('processId') ?? '',
        triggerType: rec.get('triggerType') ?? '',
        schedule: rec.get('schedule') as string | null,
        eventType: rec.get('eventType') as string | null,
        description: rec.get('description') ?? '',
      }));
    } finally {
      await session.close();
    }
  }

  async listProcesses(): Promise<CatalogProcess[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (p:Process)
         RETURN p.processId AS processId,
                coalesce(p.processType, '') AS processType,
                coalesce(p.description, '') AS description
         ORDER BY p.processId`,
      );
      return r.records.map((rec) => ({
        processId: rec.get('processId'),
        processType: rec.get('processType'),
        description: rec.get('description'),
      }));
    } finally {
      await session.close();
    }
  }

  async listEvidenceTypes(): Promise<CatalogEvidenceType[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (e:EvidenceType)
         OPTIONAL MATCH (e)-[:SATISFIES]->(o:Obligation)
         RETURN e.evidenceType AS evidenceType,
                count(o) AS satisfiesObligationCount
         ORDER BY e.evidenceType`,
      );
      return r.records.map((rec) => ({
        evidenceType: rec.get('evidenceType'),
        satisfiesObligationCount: Number(rec.get('satisfiesObligationCount') ?? 0),
      }));
    } finally {
      await session.close();
    }
  }

  async listJurisdictions(): Promise<string[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (o:Obligation) RETURN DISTINCT o.jurisdiction AS j ORDER BY j`,
      );
      return r.records.map((rec) => rec.get('j') as string).filter(Boolean);
    } finally {
      await session.close();
    }
  }

  async listProcessTypes(): Promise<string[]> {
    const session = this.session();
    try {
      const r = await session.run(
        `MATCH (o:Obligation) RETURN DISTINCT o.processType AS pt ORDER BY pt`,
      );
      return r.records.map((rec) => rec.get('pt') as string).filter(Boolean);
    } finally {
      await session.close();
    }
  }

  // Used by the agent during tool-use to "explain" an obligation it discovered.
  async explainObligation(obligationId: string): Promise<{
    obligation: ObligationNode;
    constraintTexts: string[];
    evidenceTypes: string[];
  } | null> {
    try {
      const exp = await this.graph.explainObligation(obligationId);
      return {
        obligation: exp.obligation,
        constraintTexts: exp.constraints.map((c) => c.text),
        evidenceTypes: exp.requiredEvidence,
      };
    } catch {
      return null;
    }
  }
}

