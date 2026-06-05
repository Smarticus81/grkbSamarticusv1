/**
 * Saved Agents — manage and re-run the agents you saved from a Sandbox run.
 *
 * This page does ONE thing: list your saved agents and let you re-run, rename,
 * or delete them. Creating an agent happens in the Sandbox: run a process, then
 * "Save as agent" — that captures the exact input you used. Re-running here
 * replays that saved input in the Sandbox.
 *
 * (The `processS` catalog below is the single source the Sandbox uses to map a
 * task to its regulations/risk when saving an agent — it is exported, not
 * rendered here.)
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuthenticatedApi } from '../auth/useApi.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/EmptyState.js';

/* ── Types ─────────────────────────────────────────────────────────── */

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type EvidenceRow = { label: string; required: boolean };

export type process = {
  id: string;
  taskId: string;
  title: string;
  blurb: string;
  regulations: string[];
  risk: RiskLevel;
  obligationCount: number;
  evidenceRows: EvidenceRow[];
};

type AttachedFile = {
  filename: string;
  sizeBytes: number;
  content: string;
  contentType: string;
  attachedAt: string;
};

type SavedAgent = {
  id: string;
  name: string;
  processId: string;
  processTitle: string;
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

/* ── process catalog (shared with the Sandbox save-as-agent mapping) ─────── */

export const processS: process[] = [
  {
    id: 'psur-audit',
    taskId: 'template-compliance-evaluator',
    title: 'PSUR Content Review',
    blurb: 'Review whether a PSUR draft\u2019s content satisfies each MDCG 2022-21 / EU MDR Art. 86 obligation.',
    regulations: ['EU MDR', 'MDCG 2022-21'],
    risk: 'HIGH',
    obligationCount: 13,
    evidenceRows: [
      { label: 'PSUR draft content', required: true },
      { label: 'Post-market surveillance data', required: false },
      { label: 'Clinical evaluation references', required: false },
      { label: 'Sales/distribution data', required: false },
    ],
  },
  {
    id: 'psur-template-review',
    taskId: 'psur-template-reviewer',
    title: 'PSUR Template Reviewer',
    blurb: 'Cross-reference a proposed PSUR template (section outline) against the obligations before change control.',
    regulations: ['EU MDR', 'MDCG 2022-21'],
    risk: 'MEDIUM',
    obligationCount: 13,
    evidenceRows: [
      { label: 'Proposed template section outline', required: true },
      { label: 'Device context', required: false },
    ],
  },
  {
    id: 'complaint-triage',
    taskId: 'complaint-coder',
    title: 'Complaint Review Assistant',
    blurb: 'Triage complaints against EU MDR / 21 CFR 803 timelines.',
    regulations: ['EU MDR', '21 CFR 820', 'ISO 13485'],
    risk: 'HIGH',
    obligationCount: 6,
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
    obligationCount: 6,
    evidenceRows: [
      { label: 'Adverse event narrative', required: true },
      { label: 'Device problem code', required: false },
      { label: 'Patient outcome', required: false },
    ],
  },
  {
    id: 'risk-trend-watcher',
    taskId: 'trend-determination',
    title: 'Trend Determination',
    blurb: 'Spot trend signals across complaint or NC data.',
    regulations: ['ISO 14971', 'EU MDR'],
    risk: 'MEDIUM',
    obligationCount: 10,
    evidenceRows: [
      { label: 'Complaint trend data', required: true },
      { label: 'Risk management file', required: false },
    ],
  },
  {
    id: 'mir-drafter',
    taskId: 'mir-drafter',
    title: 'MIR Drafter',
    blurb: 'Draft a Manufacturer Incident Report for a reportable adverse event with the regional clock and required attachments.',
    regulations: ['EU MDR', '21 CFR 820', 'UK MDR'],
    risk: 'HIGH',
    obligationCount: 3,
    evidenceRows: [
      { label: 'Event narrative', required: true },
      { label: 'Device UDI / SRN', required: true },
      { label: 'Immediate actions taken', required: true },
      { label: 'IMDRF coding sheet', required: false },
    ],
  },
  {
    id: 'root-cause-investigator',
    taskId: 'root-cause-investigator',
    title: 'Root Cause Investigator',
    blurb: 'Draft a root cause analysis (5-whys + fishbone) from a problem statement and observations. Feeds a CAPA plan.',
    regulations: ['ISO 13485', '21 CFR 820'],
    risk: 'HIGH',
    obligationCount: 2,
    evidenceRows: [
      { label: 'Problem statement', required: true },
      { label: 'Observations / evidence', required: true },
      { label: 'Affected product / lot', required: true },
    ],
  },
  {
    id: 'capa-plan-drafter',
    taskId: 'capa-plan-drafter',
    title: 'CAPA Plan Drafter',
    blurb: 'Draft a corrective + preventive action plan with owners, due dates, and an effectiveness check.',
    regulations: ['ISO 13485', '21 CFR 820'],
    risk: 'HIGH',
    obligationCount: 5,
    evidenceRows: [
      { label: 'Root cause statement', required: true },
      { label: 'Affected scope', required: true },
      { label: 'Target due window (days)', required: true },
    ],
  },
  {
    id: 'nonconformance-dispositioner',
    taskId: 'nonconformance-dispositioner',
    title: 'Nonconformance Dispositioner',
    blurb: 'Recommend a disposition (rework / scrap / use-as-is / RTV / regrade) with rationale and signoff chain.',
    regulations: ['ISO 13485'],
    risk: 'MEDIUM',
    obligationCount: 3,
    evidenceRows: [
      { label: 'NC defect description', required: true },
      { label: 'Detection stage', required: true },
      { label: 'Risk-to-patient assessment', required: true },
    ],
  },
  {
    id: 'change-impact-assessor',
    taskId: 'change-impact-assessor',
    title: 'Change Impact Assessor',
    blurb: 'Determine the regulatory pathway triggered by a proposed change (510(k) supplement, notified body notification, letter-to-file).',
    regulations: ['ISO 13485', 'EU MDR', '21 CFR 807'],
    risk: 'HIGH',
    obligationCount: 2,
    evidenceRows: [
      { label: 'Change description', required: true },
      { label: 'Product classification', required: true },
      { label: 'Target regions', required: true },
    ],
  },
  {
    id: 'audit-finding-drafter',
    taskId: 'audit-finding-drafter',
    title: 'Audit Finding Drafter',
    blurb: 'Draft a formal internal audit finding (statement, clause citation, evidence summary, response clock) from an auditor observation.',
    regulations: ['ISO 13485'],
    risk: 'MEDIUM',
    obligationCount: 5,
    evidenceRows: [
      { label: 'Auditor observation', required: true },
      { label: 'Clause observed', required: true },
      { label: 'Evidence references', required: true },
    ],
  },
];

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

const RISK_COLOR: Record<'low' | 'medium' | 'high', string> = {
  high: 'var(--orange)',
  medium: 'var(--ink-2)',
  low: 'var(--ink-3)',
};

/* ── Helpers ───────────────────────────────────────────────────────── */

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** A short, human description of the input saved with this agent. */
function inputSummary(a: SavedAgent): string | null {
  const input = a.attachedData?.['__input'];
  if (input && typeof input.content === 'string') {
    try {
      const obj = JSON.parse(input.content) as unknown;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const keys = Object.keys(obj as Record<string, unknown>);
        if (keys.length) {
          return `Saved input · ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? '…' : ''}`;
        }
      }
    } catch {
      /* fall through */
    }
    return 'Saved input';
  }
  const slots = Object.keys(a.attachedData ?? {}).filter((k) => k !== '__input' && k !== '__context');
  return slots.length ? `${slots.length} attached item${slots.length === 1 ? '' : 's'}` : null;
}

