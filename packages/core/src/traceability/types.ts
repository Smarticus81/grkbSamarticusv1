export type TraceEventType =
  | 'PROCESS_STARTED'
  | 'PROCESS_COMPLETED'
  | 'PROCESS_FAILED'
  | 'AGENT_SPAWNED'
  | 'AGENT_COMPLETED'
  | 'AGENT_FAILED'
  | 'QUALIFICATION_BLOCKED'
  | 'QUALIFICATION_PASSED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'LLM_REQUEST_SENT'
  | 'LLM_RESPONSE_RECEIVED'
  | 'EVIDENCE_INGESTED'
  | 'EVIDENCE_VALIDATED'
  | 'OBLIGATION_SATISFIED'
  | 'OBLIGATION_VIOLATED'
  | 'HITL_GATE_OPENED'
  | 'HITL_GATE_APPROVED'
  | 'HITL_GATE_REJECTED'
  | 'COMPLIANCE_CHECK_PASSED'
  | 'COMPLIANCE_CHECK_FAILED'
  | 'COMPLIANCE_PIPELINE_COMPLETED';

export interface TraceContext {
  processInstanceId: string;
  traceId: string;
  tenantId: string;
  workspaceId?: string;
}

export interface TraceEventInput {
  eventType: TraceEventType;
  actor: string;
  entityType?: string;
  entityId?: string;
  decision?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  reasons?: string[];
  humanSummary?: string;
  regulatoryContext?: Record<string, unknown>;
  evidenceJustification?: Record<string, unknown>;
  complianceAssertion?: Record<string, unknown>;
}

export interface DecisionTraceEntry {
  id?: number;
  processInstanceId: string;
  traceId: string;
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
  eventType: TraceEventType;
  actor: string;
  entityType?: string;
  entityId?: string;
  decision?: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  reasons: string[];
  humanSummary?: string;
  regulatoryContext: Record<string, unknown>;
  evidenceJustification: Record<string, unknown>;
  complianceAssertion: Record<string, unknown>;
  createdAt: Date;
}

export interface ChainVerification {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  brokenAt?: number;
  brokenEntry?: { expected: string; actual: string };
  verifiedAt: Date;
  signatureHash: string;
}

export interface EntryVerification {
  entryId: number;
  valid: boolean;
  expectedHash: string;
  actualHash: string;
}

export interface VerificationReport {
  processInstanceId: string;
  chain: ChainVerification;
  generatedAt: Date;
  signatureHash: string;
}

export interface ContentTraceInput {
  tenantId: string;
  processInstanceId: string;
  stepId: string;
  contentType: string;
  contentId: string;
  contentIndex?: number;
  contentPreview?: string;
  rationale?: string;
  methodology?: string;
  standardReference?: string;
  evidenceType?: string;
  atomIds?: string[];
  obligationId?: string;
  obligationTitle?: string;
  agentId?: string;
  agentName?: string;
}

export interface ProvenanceRecord {
  where: string; // source system / file
  when: Date; // extraction timestamp
  how: string; // method
  why: string; // purpose
  who?: string; // operator/agent
  contentHash: string;
  metadata?: Record<string, unknown>;
}
