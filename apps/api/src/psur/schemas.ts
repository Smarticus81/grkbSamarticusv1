/**
 * Zod schemas for the Python PSUR service contract.
 *
 * The Python service (FastAPI wrapping the real PSUR pipeline) exposes:
 *   GET  /defaults                      → DefaultsResponse
 *   POST /runs                          → RunCreatedResponse (422 on structural violations, 409 demo_busy)
 *   GET  /runs/{id}                     → RunStatusResponse
 *   GET  /runs/{id}/events              → SSE stream of PipelineEvent (named events, replay-from-start)
 *   GET  /runs/{id}/artifacts           → ArtifactListResponse
 *   GET  /runs/{id}/artifacts/{name}    → file stream
 *
 * Every payload crossing the bridge boundary is validated against these
 * schemas — no `any`, no unchecked passthrough.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const PSUR_INPUT_NAMES = [
  'sales',
  'complaints',
  'capa',
  'fsca',
  'ract',
  'external_events',
  'literature',
  'device_context',
  'pms_plan',
  'previous_psur',
  'clinical_safety',
  'clinical_performance',
] as const;

export type PsurInputName = (typeof PSUR_INPUT_NAMES)[number];

export const PsurInputNameSchema = z.enum(PSUR_INPUT_NAMES);

export const PeriodSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});
export type Period = z.infer<typeof PeriodSchema>;

export const ColumnSpecSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
});
export type ColumnSpec = z.infer<typeof ColumnSpecSchema>;

const RowSchema = z.record(z.unknown());

export const TableDefaultSchema = z.object({
  kind: z.literal('table'),
  columns: z.array(ColumnSpecSchema),
  rows: z.array(RowSchema),
});
export type TableDefault = z.infer<typeof TableDefaultSchema>;

export const JsonDefaultSchema = z.object({
  kind: z.literal('json'),
  value: z.record(z.unknown()),
});
export type JsonDefault = z.infer<typeof JsonDefaultSchema>;

export const InputDefaultSchema = z.discriminatedUnion('kind', [
  TableDefaultSchema,
  JsonDefaultSchema,
]);
export type InputDefault = z.infer<typeof InputDefaultSchema>;

export const DefaultsResponseSchema = z.object({
  period: PeriodSchema,
  inputs: z.record(PsurInputNameSchema, InputDefaultSchema),
});
export type DefaultsResponse = z.infer<typeof DefaultsResponseSchema>;

// ---------------------------------------------------------------------------
// Run creation
// ---------------------------------------------------------------------------

/** Per-input payload: table inputs send rows; json inputs send a value. */
export const RunInputSchema = z.union([
  z.object({ rows: z.array(RowSchema) }).strict(),
  z.object({ value: z.record(z.unknown()) }).strict(),
]);
export type RunInput = z.infer<typeof RunInputSchema>;

export const RunRequestSchema = z
  .object({
    period: PeriodSchema,
    inputs: z.record(PsurInputNameSchema, RunInputSchema),
  })
  .strict();
export type RunRequest = z.infer<typeof RunRequestSchema>;

export const RunCreatedSchema = z.object({ run_id: z.string().min(1) });
export type RunCreated = z.infer<typeof RunCreatedSchema>;

export const RunStatusSchema = z
  .object({ run_id: z.string().optional(), status: z.string() })
  .passthrough();
export type RunStatus = z.infer<typeof RunStatusSchema>;

// ---------------------------------------------------------------------------
// SSE events
// ---------------------------------------------------------------------------

export const PSUR_PHASES = [
  'discovery',
  'parsing',
  'device_context',
  'imdrf_coding',
  'statistics',
  'charts',
  'generation',
  'audit',
  'remediation',
  'validation',
  'rendering',
  'artifacts',
] as const;
export type PsurPhase = (typeof PSUR_PHASES)[number];

const EnvelopeBase = z.object({
  seq: z.number().int().nonnegative(),
  ts: z.string(),
});

export const ProgressEventSchema = EnvelopeBase.extend({
  kind: z.literal('progress'),
  phase: z.enum(PSUR_PHASES),
  status: z.enum(['started', 'completed']),
  section: z.string().optional(),
  detail: z.string().optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export const DecisionEventSchema = EnvelopeBase.extend({
  kind: z.literal('decision'),
  decision: z.string(),
  inputs_summary: z.record(z.unknown()),
  output: z.record(z.unknown()),
  reason: z.string(),
  regulatory_basis: z.array(z.string()),
  section: z.string().optional(),
});
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;

export const ErrorEventSchema = EnvelopeBase.extend({
  kind: z.literal('error'),
  message: z.string().optional(),
  detail: z.string().optional(),
}).passthrough();
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const ArtifactSchema = z.object({
  name: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const CompleteEventSchema = EnvelopeBase.extend({
  kind: z.literal('complete'),
  artifacts: z.array(ArtifactSchema),
  validation: z.object({
    passed: z.boolean(),
    error_count: z.number().int().nonnegative(),
  }),
});
export type CompleteEvent = z.infer<typeof CompleteEventSchema>;

export const PipelineEventSchema = z.discriminatedUnion('kind', [
  ProgressEventSchema,
  DecisionEventSchema,
  ErrorEventSchema,
  CompleteEventSchema,
]);
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export const ArtifactListSchema = z.object({ artifacts: z.array(ArtifactSchema) });
export type ArtifactList = z.infer<typeof ArtifactListSchema>;