/* ── Component ─────────────────────────────────────────────────────── */

export function Builder() {
  const [, navigate] = useLocation();
  const { api } = useAuthenticatedApi();

  const [agents, setAgents] = useState<SavedAgent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const refresh = async () => {
    try {
      setAgents(await api<SavedAgent[]>('/api/builder/agents'));
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  async function runAgent(a: SavedAgent) {
    if (!a.taskId) {
      setToast('This agent has no runnable process mapped.');
      return;
    }
    setBusy(`run:${a.id}`);
    try {
      const launch = await api<{ taskId: string; input: unknown }>(
        `/api/builder/agents/${a.id}/launch`,
        { method: 'POST' },
      );
      try {
        sessionStorage.setItem(`builder:input:${launch.taskId}`, JSON.stringify(launch.input ?? {}));
      } catch {
        /* sessionStorage may be blocked */
      }
      navigate(`/app/sandbox/${launch.taskId}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not open agent.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: SavedAgent) {
    if (!confirm(`Delete "${a.name}"? This can't be undone.`)) return;
    setBusy(`del:${a.id}`);
    try {
      await api<void>(`/api/builder/agents/${a.id}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(null);
    }
  }

  function startRename(a: SavedAgent) {
    setRenamingId(a.id);
    setRenameValue(a.name);
  }

  async function saveRename(a: SavedAgent) {
    const name = renameValue.trim();
    if (!name || name === a.name) {
      setRenamingId(null);
      return;
    }
    setBusy(`rename:${a.id}`);
    try {
      await api<SavedAgent>(`/api/builder/agents/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setRenamingId(null);
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Rename failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        eyebrow="Saved agents"
        title="Your saved agents."
        subtitle="An agent is a process saved with the exact input you used, so you can re-run it anytime. Create one by running a process in the sandbox and choosing 'Save as agent'."
        actions={
          <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')} style={{ fontSize: 13 }}>
            Run a process
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        }
      />

      <div style={{ padding: '24px 40px 80px', maxWidth: 1100, margin: '0 auto' }}>
        {toast && (
          <div
            onClick={() => setToast(null)}
            style={{
              padding: '8px 12px',
              marginBottom: 16,
              background: 'var(--paper-deep)',
              border: '1px solid var(--rule-strong)',
              borderRadius: 6,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            {toast}
          </div>
        )}

        {agents === null && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
        )}

        {agents !== null && agents.length === 0 && (
          <EmptyState
            eyebrow="No saved agents yet"
            title="Save a process once, re-run it forever."
            body="Run any process in the sandbox, fill in your data, then click 'Save as agent'. It will appear here so you can re-run it with one click."
            primaryAction={{ label: 'Run a process', href: '/app/sandbox' }}
          />
        )}

        {agents !== null && agents.length > 0 && (
          <>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              {agents.length} agent{agents.length === 1 ? '' : 's'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {agents.map((a) => {
                const summary = inputSummary(a);
                const renaming = renamingId === a.id;
                const runnable = !!a.taskId;
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: 16,
                      border: '1px solid var(--rule)',
                      borderRadius: 10,
                      background: '#fff',
                    }}
                  >
                    {/* Name / rename */}
                    {renaming ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveRename(a);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontFamily: 'var(--sans)',
                            fontSize: 15,
                            fontWeight: 600,
                            color: 'var(--ink)',
                            background: '#fff',
                            border: '1px solid var(--rule-strong)',
                            borderRadius: 6,
                            padding: '6px 8px',
                          }}
                        />
                        <button className="btn btn-ghost" onClick={() => void saveRename(a)} disabled={busy === `rename:${a.id}`} style={{ fontSize: 12 }}>
                          Save
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.name}
                        </div>
                        <button
                          onClick={() => startRename(a)}
                          title="Rename"
                          style={{ background: 'none', border: 0, color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                        >
                          Rename
                        </button>
                      </div>
                    )}

                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{a.processTitle}</div>

                    {/* Regulations + risk */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.regulations.slice(0, 4).map((r) => (
                        <span key={r} style={PILL}>{r}</span>
                      ))}
                      <span style={{ ...PILL, color: RISK_COLOR[a.riskBand], borderColor: a.riskBand === 'high' ? 'var(--orange)' : 'var(--rule-strong)' }}>
                        {a.riskBand} risk
                      </span>
                    </div>

                    {summary && (
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>{summary}</div>
                    )}

                    <div style={{ flex: 1 }} />

                    {/* Footer: timestamp + actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
                        saved {relTime(a.updatedAt)}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          onClick={() => void remove(a)}
                          disabled={busy === `del:${a.id}`}
                          style={{ fontSize: 12 }}
                        >
                          Delete
                        </button>
                        <button
                          className="btn btn-orange"
                          onClick={() => void runAgent(a)}
                          disabled={!runnable || busy === `run:${a.id}`}
                          title={runnable ? 'Re-run this agent with its saved input' : 'No runnable process mapped'}
                          style={{ fontSize: 12, opacity: runnable ? 1 : 0.5 }}
                        >
                          {busy === `run:${a.id}` ? 'Opening…' : 'Run →'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Builder;
