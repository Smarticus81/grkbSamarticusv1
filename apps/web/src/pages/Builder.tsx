/**
 * Smarticus Builder — low-code regulatory intent experience.
 *
 * 6-step flow: QMS Job > Requirements > Required Data > Review Controls > Output Package > Connect
 * Left sidebar stepper, center canvas, right sidebar regulatory inspector.
 * Client-side only — no API calls. State management via React hooks.
 */

import { useMemo, useState } from 'react';

/* ── Types ─────────────────────────────────────────────────────────── */

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type Job = {
  id: string;
  title: string;
  description: string;
  regulations: string[];
  risk: RiskLevel;
  outputType: string;
  timeEstimate: string;
  obligationIds: string[];
  recommendedScope: string[];
  scopeDetail: string;
  evidenceRows: EvidenceRow[];
};

type EvidenceRow = {
  label: string;
  status: 'connected' | 'missing' | 'optional';
};

type OutputFormat = {
  id: string;
  title: string;
  description: string;
};

type DeployOption = {
  id: string;
  title: string;
  description: string;
  cta: string;
  snippet?: string;
  comingSoon?: boolean;
};

type GuardrailDef = {
  id: string;
  title: string;
  description: string;
  defaultOn: boolean;
};

/* ── Data ──────────────────────────────────────────────────────────── */

const STEPS = [
  { key: 'job',        label: 'QMS Job',        question: 'What QMS job should this tool perform?' },
  { key: 'scope',      label: 'Requirements',    question: 'Which requirements should govern this tool?' },
  { key: 'evidence',   label: 'Required Data',   question: 'What required data can the tool use?' },
  { key: 'guardrails', label: 'Review Controls', question: 'What review controls apply?' },
  { key: 'output',     label: 'Output Package',  question: 'What should this tool produce?' },
  { key: 'deploy',     label: 'Connect',         question: 'How should this tool connect?' },
] as const;

const REGULATIONS_ALL = [
  'EU MDR',
  '21 CFR 820',
  'ISO 13485',
  'ISO 14971',
  'IMDRF',
  'UK MDR',
  'MDCG 2022-21',
];

