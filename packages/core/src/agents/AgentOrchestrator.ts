import type { BaseGroundedAgent } from './BaseGroundedAgent.js';
import type { GroundedAgentContext, GroundedAgentResult } from './types.js';

export interface DAGNode {
  id: string;
  agent: BaseGroundedAgent<any, any>;
  input: unknown | ((results: Record<string, GroundedAgentResult<any>>) => unknown);
  dependsOn: string[];
}

export interface OrchestrationResult {
  results: Record<string, GroundedAgentResult<any>>;
  order: string[];
  failed: string[];
}

/**
 * Coordinates execution of a DAG of grounded agents. Steps run in topological
 * order; an agent's input may be a function of upstream results. If any
 * required upstream fails, dependents are skipped.
 */
export class AgentOrchestrator {
  async run(nodes: DAGNode[], context: GroundedAgentContext): Promise<OrchestrationResult> {
    const order = this.topoSort(nodes);
    const results: Record<string, GroundedAgentResult<any>> = {};
    const failed: string[] = [];
    const skipped = new Set<string>();

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const id of order) {
      const node = byId.get(id)!;
      const upstreamFailed = node.dependsOn.some((d) => failed.includes(d) || skipped.has(d));
      if (upstreamFailed) {
        skipped.add(id);
        continue;
      }
      const input = typeof node.input === 'function' ? (node.input as Function)(results) : node.input;
      const res = await node.agent.run(input, context);
      results[id] = res;
      if (!res.success) failed.push(id);
    }

    return { results, order, failed };
  }

  private topoSort(nodes: DAGNode[]): string[] {
    const graph = new Map<string, Set<string>>();
    const indeg = new Map<string, number>();
    for (const n of nodes) {
      graph.set(n.id, new Set(n.dependsOn));
      indeg.set(n.id, 0);
    }
    for (const n of nodes) for (const d of n.dependsOn) indeg.set(n.id, (indeg.get(n.id) ?? 0));
    // Kahn
    const ready: string[] = [];
    for (const [id, deps] of graph) if (deps.size === 0) ready.push(id);
    const order: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      order.push(id);
      for (const [other, deps] of graph) {
        if (deps.has(id)) {
          deps.delete(id);
          if (deps.size === 0) ready.push(other);
        }
      }
    }
    if (order.length !== nodes.length) throw new Error('Agent DAG contains a cycle');
    return order;
  }
}
