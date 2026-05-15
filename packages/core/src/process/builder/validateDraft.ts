import type { KBCatalogSnapshot } from '../../graph/KBCatalog.js';
import {
  STRUCTURAL_KINDS,
  TERMINAL_KINDS,
  type WorkflowDraft,
  type WorkflowDraftValidation,
  type WorkflowRefKind,
} from './WorkflowDraft.js';

/**
 * Validate that every grounded ref in the draft exists in the supplied
 * catalog, that edges reference declared nodes, that the workflow has at
 * least one start and one end, that operational (non-structural) steps
 * carry ≥1 grounded ref, and that every decision branches.
 */
export function validateDraftAgainstCatalog(
  draft: WorkflowDraft,
  catalog: KBCatalogSnapshot,
): WorkflowDraftValidation {
  const indexes: Record<WorkflowRefKind, Set<string>> = {
    Obligation: new Set(catalog.obligations.map((o) => o.obligationId)),
    AgentRole: new Set(catalog.agentRoles.map((a) => a.agentRoleId)),
    EvidenceType: new Set(catalog.evidenceTypes.map((e) => e.evidenceType)),
    GovernancePolicy: new Set(catalog.policies.map((p) => p.policyId)),
    HITLGate: new Set(catalog.hitlGates.map((h) => h.gateId)),
    ObservabilitySLO: new Set(catalog.slos.map((s) => s.sloId)),
    ProcessTrigger: new Set(catalog.triggers.map((t) => t.triggerId)),
    None: new Set<string>(),
  };

  const unknownRefs: WorkflowDraftValidation['unknownRefs'] = [];
  const ungroundedSteps: WorkflowDraftValidation['ungroundedSteps'] = [];
  const nodeIds = new Set<string>();
  const outboundCount = new Map<string, number>();
  let hasStart = false;
  let hasEnd = false;

  for (const n of draft.nodes) {
    nodeIds.add(n.id);
    if (n.kind === 'start') hasStart = true;
    if (TERMINAL_KINDS.has(n.kind)) hasEnd = true;

    // Operational nodes (non-structural) must have ≥1 grounded ref.
    if (!STRUCTURAL_KINDS.has(n.kind) && n.kind !== 'notification') {
      if (n.groundedRefs.length === 0) {
        ungroundedSteps.push({ nodeId: n.id, label: n.label });
      }
    }

    for (const ref of n.groundedRefs) {
      if (ref.refKind === 'None') continue;
      if (!ref.refId) {
        unknownRefs.push({ nodeId: n.id, refId: '<null>', refKind: ref.refKind });
        continue;
      }
      if (!indexes[ref.refKind].has(ref.refId)) {
        unknownRefs.push({ nodeId: n.id, refId: ref.refId, refKind: ref.refKind });
      }
    }
  }

  const danglingEdges: WorkflowDraftValidation['danglingEdges'] = [];
  for (const e of draft.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
      danglingEdges.push({ from: e.from, to: e.to });
      continue;
    }
    outboundCount.set(e.from, (outboundCount.get(e.from) ?? 0) + 1);
  }

  const invalidDecisions: WorkflowDraftValidation['invalidDecisions'] = [];
  for (const n of draft.nodes) {
    if (n.kind === 'decision') {
      const count = outboundCount.get(n.id) ?? 0;
      if (count < 2) {
        invalidDecisions.push({ nodeId: n.id, label: n.label, outboundCount: count });
      }
    }
  }

  const valid =
    unknownRefs.length === 0 &&
    danglingEdges.length === 0 &&
    ungroundedSteps.length === 0 &&
    invalidDecisions.length === 0 &&
    hasStart &&
    hasEnd;

  return {
    valid,
    unknownRefs,
    danglingEdges,
    missingStart: !hasStart,
    missingEnd: !hasEnd,
    ungroundedSteps,
    invalidDecisions,
  };
}
