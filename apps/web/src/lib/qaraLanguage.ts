/**
 * QMS Language Dictionary — single source of truth for user-facing copy.
 *
 * User-facing language must use QMS terms. Backend domain models may still
 * use technical terms (obligation, evidence, graph, etc.) internally.
 *
 * When displaying any of the "avoid" terms to users, replace with the
 * corresponding QMS term from this file.
 */

// ── Approved QMS terms ─────────────────────────────────────────────────

export const Q = {
  // Core domain
  requirement: 'Requirement',
  requirements: 'Requirements',
  requirementsMap: 'Requirements Map',
  requirementsEngine: 'Requirements Engine',
  requiredData: 'Required Data',
  records: 'Records',

  // Review flow
  review: 'Review',
  reviewGate: 'Review Gate',
  reviewControls: 'Review Controls',
  reviewPath: 'Review Path',
  reviewPackage: 'Review Package',
  QMSReview: 'QMS Review',

  // Checks
  readinessCheck: 'Readiness Check',
  outputCheck: 'Output Check',
  releaseCheck: 'Release Check',
  validationCheck: 'Validation Check',

  // Coverage & status
  requirementCoverage: 'Requirement Coverage',
  requiredDataCoverage: 'Required Data Coverage',
  releaseReadiness: 'Release Readiness',

  // Traceability
  decisionTrail: 'Decision Trail',
  decisionTrails: 'Decision Trails',
  traceability: 'Traceability',
  sourceCitation: 'Source Citation',
  sourceCitations: 'Source Citations',
  rationale: 'Rationale',
  reviewerNotes: 'Reviewer Notes',

  // Outputs
  draftPackage: 'Draft Package',
  outputPackage: 'Output Package',

  // Data types
  qmsData: 'QMS Data',
  pmsData: 'PMS Data',
  complaintData: 'Complaint Data',
  capaRecords: 'CAPA Records',
  riskFile: 'Risk File',
  reportabilityAssessment: 'Reportability Assessment',

  // Sandbox modes
  smarticusGuided: 'Smarticus-guided',
  genericAi: 'Generic AI',
  compare: 'Compare',

  // Activity labels
  requirementLookup: 'Requirement lookup',
  requirementsChecked: 'Requirements checked',
  qualityReview: 'Quality Review',
} as const;

// ── Replacement map: technical term → QMS term ─────────────────────────
// Use these when transforming backend data for display.

export const TERM_REPLACEMENTS: Record<string, string> = {
  obligation: Q.requirement,
  obligations: Q.requirements,
  evidence: Q.requiredData,
  'evidence type': 'Required data type',
  'evidence types': 'Required data types',
  'knowledge graph': Q.requirementsMap,
  graph: Q.requirementsMap,
  'compliance grounding': 'Requirement-aware AI',
  grounding: 'Requirement awareness',
  'agent lifecycle': Q.reviewPath,
  guardrail: 'Review control',
  guardrails: Q.reviewControls,
  'strictgate': Q.outputCheck,
  'strict gate': Q.outputCheck,
  'StrictGate': Q.outputCheck,
  'qualification gate': Q.readinessCheck,
  'compliance validator': Q.validationCheck,
  'graph query': Q.requirementLookup,
  'graph queries': 'Requirement lookups',
  'llm judge': Q.qualityReview,
  'with graph': Q.smarticusGuided,
  'without graph': Q.genericAi,
  trace: Q.decisionTrail,
  traces: Q.decisionTrails,
};

// ── Nav labels ──────────────────────────────────────────────────────────

export const NAV_LABELS = {
  command: 'Command',
  builder: 'Builder',
  sandbox: 'Sandbox',
  requirements: 'Requirements',
  decisionTrails: 'Decision Trails',
  connect: 'Connect',
} as const;

// ── Trust copy ──────────────────────────────────────────────────────────

export const TRUST = {
  primary:
    'Smarticus does not replace QMS judgment. It prepares, checks, and traces the work so your team can review with confidence.',
  secondary:
    'Smarticus helps your team prepare review-ready outputs faster. QMS still owns final review and release.',
  dataPrivacy:
    'Your proprietary data stays in your tenant. Smarticus provides the requirements engine, review controls, and traceability layer.',
} as const;

// ── Helper: replace technical terms in a string ─────────────────────────

export function QMSify(text: string): string {
  let result = text;
  for (const [technical, QMS] of Object.entries(TERM_REPLACEMENTS)) {
    // Case-insensitive replacement, preserving word boundaries
    const regex = new RegExp(`\\b${technical}\\b`, 'gi');
    result = result.replace(regex, QMS);
  }
  return result;
}

// ── Trace event label mapping ───────────────────────────────────────────

export const TRACE_EVENT_LABELS: Record<string, string> = {
  PROCESS_STARTED: 'Work started',
  PROCESS_COMPLETED: 'Work completed',
  PROCESS_FAILED: 'Work failed',
  AGENT_SPAWNED: 'Tool started',
  AGENT_COMPLETED: 'Tool completed',
  AGENT_FAILED: 'Tool failed',
  QUALIFICATION_BLOCKED: 'Readiness check blocked',
  QUALIFICATION_PASSED: 'Readiness check passed',
  STEP_STARTED: 'Step started',
  STEP_COMPLETED: 'Step completed',
  STEP_FAILED: 'Step failed',
  LLM_REQUEST_SENT: 'AI request sent',
  LLM_RESPONSE_RECEIVED: 'AI response received',
  EVIDENCE_INGESTED: 'Required data loaded',
  EVIDENCE_VALIDATED: 'Required data validated',
  OBLIGATION_SATISFIED: 'Requirement satisfied',
  OBLIGATION_VIOLATED: 'Requirement gap detected',
  HITL_GATE_OPENED: 'Review gate opened',
  HITL_GATE_APPROVED: 'QMS review approved',
  HITL_GATE_REJECTED: 'QMS review rejected',
  COMPLIANCE_CHECK_PASSED: 'Output check passed',
  COMPLIANCE_CHECK_FAILED: 'Output check failed',
  COMPLIANCE_PIPELINE_COMPLETED: 'Validation check completed',
};
