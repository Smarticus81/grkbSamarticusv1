import type { GroundedAgentResult, ProcessDefinition } from '@regground/core';

export interface SandboxRunInput {
  workspaceId: string;
  jurisdiction: string;
  definition: ProcessDefinition;
  input: Record<string, unknown>;
  availableEvidenceTypes: string[];
}

export interface SandboxRunResult {
  processInstanceId: string;
  status: 'completed' | 'failed' | 'paused_at_gate';
  stepResults: Record<string, GroundedAgentResult<any>>;
  failedSteps: string[];
}

export type ProgressEvent =
  | { type: 'process.started'; processInstanceId: string }
  | { type: 'step.started'; stepId: string }
  | { type: 'step.completed'; stepId: string; success: boolean }
  | { type: 'process.completed'; processInstanceId: string; status: SandboxRunResult['status'] }
  | { type: 'gate.opened'; gateId: string }
  | { type: 'error'; message: string };
