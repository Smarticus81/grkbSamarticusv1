import type { HITLGateDefinition, HITLGateState } from './types.js';

/**
 * Manages human-in-the-loop approval gates. Persistence lives in `hitlGates`
 * (Postgres); this class provides the in-memory state machine for gate
 * lifecycle and the strict rule that gates cannot be auto-approved.
 */
export class HITLGate {
  constructor(public readonly definition: HITLGateDefinition, public state: HITLGateState) {}

  approve(approverRole: string, approverId: string, notes?: string): void {
    if (this.state.status !== 'pending') {
      throw new Error(`HITL gate ${this.definition.gateId} not pending (status=${this.state.status})`);
    }
    if (approverRole !== this.definition.approverRole) {
      throw new Error(
        `HITL gate ${this.definition.gateId} requires role ${this.definition.approverRole}, got ${approverRole}`,
      );
    }
    this.state.status = 'approved';
    this.state.approvedBy = approverId;
    this.state.approvalNotes = notes;
    this.state.resolvedAt = new Date();
  }

  reject(approverRole: string, approverId: string, notes?: string): void {
    if (this.state.status !== 'pending') {
      throw new Error(`HITL gate ${this.definition.gateId} not pending`);
    }
    if (approverRole !== this.definition.approverRole) {
      throw new Error(`HITL gate role mismatch`);
    }
    this.state.status = 'rejected';
    this.state.approvedBy = approverId;
    this.state.approvalNotes = notes;
    this.state.resolvedAt = new Date();
  }

  isResolved(): boolean {
    return this.state.status !== 'pending';
  }
}
