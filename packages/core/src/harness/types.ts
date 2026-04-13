import type { GroundedAgentResult } from '../agents/types.js';
import type { DecisionTraceEntry } from '../traceability/types.js';
import type { LLMRequest, LLMResponse } from '../llm/types.js';
import type { CoverageMap } from '../graph/types.js';

export interface MockLLMResponse {
  pattern: string | RegExp;
  response: string;
}

export interface MockEvidenceAtom {
  atomId: string;
  evidenceType: string;
  data: Record<string, unknown>;
}

export interface HarnessResult<O = unknown> {
  agentResult: GroundedAgentResult<O>;
  traceChain: DecisionTraceEntry[];
  mockLLMCallLog: { request: LLMRequest; response: LLMResponse }[];
  obligationCoverage: CoverageMap;
  timing: { totalMs: number; llmMs: number; graphMs: number };
}

export interface ProcessHarnessResult {
  results: Record<string, GroundedAgentResult<any>>;
  traceChain: DecisionTraceEntry[];
  failed: string[];
}
