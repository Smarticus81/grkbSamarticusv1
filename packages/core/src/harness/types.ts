import type { GroundedAgentResult } from '../agents/types.js';
import type { DecisionTraceEntry } from '../traceability/types.js';
import type { LLMRequest, LLMResponse } from '../llm/types.js';
import type { CoverageMap } from '../graph/types.js';
import type { QualificationResult } from '../guardrails/types.js';

export interface MockLLMResponse {
  pattern: string | RegExp;
  response: string;
}

export interface MockLLMCall {
  request: LLMRequest;
  response: LLMResponse;
  /** True when no canned response matched and the default `{}` was returned. */
  matched: boolean;
  durationMs: number;
}

export interface MockEvidenceAtom {
  atomId: string;
  evidenceType: string;
  data: Record<string, unknown>;
}

export interface HarnessTiming {
  totalMs: number;
  llmMs: number;
  graphMs: number;
  graphCalls: number;
}

export interface HarnessResult<O = unknown> {
  agentResult: GroundedAgentResult<O>;
  traceChain: DecisionTraceEntry[];
  mockLLMCallLog: MockLLMCall[];
  obligationCoverage: CoverageMap;
  timing: HarnessTiming;
}

export interface ProcessHarnessResult {
  results: Record<string, GroundedAgentResult<any>>;
  traceChain: DecisionTraceEntry[];
  failed: string[];
}

export type QualificationStatus = QualificationResult['status'];

/** Outcome of one YAML scenario executed by `HarnessRunner`. */
export interface ScenarioRunResult {
  name: string;
  agent: string;
  ok: boolean;
  /** Every failed assertion (or the setup error), one message per line. */
  error?: string;
  failures: string[];
  durationMs: number;
  llmCalls: number;
  /** Whether the sealed lifecycle reported success. Absent if the run never started. */
  success?: boolean;
  qualificationStatus?: QualificationStatus;
  complianceScore?: number;
  confidence?: number;
  traceEvents: number;
  obligationsSeeded: string[];
}

/** Outcome of one scenario file (suite). */
export interface ScenarioSuiteResult {
  name: string;
  file?: string;
  results: ScenarioRunResult[];
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
}

export interface HarnessSummary {
  suites: number;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  ok: boolean;
}
