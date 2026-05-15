import type { LLMAbstraction } from '../../llm/LLMAbstraction.js';
import type { KBCatalog, KBCatalogSnapshot } from '../../graph/KBCatalog.js';
import {
  WorkflowDraftSchema,
  type WorkflowDraft,
  type WorkflowDraftValidation,
} from './WorkflowDraft.js';
import { validateDraftAgainstCatalog } from './validateDraft.js';

export interface ProcessBuilderInput {
  description: string;          // Natural language process description
  jurisdiction?: string;        // Optional pre-filter
  processType?: string;         // Optional pre-filter
  conversation?: BuilderTurn[]; // Prior chat turns
}

export interface BuilderTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProcessBuilderResult {
  draft: WorkflowDraft;
  validation: WorkflowDraftValidation;
  catalogSummary: {
    obligations: number;
    agentRoles: number;
    hitlGates: number;
    policies: number;
    slos: number;
    triggers: number;
    evidenceTypes: number;
    jurisdictionUsed: string | null;
    processTypeUsed: string | null;
  };
  llmModel: string;
  llmProvider: string;
  attempts: number;
}

const SYSTEM_PROMPT = `You are the Regulatory Ground Process Builder.

Your job: produce a PRACTICAL, OPERATIONAL workflow — the actual end-to-end set of steps a quality team and its agents would perform — that satisfies the user's natural-language process description for a regulated medical-device QMS, using ONLY KB artifacts that exist in the snapshot provided.

This is NOT a list of regulations connected to evidence. It is a real workflow with start/end events, human and agent tasks, decisions with branches, evidence capture, HITL approvals, notifications, waits, and compliance checkpoints. Every regulated step has compliance grounding ATTACHED to it via groundedRefs[], rather than being represented as its own node.

Hard rules:
1. Every entry in node.groundedRefs MUST use a refId from the supplied snapshot. Never invent IDs. The refKind must match the artifact's section in the snapshot (Obligation, AgentRole, EvidenceType, GovernancePolicy, HITLGate, ObservabilitySLO, ProcessTrigger).
2. Every workflow must include exactly one "start" node and at least one terminal node ("end_success" or "end_fail").
3. Every operational node (anything that is NOT start, end_success, end_fail, decision, wait, notification) MUST carry at least one groundedRef.
4. Every "decision" node MUST have at least 2 outbound edges, with edge.label describing the branch condition (e.g. "if serious", "rejected").
5. When the KB exposes an AgentRole that fits a step, prefer kind="agent_task" with that role in groundedRefs. When the KB exposes a HITLGate, model it as kind="hitl_gate" with the gate in groundedRefs. When evidence must be produced, model it as kind="evidence_capture" with the EvidenceType in groundedRefs.
6. Use "human_task" for steps performed by named human roles (e.g. Quality Engineer, Complaint Handler, MDR Reviewer) when no AgentRole fits.
7. Use "notification" for outbound notices (regulator, customer, internal). Use "wait" for timed waits or external-event waits. Use "subprocess" when invoking another shipped process by id.
8. Use "compliance_check" right before a terminal node to validate that the obligations bound to the workflow have been satisfied.
9. If you don't have enough KB artifacts to cover a need, add an entry to openQuestions rather than fabricate.
10. responsible[] names the role/agent doing the work. inputs[] and outputs[] list concrete artifacts (e.g. "complaint payload", "investigation record", "MDR report draft"). description explains what actually happens at the step.

OUTPUT FORMAT — return ONLY a JSON object (no prose, no markdown fences, no wrapper key) that matches this exact shape:
{
  "name": "string",
  "description": "string",
  "jurisdiction": "string (e.g. EU, US, UK, GLOBAL)",
  "processType": "string (e.g. complaint-handling, capa, change-control)",
  "regulations": ["string", ...],
  "rationale": "string — top-level reasoning summary tying the workflow to the obligations",
  "openQuestions": ["string", ...],
  "nodes": [
    {
      "id": "n1",
      "kind": "start" | "task" | "agent_task" | "human_task" | "decision" | "evidence_capture" | "hitl_gate" | "notification" | "wait" | "subprocess" | "compliance_check" | "end_success" | "end_fail",
      "label": "string (≤120 chars)",
      "description": "string — what actually happens here (≤600 chars)",
      "automation": "system" | "agent" | "human" | "hybrid",
      "responsible": ["role or agent name", ...],
      "inputs": ["concrete input", ...],
      "outputs": ["concrete output", ...],
      "durationEstimate": "string (optional, e.g. '5 min', '2 days')",
      "groundedRefs": [
        { "refId": "KB id from snapshot", "refKind": "Obligation|AgentRole|EvidenceType|GovernancePolicy|HITLGate|ObservabilitySLO|ProcessTrigger", "note": "optional ≤200 chars" }
      ],
      "rationale": "string (≤500 chars)",
      "jurisdiction": "optional string"
    }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "label": "optional condition for decision branches" }
  ]
}

EXAMPLE shape (illustrative, do NOT echo verbatim):
{
  "name": "EU MDR Complaint Handling — Class IIb Vigilance Path",
  "description": "Receive complaint → triage → investigate → decide reportability → MDR notice → close.",
  "jurisdiction": "EU",
  "processType": "complaint-handling",
  "regulations": ["EU MDR 2017/745 Art. 87", "ISO 13485:2016 §8.2.2"],
  "rationale": "Workflow satisfies vigilance reporting and complaint handling obligations.",
  "openQuestions": [],
  "nodes": [
    { "id": "n1", "kind": "start", "label": "Complaint received", "description": "External complaint or internal report ingested via portal/email/phone.", "automation": "system", "responsible": ["Intake System"], "inputs": ["complaint payload"], "outputs": ["complaint record"], "groundedRefs": [{"refId": "<TriggerId from snapshot>", "refKind": "ProcessTrigger"}], "rationale": "Process entry on complaint event." },
    { "id": "n2", "kind": "agent_task", "label": "Triage and classify", "description": "Classify severity, IMDRF code, and route.", "automation": "agent", "responsible": ["ComplaintTriageAgent"], "inputs": ["complaint record"], "outputs": ["triage decision","IMDRF code"], "durationEstimate": "2 min", "groundedRefs": [{"refId": "<AgentRoleId>", "refKind": "AgentRole"}, {"refId": "<ObligationId>", "refKind": "Obligation"}], "rationale": "Agent performs classification under the triage policy." },
    { "id": "n3", "kind": "decision", "label": "Serious incident?", "description": "Branch on reportability screen.", "automation": "system", "responsible": [], "inputs": ["triage decision"], "outputs": ["branch"], "groundedRefs": [], "rationale": "Reportability gate." },
    { "id": "n4", "kind": "evidence_capture", "label": "Open vigilance file", "description": "Create MDR file with required fields.", "automation": "agent", "responsible": ["VigilanceAgent"], "inputs": ["triage decision"], "outputs": ["vigilance file"], "groundedRefs": [{"refId": "<EvidenceTypeId>", "refKind": "EvidenceType"}], "rationale": "Captures EU MDR vigilance evidence." },
    { "id": "n5", "kind": "hitl_gate", "label": "Reviewer approval", "description": "Reportability decision approved by qualified reviewer.", "automation": "human", "responsible": ["MDR Reviewer"], "inputs": ["vigilance file"], "outputs": ["approval"], "groundedRefs": [{"refId": "<HITLGateId>", "refKind": "HITLGate"}], "rationale": "EU MDR requires qualified human sign-off." },
    { "id": "n6", "kind": "notification", "label": "Submit MDR notice to authority", "description": "Submit to competent authority within 15 days.", "automation": "system", "responsible": ["Notification Service"], "inputs": ["approval","vigilance file"], "outputs": ["MDR submission receipt"], "durationEstimate": "≤15 days", "groundedRefs": [], "rationale": "EU MDR Art. 87 deadline." },
    { "id": "n7", "kind": "compliance_check", "label": "Validate obligations satisfied", "description": "Automated check that all bound obligations have evidence.", "automation": "system", "responsible": ["StrictGate"], "inputs": ["vigilance file","MDR submission receipt"], "outputs": ["compliance verdict"], "groundedRefs": [{"refId": "<ObligationId>", "refKind": "Obligation"}], "rationale": "Pre-close compliance check." },
    { "id": "n8", "kind": "end_success", "label": "Closed", "description": "Process closed with full audit trail.", "automation": "system", "responsible": [], "inputs": ["compliance verdict"], "outputs": [], "groundedRefs": [], "rationale": "Successful termination." }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" },
    { "from": "n3", "to": "n4", "label": "if serious" },
    { "from": "n3", "to": "n7", "label": "if not serious" },
    { "from": "n4", "to": "n5" },
    { "from": "n5", "to": "n6", "label": "approved" },
    { "from": "n5", "to": "n3", "label": "rejected — re-triage" },
    { "from": "n6", "to": "n7" },
    { "from": "n7", "to": "n8" }
  ]
}`;

