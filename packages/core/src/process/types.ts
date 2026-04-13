import type { ZodSchema } from 'zod';

export interface RegulationRef {
  regulation: string; // e.g. "ISO 13485:2016"
  section: string; // e.g. "§8.5.2"
}

export interface HITLGateDefinition {
  gateId: string;
  approverRole: string;
  description: string;
  payloadSchema?: ZodSchema<unknown>;
}

export interface StepDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  description: string;
  agentType: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  obligationIds: string[];
  dependsOn: string[];
  hitlGate?: HITLGateDefinition;
  timeoutMs: number;
  retryPolicy: { maxRetries: number; backoffMs: number };
}

export interface ProcessDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  regulations: RegulationRef[];
  jurisdictions: string[];
  obligationIds: string[];
  steps: StepDefinition[];
  requiredEvidenceTypes: string[];
  requiredAgentTypes: string[];
  hitlGates: HITLGateDefinition[];
}

export type ProcessInstanceStatus =
  | 'pending'
  | 'qualified'
  | 'running'
  | 'paused_at_gate'
  | 'completed'
  | 'failed';

export interface ProcessInstance {
  id: string;
  workspaceId: string;
  processDefinitionId: string;
  status: ProcessInstanceStatus;
  currentStepId?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface HITLGateState {
  gateId: string;
  status: 'pending' | 'approved' | 'rejected';
  approverRole: string;
  payload: Record<string, unknown>;
  approvedBy?: string;
  approvalNotes?: string;
  resolvedAt?: Date;
}

export interface ProcessValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
