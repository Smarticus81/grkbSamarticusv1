import { z } from 'zod';

/**
 * WorkflowDraft — the structured output of the ProcessBuilderAgent.
 *
 * The draft describes a PRACTICAL operational workflow: real steps a person
 * or agent performs, with explicit inputs/outputs, gateways, notifications,
 * and end states. Compliance grounding is attached to each step via
 * `groundedRefs[]`, which point at IDs that exist in the live KB catalog
 * (obligations, agent roles, evidence types, governance policies, HITL
 * gates, observability SLOs, process triggers). The validator rejects
 * any draft whose grounded refs aren't in the catalog.
 *
 * The shape is BPMN-flavored but kept small enough for an LLM to emit
 * reliably and a designer to read at a glance.
 */

// ─── Refs into the KB catalog ─────────────────────────────────────────────

export const WorkflowRefKind = z.enum([
  'Obligation',
  'AgentRole',
  'EvidenceType',
  'GovernancePolicy',
  'HITLGate',
  'ObservabilitySLO',
  'ProcessTrigger',
  'None',
]);
export type WorkflowRefKind = z.infer<typeof WorkflowRefKind>;

export const WorkflowGroundingRefSchema = z.object({
  refId: z.string().min(1).max(200),
  refKind: WorkflowRefKind,
  note: z.string().max(200).optional(),
});
export type WorkflowGroundingRef = z.infer<typeof WorkflowGroundingRefSchema>;

// ─── Operational node kinds ───────────────────────────────────────────────

export const WorkflowNodeKind = z.enum([
  'start',             // Process entry (manual / scheduled / event)
  'task',              // Generic operational step
  'agent_task',        // Step performed by a grounded AI agent
  'human_task',        // Step performed by a human role
  'decision',          // Gateway with branching outcomes
  'evidence_capture',  // Produce or attach a regulated evidence record
  'hitl_gate',         // Formal human-in-the-loop approval
  'notification',      // Send notice to internal/external party
  'wait',              // Timer or external-event wait
  'subprocess',        // Invoke another process by id
  'compliance_check',  // Automated obligation validation checkpoint
  'end_success',       // Terminal — happy path
  'end_fail',          // Terminal — fail / abort path
]);
export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKind>;

export const AutomationKind = z.enum(['system', 'agent', 'human', 'hybrid']);
export type AutomationKind = z.infer<typeof AutomationKind>;

// ─── Node + edge ──────────────────────────────────────────────────────────

export const WorkflowNodeSchema = z.object({
  /** Local node id, e.g. "n1". Stable within this draft only. */
  id: z.string().min(1).max(40),
  kind: WorkflowNodeKind,
  /** Short title shown on the card (≤120 chars). */
  label: z.string().min(1).max(120),
  /** Practical description of what happens at this step (≤600 chars). */
  description: z.string().min(1).max(600),
  /** Who/what performs the step. */
  automation: AutomationKind,
  /** Named role(s) responsible (e.g. "Quality Engineer", "ComplaintIntakeAgent"). */
  responsible: z.array(z.string().min(1).max(80)).max(6),
  /** Concrete inputs consumed by the step. */
  inputs: z.array(z.string().min(1).max(120)).max(8),
  /** Concrete outputs produced by the step. */
  outputs: z.array(z.string().min(1).max(120)).max(8),
  /** Rough duration estimate (e.g. "5 min", "2 days"). */
  durationEstimate: z.string().max(40).optional(),
  /** KB grounding — every regulated step should have ≥1 grounded ref. */
  groundedRefs: z.array(WorkflowGroundingRefSchema).max(12),
  /** Why this step exists in the workflow (≤500 chars). */
  rationale: z.string().min(1).max(500),
  jurisdiction: z.string().min(1).max(64).optional(),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  /** Optional condition label (e.g. "if serious", "rejected"). */
  label: z.string().max(80).optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

// ─── Draft envelope ───────────────────────────────────────────────────────

export const WorkflowDraftSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  jurisdiction: z.string().min(1).max(64),
  processType: z.string().min(1).max(64),
  regulations: z.array(z.string().min(1).max(120)).min(1).max(20),
  nodes: z.array(WorkflowNodeSchema).min(3).max(60),
  edges: z.array(WorkflowEdgeSchema).max(120),
  /** Top-level reasoning summary tying the workflow to obligations. */
  rationale: z.string().min(1).max(2000),
  /** Anything the agent could not ground or needs the user to clarify. */
  openQuestions: z.array(z.string().min(1).max(300)).max(20),
});
export type WorkflowDraft = z.infer<typeof WorkflowDraftSchema>;

// ─── Validation report ────────────────────────────────────────────────────

export interface WorkflowDraftValidation {
  valid: boolean;
  unknownRefs: Array<{ nodeId: string; refId: string; refKind: WorkflowRefKind }>;
  danglingEdges: Array<{ from: string; to: string }>;
  missingStart: boolean;
  missingEnd: boolean;
  /** Operational nodes with zero KB grounding (regulated work without a citation). */
  ungroundedSteps: Array<{ nodeId: string; label: string }>;
  /** Decision nodes with fewer than 2 outbound edges. */
  invalidDecisions: Array<{ nodeId: string; label: string; outboundCount: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Kinds that DO NOT require KB grounding (purely structural). */
export const STRUCTURAL_KINDS: ReadonlySet<WorkflowNodeKind> = new Set<WorkflowNodeKind>([
  'start',
  'end_success',
  'end_fail',
  'wait',
  'decision',
]);

/** Kinds considered "terminal" (workflow exit). */
export const TERMINAL_KINDS: ReadonlySet<WorkflowNodeKind> = new Set<WorkflowNodeKind>([
  'end_success',
  'end_fail',
]);