const JOBS: Job[] = [
  {
    id: 'psur-compiler',
    title: 'PSUR Draft Package',
    description: 'Creates a PSUR draft with citations and required data coverage.',
    regulations: ['EU MDR', 'MDCG 2022-21'],
    risk: 'HIGH',
    outputType: 'Draft document + coverage matrix',
    timeEstimate: '~10 min',
    obligationIds: ['EU-MDR-ART85', 'EU-MDR-ART86', 'MDCG-2022-21-S6', 'MDCG-2022-21-S7', 'MDCG-2022-21-S8'],
    recommendedScope: ['EU MDR', 'MDCG 2022-21'],
    scopeDetail: 'EU MDR Articles 85-86 (PSUR content and submission), MDCG 2022-21 Sections 6-8 (structure, clinical data, benefit-risk)',
    evidenceRows: [
      { label: 'Post-market surveillance data', status: 'connected' },
      { label: 'Clinical evaluation references', status: 'connected' },
      { label: 'Complaint trend data', status: 'missing' },
      { label: 'Sales/distribution data', status: 'optional' },
      { label: 'CAPA history', status: 'optional' },
    ],
  },
  {
    id: 'complaint-triage',
    title: 'Complaint Review Assistant',
    description: 'Triage incoming complaints against regulatory timelines.',
    regulations: ['EU MDR', '21 CFR 820', 'ISO 13485'],
    risk: 'HIGH',
    outputType: 'Triage report + timeline',
    timeEstimate: '~5 min',
    obligationIds: ['EU-MDR-ART87', 'CFR820-803', 'ISO13485-8.2.2', 'ISO13485-8.5.1', 'EU-MDR-ART89'],
    recommendedScope: ['EU MDR', '21 CFR 820', 'ISO 13485'],
    scopeDetail: 'EU MDR Article 87 (reporting timelines), 21 CFR 803 (MDR decisioning), ISO 13485 Section 8.2.2 (customer feedback)',
    evidenceRows: [
      { label: 'Complaint trend data', status: 'connected' },
      { label: 'Sales/distribution data', status: 'connected' },
      { label: 'Risk management file', status: 'missing' },
      { label: 'CAPA history', status: 'missing' },
      { label: 'Clinical evaluation references', status: 'optional' },
    ],
  },
  {
    id: 'imdrf-coder',
    title: 'IMDRF Coding Assistant',
    description: 'Code adverse events with IMDRF Annexes A through G.',
    regulations: ['IMDRF'],
    risk: 'MEDIUM',
    outputType: 'Coded event + rationale',
    timeEstimate: '~3 min',
    obligationIds: ['IMDRF-ANNEX-A', 'IMDRF-ANNEX-B', 'IMDRF-ANNEX-C', 'IMDRF-ANNEX-D', 'IMDRF-ANNEX-E'],
    recommendedScope: ['IMDRF'],
    scopeDetail: 'IMDRF Annexes A through G (adverse event terminology, investigation type, health impact, device problem, component)',
    evidenceRows: [
      { label: 'Complaint trend data', status: 'connected' },
      { label: 'Risk management file', status: 'optional' },
      { label: 'Sales/distribution data', status: 'optional' },
      { label: 'CAPA history', status: 'optional' },
      { label: 'Clinical evaluation references', status: 'optional' },
    ],
  },
  {
    id: 'capa-evaluator',
    title: 'CAPA File Evaluator',
    description: 'Evaluate a CAPA against ISO 13485 and 21 CFR 820.',
    regulations: ['ISO 13485', '21 CFR 820'],
    risk: 'HIGH',
    outputType: 'Gap analysis + recommendations',
    timeEstimate: '~8 min',
    obligationIds: ['ISO13485-8.5.2', 'ISO13485-8.5.3', 'CFR820-100-A', 'CFR820-100-B', 'CFR820-198'],
    recommendedScope: ['ISO 13485', '21 CFR 820'],
    scopeDetail: 'ISO 13485 Sections 8.5.2-8.5.3 (corrective/preventive action), 21 CFR 820.100 (CAPA procedures)',
    evidenceRows: [
      { label: 'CAPA history', status: 'connected' },
      { label: 'Risk management file', status: 'connected' },
      { label: 'Complaint trend data', status: 'missing' },
      { label: 'Sales/distribution data', status: 'optional' },
      { label: 'Clinical evaluation references', status: 'optional' },
    ],
  },
  {
    id: 'pms-plan-builder',
    title: 'PMS Plan Builder',
    description: 'Generate a PMS plan per EU MDR Articles 83-86.',
    regulations: ['EU MDR'],
    risk: 'MEDIUM',
    outputType: 'PMS plan document',
    timeEstimate: '~12 min',
    obligationIds: ['EU-MDR-ART83', 'EU-MDR-ART84', 'EU-MDR-ART85', 'EU-MDR-ART86', 'EU-MDR-ANNIX-III'],
    recommendedScope: ['EU MDR'],
    scopeDetail: 'EU MDR Articles 83-86 (PMS system, plan, report, PSUR) and Annex III (technical documentation requirements)',
    evidenceRows: [
      { label: 'Post-market surveillance data', status: 'connected' },
      { label: 'Risk management file', status: 'connected' },
      { label: 'Clinical evaluation references', status: 'missing' },
      { label: 'Complaint trend data', status: 'optional' },
      { label: 'Sales/distribution data', status: 'optional' },
    ],
  },
  {
    id: 'risk-file-watcher',
    title: 'Risk File Watcher',
    description: 'Re-score a risk file when an input changes.',
    regulations: ['ISO 14971'],
    risk: 'MEDIUM',
    outputType: 'Risk delta report',
    timeEstimate: '~5 min',
    obligationIds: ['ISO14971-4.1', 'ISO14971-4.2', 'ISO14971-5.1', 'ISO14971-6.1', 'ISO14971-7.1'],
    recommendedScope: ['ISO 14971'],
    scopeDetail: 'ISO 14971 Sections 4-7 (risk analysis, evaluation, control, residual risk evaluation)',
    evidenceRows: [
      { label: 'Risk management file', status: 'connected' },
      { label: 'Clinical evaluation references', status: 'connected' },
      { label: 'Complaint trend data', status: 'optional' },
      { label: 'CAPA history', status: 'optional' },
      { label: 'Sales/distribution data', status: 'optional' },
    ],
  },
  {
    id: 'internal-audit-pack',
    title: 'Internal Audit Pack',
    description: 'Generate audit plan, checklist, and report scaffold.',
    regulations: ['ISO 13485'],
    risk: 'LOW',
    outputType: 'Audit package',
    timeEstimate: '~8 min',
    obligationIds: ['ISO13485-8.2.4', 'ISO13485-8.2.4-A', 'ISO13485-8.2.4-B', 'ISO13485-4.2.5', 'ISO13485-5.6.1'],
    recommendedScope: ['ISO 13485'],
    scopeDetail: 'ISO 13485 Section 8.2.4 (internal audit), Sections 4.2.5 and 5.6.1 (document control and management review)',
    evidenceRows: [
      { label: 'CAPA history', status: 'connected' },
      { label: 'Risk management file', status: 'connected' },
      { label: 'Complaint trend data', status: 'connected' },
      { label: 'Sales/distribution data', status: 'optional' },
      { label: 'Clinical evaluation references', status: 'optional' },
    ],
  },
];

