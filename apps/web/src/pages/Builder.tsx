/**
 * Builder — minimalist single-agent canvas.
 *
 * - Left rail (240px): "My agents" list + "+ New agent".
 * - Center canvas (max-w 760px): one agent at a time.
 *     Job picker → Required data slots (attach text/JSON) → Controls → Run in Sandbox.
 *
 * No wizard, no stepper. Save persists to /api/builder/agents.
 * Attachments persist via PATCH /api/builder/agents/:id/attach (text/JSON only,
 * 2MB cap). Run in Sandbox calls POST /:id/launch and navigates to the sandbox
 * task page where the resolved input is pre-filled.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api } from '../lib/queryClient.js';

/* ── Types ─────────────────────────────────────────────────────────── */

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type EvidenceRow = { label: string; required: boolean };

type Job = {
  id: string;
  /** Sandbox task id this job runs against. null = no runner yet. */
  taskId: string | null;
  title: string;
  blurb: string;
  regulations: string[];
  risk: RiskLevel;
  obligationCount: number;
  evidenceRows: EvidenceRow[];
};

type SavedAgent = {
  id: string;
  name: string;
  jobId: string;
  jobTitle: string;
  taskId: string | null;
  regulations: string[];
  evidenceStatus: Record<string, string>;
  attachedData: Record<string, AttachedFile>;
  guardrails: Record<string, boolean>;
  outputFormat: string | null;
  deployTarget: string | null;
  riskBand: 'low' | 'medium' | 'high';
  description: string | null;
  updatedAt: string;
};

type AttachedFile = {
  filename: string;
  sizeBytes: number;
  content: string;
  contentType: string;
  attachedAt: string;
};

/* ── Job catalog ───────────────────────────────────────────────────── */

const JOBS: Job[] = [
  {
    id: 'psur-compiler',
    taskId: 'psur-section-drafter',
    title: 'PSUR Draft Package',
    blurb: 'Draft a PSUR with citations and required-data coverage.',
    regulations: ['EU MDR', 'MDCG 2022-21'],
    risk: 'HIGH',
    obligationCount: 5,
    evidenceRows: [
      { label: 'Post-market surveillance data', required: true },
      { label: 'Clinical evaluation references', required: true },
      { label: 'Complaint trend data', required: true },
      { label: 'Sales/distribution data', required: false },
      { label: 'CAPA history', required: false },
    ],
  },
  {
    id: 'complaint-triage',
    taskId: 'complaint-coder',
    title: 'Complaint Review Assistant',
    blurb: 'Triage complaints against EU MDR / 21 CFR 803 timelines.',
    regulations: ['EU MDR', '21 CFR 820', 'ISO 13485'],
    risk: 'HIGH',
    obligationCount: 5,
    evidenceRows: [
      { label: 'Complaint record', required: true },
      { label: 'Sales/distribution data', required: true },
      { label: 'Risk management file', required: false },
      { label: 'CAPA history', required: false },
    ],
  },
  {
    id: 'imdrf-coder',
    taskId: 'ae-reportability',
    title: 'IMDRF Coding Assistant',
    blurb: 'Code adverse events with IMDRF Annexes A–G.',
    regulations: ['IMDRF'],
    risk: 'MEDIUM',
    obligationCount: 5,
    evidenceRows: [
      { label: 'Adverse event narrative', required: true },
      { label: 'Device problem code', required: false },
      { label: 'Patient outcome', required: false },
    ],
  },
  {
    id: 'capa-evaluator',
    taskId: 'template-compliance-evaluator',
    title: 'CAPA File Evaluator',
    blurb: 'Evaluate a CAPA against ISO 13485 / 21 CFR 820.100.',
    regulations: ['ISO 13485', '21 CFR 820'],
    risk: 'HIGH',
    obligationCount: 5,
    evidenceRows: [
      { label: 'CAPA record', required: true },
      { label: 'Root cause analysis', required: true },
      { label: 'Effectiveness check', required: false },
    ],
  },
  {
    id: 'risk-trend-watcher',
    taskId: 'trend-determination',
    title: 'Trend Determination',
    blurb: 'Spot trend signals across complaint or NC data.',
    regulations: ['ISO 14971', 'EU MDR'],
    risk: 'MEDIUM',
    obligationCount: 4,
    evidenceRows: [
      { label: 'Complaint trend data', required: true },
      { label: 'Risk management file', required: false },
    ],
  },
  {
    id: 'pms-plan-builder',
    taskId: null,
    title: 'PMS Plan Builder',
    blurb: 'Generate a PMS plan per EU MDR Articles 83–86. (Sandbox runner coming soon.)',
    regulations: ['EU MDR'],
    risk: 'MEDIUM',
    obligationCount: 5,
    evidenceRows: [
      { label: 'Post-market surveillance data', required: true },
      { label: 'Risk management file', required: true },
      { label: 'Clinical evaluation references', required: true },
    ],
  },
  {
    id: 'internal-audit-pack',
    taskId: null,
    title: 'Internal Audit Pack',
    blurb: 'Generate audit plan, checklist, and report scaffold. (Sandbox runner coming soon.)',
    regulations: ['ISO 13485'],
    risk: 'LOW',
    obligationCount: 5,
    evidenceRows: [
      { label: 'CAPA history', required: true },
      { label: 'Risk management file', required: false },
      { label: 'Complaint trend data', required: false },
    ],
  },
];

