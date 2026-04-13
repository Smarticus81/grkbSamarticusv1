import type {
  ProcessDefinition,
  ProcessInstance,
  ProcessInstanceStatus,
  StepDefinition,
} from './types.js';

/**
 * Runtime view of a process instance, with a small state machine for valid
 * status transitions. Persistence lives in `processInstances` (Postgres);
 * this class is the in-memory representation used by orchestration.
 */
export class ProcessInstanceState {
  constructor(public readonly instance: ProcessInstance, public readonly definition: ProcessDefinition) {}

  static readonly TRANSITIONS: Record<ProcessInstanceStatus, ProcessInstanceStatus[]> = {
    pending: ['qualified', 'failed'],
    qualified: ['running', 'failed'],
    running: ['paused_at_gate', 'completed', 'failed'],
    paused_at_gate: ['running', 'failed'],
    completed: [],
    failed: [],
  };

  canTransitionTo(next: ProcessInstanceStatus): boolean {
    return ProcessInstanceState.TRANSITIONS[this.instance.status].includes(next);
  }

  transition(next: ProcessInstanceStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Invalid transition: ${this.instance.status} -> ${next}`);
    }
    this.instance.status = next;
    this.instance.updatedAt = new Date();
  }

  nextRunnableSteps(completedStepIds: Set<string>): StepDefinition[] {
    return this.definition.steps.filter(
      (s) => !completedStepIds.has(s.id) && s.dependsOn.every((d) => completedStepIds.has(d)),
    );
  }

  isComplete(completedStepIds: Set<string>): boolean {
    return this.definition.steps.every((s) => completedStepIds.has(s.id));
  }
}