const OUTPUT_FORMATS: OutputFormat[] = [
  { id: 'draft-doc',       title: 'Draft Document',       description: 'Structured document with sections, citations, and required data refs' },
  { id: 'coverage-matrix', title: 'Coverage Matrix',      description: 'Requirement x required data coverage grid' },
  { id: 'json-api',        title: 'JSON API Response',    description: 'Structured JSON for downstream systems' },
  { id: 'audit-pack',      title: 'Audit Pack',           description: 'Complete audit-ready package with decision trails' },
];

const DEPLOY_OPTIONS: DeployOption[] = [
  {
    id: 'sandbox',
    title: 'Sandbox Only',
    description: 'Test in the sandbox before connecting',
    cta: 'Run in sandbox',
  },
  {
    id: 'mcp-tool',
    title: 'MCP Tool',
    description: 'Expose as an MCP tool for Claude/Cursor/agents',
    cta: 'Copy config',
    snippet: `{
  "mcpServers": {
    "regground": {
      "command": "npx",
      "args": ["-y", "@regground/mcp-server"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687"
      }
    }
  }
}`,
  },
  {
    id: 'api-endpoint',
    title: 'API Endpoint',
    description: 'REST API endpoint for programmatic access',
    cta: 'Copy curl',
    snippet: `curl -X POST https://api.smarticus.ai/v1/agents/run \\
  -H "Authorization: Bearer sk-reg-..." \\
  -H "Content-Type: application/json" \\
  -d '{"agentId": "{{AGENT_ID}}", "input": {...}}'`,
  },
  {
    id: 'qms-connection',
    title: 'QMS Agent Connection',
    description: 'Connect directly to your QMS system',
    cta: 'Coming soon',
    comingSoon: true,
  },
];

const GUARDRAILS: GuardrailDef[] = [
  {
    id: 'qualification-gate',
    title: 'Readiness Check',
    description: 'Blocks execution if mandatory requirements lack required data',
    defaultOn: true,
  },
  {
    id: 'strict-output-schema',
    title: 'Output Check',
    description: 'Validates output structure before release',
    defaultOn: true,
  },
  {
    id: 'human-review-gate',
    title: 'Review Gate',
    description: 'Requires human approval before output is final',
    defaultOn: true,
  },
  {
    id: 'compliance-validator',
    title: 'Validation Check',
    description: '5-validator pipeline checks output against requirements',
    defaultOn: true,
  },
];

/* ── Helpers ──────────────────────────────────────────────────────── */

function riskBadgeClass(risk: RiskLevel): string {
  switch (risk) {
    case 'LOW':      return 'badge-ok';
    case 'MEDIUM':   return 'badge-warn';
    case 'HIGH':     return 'badge-signal';
    case 'CRITICAL': return 'badge-err';
  }
}

function evidenceBadgeClass(status: EvidenceRow['status']): string {
  switch (status) {
    case 'connected': return 'badge-ok';
    case 'missing':   return 'badge-err';
    case 'optional':  return 'badge-ink';
  }
}

/* ── Component ────────────────────────────────────────────────────── */

