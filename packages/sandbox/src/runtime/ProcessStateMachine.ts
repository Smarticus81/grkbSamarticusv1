import type { ProcessDefinition, StepDefinition } from '@regground/core';

/**
 * DAG runner. Returns steps in topological order; tracks completion so
 * dependents only run after their predecessors.
 */
export class ProcessStateMachine {
  private completed = new Set<string>();

  constructor(private readonly definition: ProcessDefinition) {
    this.validateAcyclic();
  }

  next(): StepDefinition[] {
    return this.definition.steps.filter(
      (s) => !this.completed.has(s.id) && s.dependsOn.every((d) => this.completed.has(d)),
    );
  }

  markComplete(stepId: string): void {
    this.completed.add(stepId);
  }

  isDone(): boolean {
    return this.definition.steps.every((s) => this.completed.has(s.id));
  }

  completedSteps(): string[] {
    return Array.from(this.completed);
  }

  private validateAcyclic(): void {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const s of this.definition.steps) color.set(s.id, WHITE);
    const visit = (id: string): boolean => {
      color.set(id, GRAY);
      const step = this.definition.steps.find((s) => s.id === id)!;
      for (const dep of step.dependsOn) {
        const c = color.get(dep) ?? WHITE;
        if (c === GRAY) return true;
        if (c === WHITE && visit(dep)) return true;
      }
      color.set(id, BLACK);
      return false;
    };
    for (const s of this.definition.steps) {
      if (color.get(s.id) === WHITE && visit(s.id)) {
        throw new Error(`Process ${this.definition.id} has a cyclic step DAG`);
      }
    }
  }
}
