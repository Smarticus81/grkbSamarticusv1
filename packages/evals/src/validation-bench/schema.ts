import { z } from 'zod';

/**
 * Case format for the compliance-validation benchmark.
 *
 * Every case is fully deterministic: the obligation graph is declared inline
 * and built as an in-memory MockGraph, so no Neo4j, Postgres, or LLM is ever
 * touched. Cases target either the CompliancePipeline (the five validators)
 * or the QualificationGate.
 */

export const VALIDATOR_NAMES = [
  'ClaimCoverageValidator',
  'EvidenceBackedComplianceValidator',
  'ConstraintEvaluator',
  'CitationVerifier',
  'RegulatoryContradictionDetector',
] as const;
export type ValidatorName = (typeof VALIDATOR_NAMES)[number];

const ValidatorNameSchema = z.enum(VALIDATOR_NAMES);
const SeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);

export const BenchObligationSchema = z.object({
  obligationId: z.string().min(1),
  processType: z.string().default('capa'),
  jurisdiction: z.string().default('GLOBAL'),
  mandatory: z.boolean().default(true),
  requiredEvidenceTypes: z.array(z.string()).default([]),
  title: z.string().optional(),
  text: z.string().optional(),
  sourceCitation: z.string().optional(),
});
export type BenchObligation = z.infer<typeof BenchObligationSchema>;

export const BenchConstraintSchema = z.object({
  constraintId: z.string().min(1),
  appliesTo: z.string().min(1),
  text: z.string().min(1),
  expression: z.string().optional(),
  severity: z.enum(['hard', 'soft']).default('hard'),
});
export type BenchConstraint = z.infer<typeof BenchConstraintSchema>;

const BenchRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().min(1),
});

export const BenchGraphSchema = z.object({
  obligations: z.array(BenchObligationSchema).min(1),
  constraints: z.array(BenchConstraintSchema).default([]),
  relationships: z.array(BenchRelationshipSchema).default([]),
  /** obligationId → cross-referenced obligations (returned by explainObligation). */
  crossReferences: z.record(z.array(BenchObligationSchema)).default({}),
});
export type BenchGraphSpec = z.infer<typeof BenchGraphSchema>;

export const ExpectedFindingSchema = z.object({
  validator: ValidatorNameSchema,
  severity: SeveritySchema,
  obligationId: z.string().optional(),
  messageIncludes: z.string().optional(),
});
export type ExpectedFinding = z.infer<typeof ExpectedFindingSchema>;

const PipelineCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  target: z.literal('pipeline'),
  graph: BenchGraphSchema,
  processType: z.string().default('capa'),
  jurisdiction: z.string().default('GLOBAL'),
  /** The agent output under validation. */
  output: z.unknown(),
  expect: z.object({
    status: z.enum(['PASS', 'PASS_WITH_WARNINGS', 'REQUIRES_REVIEW', 'FAIL']),
    passedHardChecks: z.boolean().optional(),
    findings: z.array(ExpectedFindingSchema).default([]),
    /** Validators that must NOT emit any finding at warning severity or above. */
    mustNotFire: z.array(ValidatorNameSchema).default([]),
  }),
});
export type PipelineCase = z.infer<typeof PipelineCaseSchema>;

const QualificationCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  target: z.literal('qualification'),
  graph: BenchGraphSchema,
  input: z.object({
    processType: z.string().default('capa'),
    jurisdiction: z.string().default('GLOBAL'),
    availableEvidence: z.array(z.string()).default([]),
    requiredObligations: z.array(z.string()).default([]),
  }),
  expect: z.object({
    status: z.enum([
      'QUALIFIED',
      'QUALIFIED_WITH_WARNINGS',
      'NEEDS_HUMAN_REVIEW',
      'BLOCKED',
      'OUT_OF_SCOPE',
    ]),
    missingEvidenceIncludes: z.array(z.string()).default([]),
    coverageScore: z.number().min(0).max(1).optional(),
    canProceedWithHumanApproval: z.boolean().optional(),
  }),
});
export type QualificationCase = z.infer<typeof QualificationCaseSchema>;

export const BenchCaseSchema = z.discriminatedUnion('target', [
  PipelineCaseSchema,
  QualificationCaseSchema,
]);
export type BenchCase = z.infer<typeof BenchCaseSchema>;

export const BenchCaseFileSchema = z.object({
  suite: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(BenchCaseSchema).min(1),
});
export type BenchCaseFile = z.infer<typeof BenchCaseFileSchema>;

/** Per-check accuracy scores tracked in the committed baseline. */
export const CheckScoreSchema = z.object({
  positives: z.number().int().nonnegative(),
  truePositives: z.number().int().nonnegative(),
  recall: z.number().min(0).max(1),
  falseAlarmCandidates: z.number().int().nonnegative(),
  falseAlarms: z.number().int().nonnegative(),
  precision: z.number().min(0).max(1),
});
export type CheckScore = z.infer<typeof CheckScoreSchema>;

export const BaselineSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  caseCount: z.number().int().positive(),
  overallAccuracy: z.number().min(0).max(1),
  checks: z.record(CheckScoreSchema),
});
export type Baseline = z.infer<typeof BaselineSchema>;
