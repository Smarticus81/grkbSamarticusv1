import { z } from 'zod';

export const ObligationKindSchema = z.enum(['obligation', 'constraint', 'definition']);
export type ObligationKind = z.infer<typeof ObligationKindSchema>;

/**
 * Structured applicability filter — allows discovery to filter obligations by
 * device class, operator role, device type, and additional conditions rather
 * than relying on free-text tags alone.  All fields are optional so existing
 * obligations remain backward-compatible.
 */
export const ApplicabilitySchema = z.object({
  /** MDR risk classes: I, IIa, IIb, III, AIMD, IVD-A/B/C/D, etc. */
  deviceClasses: z.array(z.string()).optional(),
  /** Economic operator roles: manufacturer, authorised_representative, importer, distributor, etc. */
  operatorRoles: z.array(z.string()).optional(),
  /** Device categories: implantable, active, software, in_vitro_diagnostic, etc. */
  deviceTypes: z.array(z.string()).optional(),
  /** Free-form conditions (e.g. "only when device incorporates medicinal substance"). */
  conditions: z.array(z.string()).optional(),
}).default({});
export type Applicability = z.infer<typeof ApplicabilitySchema>;

export const ObligationNodeSchema = z.object({
  obligationId: z.string().min(1),
  jurisdiction: z.string().min(1),
  artifactType: z.string().min(1),
  processType: z.string().min(1),
  kind: ObligationKindSchema,
  title: z.string().min(1),
  text: z.string().min(1),
  sourceCitation: z.string().min(1),
  version: z.string().min(1),
  effectiveFrom: z.coerce.date().optional(),
  mandatory: z.boolean().default(true),
  requiredEvidenceTypes: z.array(z.string()).default([]),
  applicability: ApplicabilitySchema,
  metadata: z.record(z.unknown()).default({}),
});
export type ObligationNode = z.infer<typeof ObligationNodeSchema>;

export const ConstraintNodeSchema = z.object({
  constraintId: z.string().min(1),
  appliesTo: z.string().min(1), // obligationId
  text: z.string().min(1),
  expression: z.string().optional(), // optional machine-readable expression
  severity: z.enum(['hard', 'soft']).default('hard'),
  metadata: z.record(z.unknown()).default({}),
});
export type ConstraintNode = z.infer<typeof ConstraintNodeSchema>;

export const DefinitionNodeSchema = z.object({
  definitionId: z.string().min(1),
  term: z.string().min(1),
  text: z.string().min(1),
  sourceCitation: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});
export type DefinitionNode = z.infer<typeof DefinitionNodeSchema>;

export const EvidenceTypeNodeSchema = z.object({
  evidenceType: z.string().min(1),
  description: z.string().min(1),
  schema: z.record(z.unknown()).default({}),
});
export type EvidenceTypeNode = z.infer<typeof EvidenceTypeNodeSchema>;

export type RelationType =
  | 'REQUIRES_EVIDENCE'
  | 'CONSTRAINED_BY'
  | 'SUPERSEDES'
  | 'APPLIES_TO'
  | 'PART_OF'
  | 'CROSS_REFERENCES'
  | 'TRIGGERS'
  | 'SATISFIES'
  | 'CONFLICTS_WITH'
  // === Cross-regulation edges ===
  // Source obligation implements a requirement in a target regulation/standard
  // e.g. EU MDR Art. 10(9) QMS → ISO 13485 clause 4.1
  | 'IMPLEMENTS'
  // Source obligation is harmonized by a harmonized standard
  // e.g. EU MDR Annex I GSPR → EN ISO 14971 risk management
  | 'HARMONIZED_BY'
  // Source obligation is derived from a higher-level requirement
  // e.g. national implementing measure → EU MDR article
  | 'DERIVED_FROM'
  // Source obligation depends on another obligation being satisfied first
  // e.g. CE marking depends on conformity assessment completion
  | 'DEPENDS_ON'
  // Source obligation grants an exemption from the target obligation
  // e.g. class I self-certification exempts notified-body involvement
  | 'EXEMPTS'
  // === AgentOS extensions (Phase 0) ===
  // AgentRole -> Process: this role is permitted to execute steps in this process
  | 'EXECUTES'
  // Obligation -> HITLGate: satisfying this obligation requires the named HITL gate
  | 'REQUIRES_HITL'
  // Obligation|Process -> GovernancePolicy: subject is bound by this governance rule
  | 'BOUND_BY_POLICY'
  // Obligation|Process -> ObservabilitySLO: subject is measured by this SLO
  | 'MEASURED_BY'
  // Process -> ProcessTrigger: this process is started by the named trigger
  | 'STARTED_BY';