export function Builder() {
  const [step, setStep] = useState(0);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [scope, setScope] = useState<string[]>([]);
  const [guardrailState, setGuardrailState] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    GUARDRAILS.forEach((g) => { init[g.id] = g.defaultOn; });
    return init;
  });
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);
  const [selectedDeploy, setSelectedDeploy] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  /* Derived inspector data */
  const inspector = useMemo(() => {
    const obligationCount = selectedJob ? selectedJob.obligationIds.length : 0;
    const obligations = selectedJob ? selectedJob.obligationIds : [];
    const missingEvidence = selectedJob
      ? selectedJob.evidenceRows.filter((r) => r.status === 'missing')
      : [];
    const risk = selectedJob?.risk ?? null;
    const activeGates = GUARDRAILS.filter((g) => guardrailState[g.id]);
    const traceConfigured = guardrailState['compliance-validator'] || guardrailState['qualification-gate'];
    return { obligationCount, obligations, missingEvidence, risk, activeGates, traceConfigured };
  }, [selectedJob, guardrailState]);

  function isStepCompleted(idx: number): boolean {
    switch (idx) {
      case 0: return selectedJob !== null;
      case 1: return scope.length > 0;
      case 2: return selectedJob !== null;
      case 3: return true;
      case 4: return selectedOutput !== null;
      case 5: return selectedDeploy !== null;
      default: return false;
    }
  }

  function canAdvance(): boolean {
    return isStepCompleted(step);
  }

  function handleSelectJob(job: Job) {
    setSelectedJob(job);
    setScope(job.recommendedScope);
    if (job.id === 'internal-audit-pack') setSelectedOutput('audit-pack');
    else if (job.id === 'psur-compiler' || job.id === 'pms-plan-builder') setSelectedOutput('draft-doc');
    else setSelectedOutput('json-api');
  }

  function toggleScope(reg: string) {
    setScope((prev) =>
      prev.includes(reg) ? prev.filter((r) => r !== reg) : [...prev, reg]
    );
  }

  function recommendScope() {
    if (selectedJob) setScope(selectedJob.recommendedScope);
  }

  function toggleGuardrail(id: string) {
    setGuardrailState((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleCopySnippet(snippet: string, id: string) {
    navigator.clipboard.writeText(snippet).catch(() => {});
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  }

  function goNext() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      {/* Header */}
      <header
        style={{
          padding: '28px 32px 20px',
          borderBottom: '1px solid var(--rule)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Agent builder</div>
          <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.025em', margin: 0 }}>
            Build a QMS tool.
          </h1>
          <p style={{ marginTop: 6, color: 'var(--ink-3)', fontSize: 13.5, maxWidth: 600, margin: '6px 0 0' }}>
            Define what the tool does, which requirements govern it, and how it connects.
            Smarticus grounds every step in the requirements engine.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={goBack} style={{ fontSize: 13 }}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 && (
            <button
              className="btn btn-orange"
              onClick={goNext}
              disabled={!canAdvance()}
              style={{ fontSize: 13, opacity: canAdvance() ? 1 : 0.5 }}
            >
              Next: {STEPS[step + 1]?.label}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* 3-column layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr 300px',
          minHeight: 'calc(100vh - 120px)',
        }}
      >
        {/* ── Left sidebar: Stepper ── */}
        <aside
          style={{
            borderRight: '1px solid var(--rule)',
            padding: '24px 20px',
            background: 'var(--paper)',
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 16, fontSize: 10 }}>Steps</div>
          <div className="stepper">
            {STEPS.map((s, i) => {
              const completedPrior = i < step && isStepCompleted(i);
              const active = i === step;
              return (
                <button
                  key={s.key}
                  className="stepper-step"
                  onClick={() => {
                    if (i <= step) setStep(i);
                  }}
                  style={{
                    background: 'none',
                    border: 0,
                    cursor: i <= step ? 'pointer' : 'default',
                    textAlign: 'left',
                    width: '100%',
                    opacity: i > step ? 0.4 : 1,
                  }}
                >
                  <div
                    className={`stepper-dot ${active ? 'active' : completedPrior ? 'completed' : ''}`}
                  >
                    {completedPrior ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5.4l2.1 2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? 'var(--ink)' : completedPrior ? 'var(--ink-2)' : 'var(--ink-3)',
                        lineHeight: 1.3,
                      }}
                    >
                      {s.label}
                    </div>
                    {active && (
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2, lineHeight: 1.4 }}>
                        {s.question}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Progress bar */}
          <div
            style={{
              marginTop: 32,
              padding: '14px 0',
              borderTop: '1px solid var(--rule)',
            }}
          >
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 8 }}>Progress</div>
            <div
              style={{
                height: 4,
                background: 'var(--paper-edge)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(((step + (canAdvance() ? 1 : 0)) / STEPS.length) * 100)}%`,
                  height: '100%',
                  background: 'var(--orange)',
                  transition: 'width 0.3s var(--ease)',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 6 }}>
              {step + 1} of {STEPS.length}
              {selectedJob && <span> &middot; {selectedJob.title}</span>}
            </div>
          </div>
        </aside>

        {/* ── Center: Work canvas ── */}
        <section style={{ padding: '28px 36px', overflow: 'auto' }}>
          <div className="eyebrow" style={{ marginBottom: 6, fontSize: 10 }}>
            Step {step + 1} / {STEPS.length}
          </div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.015em',
              margin: '0 0 24px',
            }}
          >
            {STEPS[step].question}
          </h2>

          {/* ── Step 1: Job ── */}
          {step === 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 14,
              }}
            >
              {JOBS.map((job) => {
                const active = selectedJob?.id === job.id;
                return (
                  <div
                    key={job.id}
                    className={`ground-card ${active ? 'active' : ''} lift`}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
                    onClick={() => handleSelectJob(job)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{job.title}</h3>
                      <span className={`badge ${riskBadgeClass(job.risk)}`}>{job.risk}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                      {job.description}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {job.regulations.map((reg) => (
                        <span key={reg} className="badge badge-ink" style={{ fontSize: 9 }}>
                          {reg}
                        </span>
                      ))}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid var(--rule)',
                        paddingTop: 10,
                        marginTop: 2,
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        <span style={{ fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>OUTPUT</span>{' '}
                        {job.outputType}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: 'var(--ink-4)',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {job.timeEstimate}
                      </div>
                    </div>
                    <button
                      className={active ? 'btn btn-orange' : 'btn btn-ghost'}
                      style={{ fontSize: 12, padding: '8px 14px', width: '100%', justifyContent: 'center' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectJob(job);
                      }}
                    >
                      {active ? 'Selected' : 'Select'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 2: Scope ── */}
          {step === 1 && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
                {REGULATIONS_ALL.map((reg) => {
                  const active = scope.includes(reg);
                  return (
                    <button
                      key={reg}
                      onClick={() => toggleScope(reg)}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 999,
                        border: `1.5px solid ${active ? 'var(--orange)' : 'var(--rule-strong)'}`,
                        background: active ? 'var(--signal-soft)' : 'var(--paper)',
                        color: active ? 'var(--orange)' : 'var(--ink-2)',
                        cursor: 'pointer',
                        fontFamily: 'var(--mono)',
                        fontSize: 12,
                        fontWeight: 500,
                        letterSpacing: '0.06em',
                        transition: 'all var(--t-fast) var(--ease)',
                      }}
                    >
                      {active && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginRight: 6, verticalAlign: -1 }}>
                          <path d="M2 5.4l2.1 2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {reg}
                    </button>
                  );
                })}
              </div>

              <button
                className="btn btn-ghost"
                onClick={recommendScope}
                style={{ fontSize: 12, marginBottom: 24 }}
              >
                Recommend scope
              </button>

              {selectedJob && (
                <div
                  className="ground-card"
                  style={{ marginTop: 8, background: 'var(--paper-deep)' }}
                >
                  <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>
                    Scope recommendation
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                    For <strong style={{ color: 'var(--ink)' }}>{selectedJob.title}</strong>, Smarticus recommends:{' '}
                    <span style={{ color: 'var(--ink)' }}>{selectedJob.scopeDetail}</span>
                  </p>
                </div>
              )}

              {!selectedJob && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                  Select a job in Step 1 to see scope recommendations.
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Evidence ── */}
          {step === 2 && (
            <div>
              {selectedJob ? (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Required Data</th>
                        <th style={{ textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedJob.evidenceRows.map((row) => (
                        <tr key={row.label}>
                          <td style={{ fontSize: 14, color: 'var(--ink)' }}>{row.label}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`badge ${evidenceBadgeClass(row.status)}`}>
                              {row.status === 'connected' && (
                                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ verticalAlign: -1 }}>
                                  <path d="M2 5.4l2.1 2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                              {row.status === 'missing' && (
                                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ verticalAlign: -1 }}>
                                  <path d="M3 3l4 4M7 3l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                </svg>
                              )}
                              {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div
                    className="ground-card"
                    style={{
                      marginTop: 24,
                      background: 'var(--paper-deep)',
                      borderLeft: '3px solid var(--orange)',
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13.5,
                        color: 'var(--ink-2)',
                        lineHeight: 1.6,
                        fontStyle: 'italic',
                      }}
                    >
                      Smarticus will not fabricate required data it does not have.
                    </p>
                  </div>
                </>
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                  Select a job in Step 1 to see required data.
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Guardrails ── */}
          {step === 3 && (
            <div style={{ display: 'grid', gap: 14 }}>
              {GUARDRAILS.map((g) => {
                const on = guardrailState[g.id];
                return (
                  <div
                    key={g.id}
                    className={`ground-card ${on ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleGuardrail(g.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{g.title}</h3>
                        <span
                          className={`badge ${on ? 'badge-ok' : 'badge-ink'}`}
                          style={{ fontSize: 9 }}
                        >
                          {on ? 'ACTIVE' : 'OFF'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                        {g.description}
                      </p>
                    </div>

                    {/* Toggle switch */}
                    <div
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: on ? 'var(--orange)' : 'var(--paper-edge)',
                        position: 'relative',
                        flexShrink: 0,
                        transition: 'background var(--t-fast) var(--ease)',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGuardrail(g.id);
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: '#fff',
                          position: 'absolute',
                          top: 3,
                          left: on ? 23 : 3,
                          transition: 'left var(--t-fast) var(--ease)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 5: Output ── */}
          {step === 4 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {OUTPUT_FORMATS.map((fmt) => {
                const active = selectedOutput === fmt.id;
                return (
                  <div
                    key={fmt.id}
                    className={`ground-card ${active ? 'active' : ''} lift`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedOutput(fmt.id)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{fmt.title}</h3>
                      {active && (
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: 'var(--orange)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5.4l2.1 2L8 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                      {fmt.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 6: Deploy ── */}
          {step === 5 && (
            <div style={{ display: 'grid', gap: 14 }}>
              {DEPLOY_OPTIONS.map((opt) => {
                const active = selectedDeploy === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`ground-card ${active ? 'active' : ''}`}
                    style={{
                      cursor: opt.comingSoon ? 'default' : 'pointer',
                      opacity: opt.comingSoon ? 0.55 : 1,
                    }}
                    onClick={() => {
                      if (!opt.comingSoon) setSelectedDeploy(opt.id);
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{opt.title}</h3>
                      {opt.comingSoon && (
                        <span className="badge badge-ink" style={{ fontSize: 9 }}>
                          COMING SOON
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 12 }}>
                      {opt.description}
                    </p>

                    {opt.snippet && active && (
                      <pre
                        style={{
                          margin: '0 0 12px',
                          padding: 14,
                          fontSize: 11.5,
                          lineHeight: 1.55,
                          background: 'var(--paper-deep)',
                          border: '1px solid var(--rule)',
                          borderRadius: 'var(--r-2)',
                          overflow: 'auto',
                          maxHeight: 200,
                        }}
                      >
                        {opt.snippet}
                      </pre>
                    )}

                    {!opt.comingSoon && (
                      <button
                        className={active ? 'btn btn-orange' : 'btn btn-ghost'}
                        style={{ fontSize: 12, padding: '8px 14px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (opt.snippet) {
                            handleCopySnippet(opt.snippet, opt.id);
                          }
                          setSelectedDeploy(opt.id);
                        }}
                      >
                        {copiedSnippet === opt.id ? 'Copied!' : opt.cta}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Agent summary */}
              {selectedJob && (
                <div
                  className="ground-card"
                  style={{
                    marginTop: 12,
                    background: 'var(--paper-deep)',
                    borderLeft: '3px solid var(--orange)',
                  }}
                >
                  <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>
                    Agent summary
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                    <div>
                      <div style={{ color: 'var(--ink-4)', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 2 }}>
                        JOB
                      </div>
                      <div style={{ color: 'var(--ink)' }}>{selectedJob.title}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--ink-4)', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 2 }}>
                        SCOPE
                      </div>
                      <div style={{ color: 'var(--ink)' }}>{scope.join(', ') || 'None'}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--ink-4)', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 2 }}>
                        OUTPUT
                      </div>
                      <div style={{ color: 'var(--ink)' }}>
                        {OUTPUT_FORMATS.find((f) => f.id === selectedOutput)?.title ?? 'Not selected'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--ink-4)', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 2 }}>
                        REVIEW CONTROLS
                      </div>
                      <div style={{ color: 'var(--ink)' }}>
                        {GUARDRAILS.filter((g) => guardrailState[g.id]).length} of {GUARDRAILS.length} active
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Right sidebar: Regulatory Inspector ── */}
        <aside
          style={{
            borderLeft: '1px solid var(--rule)',
            background: 'var(--paper-deep)',
            padding: '24px 20px',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span className="pulse-orange" />
            <span className="eyebrow" style={{ color: 'var(--ink-2)', fontSize: 10 }}>
              QMS Inspector
            </span>
          </div>

          {/* Risk Level */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-4)', marginBottom: 6 }}>
              Risk level
            </div>
            {inspector.risk ? (
              <span className={`badge ${riskBadgeClass(inspector.risk)}`} style={{ fontSize: 11 }}>
                {inspector.risk}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>No job selected</span>
            )}
          </div>

          {/* Applicable Obligations */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-4)', marginBottom: 8 }}>
              Applicable Requirements
            </div>
            {inspector.obligationCount > 0 ? (
              <>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 400,
                    letterSpacing: '-0.03em',
                    color: 'var(--ink)',
                    lineHeight: 1,
                    marginBottom: 10,
                  }}
                >
                  {inspector.obligationCount}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inspector.obligations.slice(0, 5).map((id) => (
                    <div
                      key={id}
                      style={{
                        padding: '8px 10px',
                        borderLeft: '2px solid var(--orange)',
                        background: 'var(--paper)',
                        fontSize: 11,
                        fontFamily: 'var(--mono)',
                        letterSpacing: '0.04em',
                        color: 'var(--ink-2)',
                      }}
                    >
                      {id}
                    </div>
                  ))}
                  {inspector.obligationCount > 5 && (
                    <div style={{ fontSize: 11, color: 'var(--ink-4)', paddingLeft: 12 }}>
                      +{inspector.obligationCount - 5} more
                    </div>
                  )}
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Select a job to view</span>
            )}
          </div>

          <hr className="rule" style={{ margin: '0 0 20px' }} />

          {/* Missing Evidence */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-4)', marginBottom: 8 }}>
              Missing Required Data
            </div>
            {inspector.missingEvidence.length > 0 ? (
              <>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 400,
                    letterSpacing: '-0.03em',
                    color: 'var(--err)',
                    lineHeight: 1,
                    marginBottom: 10,
                  }}
                >
                  {inspector.missingEvidence.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inspector.missingEvidence.map((e) => (
                    <div
                      key={e.label}
                      style={{
                        padding: '6px 10px',
                        borderLeft: '2px solid var(--err)',
                        background: 'var(--paper)',
                        fontSize: 12,
                        color: 'var(--ink-2)',
                      }}
                    >
                      {e.label}
                    </div>
                  ))}
                </div>
              </>
            ) : selectedJob ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot-ok" />
                <span style={{ fontSize: 12, color: 'var(--ok)' }}>All required data connected</span>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Select a job to view</span>
            )}
          </div>

          <hr className="rule" style={{ margin: '0 0 20px' }} />

          {/* Review Gates */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-4)', marginBottom: 8 }}>
              Review Controls
            </div>
            {inspector.activeGates.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {inspector.activeGates.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--ink-2)',
                    }}
                  >
                    <span className="dot-ok" />
                    {g.title}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot-warn" />
                <span style={{ fontSize: 12, color: 'var(--warn)' }}>No review controls active</span>
              </div>
            )}
          </div>

          <hr className="rule" style={{ margin: '0 0 20px' }} />

          {/* Trace Status */}
          <div>
            <div className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-4)', marginBottom: 8 }}>
              Decision Trail Status
            </div>
            {inspector.traceConfigured ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="dot-ok" />
                <span style={{ color: 'var(--ok)' }}>Decision trail will be generated</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="dot-warn" />
                <span style={{ color: 'var(--warn)' }}>No decision trail configured</span>
              </div>
            )}
          </div>

          {/* Active scope */}
          {scope.length > 0 && (
            <>
              <hr className="rule" style={{ margin: '20px 0' }} />
              <div>
                <div className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-4)', marginBottom: 8 }}>
                  Active scope
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {scope.map((reg) => (
                    <span key={reg} className="badge badge-ink" style={{ fontSize: 9 }}>
                      {reg}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default Builder;
