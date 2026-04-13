export interface WorkspaceConfig {
  id: string;
  name: string;
  tenantId: string;
  jurisdictions: string[];
  enabledProcesses: string[];
  resourceLimits: {
    maxConcurrentProcesses: number;
    maxAgentsPerProcess: number;
    maxLLMCostPerRunUSD: number;
  };
  metadata?: Record<string, unknown>;
}