// =============================================================================
// AgentOS node schemas (Phase 0)
//
// These five node types extend the obligation graph from a pure regulatory
// reference store into a complete substrate for an AgentOS:
//   - AgentRole         : who may act
//   - HITLGate          : when humans must sign off
//   - GovernancePolicy  : what rules bind the actor (model, residency, PII...)
//   - ObservabilitySLO  : how performance is measured
//   - ProcessTrigger    : when a process legitimately starts
//
// Every AgentOS manager (Scheduler, GuardrailKernel, PolicyEngine,
// AgentTelemetry, AgentIdentity) reads from these nodes — agent behaviour is
// derived from the KB, not hardcoded in TypeScript.
// =============================================================================

export const AgentRoleNodeSchema = z.object({
  agentRoleId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  /** Process IDs whose steps this role is permitted to execute. */
  processIds: z.array(z.string().min(1)).default([]),
  /** Obligation IDs this role is permitted to satisfy / cite. */
  obligationScope: z.array(z.string()).default([]),
  /** LLM capabilities this role requires (e.g. 'tool_use', 'long_context'). */
  llmCapabilities: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type AgentRoleNode = z.infer<typeof AgentRoleNodeSchema>;

export const HITLGateNodeSchema = z.object({
  gateId: z.string().min(1),
  /** obligationId whose satisfaction requires this HITL gate. */
  appliesTo: z.string().min(1),
  /** Role of the human approver (e.g. 'vigilance_officer', 'quality_manager'). */
  approverRole: z.string().min(1),
  description: z.string().min(1),
  /** Human-readable trigger condition (when this gate fires). */
  triggerCondition: z.string().min(1),
  /** Optional SLA in hours for the human to resolve the gate. */
  slaHours: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type HITLGateNode = z.infer<typeof HITLGateNodeSchema>;

export const PolicyClassSchema = z.enum([
  'model_allowlist',
  'data_residency',
  'pii_redaction',
  'hitl_required',
  'slo_time_bound',
]);
export type PolicyClass = z.infer<typeof PolicyClassSchema>;

export const GovernancePolicyNodeSchema = z.object({
  policyId: z.string().min(1),
  policyClass: PolicyClassSchema,
  /** Jurisdiction this policy applies to (e.g. 'EU_MDR', 'US_FDA', 'GLOBAL'). */
  jurisdiction: z.string().min(1),
  description: z.string().min(1),
  /** Class-specific structured rule (e.g. {"allowed":["claude-*-eu","gpt-*-eu"]}). */
  rule: z.record(z.unknown()).default({}),
  severity: z.enum(['hard', 'soft']).default('hard'),
  /** Subjects bound by this policy (obligationIds or processIds). */
  appliesTo: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type GovernancePolicyNode = z.infer<typeof GovernancePolicyNodeSchema>;

export const ObservabilitySLONodeSchema = z.object({
  sloId: z.string().min(1),
  /** Subject being measured: obligationId or processId. */
  appliesTo: z.string().min(1),
  /** Metric name (e.g. 'time_to_decision_hours', 'mdr_submission_latency_days'). */
  metric: z.string().min(1),
  threshold: z.number(),
  unit: z.string().min(1),
  comparator: z.enum(['lte', 'gte', 'eq']).default('lte'),
  description: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});
export type ObservabilitySLONode = z.infer<typeof ObservabilitySLONodeSchema>;

export const ProcessTriggerNodeSchema = z.object({
  triggerId: z.string().min(1),
  /** processId that this trigger starts. */
  processId: z.string().min(1),
  /** Event type that fires the trigger (e.g. 'complaint.received', 'schedule'). */
  eventType: z.string().min(1),
  /** Cron expression for time-based triggers (only when eventType === 'schedule'). */
  schedule: z.string().optional(),
  /** Optional event-payload filter (engine-specific). */
  filter: z.record(z.unknown()).optional(),
  description: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});
export type ProcessTriggerNode = z.infer<typeof ProcessTriggerNodeSchema>;

export interface GraphPath {
  nodes: ObligationNode[];
  relationships: { from: string; to: string; type: RelationType }[];
}

export interface Subgraph {
  nodes: ObligationNode[];
  relationships: { from: string; to: string; type: RelationType }[];
}

export interface ObligationExplanation {
  obligation: ObligationNode;
  parents: ObligationNode[];
  constraints: ConstraintNode[];
  requiredEvidence: string[];
  crossReferences: ObligationNode[];
  plainEnglishChain: string[];
}

export interface ObligationTree {
  root: ObligationNode;
  children: ObligationTree[];
}

export interface SeedResult {
  file: string;
  obligationsLoaded: number;
  constraintsLoaded: number;
  definitionsLoaded: number;
  relationshipsLoaded: number;
  // === AgentOS extensions (Phase 0) ===
  agentRolesLoaded: number;
  hitlGatesLoaded: number;
  policiesLoaded: number;
  slosLoaded: number;
  triggersLoaded: number;
  errors: string[];
}

export interface ObligationDiff {
  added: string[];
  removed: string[];
  changed: { obligationId: string; before: ObligationNode; after: ObligationNode }[];
}

export interface CoverageMap {
  processInstanceId: string;
  total: number;
  covered: number;
  uncovered: string[];
  byObligation: Record<string, { covered: boolean; evidenceCount: number }>;
}
