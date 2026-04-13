import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  jsonb,
  boolean,
  integer,
  uuid,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// === Enums ===
export const processStatusEnum = pgEnum('process_status', [
  'pending',
  'qualified',
  'running',
  'paused_at_gate',
  'completed',
  'failed',
]);

export const obligationKindEnum = pgEnum('obligation_kind', [
  'obligation',
  'constraint',
  'definition',
]);

export const traceEventTypeEnum = pgEnum('trace_event_type', [
  'PROCESS_STARTED',
  'PROCESS_COMPLETED',
  'PROCESS_FAILED',
  'AGENT_SPAWNED',
  'AGENT_COMPLETED',
  'AGENT_FAILED',
  'QUALIFICATION_BLOCKED',
  'QUALIFICATION_PASSED',
  'STEP_STARTED',
  'STEP_COMPLETED',
  'STEP_FAILED',
  'LLM_REQUEST_SENT',
  'LLM_RESPONSE_RECEIVED',
  'EVIDENCE_INGESTED',
  'EVIDENCE_VALIDATED',
  'OBLIGATION_SATISFIED',
  'OBLIGATION_VIOLATED',
  'HITL_GATE_OPENED',
  'HITL_GATE_APPROVED',
  'HITL_GATE_REJECTED',
  'COMPLIANCE_CHECK_PASSED',
  'COMPLIANCE_CHECK_FAILED',
]);

export const evidenceStatusEnum = pgEnum('evidence_status', [
  'valid',
  'invalid',
  'superseded',
]);

export const hitlStatusEnum = pgEnum('hitl_status', ['pending', 'approved', 'rejected']);

export const qualificationStatusEnum = pgEnum('qualification_status', [
  'QUALIFIED',
  'BLOCKED',
]);

// === Tables ===
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tenantId: varchar('tenant_id', { length: 128 }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const processDefinitions = pgTable(
  'process_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    regulationRef: text('regulation_ref').notNull(),
    jurisdictions: jsonb('jurisdictions').$type<string[]>().notNull(),
    obligationIds: jsonb('obligation_ids').$type<string[]>().notNull(),
    steps: jsonb('steps').$type<unknown[]>().notNull(),
    requiredEvidenceTypes: jsonb('required_evidence_types').$type<string[]>().notNull(),
    requiredAgentTypes: jsonb('required_agent_types').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    nameVersionIdx: uniqueIndex('process_def_name_version_idx').on(t.name, t.version),
  }),
);

export const processInstances = pgTable(
  'process_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    processDefinitionId: uuid('process_definition_id')
      .references(() => processDefinitions.id)
      .notNull(),
    status: processStatusEnum('status').default('pending').notNull(),
    currentStepId: varchar('current_step_id', { length: 128 }),
    input: jsonb('input').$type<Record<string, unknown>>().default({}).notNull(),
    output: jsonb('output').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsIdx: index('process_instances_ws_idx').on(t.workspaceId),
    statusIdx: index('process_instances_status_idx').on(t.status),
  }),
);

export const obligations = pgTable(
  'obligations',
  {
    id: serial('id').primaryKey(),
    obligationId: varchar('obligation_id', { length: 128 }).notNull(),
    jurisdiction: varchar('jurisdiction', { length: 64 }).notNull(),
    artifactType: varchar('artifact_type', { length: 64 }).notNull(),
    processType: varchar('process_type', { length: 64 }).notNull(),
    kind: obligationKindEnum('kind').notNull(),
    title: text('title').notNull(),
    text: text('text').notNull(),
    sourceCitation: text('source_citation').notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    mandatory: boolean('mandatory').default(true).notNull(),
    requiredEvidenceTypes: jsonb('required_evidence_types').$type<string[]>().default([]).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    oblIdIdx: uniqueIndex('obligations_obl_id_idx').on(t.obligationId),
    processIdx: index('obligations_process_idx').on(t.processType, t.jurisdiction),
  }),
);

