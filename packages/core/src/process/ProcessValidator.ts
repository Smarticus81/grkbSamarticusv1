import type { ObligationGraph } from '../graph/ObligationGraph.js';
import type { ProcessDefinition, ProcessValidationResult } from './types.js';

export class ProcessValidator {
  constructor(private readonly graph: ObligationGraph) {}

  async validate(def: ProcessDefinition): Promise<ProcessValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. All obligationIds must exist
    for (const id of def.obligationIds) {
      const o = await this.graph.getObligation(id);
      if (!o) errors.push(`Obligation not in graph: ${id}`);
    }

    // 2. DAG must be acyclic & every dependency must exist
    const stepIds = new Set(def.steps.map((s) => s.id));
    for (const step of def.steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) errors.push(`Step ${step.id} depends on unknown step ${dep}`);
      }
    }
    if (this.hasCycle(def)) errors.push('Step DAG contains a cycle');

    // 3. Every reachable step from the roots
    const reachable = this.reachable(def);
    for (const step of def.steps) {
      if (!reachable.has(step.id)) warnings.push(`Step ${step.id} is unreachable`);
    }

    // 4. Every mandatory obligation must be addressed by at least one step
    const addressed = new Set<string>();
    for (const step of def.steps) for (const o of step.obligationIds) addressed.add(o);
    for (const id of def.obligationIds) {
      const o = await this.graph.getObligation(id);
      if (o && o.mandatory && !addressed.has(id)) {
        errors.push(`Mandatory obligation ${id} is not addressed by any step`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private hasCycle(def: ProcessDefinition): boolean {
    const graph = new Map<string, string[]>();
    for (const s of def.steps) graph.set(s.id, [...s.dependsOn]);
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of graph.keys()) color.set(id, WHITE);
    const visit = (id: string): boolean => {
      color.set(id, GRAY);
      for (const dep of graph.get(id) ?? []) {
        const c = color.get(dep) ?? WHITE;
        if (c === GRAY) return true;
        if (c === WHITE && visit(dep)) return true;
      }
      color.set(id, BLACK);
      return false;
    };
    for (const id of graph.keys()) {
      if (color.get(id) === WHITE && visit(id)) return true;
    }
    return false;
  }

  private reachable(def: ProcessDefinition): Set<string> {
    const roots = def.steps.filter((s) => s.dependsOn.length === 0).map((s) => s.id);
    const seen = new Set<string>();
    const stack = [...roots];
    const childrenOf = (id: string) =>
      def.steps.filter((s) => s.dependsOn.includes(id)).map((s) => s.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const c of childrenOf(id)) stack.push(c);
    }
    return seen;
  }
}
