import type { ObligationNode, ConstraintNode } from '../graph/types.js';

export interface QualificationInput {
  processType: string;
  jurisdiction: string;
  availableEvidence: string[];
  requiredObligations: string[];
}

export interface QualificationResult {
  status: 'QUALIFIED' | 'QUALIFIED_WITH_WARNINGS' | 'NEEDS_HUMAN_REVIEW' | 'BLOCKED' | 'OUT_OF_SCOPE';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  coverageScore: number; // 0..1
  mandatoryTotal: number;
  mandatoryCovered: number;
  missingObligations: string[];
  missingEvidence: string[];
  unsatisfiedConstraints: string[];
  constraints: ConstraintNode[];
  blockingErrors: string[];
  recommendedNextActions: string[];
  canProceedWithHumanApproval: boolean;
}

export interface ComplianceContext {
  processType: string;
  jurisdiction: string;
  processInstanceId: string;
  agentId: string;
}

export interface ComplianceResult {
  valid: boolean;
  score: number; // 0..1
  satisfied: string[]; // obligationIds
  unsatisfied: string[];
  warnings: string[];
  assertion: ComplianceAssertion;
  summary: string;
}

export interface ComplianceAssertion {
  agentId: string;
  obligationsClaimed: string[];
  obligationsSatisfied: string[];
  attestedAt: string;
  signature: string;
}

export interface StrictGateResult {
  valid: boolean;
  errors: string[];
  parsed?: unknown;
}

export type BoundaryPolicyId =
  | 'MUST_TRACE_EVERY_DECISION'
  | 'MUST_NOT_FABRICATE_EVIDENCE'
  | 'MUST_NOT_SKIP_MANDATORY_OBLIGATIONS'
  | 'MUST_RESPECT_HITL_GATES'
  | 'MUST_USE_APPROVED_TERMINOLOGY'
  | 'MUST_HASH_CHAIN_TRACES'
  | 'MUST_VALIDATE_OUTPUT_SCHEMA'
  | 'MUST_LOG_LLM_CALLS'
  | 'MUST_SCOPE_TO_JURISDICTION'
  | 'MUST_VERSION_OBLIGATIONS';

export interface BoundaryPolicy {
  id: BoundaryPolicyId;
  description: string;
  rationale: string;
}

export type { ObligationNode, ConstraintNode };
