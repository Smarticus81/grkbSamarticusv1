import type { ProcessDefinition } from '../types.js';
import type {
  WorkflowDraft,
  WorkflowNode,
  WorkflowEdge,
  WorkflowGroundingRef,
  AutomationKind,
} from './WorkflowDraft.js';

/**
 * Compact summary of a shipped ProcessDefinition for the templates picker
 * in the Process Designer UI.
 */
export interface ProcessTemplateSummary {
  id: string;
  processId: string;
  name: string;
  description: string;
  version: string;
  regulations: string[];
  jurisdictions: string[];
  steps: Array<{
    id: string;
    name: string;
    description: string;
    agentType: string;
    obligationIds: string[];
    dependsOn: string[];
    hitlGateId: string | null;
  }>;
  requiredEvidenceTypes: string[];
  requiredAgentTypes: string[];
  hitlGates: Array<{ gateId: string; approverRole: string; description: string }>;
}

const automationForAgentType = (agentType: string): AutomationKind => {
  if (/Human|Reviewer|Manager|Approval/i.test(agentType)) return 'human';
  if (/Agent$/.test(agentType)) return 'agent';
  return 'hybrid';
};

/**
 * Convert a shipped ProcessDefinition into a ready-to-edit WorkflowDraft.
 *
 * Layout:
 *   start → step₁ → [hitl_gate?] → step₂ → ... → compliance_check → end_success
 *
 * Every operational step becomes an "agent_task" (or "human_task" if the
 * agent type implies a human role) with its obligation IDs attached as
 * groundedRefs of kind=Obligation. HITL gates become hitl_gate nodes that
 * sit immediately after the step that requires them. Each step's
 * `dependsOn` becomes additional inbound edges if it isn't already covered
 * by the linear order.
 */
