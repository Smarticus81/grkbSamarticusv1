/**
 * Home — the medical-device agent command center.
 *
 * Design intent: a first-time user must understand the product and know their
 * next action within seconds. So the screen is deliberately low-density and
 * progressive:
 *
 *   1. One dominant action: start an agent build from a grounded template.
 *   2. One product model: templates -> grounding run -> managed agent -> audit pack.
 *   3. Live operational counts from the existing APIs.
 *   4. Medical-device lanes instead of technical feature buckets.
 *
 * Everything is wired to live endpoints — no placeholder data.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuthenticatedApi } from '../auth/useApi.js';
import { EVIDENCE_TYPE_COUNT, REG_COUNT, REQUIREMENT_COUNT } from '../lib/coverage.js';
import { workspaceScopeKey } from '../lib/workspaceScope.js';
import type { PsurRunSummary } from '../lib/psurWorkspace.js';

/* ── Types (mirrored from the sandbox + builder APIs) ───────────────── */

interface TaskCard {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
}

interface RecentRun {
  runId: string;
  taskName: string;
  createdAtIso: string;
  withGraph?: { satisfied: number; missed: number; passed: boolean };
  withoutGraph?: { satisfied: number; missed: number; passed: boolean };
}

interface SavedAgent {
  id: string;
  name: string;
  processTitle: string;
}

