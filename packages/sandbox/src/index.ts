// @regground/sandbox — public barrel.
export const SANDBOX_VERSION = '0.1.0';

// templates
export { TemplateEngine } from './templates/TemplateEngine.js';
export { generateSkill, type SkillTemplateParams } from './templates/SkillTemplate.js';
export { generateAgentMd, type AgentTemplateParams } from './templates/AgentTemplate.js';
export {
  generateInstructionMd,
  type InstructionTemplateParams,
} from './templates/InstructionTemplate.js';
export { generateHooksJson, type HookTemplateParams } from './templates/HookTemplate.js';
export { generateHarnessYAML, type HarnessTemplateParams } from './templates/HarnessTemplate.js';

// workspace
export { WorkspaceManager } from './workspace/WorkspaceManager.js';
export { SandboxIsolation } from './workspace/SandboxIsolation.js';
export { buildWorkspaceConfig, DEFAULT_WORKSPACE_CONFIG } from './workspace/WorkspaceConfig.js';
export type { WorkspaceConfig } from './workspace/types.js';

// runtime
export { SandboxRunner } from './runtime/SandboxRunner.js';
export { SSEStream, eventToSSE } from './runtime/SSEStream.js';
export { ProcessStateMachine } from './runtime/ProcessStateMachine.js';
export type { SandboxRunInput, SandboxRunResult, ProgressEvent } from './runtime/types.js';

// processes
export { ProcessRegistry } from './processes/ProcessRegistry.js';
export { registerAllProcesses, registerAllAgents } from './processes/registerAll.js';
export { CAPA_PROCESS } from './processes/capa/CAPAProcessDefinition.js';
export { COMPLAINT_PROCESS } from './processes/complaints/ComplaintProcessDefinition.js';
export { NC_PROCESS } from './processes/nonconformances/NCProcessDefinition.js';
export { TREND_PROCESS } from './processes/trend-reporting/TrendProcessDefinition.js';
export { CHANGE_PROCESS } from './processes/change-control/ChangeProcessDefinition.js';
export { AUDIT_PROCESS } from './processes/audit/AuditProcessDefinition.js';

// tasks (single-step task agents for the sandbox)
export * from './tasks/index.js';