const GUARDRAILS = [
  { id: 'qualification', label: 'Readiness check', detail: 'Block runs that lack required evidence.' },
  { id: 'compliance',    label: 'Compliance check', detail: 'Validate output against bound obligations.' },
  { id: 'review-gate',   label: 'Human review gate', detail: 'Pause for sign-off before output is released.' },
  { id: 'strict-schema', label: 'Strict output schema', detail: 'Reject malformed agent output.' },
] as const;

const OUTPUT_FORMATS = [
  { id: 'draft-doc',       label: 'Draft document' },
  { id: 'coverage-matrix', label: 'Coverage matrix' },
  { id: 'json-api',        label: 'JSON response' },
  { id: 'audit-pack',      label: 'Audit pack' },
] as const;

/* ── Tokens ────────────────────────────────────────────────────────── */

const PILL: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 8px',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-2)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 11,
  background: 'transparent',
};

const RISK_COLOR: Record<RiskLevel, string> = {
  HIGH: 'var(--orange)',
  MEDIUM: 'var(--ink-2)',
  LOW: 'var(--ink-3)',
};

/* ── Component ─────────────────────────────────────────────────────── */

export function Builder() {
  const [, navigate] = useLocation();

  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Working draft (not yet saved). When activeId is set, this mirrors the saved agent.
  const [name, setName] = useState('Untitled agent');
  const [jobId, setJobId] = useState<string | null>(null);
  const [evidenceStatus, setEvidenceStatus] = useState<Record<string, string>>({});
  const [attachedData, setAttachedData] = useState<Record<string, AttachedFile>>({});
  const [guardrails, setGuardrails] = useState<Record<string, boolean>>({
    qualification: true,
    compliance: true,
    'review-gate': false,
    'strict-schema': true,
  });
  const [outputFormat, setOutputFormat] = useState<string | null>('draft-doc');

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const job = useMemo(() => JOBS.find((j) => j.id === jobId) ?? null, [jobId]);

  /* ── load saved ── */
  const refresh = async () => {
    try {
      const rows = await api<SavedAgent[]>('/api/builder/agents');
      setAgents(rows);
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  function loadAgent(a: SavedAgent) {
    setActiveId(a.id);
    setName(a.name);
    setJobId(a.jobId);
    setEvidenceStatus(a.evidenceStatus ?? {});
    setAttachedData(a.attachedData ?? {});
    setGuardrails({
      qualification: a.guardrails?.qualification ?? true,
      compliance: a.guardrails?.compliance ?? true,
      'review-gate': a.guardrails?.['review-gate'] ?? false,
      'strict-schema': a.guardrails?.['strict-schema'] ?? true,
    });
    setOutputFormat(a.outputFormat ?? 'draft-doc');
  }

  function newAgent() {
    setActiveId(null);
    setName('Untitled agent');
    setJobId(null);
    setEvidenceStatus({});
    setAttachedData({});
    setGuardrails({
      qualification: true,
      compliance: true,
      'review-gate': false,
      'strict-schema': true,
    });
    setOutputFormat('draft-doc');
  }

  /* ── save ── */
  async function save() {
    if (!job) {
      setToast('Pick a job first.');
      return;
    }
    setBusy('save');
    try {
      const riskBand: 'low' | 'medium' | 'high' =
        job.risk === 'HIGH' ? 'high' : job.risk === 'LOW' ? 'low' : 'medium';
      const payload = {
        name: name.trim() || 'Untitled agent',
        jobId: job.id,
        jobTitle: job.title,
        taskId: job.taskId,
        regulations: job.regulations,
        evidenceStatus,
        guardrails,
        outputFormat,
        deployTarget: 'sandbox',
        riskBand,
        description: job.blurb,
      };
      const saved = await api<SavedAgent>('/api/builder/agents', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setActiveId(saved.id);
      // Pull canonical row so attachedData is in sync
      const fresh = await api<SavedAgent>(`/api/builder/agents/${saved.id}`);
      setAttachedData(fresh.attachedData ?? {});
      await refresh();
      setToast('Saved.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(null);
    }
  }

  /* ── attach data ── */
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function ensureAgentId(): Promise<string | null> {
    if (activeId) return activeId;
    // Auto-save first so we have an id to attach against.
    await save();
    return activeId; // Set by save()
  }

  async function attach(slot: string, file: File) {
    if (file.size > 2_000_000) {
      setToast('File too large (2 MB cap).');
      return;
    }
    const id = activeId ?? (await new Promise<string | null>((r) => {
      // Two-phase: save then resolve via state propagation.
      void save().then(() => r(null));
    }));
    void id;
    // Refetch the latest activeId after save
    const currentId = activeId;
    if (!currentId) {
      setToast('Save the agent first, then attach data.');
      return;
    }
    setBusy(`attach:${slot}`);
    try {
      const text = await file.text();
      const updated = await api<SavedAgent>(`/api/builder/agents/${currentId}/attach`, {
        method: 'PATCH',
        body: JSON.stringify({
          slot,
          filename: file.name,
          content: text,
          contentType: file.type || (file.name.endsWith('.json') ? 'application/json' : 'text/plain'),
        }),
      });
      setAttachedData(updated.attachedData ?? {});
      setEvidenceStatus(updated.evidenceStatus ?? {});
      setToast(`Attached ${file.name}.`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Attach failed.');
    } finally {
      setBusy(null);
    }
  }

  async function detach(slot: string) {
    if (!activeId) return;
    setBusy(`detach:${slot}`);
    try {
      const updated = await api<SavedAgent>(
        `/api/builder/agents/${activeId}/attach/${encodeURIComponent(slot)}`,
        { method: 'DELETE' },
      );
      setAttachedData(updated.attachedData ?? {});
      setEvidenceStatus(updated.evidenceStatus ?? {});
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Remove failed.');
    } finally {
      setBusy(null);
    }
  }

  /* ── delete saved agent ── */
  async function remove(id: string) {
    if (!confirm('Delete this agent?')) return;
    setBusy(`del:${id}`);
    try {
      await api<void>(`/api/builder/agents/${id}`, { method: 'DELETE' });
      if (activeId === id) newAgent();
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(null);
    }
  }

  /* ── launch ── */
  const missingRequired = useMemo(() => {
    if (!job) return [];
    return job.evidenceRows.filter((r) => r.required && !attachedData[r.label]);
  }, [job, attachedData]);

  async function runInSandbox() {
    if (!job) return;
    if (!job.taskId) {
      setToast('No sandbox runner for this job yet.');
      return;
    }
    if (missingRequired.length > 0) {
      setToast(`Attach required data first: ${missingRequired.map((r) => r.label).join(', ')}`);
      return;
    }
    if (!activeId) {
      await save();
    }
    const id = activeId;
    if (!id) return;
    setBusy('launch');
    try {
      const launch = await api<{ taskId: string; input: unknown }>(
        `/api/builder/agents/${id}/launch`,
        { method: 'POST' },
      );
      // Cache the merged input for Sandbox to pick up.
      try {
        sessionStorage.setItem(
          `builder:input:${launch.taskId}`,
          JSON.stringify(launch.input ?? {}),
        );
      } catch { /* sessionStorage may be blocked */ }
      navigate(`/app/sandbox/${launch.taskId}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Launch failed.');
    } finally {
      setBusy(null);
    }
  }

  /* ── UI ──────────────────────────────────────────────────────────── */

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        minHeight: 'calc(100vh - 64px)',
        background: 'var(--paper)',
      }}
    >
      {/* ── Left rail: My agents ── */}
      <aside
        style={{
          borderRight: '1px solid var(--rule)',
          padding: '24px 16px',
          background: 'var(--paper-deep)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            padding: '0 8px 12px',
          }}
        >
          My agents
        </div>

        <button
          onClick={newAgent}
          style={{
            textAlign: 'left',
            padding: '10px 12px',
            background: activeId === null ? 'var(--ink)' : 'transparent',
            color: activeId === null ? 'var(--paper)' : 'var(--ink-2)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 8,
            fontFamily: 'var(--sans)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + New agent
        </button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            marginTop: 8,
            overflowY: 'auto',
          }}
        >
          {agents.length === 0 && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--ink-4)',
                padding: '12px 8px',
                lineHeight: 1.5,
              }}
            >
              No saved agents yet.
            </div>
          )}
          {agents.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 4,
                background: activeId === a.id ? 'var(--paper)' : 'transparent',
                border: '1px solid',
                borderColor: activeId === a.id ? 'var(--ink)' : 'transparent',
                borderRadius: 8,
              }}
            >
              <button
                onClick={() => loadAgent(a)}
                title={a.name}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  color: 'var(--ink)',
                  border: 'none',
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ fontWeight: 500 }}>{a.name}</div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--ink-3)',
                    marginTop: 2,
                  }}
                >
                  {a.jobTitle}
                </div>
              </button>
              <button
                onClick={() => remove(a.id)}
                disabled={busy === `del:${a.id}`}
                title="Delete"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--ink-4)',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  fontSize: 14,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Center canvas ── */}
      <main
        style={{
          padding: '40px 48px 80px',
          maxWidth: 760,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px dashed var(--rule-strong)',
              color: 'var(--ink)',
              fontFamily: 'var(--sans)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={save}
              disabled={busy === 'save' || !job}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid var(--ink)',
                color: 'var(--ink)',
                borderRadius: 6,
                fontFamily: 'var(--sans)',
                fontSize: 13,
                cursor: job ? 'pointer' : 'not-allowed',
                opacity: !job ? 0.4 : 1,
              }}
            >
              {busy === 'save' ? 'Saving…' : activeId ? 'Save' : 'Save as new'}
            </button>
            <button
              onClick={runInSandbox}
              disabled={!job?.taskId || busy === 'launch' || missingRequired.length > 0}
              style={{
                padding: '8px 16px',
                background: !job?.taskId || missingRequired.length > 0 ? 'var(--paper-deep)' : 'var(--ink)',
                border: '1px solid var(--ink)',
                color: !job?.taskId || missingRequired.length > 0 ? 'var(--ink-3)' : 'var(--paper)',
                borderRadius: 6,
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: 600,
                cursor: !job?.taskId || missingRequired.length > 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {busy === 'launch' ? 'Launching…' : 'Run in sandbox →'}
            </button>
          </div>
        </header>

        {toast && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--paper-deep)',
              border: '1px solid var(--rule-strong)',
              borderRadius: 6,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-2)',
            }}
            onClick={() => setToast(null)}
          >
            {toast}
          </div>
        )}

        {/* Section: Job */}
        <Section
          label="Job"
          subtitle={job ? job.blurb : 'Pick the job this agent performs.'}
        >
          {!job ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {JOBS.map((j) => (
                <button
                  key={j.id}
                  onClick={() => setJobId(j.id)}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    background: 'var(--paper)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{j.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{j.blurb}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    <span style={{ ...PILL, color: RISK_COLOR[j.risk], borderColor: RISK_COLOR[j.risk] }}>
                      {j.risk}
                    </span>
                    {!j.taskId && <span style={PILL}>no runner</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                border: '1px solid var(--rule-strong)',
                borderRadius: 8,
                background: 'var(--paper-deep)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{job.title}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...PILL, color: RISK_COLOR[job.risk], borderColor: RISK_COLOR[job.risk] }}>
                    {job.risk}
                  </span>
                  {job.regulations.map((r) => (
                    <span key={r} style={PILL}>{r}</span>
                  ))}
                  <span style={PILL}>{job.obligationCount} obligations</span>
                  {!job.taskId && <span style={{ ...PILL, color: 'var(--orange)', borderColor: 'var(--orange)' }}>no runner</span>}
                </div>
              </div>
              <button
                onClick={() => setJobId(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 6,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--sans)',
                  fontSize: 12,
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                Change
              </button>
            </div>
          )}
        </Section>

        {/* Section: Required data */}
        {job && (
          <Section
            label="Required data"
            subtitle="Attach the inputs the agent needs. Required slots block runs until filled."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {job.evidenceRows.map((row) => {
                const attached = attachedData[row.label];
                const status = attached ? 'connected' : row.required ? 'missing' : 'optional';
                const statusColor =
                  status === 'connected' ? 'var(--ink)' :
                  status === 'missing'   ? 'var(--orange)' :
                                           'var(--ink-4)';
                return (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      border: '1px solid var(--rule-strong)',
                      borderRadius: 8,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: statusColor,
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{row.label}</span>
                        {row.required && (
                          <span
                            style={{
                              fontFamily: 'var(--mono)',
                              fontSize: 9,
                              color: 'var(--ink-4)',
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                            }}
                          >
                            required
                          </span>
                        )}
                      </div>
                      {attached && (
                        <div
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 10,
                            color: 'var(--ink-3)',
                            paddingLeft: 16,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {attached.filename} · {(attached.sizeBytes / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <input
                        ref={(el) => { fileRefs.current[row.label] = el; }}
                        type="file"
                        accept=".json,.txt,.md,.csv,application/json,text/plain,text/markdown,text/csv"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void attach(row.label, f);
                          e.target.value = '';
                        }}
                      />
                      <button
                        onClick={() => fileRefs.current[row.label]?.click()}
                        disabled={busy === `attach:${row.label}` || !activeId && !job}
                        title={!activeId ? 'Save the agent first to enable attachments.' : ''}
                        style={{
                          padding: '5px 10px',
                          background: 'transparent',
                          border: '1px solid var(--rule-strong)',
                          borderRadius: 5,
                          fontFamily: 'var(--sans)',
                          fontSize: 12,
                          color: 'var(--ink-2)',
                          cursor: 'pointer',
                        }}
                      >
                        {busy === `attach:${row.label}` ? '…' : attached ? 'Replace' : 'Attach'}
                      </button>
                      {attached && (
                        <button
                          onClick={() => detach(row.label)}
                          style={{
                            padding: '5px 8px',
                            background: 'transparent',
                            border: '1px solid var(--rule-strong)',
                            borderRadius: 5,
                            fontFamily: 'var(--sans)',
                            fontSize: 12,
                            color: 'var(--ink-3)',
                            cursor: 'pointer',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!activeId && (
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--ink-3)',
                    padding: '4px 2px',
                  }}
                >
                  Save the agent first — attachments are persisted against the saved record.
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--ink-4)', margin: '4px 2px 0', lineHeight: 1.5 }}>
                Plain text, JSON, CSV, or Markdown · 2 MB cap per slot.
              </p>
            </div>
          </Section>
        )}

        {/* Section: Controls */}
        {job && (
          <Section label="Review controls" subtitle="Gates the runtime applies on every run.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {GUARDRAILS.map((g) => (
                <label
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!guardrails[g.id]}
                    onChange={(e) =>
                      setGuardrails((s) => ({ ...s, [g.id]: e.target.checked }))
                    }
                    style={{ accentColor: 'var(--ink)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{g.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{g.detail}</div>
                  </div>
                </label>
              ))}
            </div>
          </Section>
        )}

        {/* Section: Output format */}
        {job && (
          <Section label="Output" subtitle="Shape of the deliverable.">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {OUTPUT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOutputFormat(f.id)}
                  style={{
                    padding: '8px 14px',
                    background: outputFormat === f.id ? 'var(--ink)' : 'transparent',
                    color: outputFormat === f.id ? 'var(--paper)' : 'var(--ink-2)',
                    border: '1px solid',
                    borderColor: outputFormat === f.id ? 'var(--ink)' : 'var(--rule-strong)',
                    borderRadius: 6,
                    fontFamily: 'var(--sans)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({
  label,
  subtitle,
  children,
}: {
  label: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          {label}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export default Builder;
