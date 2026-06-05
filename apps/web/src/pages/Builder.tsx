/**
 * Managed Agents — operate medical-device agents promoted from validated runs.
 *
 * This page does ONE thing: list managed agent configurations and let operators
 * deploy, version, rename, delete, or start live Claude Managed Agent sessions.
 *
 * The process catalog below maps templates to regulations and risk when a run is
 * promoted into an agent.
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

type GroundedRunManifest = {
  runId: string;
  taskName: string;
  manifestHash: string;
  validation: {
    strictGatePass: boolean;
    violations: string[];
  };
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
  error?: string | { message?: string; type?: string };
  text?: string;
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
};

type SavedAgent = {
  id: string;
  name: string;
  processId: string;
  processTitle: string;
  taskId: string | null;
  regulations: string[];
  evidenceStatus: Record<string, string>;
  attachedData: Record<string, AttachedFile | GroundedRunManifest>;
  guardrails: Record<string, boolean>;
  outputFormat: string | null;
  deployTarget: string | null;
  providerRuntime: ProviderRuntime;
  riskBand: 'low' | 'medium' | 'high';
  description: string | null;
  updatedAt: string;
};

/* ── process catalog (shared with the agent-template promotion flow) ─────── */

const processS: process[] = [
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

/* ── Helpers ───────────────────────────────────────────────────────── */

function runtimeLabel(a: SavedAgent): string {
  return a.providerRuntime?.agentId ? 'Ready' : 'Deploy';
}

function runtimeTone(a: SavedAgent): { border: string; background: string; accent: string } {
  return a.providerRuntime?.agentId
    ? { border: 'rgba(37, 99, 235, 0.35)', background: 'linear-gradient(135deg, #fff 0%, #f5f8ff 100%)', accent: '#2563eb' }
    : { border: 'rgba(255, 115, 0, 0.32)', background: 'linear-gradient(135deg, #fff 0%, #fff8f2 100%)', accent: 'var(--orange)' };
}

function outcomeText(events: ManagedEvent[]): string {
  return events.map((event) => {
    if (event.type === 'agent.message' && event.content) {
      return event.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
    }
    if (event.type !== 'assistant.message' && event.type !== 'message.delta') return '';
    if (typeof event.text === 'string') return event.text;
    if (event.delta?.text) return event.delta.text;
    if (Array.isArray(event.message?.content)) {
      return event.message.content
        .map((block) => block && typeof block === 'object' && 'text' in block && typeof block.text === 'string' ? block.text : '')
        .join('');
    }
    return '';
  }).join('').trim();
}

function managedEventError(event: ManagedEvent): string | null {
  if (event.type !== 'session.error' && event.type !== 'session.status_failed') return null;
  if (typeof event.error === 'string') return event.error;
  if (event.error?.message) return event.error.message;
  return 'The managed agent could not complete this run.';
}

function sessionState(events: ManagedEvent[], streaming: boolean): { label: string; tone: 'idle' | 'working' | 'done' | 'failed' } {
  const providerError = events.map(managedEventError).find(Boolean);
  if (providerError) return { label: 'Run failed', tone: 'failed' };
  const failed = events.find((event) => event.type === 'session.status_failed');
  if (failed) return { label: 'Run failed', tone: 'failed' };
  if (events.some((event) => event.type === 'session.status_idle')) return { label: 'Outcome ready', tone: 'done' };
  if (streaming) return { label: 'Working on it', tone: 'working' };
  return { label: 'No outcome yet', tone: 'idle' };
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
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
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
      setActiveRunId(run.id);

      const controller = new AbortController();
      streamAbortRef.current = controller;
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
    setActiveRunId(null);
    setStreamEvents([]);
    setStreaming(false);
    setRunMessage('');
  }

  async function saveCurrentResult(a: SavedAgent) {
    if (!activeRunId) {
      setToast('Run the agent before saving a result.');
      return;
    }
    try {
      await api<ManagedRun>(`/api/builder/agents/${a.id}/runs/${activeRunId}/save`, { method: 'POST', body: '{}' });
      setToast('Result saved.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed.');
    }
  }

  function downloadCurrentResult(a: SavedAgent, text: string, error: string | null) {
    const body = [
      a.name,
      a.processTitle,
      new Date().toISOString(),
      '',
      error ? `Run failed:\n${error}` : text,
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'agent-result'}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!activeRunAgent || streaming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeManagedPanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeRunAgent, streaming]);

  const deployedCount = agents?.filter((a) => a.providerRuntime?.agentId).length ?? 0;
  const activeAgent = agents?.find((agent) => agent.id === activeRunAgent) ?? null;
  const activeText = activeAgent ? outcomeText(streamEvents) : '';
  const activeState = activeAgent ? sessionState(streamEvents, streaming) : sessionState([], false);
  const activeError = activeAgent ? streamEvents.map(managedEventError).find(Boolean) : null;

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        eyebrow="Managed Agents"
        title="Run agents."
        subtitle="Paste the record. Get the decision."
        actions={
          <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')} style={{ fontSize: 13 }}>
            New Agent Build
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        }
        meta={<div style={{ color: 'var(--ink-3)', fontSize: 13 }}>{deployedCount} ready</div>}
      />

      <div style={{ padding: '28px 40px 80px', maxWidth: 1120, margin: '0 auto' }}>
        {toast && (
          <div
            onClick={() => setToast(null)}
            style={{
              padding: '12px 14px',
              marginBottom: 18,
              background: '#fff',
              border: '1px solid var(--rule-strong)',
              borderRadius: 10,
              fontSize: 13,
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
            title="Build your first agent."
            body="Start from a template, run it with real evidence, then come back here to operate it."
            primaryAction={{ label: 'Choose Template', href: '/app/sandbox' }}
          />
        )}

        {agents !== null && agents.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
              {agents.map((a) => {
                const renaming = renamingId === a.id;
                const deployed = !!a.providerRuntime?.agentId;
                const tone = runtimeTone(a);
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      aspectRatio: '1 / 1',
                      minHeight: 230,
                      padding: 18,
                      border: `1px solid ${deployed ? 'rgba(37, 99, 235, 0.22)' : 'rgba(255, 115, 0, 0.24)'}`,
                      borderRadius: 18,
                      background: '#fff',
                      boxShadow: '0 14px 38px rgba(17, 24, 39, 0.045)',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                        <RuntimeBadge label={runtimeLabel(a)} color={tone.accent} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        {renaming ? (
                          <div style={{ display: 'grid', gap: 6 }}>
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
                            <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.03em', color: 'var(--ink)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {a.name}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {a.processTitle}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: 1 }} />

                    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
                      <div style={{ display: 'flex', gap: 6, opacity: 0.72 }}>
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
                      <div style={{ display: 'flex', gap: 6 }}>
                        {deployed && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => void deployAgent(a)}
                            disabled={busy === `deploy:${a.id}`}
                            style={{ fontSize: 12, flex: 1 }}
                          >
                            {busy === `deploy:${a.id}` ? 'Redeploying…' : 'Redeploy'}
                          </button>
                        )}
                        {!deployed && (
                          <button
                            className="btn btn-orange"
                            onClick={() => void deployAgent(a)}
                            disabled={busy === `deploy:${a.id}`}
                            style={{ fontSize: 12, flex: 1 }}
                          >
                            {busy === `deploy:${a.id}` ? 'Deploying…' : 'Deploy'}
                          </button>
                        )}
                        {deployed && (
                          <button
                            className="btn btn-orange"
                            onClick={() => { setActiveRunAgent(a.id); setActiveRunId(null); setRunMessage(''); setStreamEvents([]); }}
                            disabled={streaming}
                            style={{ fontSize: 13, padding: '9px 16px', flex: 1 }}
                          >
                            Run
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {activeAgent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Run ${activeAgent.name}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !streaming) closeManagedPanel();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'rgba(15, 23, 42, 0.18)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            style={{
              width: 'min(760px, calc(100vw - 48px))',
              maxHeight: 'min(760px, calc(100vh - 48px))',
              overflow: 'auto',
              borderRadius: 22,
              border: '1px solid rgba(17, 24, 39, 0.12)',
              background: '#fff',
              boxShadow: '0 28px 90px rgba(17, 24, 39, 0.22)',
              padding: 22,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Run Agent</div>
                <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.035em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeAgent.name}
                </div>
                <div style={{ marginTop: 5, fontSize: 13, color: 'var(--ink-3)' }}>
                  {activeAgent.processTitle}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                onClick={closeManagedPanel}
                disabled={streaming}
                style={{ fontSize: 12 }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)' }}>Record</span>
                <textarea
                  value={runMessage}
                  onChange={(event) => setRunMessage(event.target.value)}
                  placeholder="Paste the complaint, audit finding, CAPA record, or device file excerpt here."
                  disabled={streaming}
                  style={{
                    minHeight: 180,
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--ink)',
                    background: '#fff',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 14,
                    padding: '13px 14px',
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  className="btn btn-orange"
                  onClick={() => void startManagedRun(activeAgent)}
                  disabled={streaming || !runMessage.trim()}
                  style={{ fontSize: 13, padding: '10px 18px' }}
                >
                  {streaming ? 'Running…' : 'Run'}
                </button>
              </div>

              <div
                style={{
                  minHeight: 190,
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 16,
                  background: '#fff',
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 5 }}>Outcome</div>
                    <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                      {activeState.tone === 'done' && !activeText ? 'No answer returned' : activeState.label}
                    </div>
                  </div>
                  <OutcomeDot tone={activeState.tone} />
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: activeError ? '#B00020' : activeText ? 'var(--ink)' : 'var(--ink-3)', whiteSpace: 'pre-wrap' }}>
                  {activeError || activeText || (streaming
                    ? 'The agent is reading the record and preparing the outcome.'
                    : activeState.tone === 'done'
                      ? 'No written answer was returned by the managed agent.'
                      : 'Run the agent to see the outcome here.')}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => void saveCurrentResult(activeAgent)}
                  disabled={streaming || !activeRunId || (!activeText && !activeError)}
                  style={{ fontSize: 12 }}
                >
                  Save result
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => downloadCurrentResult(activeAgent, activeText, activeError ?? null)}
                  disabled={streaming || (!activeText && !activeError)}
                  style={{ fontSize: 12 }}
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OutcomeDot({ tone }: { tone: 'idle' | 'working' | 'done' | 'failed' }) {
  const colors = {
    idle: 'var(--ink-4)',
    working: 'var(--orange)',
    done: 'var(--ok, #2a8c4f)',
    failed: '#B00020',
  };
  return (
    <span
      aria-hidden="true"
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: colors[tone],
        boxShadow: tone === 'working' ? '0 0 0 6px rgba(255, 115, 0, 0.08)' : undefined,
      }}
    />
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

export default Builder;
