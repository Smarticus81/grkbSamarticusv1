import { z } from 'zod';

// ── Eval prompt schema ──────────────────────────────────────────────────────

export const EvalPromptSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  expected: z.object({
    /** Obligation IDs that MUST appear in the response */
    should_contain_obligations: z.array(z.string()).optional(),
    /** Strings/phrases that must NOT appear in the response */
    should_not_contain: z.array(z.string()).optional(),
    /** Expected jurisdiction for the response */
    expected_jurisdiction: z.string().optional(),
    /** Expected process type for the response */
    expected_process_type: z.string().optional(),
    /** Whether the model should refuse to answer */
    should_refuse: z.boolean().optional(),
    /** Minimum number of source citations required */
    min_citations: z.number().int().min(0).optional(),
  }),
  tags: z.array(z.string()).default([]),
});

export type EvalPrompt = z.infer<typeof EvalPromptSchema>;

// ── Eval suite schema ───────────────────────────────────────────────────────

export const EvalSuiteSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  prompts: z.array(EvalPromptSchema).min(1),
});

export type EvalSuite = z.infer<typeof EvalSuiteSchema>;

// ── Eval result types ───────────────────────────────────────────────────────

export interface EvalMetrics {
  /** Fraction of expected obligations found in the response (0-1) */
  obligationRecallAtK: number;
  /** Fraction of citations in the response that are accurate (0-1) */
  citationAccuracy: number;
  /** Fraction of mandatory obligations that were missed (0-1, lower is better) */
  mandatoryMissRate: number;
  /** Fraction of claims in the response that are false (0-1, lower is better) */
  falseClaimRate: number;
  /** Fraction of required evidence types mentioned (0-1) */
  evidenceCompleteness: number;
  /** Whether refusal behavior was correct (null if not applicable) */
  refusalCorrectness: number | null;
}

export interface EvalResult {
  promptId: string;
  passed: boolean;
  metrics: EvalMetrics;
  details: string[];
  latencyMs: number;
}

export interface EvalReport {
  suite: string;
  model: string;
  timestamp: string;
  results: EvalResult[];
  summary: {
    totalPrompts: number;
    passed: number;
    failed: number;
    avgObligationRecall: number;
    avgCitationAccuracy: number;
    avgMandatoryMissRate: number;
    avgLatencyMs: number;
  };
}