/**
 * Tolerant draft parser. LLMs occasionally:
 *  - wrap the response in markdown fences,
 *  - add a top-level wrapper key like { "workflow": {...} } or { "draft": {...} },
 *  - return a JSON-Schema description instead of an instance,
 *  - prefix the JSON with prose.
 * We strip fences, locate the first '{', try direct parse, then unwrap a
 * single top-level wrapper if the schema parse fails.
 */
function parseDraft(raw: string): WorkflowDraft {
  let text = raw.trim();
  // Strip ```json fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Locate first '{' / last '}'
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No JSON object found in LLM response');
  }
  const slice = text.slice(first, last + 1);

  let obj: unknown;
  try {
    obj = JSON.parse(slice);
  } catch (e) {
    throw new Error(`JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Try the object as-is.
  const direct = WorkflowDraftSchema.safeParse(obj);
  if (direct.success) return direct.data;

  // Try unwrapping a single top-level key (workflow/draft/output/data/result).
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj as Record<string, unknown>);
    const wrapperKeys = ['workflow', 'draft', 'output', 'data', 'result', 'WorkflowDraft'];
    for (const k of keys) {
      if (
        wrapperKeys.includes(k) ||
        (keys.length === 1 && typeof (obj as Record<string, unknown>)[k] === 'object')
      ) {
        const inner = (obj as Record<string, unknown>)[k];
        const wrapped = WorkflowDraftSchema.safeParse(inner);
        if (wrapped.success) return wrapped.data;
      }
    }
  }

  // Surface the most informative error.
  const issues = direct.error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  throw new Error(`WorkflowDraft schema mismatch: ${issues}`);
}

function summarizeCatalog(catalog: KBCatalogSnapshot, maxObligations = 80): string {
  const ob = catalog.obligations.slice(0, maxObligations).map((o) => ({
    id: o.obligationId,
    reg: o.regulation,
    section: o.section,
    text: o.text.length > 220 ? `${o.text.slice(0, 220)}…` : o.text,
    mandatory: o.mandatory,
    requiredEvidenceTypes: o.requiredEvidenceTypes,
  }));
  return JSON.stringify(
    {
      obligations: ob,
      obligationsTotalAvailable: catalog.obligations.length,
      agentRoles: catalog.agentRoles.map((a) => ({
        id: a.agentRoleId,
        name: a.name,
        description: a.description,
        processIds: a.processIds,
      })),
      hitlGates: catalog.hitlGates.map((h) => ({
        id: h.gateId,
        appliesTo: h.appliesTo,
        approverRole: h.approverRole,
        slaHours: h.slaHours,
        description: h.description,
      })),
      policies: catalog.policies.map((p) => ({
        id: p.policyId,
        class: p.policyClass,
        appliesTo: p.appliesTo,
        description: p.description,
      })),
      slos: catalog.slos.map((s) => ({
        id: s.sloId,
        appliesTo: s.appliesTo,
        metric: s.metric,
        threshold: s.threshold,
        unit: s.unit,
      })),
      triggers: catalog.triggers.map((t) => ({
        id: t.triggerId,
        processId: t.processId,
        triggerType: t.triggerType,
        schedule: t.schedule,
        eventType: t.eventType,
      })),
      evidenceTypes: catalog.evidenceTypes.map((e) => e.evidenceType),
      jurisdictions: catalog.jurisdictions,
      processTypes: catalog.processTypes,
    },
    null,
    2,
  );
}

/**
 * ProcessBuilderAgent — LLM-driven, KB-grounded process composer.
 *
 * NOT a BaseGroundedAgent: it doesn't satisfy a regulation, it composes one.
 * Its grounding comes from the structural rule that every refId in its output
 * must exist in the live Neo4j catalog supplied at call time.
 *
 * Strategy: single-shot structured-output call, with one automatic re-prompt
 * if the validator finds unknown refs or dangling edges. The error report is
 * fed back so the LLM can self-correct, capped at 3 attempts to bound cost.
 */
export class ProcessBuilderAgent {
  constructor(
    private readonly llm: LLMAbstraction,
    private readonly catalog: KBCatalog,
    private readonly maxAttempts = 3,
  ) {}

  async build(input: ProcessBuilderInput): Promise<ProcessBuilderResult> {
    const snapshot = await this.catalog.snapshot({
      jurisdiction: input.jurisdiction,
      processType: input.processType,
    });

    if (snapshot.obligations.length === 0) {
      throw new Error(
        `KB catalog is empty for jurisdiction=${input.jurisdiction ?? 'ANY'} ` +
          `processType=${input.processType ?? 'ANY'}. Seed regulations first.`,
      );
    }

    const catalogJson = summarizeCatalog(snapshot);

    const conversation = (input.conversation ?? []).map((t) => ({
      role: t.role,
      content: t.content,
    }));

    let lastError:
      | { kind: 'validation'; report: WorkflowDraftValidation }
      | { kind: 'parse'; message: string; rawSnippet: string }
      | null = null;
    let attempts = 0;
    let provider = '';
    let model = '';

    while (attempts < this.maxAttempts) {
      attempts += 1;
      const errorBlock = lastError
        ? lastError.kind === 'validation'
          ? `\n\nPREVIOUS DRAFT WAS REJECTED. Fix these structural issues:\n${JSON.stringify(lastError.report, null, 2)}`
          : `\n\nPREVIOUS DRAFT FAILED TO PARSE. Reason: ${lastError.message}\nReturn a single JSON object that matches the OUTPUT FORMAT exactly. Do NOT wrap it in another key. Do NOT include markdown fences. Snippet of last response:\n${lastError.rawSnippet}`
        : '';

      const userMessages = [
        {
          role: 'user' as const,
          content:
            `KB SNAPSHOT (the only IDs you may reference):\n` +
            `\`\`\`json\n${catalogJson}\n\`\`\`\n\n` +
            `USER REQUEST:\n${input.description}\n\n` +
            (input.jurisdiction ? `Jurisdiction filter: ${input.jurisdiction}\n` : '') +
            (input.processType ? `Process type filter: ${input.processType}\n` : '') +
            errorBlock,
        },
      ];

      const res = await this.llm.complete(
        {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversation,
            ...userMessages,
          ],
          temperature: 0.2,
          maxTokens: 8192,
          metadata: { agent: 'ProcessBuilderAgent', attempt: attempts },
        },
        { structuredOutput: true, minContextTokens: 32_000 },
      );

      let draft: WorkflowDraft;
      try {
        draft = parseDraft(res.content);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = {
          kind: 'parse',
          message: msg,
          rawSnippet: res.content.slice(0, 1000),
        };
        continue;
      }

      const validation = validateDraftAgainstCatalog(draft, snapshot);

      if (validation.valid) {
        const providers = this.llm.listProviders();
        provider = providers[0]?.name ?? 'unknown';
        model = res.model ?? 'auto-selected';
        return {
          draft,
          validation,
          catalogSummary: {
            obligations: snapshot.obligations.length,
            agentRoles: snapshot.agentRoles.length,
            hitlGates: snapshot.hitlGates.length,
            policies: snapshot.policies.length,
            slos: snapshot.slos.length,
            triggers: snapshot.triggers.length,
            evidenceTypes: snapshot.evidenceTypes.length,
            jurisdictionUsed: input.jurisdiction ?? null,
            processTypeUsed: input.processType ?? null,
          },
          llmModel: model,
          llmProvider: provider,
          attempts,
        };
      }

      lastError = { kind: 'validation', report: validation };
    }

    // After max attempts, surface the last error so the route returns 422
    // with actionable diagnostics.
    throw Object.assign(
      new Error(
        `ProcessBuilderAgent failed after ${this.maxAttempts} attempts: ` +
          (lastError?.kind === 'parse'
            ? `last error was a parse failure: ${lastError.message}`
            : 'last draft did not pass KB validation'),
      ),
      {
        validation: lastError?.kind === 'validation' ? lastError.report : undefined,
        parseError: lastError?.kind === 'parse' ? lastError : undefined,
        attempts,
      },
    );
  }
}