interface GraphStats {
  regulations: number;
  obligations: number;
  evidenceTypes: number;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function Home() {
  const { api, orgId, userId } = useAuthenticatedApi();
  const [, navigate] = useLocation();
  const activeWorkspaceKey = workspaceScopeKey({ orgId, userId });

  const [tasks, setTasks] = useState<TaskCard[] | null>(null);
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [agents, setAgents] = useState<SavedAgent[] | null>(null);
  const [psurRuns, setPsurRuns] = useState<PsurRunSummary[] | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTasks(null);
    setRuns(null);
    setAgents(null);
    setPsurRuns(null);
    setGraphStats(null);
    api<{ tasks: TaskCard[] }>('/api/sandbox/tasks')
      .then((r) => !cancelled && setTasks(r.tasks))
      .catch(() => !cancelled && setTasks([]));
    api<{ runs: RecentRun[] }>('/api/sandbox/runs/recent?limit=5')
      .then((r) => !cancelled && setRuns(r.runs ?? []))
      .catch(() => !cancelled && setRuns([]));
    api<SavedAgent[]>('/api/builder/agents')
      .then((r) => !cancelled && setAgents(Array.isArray(r) ? r : []))
      .catch(() => !cancelled && setAgents([]));
    api<{ runs?: PsurRunSummary[] }>('/api/psur/runs')
      .then((r) => !cancelled && setPsurRuns(r.runs ?? []))
      .catch(() => !cancelled && setPsurRuns([]));
    api<GraphStats>('/api/graph/stats')
      .then((r) => !cancelled && setGraphStats(r))
      .catch(() => !cancelled && setGraphStats(null));
    return () => {
      cancelled = true;
    };
  }, [api, activeWorkspaceKey]);

  const hasRuns = (runs?.length ?? 0) > 0;
  const hasAgents = (agents?.length ?? 0) > 0;
  const hasPsurRuns = (psurRuns?.length ?? 0) > 0;
  const hasHistory = hasRuns || hasAgents || hasPsurRuns;
  const continuePanelCount = [hasRuns, hasPsurRuns, hasAgents].filter(Boolean).length;
  const taskCount = tasks?.length ?? 0;
  const agentCount = agents?.length ?? 0;
  const psurRunCount = psurRuns?.length ?? 0;
  const requirementCount = graphStats?.obligations ?? REQUIREMENT_COUNT;
  const evidenceTypeCount = graphStats?.evidenceTypes ?? EVIDENCE_TYPE_COUNT;
  const semanticBucketCount = graphStats?.regulations ?? REG_COUNT;

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <style>{`
        .hw-wrap { max-width: 1120px; margin: 0 auto; padding: 0 40px; }
        .hw-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 30px; }
        .hw-action { min-height: 132px; text-align:left; padding:20px; border:1px solid var(--rule); border-radius: var(--r-3); background:var(--surface); cursor:pointer; display:flex; flex-direction:column; justify-content:space-between; gap:14px; }
        .hw-action:hover { border-color: var(--ink); }
        .hw-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 22px; max-width: 680px; }
        .hw-continue { display: grid; gap: 24px; }
        .hw-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 15px; border:1px solid var(--rule); border-radius: var(--r-2); background: var(--paper); cursor:pointer; text-align:left; width:100%; transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease); }
        .hw-row:hover { border-color: var(--ink); background: var(--paper-deep); }
        @media (max-width: 860px) {
          .hw-actions { grid-template-columns: 1fr; }
          .hw-metrics { grid-template-columns: 1fr; }
          .hw-continue { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <section style={{ borderBottom: '1px solid var(--rule)', position: 'relative', overflow: 'hidden' }}>
        <div
          aria-hidden
          className="halftone"
          style={{
            position: 'absolute', inset: 0, opacity: 0.14,
            maskImage: 'radial-gradient(ellipse 55% 90% at 92% 15%, #000 18%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse 55% 90% at 92% 15%, #000 18%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div className="hw-wrap" style={{ position: 'relative', padding: '56px 40px 44px' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
            Medical Device Agent OS
          </div>
          <h1 style={{ fontSize: 'clamp(42px, 6vw, 78px)', fontWeight: 500, letterSpacing: '-0.06em', lineHeight: 0.92, margin: 0, maxWidth: 760 }}>
            Build regulated agents from evidence.
          </h1>
          <p style={{ marginTop: 20, fontSize: 17, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 610 }}>
            Design the workflow, run a grounded build, then operate the validated Anthropic managed agent with decision traces.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')} style={{ padding: '12px 22px', fontSize: 14.5 }}>
              Start agent build
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/designer')} style={{ fontSize: 14 }}>
              Open Workflow Studio
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/builder')} style={{ fontSize: 14 }}>
              Managed Agents
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/psur')} style={{ fontSize: 14 }}>
              PSUR Builder
            </button>
          </div>
          <div className="hw-metrics">
            <Metric label="Agent templates" value={tasks ? String(taskCount) : '...'} />
            <Metric label="Managed agents" value={agents ? String(agentCount) : '...'} />
            <Metric label="PSUR runs" value={psurRuns ? String(psurRunCount) : '...'} />
            <Metric label="Graph requirements" value={String(requirementCount)} />
            <Metric label="Evidence types" value={String(evidenceTypeCount)} />
            <Metric label="Semantic buckets" value={String(semanticBucketCount)} />
          </div>
        </div>
      </section>

      <section className="hw-wrap" style={{ padding: '34px 40px 8px' }}>
        <div className="hw-actions">
          <ActionCard label="Workflow Studio" title="Create the agentic workflow" body="Use chat or the canvas builder." onClick={() => navigate('/app/designer')} />
          <ActionCard label="Agent Builds" title="Validate one grounded run" body="Run evidence through the graph." onClick={() => navigate('/app/sandbox')} />
          <ActionCard label="PSUR Builder" title="Draft your post-market report" body="Run PSUR/PMSR data packs and reopen artifacts." onClick={() => navigate('/app/psur')} />
          <ActionCard label="Managed Agents" title="Operate the passing agent" body="Deploy and stream the Anthropic runtime." onClick={() => navigate('/app/builder')} />
        </div>
      </section>

      {hasHistory && (
        <section className="hw-wrap" style={{ padding: '40px 40px 8px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 16px' }}>Continue</h2>
          <div className="hw-continue" style={{ gridTemplateColumns: `repeat(${continuePanelCount}, minmax(0, 1fr))` }}>
            {hasRuns && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Evidence runs</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {runs!.map((r) => {
                    const score = r.withGraph ?? r.withoutGraph;
                    return (
                      <button key={r.runId} className="hw-row" onClick={() => navigate(`/app/trails/${r.runId}`)}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.taskName}</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>{relTime(r.createdAtIso)} · {r.runId.slice(0, 12)}</div>
                        </div>
                        {score && (
                          <span className={`badge ${score.passed ? 'badge-ok' : 'badge-warn'}`} style={{ flexShrink: 0 }}>
                            {score.passed ? 'Cleared' : 'Needs review'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {hasPsurRuns && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>PSUR builder</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {psurRuns!.slice(0, 5).map((r) => (
                    <button key={r.runId} className="hw-row" onClick={() => navigate('/app/psur')}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.deviceName ?? 'Post-market report'} {r.reportType ? `(${r.reportType})` : ''}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>
                          {relTime(r.createdAt)} · {r.periodStart} to {r.periodEnd}
                        </div>
                      </div>
                      <span className={r.status === 'completed' && r.validationPassed ? 'badge badge-ok' : r.status === 'failed' ? 'badge badge-err' : 'badge badge-warn'} style={{ flexShrink: 0 }}>
                        {r.status === 'completed' && r.validationPassed ? 'Validated' : r.status === 'failed' ? 'Failed' : 'Review'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasAgents && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Managed agents</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {agents!.map((a) => (
                    <button key={a.id} className="hw-row" onClick={() => navigate('/app/builder')}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>{a.processTitle}</div>
                      </div>
                      <span style={{ color: 'var(--ink-3)', fontSize: 13, flexShrink: 0 }}>Operate &rarr;</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '15px 16px',
        border: '1px solid rgba(255, 115, 0, 0.20)',
        borderRadius: 'var(--r-3)',
        background: 'var(--surface-glass)',
        boxShadow: '0 14px 38px rgba(17, 24, 39, 0.045)',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{value}</div>
      <div style={{ marginTop: 3, fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
        {label}
      </div>
    </div>
  );
}

function ActionCard({
  label,
  title,
  body,
  onClick,
}: {
  label: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button className="hw-action" onClick={onClick}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</div>
        <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-3)' }}>{body}</p>
      </div>
      <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 650 }}>Open -&gt;</span>
    </button>
  );
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

export default Home;
