import { AgentRegistry, type BaseGroundedAgentDeps } from '@regground/core';
import { ProcessRegistry } from './ProcessRegistry.js';

import { CAPA_PROCESS } from './capa/CAPAProcessDefinition.js';
import { CAPAInitiationAgent } from './capa/agents/CAPAInitiationAgent.js';
import { RootCauseAnalysisAgent } from './capa/agents/RootCauseAnalysisAgent.js';
import { ActionPlanAgent } from './capa/agents/ActionPlanAgent.js';
import { EffectivenessCheckAgent } from './capa/agents/EffectivenessCheckAgent.js';
import { CAPAClosureAgent } from './capa/agents/CAPAClosureAgent.js';

import { COMPLAINT_PROCESS } from './complaints/ComplaintProcessDefinition.js';
import { ComplaintIntakeAgent } from './complaints/agents/ComplaintIntakeAgent.js';
import { ComplaintTriageAgent } from './complaints/agents/ComplaintTriageAgent.js';
import { ComplaintInvestigationAgent } from './complaints/agents/ComplaintInvestigationAgent.js';
import { TrendDetectionAgent } from './complaints/agents/TrendDetectionAgent.js';

import { NC_PROCESS } from './nonconformances/NCProcessDefinition.js';
import { NCClassificationAgent } from './nonconformances/agents/NCClassificationAgent.js';
import { NCInvestigationAgent } from './nonconformances/agents/NCInvestigationAgent.js';
import { NCDispositionAgent } from './nonconformances/agents/NCDispositionAgent.js';

import { TREND_PROCESS } from './trend-reporting/TrendProcessDefinition.js';
import { StatisticalTrendAgent } from './trend-reporting/agents/StatisticalTrendAgent.js';
import { TrendNarrativeAgent } from './trend-reporting/agents/TrendNarrativeAgent.js';

import { CHANGE_PROCESS } from './change-control/ChangeProcessDefinition.js';
import { ChangeImpactAgent } from './change-control/agents/ChangeImpactAgent.js';
import { ChangeVerificationAgent } from './change-control/agents/ChangeVerificationAgent.js';

import { AUDIT_PROCESS } from './audit/AuditProcessDefinition.js';
import { AuditPlanningAgent } from './audit/agents/AuditPlanningAgent.js';
import { AuditFindingAgent } from './audit/agents/AuditFindingAgent.js';
import { AuditReportAgent } from './audit/agents/AuditReportAgent.js';

/**
 * One-shot registration of every shipped process and agent. Call once at
 * sandbox boot. Tests use the registry too via `registerAllAgents(...)`.
 */
export function registerAllProcesses(registry: ProcessRegistry): ProcessRegistry {
  registry.register(CAPA_PROCESS);
  registry.register(COMPLAINT_PROCESS);
  registry.register(NC_PROCESS);
  registry.register(TREND_PROCESS);
  registry.register(CHANGE_PROCESS);
  registry.register(AUDIT_PROCESS);
  return registry;
}

export function registerAllAgents(registry: AgentRegistry, deps: BaseGroundedAgentDeps): AgentRegistry {
  const reg = (agentType: string, processTypes: string[], factory: () => any) =>
    registry.register({ agentType, version: '1.0.0', description: agentType, processTypes, factory });

  reg('CAPAInitiationAgent', ['CAPA'], () => new CAPAInitiationAgent(deps));
  reg('RootCauseAnalysisAgent', ['CAPA'], () => new RootCauseAnalysisAgent(deps));
  reg('ActionPlanAgent', ['CAPA'], () => new ActionPlanAgent(deps));
  reg('EffectivenessCheckAgent', ['CAPA'], () => new EffectivenessCheckAgent(deps));
  reg('CAPAClosureAgent', ['CAPA'], () => new CAPAClosureAgent(deps));

  reg('ComplaintIntakeAgent', ['COMPLAINT'], () => new ComplaintIntakeAgent(deps));
  reg('ComplaintTriageAgent', ['COMPLAINT'], () => new ComplaintTriageAgent(deps));
  reg('ComplaintInvestigationAgent', ['COMPLAINT'], () => new ComplaintInvestigationAgent(deps));
  reg('TrendDetectionAgent', ['COMPLAINT', 'TREND'], () => new TrendDetectionAgent(deps));

  reg('NCClassificationAgent', ['NONCONFORMANCE'], () => new NCClassificationAgent(deps));
  reg('NCInvestigationAgent', ['NONCONFORMANCE'], () => new NCInvestigationAgent(deps));
  reg('NCDispositionAgent', ['NONCONFORMANCE'], () => new NCDispositionAgent(deps));

  reg('StatisticalTrendAgent', ['TREND'], () => new StatisticalTrendAgent(deps));
  reg('TrendNarrativeAgent', ['TREND'], () => new TrendNarrativeAgent(deps));

  reg('ChangeImpactAgent', ['CHANGE_CONTROL'], () => new ChangeImpactAgent(deps));
  reg('ChangeVerificationAgent', ['CHANGE_CONTROL'], () => new ChangeVerificationAgent(deps));

  reg('AuditPlanningAgent', ['AUDIT'], () => new AuditPlanningAgent(deps));
  reg('AuditFindingAgent', ['AUDIT'], () => new AuditFindingAgent(deps));
  reg('AuditReportAgent', ['AUDIT'], () => new AuditReportAgent(deps));

  return registry;
}
