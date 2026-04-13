import type { WorkspaceConfig } from './types.js';

export const DEFAULT_WORKSPACE_CONFIG: Omit<WorkspaceConfig, 'id' | 'name' | 'tenantId'> = {
  jurisdictions: ['GLOBAL'],
  enabledProcesses: [],
  resourceLimits: {
    maxConcurrentProcesses: 10,
    maxAgentsPerProcess: 20,
    maxLLMCostPerRunUSD: 5,
  },
};

export function buildWorkspaceConfig(
  partial: Partial<WorkspaceConfig> & Pick<WorkspaceConfig, 'id' | 'name' | 'tenantId'>,
): WorkspaceConfig {
  return {
    ...DEFAULT_WORKSPACE_CONFIG,
    ...partial,
    resourceLimits: {
      ...DEFAULT_WORKSPACE_CONFIG.resourceLimits,
      ...(partial.resourceLimits ?? {}),
    },
  };
}
