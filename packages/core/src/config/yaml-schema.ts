import { z } from 'zod';

// ── Metadata ────────────────────────────────────────────────────────────────

export const RegulationApprovalStatus = z.enum([
  'draft',
  'in_review',
  'approved',
  'released',
  'superseded',
]);

export type RegulationApprovalStatus = z.infer<typeof RegulationApprovalStatus>;

export const ChangeLogEntry = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  author: z.string().min(1, 'Author is required'),
  description: z.string().min(1, 'Description is required'),
});

export type ChangeLogEntry = z.infer<typeof ChangeLogEntry>;

export const RegulationMetadata = z.object({
  regulation: z.string().min(1, 'Regulation name is required'),
  version: z.string().min(1, 'Version is required'),
  source_url: z.string().url('source_url must be a valid URL'),
  source_document_title: z.string().min(1, 'Source document title is required'),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effective_date must be YYYY-MM-DD'),
  last_reviewed: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'last_reviewed must be YYYY-MM-DD'),
  reviewer: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  approval_status: RegulationApprovalStatus,
  superseded_by: z.string().optional(),
  change_log: z.array(ChangeLogEntry).min(1, 'At least one change_log entry is required'),
  checksum: z.string().optional(), // auto-computed at seed time
});

export type RegulationMetadata = z.infer<typeof RegulationMetadata>;

// ── Obligations ─────────────────────────────────────────────────────────────

export const ObligationYAML = z.object({
  obligation_id: z.string().min(1),
  jurisdiction: z.string().min(1),
  artifact_type: z.string().min(1),
  process_type: z.string().min(1),
  kind: z.enum(['obligation', 'constraint', 'definition']),
  title: z.string().min(1),
  text: z.string().min(1),
  source_citation: z.string().min(1),
  version: z.string().min(1),
  mandatory: z.boolean().default(true),
  required_evidence_types: z.array(z.string()).default([]),
  effective_from: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type ObligationYAML = z.infer<typeof ObligationYAML>;

// ── Constraints ─────────────────────────────────────────────────────────────

export const ConstraintYAML = z.object({
  constraint_id: z.string().min(1),
  applies_to: z.string().min(1),
  text: z.string().min(1),
  expression: z.string().optional(),
  severity: z.enum(['hard', 'soft']).default('hard'),
});

export type ConstraintYAML = z.infer<typeof ConstraintYAML>;

// ── Definitions ─────────────────────────────────────────────────────────────

export const DefinitionYAML = z.object({
  definition_id: z.string().min(1),
  term: z.string().min(1),
  text: z.string().min(1),
  source_citation: z.string().min(1),
});

export type DefinitionYAML = z.infer<typeof DefinitionYAML>;

// ── Cross-references ────────────────────────────────────────────────────────

export const CrossReferenceYAML = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z
    .enum([
      'CROSS_REFERENCES',
      'SUPERSEDES',
      'PART_OF',
      'TRIGGERS',
      'CONFLICTS_WITH',
    ])
    .default('CROSS_REFERENCES'),
});

export type CrossReferenceYAML = z.infer<typeof CrossReferenceYAML>;

// ── Legacy file shape (existing YAML files without metadata envelope) ───────

/**
 * The current YAML files use camelCase keys at the top level
 * (e.g. obligationId, sourceCitation). This schema validates the existing shape.
 */
export const LegacyObligationEntry = z.object({
  obligationId: z.string().min(1),
  kind: z.enum(['obligation', 'constraint', 'definition']),
  title: z.string().min(1),
  text: z.string().min(1),
  sourceCitation: z.string().min(1),
  mandatory: z.boolean().default(true),
  requiredEvidenceTypes: z.array(z.string()).default([]),
});

export type LegacyObligationEntry = z.infer<typeof LegacyObligationEntry>;

export const LegacyConstraintEntry = z.object({
  constraintId: z.string().min(1),
  appliesTo: z.string().min(1),
  text: z.string().min(1),
  severity: z.enum(['hard', 'soft']).default('hard'),
});

export type LegacyConstraintEntry = z.infer<typeof LegacyConstraintEntry>;

export const LegacyRegulationFile = z.object({
  regulation: z.string().min(1),
  section: z.string().optional(),
  jurisdiction: z.string().min(1),
  processType: z.string().min(1),
  artifactType: z.string().min(1),
  version: z.string().min(1),
  effectiveFrom: z.string().optional(),
  obligations: z.array(LegacyObligationEntry).default([]),
  constraints: z.array(LegacyConstraintEntry).default([]),
});

export type LegacyRegulationFile = z.infer<typeof LegacyRegulationFile>;

// ── Full regulation file (new metadata-enriched format) ─────────────────────

export const RegulationFile = z.object({
  metadata: RegulationMetadata,
  obligations: z.array(ObligationYAML).min(1),
  constraints: z.array(ConstraintYAML).default([]),
  definitions: z.array(DefinitionYAML).default([]),
  cross_references: z.array(CrossReferenceYAML).default([]),
});

export type RegulationFile = z.infer<typeof RegulationFile>;
