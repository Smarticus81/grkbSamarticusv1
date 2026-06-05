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

import { useEffect, useRef, useState } from 'react';
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

type ProviderRuntime = {
  provider: 'claude-managed-agents';
  agentId: string;
  agentVersion: number;
  environmentId: string;
  deployedAt: string;
} | null;

type ManagedRun = {
  id: string;
  status: 'deploying' | 'running' | 'idle' | 'completed' | 'failed';
  externalSessionId: string | null;
  inputSnapshot: { message?: string };
  outputSnapshot: { text?: string; error?: string };
  createdAt: string;
  finishedAt: string | null;
};

type ManagedEvent = {
  type: string;
  content?: Array<{ type: string; text: string }>;
  name?: string;
  error?: string;
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
  providerRuntime: ProviderRuntime;
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

function runtimeLabel(a: SavedAgent): string {
  return a.providerRuntime?.agentId ? 'Claude cloud live' : 'Claude cloud ready';
}

function runtimeDescription(a: SavedAgent): string {
  return a.providerRuntime?.agentId
    ? 'Provisioned as a Claude Managed Agent with a cloud environment and session streaming.'
    : 'Configured for Claude Managed Agents. Deploy once, then start live sessions from this card.';
}

function runtimeTone(a: SavedAgent): { border: string; background: string; accent: string } {
  return a.providerRuntime?.agentId
    ? { border: 'rgba(37, 99, 235, 0.35)', background: 'linear-gradient(135deg, #fff 0%, #f5f8ff 100%)', accent: '#2563eb' }
    : { border: 'rgba(255, 115, 0, 0.32)', background: 'linear-gradient(135deg, #fff 0%, #fff8f2 100%)', accent: 'var(--orange)' };
}

/* ── Component ─────────────────────────────────────────────────────── */

export function Builder() {
  const [, navigate] = useLocation();
  const { api, streamSse } = useAuthenticatedApi();

  const [agents, setAgents] = useState<SavedAgent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Managed agents state
  const [activeRunAgent, setActiveRunAgent] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState('');
  const [streamEvents, setStreamEvents] = useState<ManagedEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    try {
      setAgents(await api<SavedAgent[]>('/api/builder/agents'));
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    void refresh();
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

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

  // ── Managed Agents: deploy ──────────────────────────────────────
  async function deployAgent(a: SavedAgent) {
    setBusy(`deploy:${a.id}`);
    try {
      await api<unknown>(`/api/builder/agents/${a.id}/deploy`, { method: 'POST', body: '{}' });
      setToast(`Deployed "${a.name}" to Claude Managed Agents.`);
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Deploy failed.');
    } finally {
      setBusy(null);
    }
  }

  // ── Managed Agents: start session + stream ─────────────────────
  async function startManagedRun(a: SavedAgent) {
    const msg = runMessage.trim();
    if (!msg) {
      setToast('Enter a message for the agent.');
      return;
    }
    if (!a.providerRuntime?.agentId) {
      setToast('Deploy this agent before starting a managed session.');
      return;
    }
    setBusy(`mrun:${a.id}`);
    setStreamEvents([]);
    setStreaming(true);
    streamAbortRef.current?.abort();
    try {
      const run = await api<ManagedRun>(`/api/builder/agents/${a.id}/runs`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });

      const controller = new AbortController();
      streamAbortRef.current = controller;
      const eventTypes = new Set([
        'agent.message', 'agent.tool_use', 'agent.tool_result',
        'session.status_idle', 'session.status_failed',
      ]);

      await streamSse(`/api/builder/agents/${a.id}/runs/${run.id}/stream`, {
        signal: controller.signal,
        onEvent: ({ event, data }) => {
          if (event === 'stream.end') return;
          if (event === 'stream.error') {
            try {
              const parsed = JSON.parse(data) as { error?: string };
              setToast(parsed.error ?? 'Managed session stream failed.');
            } catch {
              setToast('Managed session stream failed.');
            }
            return;
          }
          if (!eventTypes.has(event)) return;
          try {
            const parsed = JSON.parse(data) as ManagedEvent;
            setStreamEvents((prev) => [...prev, parsed]);
          } catch {
            /* ignore malformed event payloads */
          }
        },
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setToast(e instanceof Error ? e.message : 'Run failed.');
      }
    } finally {
      streamAbortRef.current = null;
      setStreaming(false);
      setBusy(null);
    }
  }

  function closeManagedPanel() {
    streamAbortRef.current?.abort();
    setActiveRunAgent(null);
    setStreamEvents([]);
    setStreaming(false);
    setRunMessage('');
  }

  const managedCount = agents?.length ?? 0;
  const deployedCount = agents?.filter((a) => a.providerRuntime?.agentId).length ?? 0;

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        eyebrow="Agent Builder"
        title="All saved agents run as Claude Managed Agents."
        subtitle="Every saved process is now promoted into the managed runtime path: deploy a Claude cloud agent, start a session, and stream events back into Regulatory Ground."
        actions={
          <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')} style={{ fontSize: 13 }}>
            Create from Sandbox
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        }
        meta={
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, maxWidth: 760 }}>
            <RuntimeStat label="Agent configs" value={String(agents?.length ?? 0)} />
            <RuntimeStat label="Claude managed" value={String(managedCount)} />
            <RuntimeStat label="Live deployments" value={String(deployedCount)} />
            <RuntimeStat label="Need deploy" value={String(Math.max(0, managedCount - deployedCount))} />
          </div>
        }
      />

      <div style={{ padding: '28px 40px 80px', maxWidth: 1240, margin: '0 auto' }}>
        {toast && (
          <div
            onClick={() => setToast(null)}
            style={{
              padding: '10px 14px',
              marginBottom: 18,
              background: '#fff',
              border: '1px solid var(--rule-strong)',
              borderRadius: 10,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-2)',
              cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(17, 24, 39, 0.04)',
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
            eyebrow="No runtime agents yet"
            title="Create a grounded agent from a real process run."
            body="Run a regulated process, save the input, then choose whether that agent stays in Sandbox or deploys to Claude Managed Agents."
            primaryAction={{ label: 'Create from Sandbox', href: '/app/sandbox' }}
          />
        )}

        {agents !== null && agents.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  Managed runtime inventory
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                  Every card follows the same lifecycle: saved configuration, Claude deployment, then live session.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <RuntimeLegend label="Awaiting deployment" color="var(--orange)" />
                <RuntimeLegend label="Live cloud agent" color="#2563eb" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {agents.map((a) => {
                const summary = inputSummary(a);
                const renaming = renamingId === a.id;
                const deployed = !!a.providerRuntime?.agentId;
                const tone = runtimeTone(a);
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      padding: 18,
                      border: `1px solid ${tone.border}`,
                      borderRadius: 16,
                      background: tone.background,
                      boxShadow: '0 16px 44px rgba(17, 24, 39, 0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
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
                                borderRadius: 8,
                                padding: '8px 10px',
                              }}
                            />
                            <button className="btn btn-ghost" onClick={() => void saveRename(a)} disabled={busy === `rename:${a.id}`} style={{ fontSize: 12 }}>
                              Save
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.name}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                              {a.processTitle}
                            </div>
                          </>
                        )}
                      </div>
                      <RuntimeBadge label={runtimeLabel(a)} color={tone.accent} />
                    </div>

                    <AgentLifecycle deployed={deployed} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {a.regulations.slice(0, 4).map((r) => (
                          <span key={r} style={PILL}>{r}</span>
                        ))}
                        <span style={{ ...PILL, color: RISK_COLOR[a.riskBand], borderColor: a.riskBand === 'high' ? 'var(--orange)' : 'var(--rule-strong)' }}>
                          {a.riskBand} risk
                        </span>
                        {summary && <span style={PILL}>{summary}</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                        {runtimeDescription(a)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: deployed && a.providerRuntime ? '1fr 1fr' : '1fr',
                        gap: 8,
                        padding: 12,
                        border: '1px solid var(--rule)',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.72)',
                      }}
                    >
                      <RuntimeMeta label="Updated" value={relTime(a.updatedAt)} />
                      {deployed && a.providerRuntime && (
                        <>
                          <RuntimeMeta label="Agent" value={`${a.providerRuntime.agentId.slice(0, 18)}…`} />
                          <RuntimeMeta label="Environment" value={`${a.providerRuntime.environmentId.slice(0, 18)}…`} />
                          <RuntimeMeta label="Version" value={`v${a.providerRuntime.agentVersion}`} />
                        </>
                      )}
                    </div>

                    <div style={{ flex: 1 }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!renaming && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => startRename(a)}
                            style={{ fontSize: 12 }}
                          >
                            Rename
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          onClick={() => void remove(a)}
                          disabled={busy === `del:${a.id}`}
                          style={{ fontSize: 12 }}
                        >
                          Delete
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {deployed && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => void deployAgent(a)}
                            disabled={busy === `deploy:${a.id}`}
                            style={{ fontSize: 12 }}
                          >
                            {busy === `deploy:${a.id}` ? 'Redeploying…' : 'Redeploy'}
                          </button>
                        )}
                        {!deployed && (
                          <button
                            className="btn btn-orange"
                            onClick={() => void deployAgent(a)}
                            disabled={busy === `deploy:${a.id}`}
                            style={{ fontSize: 12 }}
                          >
                            {busy === `deploy:${a.id}` ? 'Deploying…' : 'Deploy'}
                          </button>
                        )}
                        {deployed && (
                          <button
                            className="btn btn-orange"
                            onClick={() => { setActiveRunAgent(a.id); setRunMessage(''); setStreamEvents([]); }}
                            disabled={streaming && activeRunAgent === a.id}
                            style={{ fontSize: 12 }}
                          >
                            Start session
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Managed session panel (inline) */}
                    {activeRunAgent === a.id && (
                      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <div className="eyebrow" style={{ marginBottom: 6 }}>Claude session</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                            This sends a `user.message`, opens the Managed Agents stream, and persists the run record.
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'stretch' }}>
                          <textarea
                            value={runMessage}
                            onChange={(e) => setRunMessage(e.target.value)}
                            placeholder="Ask the managed agent to perform a specific regulated task…"
                            disabled={streaming}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !streaming) void startManagedRun(a); }}
                            style={{
                              minWidth: 0,
                              minHeight: 76,
                              fontFamily: 'var(--sans)',
                              fontSize: 13,
                              color: 'var(--ink)',
                              background: '#fff',
                              border: '1px solid var(--rule-strong)',
                              borderRadius: 10,
                              padding: '10px 12px',
                              resize: 'vertical',
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button
                              className="btn btn-orange"
                              onClick={() => void startManagedRun(a)}
                              disabled={streaming || !runMessage.trim()}
                              style={{ fontSize: 12, flex: 1 }}
                            >
                              {streaming ? 'Running…' : 'Start'}
                            </button>
                            <button className="btn btn-ghost" onClick={closeManagedPanel} style={{ fontSize: 12 }}>
                              Close
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            minHeight: 120,
                            maxHeight: 340,
                            overflowY: 'auto',
                            background: '#0f172a',
                            border: '1px solid rgba(15, 23, 42, 0.2)',
                            borderRadius: 12,
                            padding: 12,
                            fontSize: 12,
                            fontFamily: 'var(--mono)',
                            lineHeight: 1.65,
                            color: '#dbeafe',
                          }}
                        >
                          {streamEvents.length === 0 && (
                            <div style={{ color: '#94a3b8' }}>
                              {streaming ? 'Opening Claude Managed Agents stream…' : 'Session events will appear here.'}
                            </div>
                          )}
                          {streamEvents.map((ev, i) => (
                            <ManagedEventLine key={i} event={ev} />
                          ))}
                          {streaming && (
                            <div style={{ color: '#93c5fd', marginTop: 4 }}>Streaming…</div>
                          )}
                        </div>
                      </div>
                    )}
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

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 12,
        padding: '12px 14px',
        background: '#fff',
      }}
    >
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
        {value}
      </div>
    </div>
  );
}