export const decisionTraceEntries = pgTable(
  'decision_trace_entries',
  {
    id: serial('id').primaryKey(),
    processInstanceId: uuid('process_instance_id')
      .references(() => processInstances.id)
      .notNull(),
    traceId: varchar('trace_id', { length: 128 }).notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    previousHash: varchar('previous_hash', { length: 128 }).notNull(),
    currentHash: varchar('current_hash', { length: 128 }).notNull(),
    eventType: traceEventTypeEnum('event_type').notNull(),
    actor: varchar('actor', { length: 128 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: varchar('entity_id', { length: 128 }),
    decision: text('decision'),
    inputData: jsonb('input_data').$type<Record<string, unknown>>().default({}).notNull(),
    outputData: jsonb('output_data').$type<Record<string, unknown>>().default({}).notNull(),
    reasons: jsonb('reasons').$type<string[]>().default([]).notNull(),
    humanSummary: text('human_summary'),
    regulatoryContext: jsonb('regulatory_context')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    evidenceJustification: jsonb('evidence_justification')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    complianceAssertion: jsonb('compliance_assertion')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    traceSeqIdx: uniqueIndex('decision_trace_seq_idx').on(t.traceId, t.sequenceNumber),
    instIdx: index('decision_trace_inst_idx').on(t.processInstanceId),
  }),
);

export const contentTraces = pgTable('content_traces', {
  id: serial('id').primaryKey(),
  processInstanceId: uuid('process_instance_id')
    .references(() => processInstances.id)
    .notNull(),
  stepId: varchar('step_id', { length: 128 }).notNull(),
  contentType: varchar('content_type', { length: 64 }).notNull(),
  contentId: varchar('content_id', { length: 128 }).notNull(),
  contentIndex: integer('content_index').default(0).notNull(),
  contentPreview: text('content_preview'),
  contentHash: varchar('content_hash', { length: 128 }).notNull(),
  rationale: text('rationale'),
  methodology: text('methodology'),
  standardReference: text('standard_reference'),
  evidenceType: varchar('evidence_type', { length: 64 }),
  atomIds: jsonb('atom_ids').$type<string[]>().default([]).notNull(),
  obligationId: varchar('obligation_id', { length: 128 }),
  obligationTitle: text('obligation_title'),
  agentId: varchar('agent_id', { length: 128 }),
  agentName: text('agent_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const evidenceAtoms = pgTable(
  'evidence_atoms',
  {
    id: serial('id').primaryKey(),
    atomId: varchar('atom_id', { length: 128 }).notNull(),
    processInstanceId: uuid('process_instance_id').references(() => processInstances.id),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    evidenceType: varchar('evidence_type', { length: 64 }).notNull(),
    sourceSystem: varchar('source_system', { length: 128 }).notNull(),
    extractDate: timestamp('extract_date', { withTimezone: true }).notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    recordCount: integer('record_count').default(0).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
    normalizedData: jsonb('normalized_data').$type<Record<string, unknown>>().default({}).notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().default({}).notNull(),
    status: evidenceStatusEnum('status').default('valid').notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    atomIdIdx: uniqueIndex('evidence_atom_id_idx').on(t.atomId),
  }),
);

export const agentRegistrations = pgTable('agent_registrations', {
  id: serial('id').primaryKey(),
  agentType: varchar('agent_type', { length: 128 }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  version: varchar('version', { length: 32 }).notNull(),
  processTypes: jsonb('process_types').$type<string[]>().default([]).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  capabilities: jsonb('capabilities').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const hitlGates = pgTable('hitl_gates', {
  id: serial('id').primaryKey(),
  processInstanceId: uuid('process_instance_id')
    .references(() => processInstances.id)
    .notNull(),
  stepId: varchar('step_id', { length: 128 }).notNull(),
  gateId: varchar('gate_id', { length: 128 }).notNull(),
  status: hitlStatusEnum('status').default('pending').notNull(),
  approverRole: varchar('approver_role', { length: 64 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
  approvedBy: varchar('approved_by', { length: 128 }),
  approvalNotes: text('approval_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const qualificationReports = pgTable('qualification_reports', {
  id: serial('id').primaryKey(),
  processInstanceId: uuid('process_instance_id')
    .references(() => processInstances.id)
    .notNull(),
  processDefinitionId: uuid('process_definition_id')
    .references(() => processDefinitions.id)
    .notNull(),
  jurisdictions: jsonb('jurisdictions').$type<string[]>().notNull(),
  status: qualificationStatusEnum('status').notNull(),
  mandatoryTotal: integer('mandatory_total').default(0).notNull(),
  mandatoryCovered: integer('mandatory_covered').default(0).notNull(),
  missingObligations: jsonb('missing_obligations').$type<unknown[]>().default([]).notNull(),
  constraints: jsonb('constraints').$type<unknown[]>().default([]).notNull(),
  blockingErrors: jsonb('blocking_errors').$type<string[]>().default([]).notNull(),
  validatedAt: timestamp('validated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// === Files — workspace-scoped asset store ===
export const workspaceFiles = pgTable(
  'workspace_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    fileId: varchar('file_id', { length: 128 }).notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    fileIdIdx: uniqueIndex('workspace_files_file_id_idx').on(t.fileId),
    wsIdx: index('workspace_files_ws_idx').on(t.workspaceId),
  }),
);

// === Skills — versioned capability packages ===
export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description').notNull(),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    author: varchar('author', { length: 128 }).notNull(),
    latestVersionId: uuid('latest_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    nameIdx: uniqueIndex('skills_name_idx').on(t.name),
  }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .references(() => skills.id, { onDelete: 'cascade' })
      .notNull(),
    versionTag: varchar('version_tag', { length: 32 }).notNull(),
    definition: jsonb('definition')
      .$type<{ triggers: string[]; instructions: string; schema?: Record<string, unknown> }>()
      .notNull(),
    rawContent: text('raw_content'),
    fileHash: varchar('file_hash', { length: 128 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    skillVersionIdx: uniqueIndex('skill_versions_skill_tag_idx').on(t.skillId, t.versionTag),
  }),
);

export const agentConfigs = pgTable(
  'agent_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description').notNull(),
    version: varchar('version', { length: 32 }).default('1.0.0').notNull(),
    task: varchar('task', { length: 128 }).notNull(),
    processTypes: jsonb('process_types').$type<string[]>().notNull(),
    jurisdictions: jsonb('jurisdictions').$type<string[]>().notNull(),
    persona: text('persona').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
    outputSchema: jsonb('output_schema').$type<Record<string, unknown>>().notNull(),
    discoveredObligationIds: jsonb('discovered_obligation_ids').$type<string[]>().default([]).notNull(),
    attachedFileIds: jsonb('attached_file_ids').$type<string[]>().default([]).notNull(),
    attachedSkillIds: jsonb('attached_skill_ids').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    nameIdx: uniqueIndex('agent_configs_name_idx').on(t.name),
    taskIdx: index('agent_configs_task_idx').on(t.task),
  }),
);

// === API Keys — external agent graph access ===
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    keyHash: varchar('key_hash', { length: 128 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().default(['graph:read']).notNull(),
    rateLimit: integer('rate_limit').default(1000).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    usageCount: integer('usage_count').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    keyHashIdx: uniqueIndex('api_keys_key_hash_idx').on(t.keyHash),
    prefixIdx: index('api_keys_prefix_idx').on(t.keyPrefix),
  }),
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type ProcessDefinitionRow = typeof processDefinitions.$inferSelect;
export type ProcessInstanceRow = typeof processInstances.$inferSelect;
export type ObligationRow = typeof obligations.$inferSelect;
export type DecisionTraceEntryRow = typeof decisionTraceEntries.$inferSelect;
export type NewDecisionTraceEntry = typeof decisionTraceEntries.$inferInsert;
export type ContentTraceRow = typeof contentTraces.$inferSelect;
export type EvidenceAtomRow = typeof evidenceAtoms.$inferSelect;
export type AgentRegistrationRow = typeof agentRegistrations.$inferSelect;
export type HitlGateRow = typeof hitlGates.$inferSelect;
export type QualificationReportRow = typeof qualificationReports.$inferSelect;
export type AgentConfigRow = typeof agentConfigs.$inferSelect;
export type NewAgentConfig = typeof agentConfigs.$inferInsert;
export type WorkspaceFileRow = typeof workspaceFiles.$inferSelect;
export type NewWorkspaceFile = typeof workspaceFiles.$inferInsert;
export type SkillRow = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillVersionRow = typeof skillVersions.$inferSelect;
export type NewSkillVersion = typeof skillVersions.$inferInsert;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
