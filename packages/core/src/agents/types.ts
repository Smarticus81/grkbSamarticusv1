import type { ObligationNode, ConstraintNode } from '../graph/types.js';
import type { TraceContext } from '../traceability/types.js';
import type { QualificationResult, ComplianceResult } from '../guardrails/types.js';
import type { ValidationReport } from '../guardrails/validators/types.js';
import type { LLMResponse } from '../llm/types.js';

export interface GroundedAgentConfig {
  name: string;
  description: string;
  version: string;
  persona: string;
  systemPrompt: string;
  processTypes: string[];
  requiredObligations: string[];
}

export interface GroundedAgentContext {
  processInstanceId: string;
  workspaceId: string;
  processType: string;
  jurisdiction: string;
  availableEvidenceTypes: string[];
  traceCtx: TraceContext;
  metadata?: Record<string, unknown>;
}

export interface GroundedAgentMetricsSnapshot {
  llmCalls: number;
  tokens: number;
  cost: number;
  timeMs: number;
}

export interface GroundedAgentResult<TOutput> {
  success: boolean;
  data?: TOutput;
  error?: string;
  confidence?: number;
  qualification?: QualificationResult;
  compliance?: ComplianceResult;
  pipelineReport?: ValidationReport;
  metrics?: GroundedAgentMetricsSnapshot;
  traceId?: string;
  warnings?: string[];
}

export interface LLMCallResult<T> {
  content: T;
  response: LLMResponse;
}

export type { ObligationNode, ConstraintNode };