function RuntimeLegend({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      {label}
    </span>
  );
}

function RuntimeBadge({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 30,
        padding: '0 10px',
        borderRadius: 999,
        background: '#fff',
        border: `1px solid ${color}`,
        color,
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {label}
    </div>
  );
}

function AgentLifecycle({ deployed }: { deployed: boolean }) {
  const steps = [
    { label: 'Saved', done: true },
    { label: 'Deployed', done: deployed },
    { label: 'Session-ready', done: deployed },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, 1fr)`, gap: 6 }}>
      {steps.map((step) => (
        <div
          key={step.label}
          style={{
            padding: '7px 8px',
            borderRadius: 999,
            background: step.done ? 'rgba(42, 140, 79, 0.08)' : 'rgba(17, 24, 39, 0.04)',
            border: `1px solid ${step.done ? 'rgba(42, 140, 79, 0.22)' : 'var(--rule)'}`,
            color: step.done ? 'var(--ok, #2a8c4f)' : 'var(--ink-3)',
            textAlign: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}

function RuntimeMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
        {label}
      </div>
      <div style={{ marginTop: 3, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}

/** Renders a single event from the managed agent stream. */
function ManagedEventLine({ event }: { event: ManagedEvent }) {
  if (event.type === 'agent.message' && event.content) {
    const text = event.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return <div style={{ whiteSpace: 'pre-wrap', color: '#e0f2fe' }}>{text}</div>;
  }
  if (event.type === 'agent.tool_use') {
    return (
      <div style={{ color: '#93c5fd' }}>
        [Tool: {event.name}]
      </div>
    );
  }
  if (event.type === 'session.status_idle') {
    return <div style={{ color: '#86efac', fontWeight: 600 }}>Agent finished.</div>;
  }
  if (event.type === 'session.status_failed') {
    return <div style={{ color: '#fca5a5' }}>Session failed{event.error ? `: ${event.error}` : '.'}</div>;
  }
  return null;
}

export default Builder;