export function templateToWorkflowDraft(def: ProcessDefinition): WorkflowDraft {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // Start node
  nodes.push({
    id: 'start',
    kind: 'start',
    label: `${def.name} — start`,
    description: `Process entry. Triggered when ${def.processId} input arrives.`,
    automation: 'system',
    responsible: ['Process Runtime'],
    inputs: ['process input'],
    outputs: ['process instance'],
    groundedRefs: [],
    rationale: `Entry point for ${def.processId}.`,
  });

  const stepIds = new Set(def.steps.map((s) => s.id));
  let prevId = 'start';

  const regulationTags = def.regulations.map((r) => `${r.regulation} ${r.section}`);
  const regulationLine = regulationTags.length ? regulationTags.join('; ') : 'general QMS practice';

  for (const step of def.steps) {
    const stepNodeId = `s_${step.id}`;
    const groundedRefs: WorkflowGroundingRef[] = [];
    for (const ob of step.obligationIds) {
      groundedRefs.push({ refId: ob, refKind: 'Obligation' });
    }
    const automation = automationForAgentType(step.agentType);
    const isTaskNode = automation !== 'system';
    const obligationList = step.obligationIds.length
      ? step.obligationIds.slice(0, 12).join(', ')
      : '(none bound \u2014 ask the user to bind obligations before running)';
    const agentContext = isTaskNode
      ? [
          `You are the ${step.agentType} performing "${step.name}" within the ${def.name} process.`,
          `Regulatory focus: ${regulationLine}.`,
          `Bound obligations: ${obligationList}.`,
          `Step intent: ${step.description}`,
          step.hitlGate
            ? `Human approval required after this step (${step.hitlGate.approverRole}). Produce output a human can review without rework.`
            : '',
          'Cite only the obligations bound to this step; never invent regulatory references. Be specific, evidence-driven, and avoid generic compliance language.',
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 2000)
      : undefined;
    nodes.push({
      id: stepNodeId,
      kind: automation === 'human' ? 'human_task' : 'agent_task',
      label: step.name,
      description: step.description,
      automation,
      responsible: [step.agentType],
      inputs: [`step:${step.id}:input`],
      outputs: [`step:${step.id}:output`],
      durationEstimate: msToHuman(step.timeoutMs),
      groundedRefs,
      rationale: `${step.name} satisfies ${step.obligationIds.length} obligation(s).`,
      ...(agentContext ? { agentContext } : {}),
    });

    // Link from previous node (linear order) ...
    edges.push({ from: prevId, to: stepNodeId });
    // ... plus any explicit dependsOn that isn't the immediate predecessor.
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) continue;
      const depNodeId = `s_${dep}`;
      if (depNodeId !== prevId) {
        edges.push({ from: depNodeId, to: stepNodeId, label: 'depends on' });
      }
    }
    prevId = stepNodeId;

    // Optional HITL gate immediately after the step.
    if (step.hitlGate) {
      const gateNodeId = `g_${step.hitlGate.gateId}`;
      nodes.push({
        id: gateNodeId,
        kind: 'hitl_gate',
        label: `Approve: ${step.hitlGate.gateId}`,
        description: step.hitlGate.description,
        automation: 'human',
        responsible: [step.hitlGate.approverRole],
        inputs: [`step:${step.id}:output`],
        outputs: ['approval decision'],
        groundedRefs: [{ refId: step.hitlGate.gateId, refKind: 'HITLGate' }],
        rationale: `Required approval gate after ${step.name}.`,
      });
      edges.push({ from: stepNodeId, to: gateNodeId });
      prevId = gateNodeId;
    }
  }

  // Compliance check before terminal
  const complianceNodeId = 'compliance';
  nodes.push({
    id: complianceNodeId,
    kind: 'compliance_check',
    label: 'Validate obligations satisfied',
    description: 'Automated verification that every bound obligation has matching evidence.',
    automation: 'system',
    responsible: ['StrictGate'],
    inputs: ['all step outputs'],
    outputs: ['compliance verdict'],
    groundedRefs: def.obligationIds.slice(0, 6).map((id) => ({
      refId: id,
      refKind: 'Obligation' as const,
    })),
    rationale: 'Pre-close compliance check against the obligation set.',
  });
  edges.push({ from: prevId, to: complianceNodeId });

  // Terminal nodes
  nodes.push({
    id: 'end_success',
    kind: 'end_success',
    label: 'Closed',
    description: 'Process completed with full audit trail.',
    automation: 'system',
    responsible: [],
    inputs: ['compliance verdict'],
    outputs: [],
    groundedRefs: [],
    rationale: 'Successful termination.',
  });
  nodes.push({
    id: 'end_fail',
    kind: 'end_fail',
    label: 'Failed compliance',
    description: 'Process aborted due to unmet obligations.',
    automation: 'system',
    responsible: [],
    inputs: ['compliance verdict'],
    outputs: [],
    groundedRefs: [],
    rationale: 'Failure exit when compliance check rejects.',
  });

  // Compliance check is treated as a decision-like split via labels.
  edges.push({ from: complianceNodeId, to: 'end_success', label: 'pass' });
  edges.push({ from: complianceNodeId, to: 'end_fail', label: 'fail' });

  const draft: WorkflowDraft = {
    name: def.name,
    description: def.description,
    jurisdiction: def.jurisdictions[0] ?? 'GLOBAL',
    processType: def.processId,
    regulations: def.regulations.map((r) => `${r.regulation} ${r.section}`).slice(0, 20),
    nodes,
    edges,
    rationale:
      `Boilerplate workflow generated from the shipped ${def.name} (${def.id}) ProcessDefinition. ` +
      `${def.steps.length} step(s), ${def.hitlGates.length} HITL gate(s), ${def.obligationIds.length} obligation(s).`,
    openQuestions: [],
  };

  return draft;
}

function msToHuman(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} d`;
}

/** Compact summary used by GET /api/builder/templates list endpoint. */
export function summarizeTemplate(def: ProcessDefinition): ProcessTemplateSummary {
  return {
    id: def.id,
    processId: def.processId,
    name: def.name,
    description: def.description,
    version: def.version,
    regulations: def.regulations.map((r) => `${r.regulation} ${r.section}`),
    jurisdictions: def.jurisdictions,
    steps: def.steps.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      agentType: s.agentType,
      obligationIds: s.obligationIds,
      dependsOn: s.dependsOn,
      hitlGateId: s.hitlGate?.gateId ?? null,
    })),
    requiredEvidenceTypes: def.requiredEvidenceTypes,
    requiredAgentTypes: def.requiredAgentTypes,
    hitlGates: def.hitlGates.map((h) => ({
      gateId: h.gateId,
      approverRole: h.approverRole,
      description: h.description,
    })),
  };
}
