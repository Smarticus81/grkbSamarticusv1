import type { WorkspaceManager } from './WorkspaceManager.js';

export class SandboxIsolation {
  constructor(private readonly manager: WorkspaceManager) {}

  assertCanStart(workspaceId: string): void {
    const ws = this.manager.get(workspaceId);
    if (!ws) throw new Error(`Unknown workspace: ${workspaceId}`);
    const active = this.manager.activeCount(workspaceId);
    if (active >= ws.resourceLimits.maxConcurrentProcesses) {
      throw new Error(
        `Workspace ${workspaceId} exceeded maxConcurrentProcesses (${ws.resourceLimits.maxConcurrentProcesses})`,
      );
    }
  }

  assertCostBudget(workspaceId: string, costUSD: number): void {
    const ws = this.manager.get(workspaceId);
    if (!ws) throw new Error(`Unknown workspace: ${workspaceId}`);
    if (costUSD > ws.resourceLimits.maxLLMCostPerRunUSD) {
      throw new Error(
        `Workspace ${workspaceId} cost ${costUSD} exceeds limit ${ws.resourceLimits.maxLLMCostPerRunUSD}`,
      );
    }
  }
}
