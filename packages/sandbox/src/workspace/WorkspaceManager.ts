import type { WorkspaceConfig } from './types.js';
import { buildWorkspaceConfig } from './WorkspaceConfig.js';

/**
 * Multi-tenant workspace manager. Holds workspace configs and tracks active
 * resource usage so the SandboxIsolation layer can enforce limits.
 */
export class WorkspaceManager {
  private workspaces = new Map<string, WorkspaceConfig>();
  private activeProcesses = new Map<string, Set<string>>(); // workspaceId -> processInstanceIds

  create(partial: Partial<WorkspaceConfig> & Pick<WorkspaceConfig, 'id' | 'name' | 'tenantId'>): WorkspaceConfig {
    if (this.workspaces.has(partial.id)) throw new Error(`Workspace exists: ${partial.id}`);
    const config = buildWorkspaceConfig(partial);
    this.workspaces.set(config.id, config);
    this.activeProcesses.set(config.id, new Set());
    return config;
  }

  get(id: string): WorkspaceConfig | undefined {
    return this.workspaces.get(id);
  }

  list(): WorkspaceConfig[] {
    return Array.from(this.workspaces.values());
  }

  update(id: string, patch: Partial<WorkspaceConfig>): WorkspaceConfig {
    const existing = this.workspaces.get(id);
    if (!existing) throw new Error(`Unknown workspace: ${id}`);
    const merged = { ...existing, ...patch };
    this.workspaces.set(id, merged);
    return merged;
  }

  registerProcessStart(workspaceId: string, processInstanceId: string): void {
    const set = this.activeProcesses.get(workspaceId) ?? new Set();
    set.add(processInstanceId);
    this.activeProcesses.set(workspaceId, set);
  }

  registerProcessEnd(workspaceId: string, processInstanceId: string): void {
    this.activeProcesses.get(workspaceId)?.delete(processInstanceId);
  }

  activeCount(workspaceId: string): number {
    return this.activeProcesses.get(workspaceId)?.size ?? 0;
  }
}
