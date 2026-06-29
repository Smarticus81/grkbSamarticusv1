/**
 * Home - the medical-device agent command center.
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
 * Everything is wired to live endpoints - no placeholder data.
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
        .hw-action { min-height: 110px; text-align:left; padding:16px; border:1px solid var(--rule); border-radius: var(--radius); background:var(--surface); cursor:pointer; display:flex; flex-direction:column; justify-content:space-between; gap:10px; }
        .hw-action:hover { border-color: var(--ink); }
        .hw-metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0; margin-top: 18px; border: 1px solid var(--rule); border-radius: var(--radius); background: var(--surface); }
        .hw-continue { display: grid; gap: 24px; }
        .hw-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; border:1px solid var(--rule); border-radius: var(--radius); background: var(--surface); cursor:pointer; text-align:left; width:100%; transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease); }
        .hw-row:hover { border-color: var(--rule-strong); background: var(--paper-deep); }
        @media (max-width: 860px) {
          .hw-actions { grid-template-columns: 1fr; }
          .hw-metrics { grid-template-columns: repeat(3, 1fr); }
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
        <div className="hw-wrap" style={{ position: 'relative', padding: '36px 32px 28px' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
            Post-Market Surveillance Platform
          </div>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 30px)', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.15, margin: 0, maxWidth: 760 }}>
            Draft PSURs and QMS records from your source data.
          </h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 610 }}>
            Configure once, generate from controlled inputs, review with a full audit trail.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')} style={{ padding: '12px 22px', fontSize: 14.5 }}>
              Configure a module
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/designer')} style={{ fontSize: 14 }}>
              Open Workflow Builder
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/builder')} style={{ fontSize: 14 }}>
              Modules in Routine Use
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/psur')} style={{ fontSize: 14 }}>
              PSUR Builder
            </button>
          </div>
          <div className="hw-metrics">
            <Metric label="Modules" value={tasks ? String(taskCount) : '...'} />
            <Metric label="Modules in routine use" value={agents ? String(agentCount) : '...'} />
            <Metric label="PSUR runs" value={psurRuns ? String(psurRunCount) : '...'} />
            <Metric label="Regulatory requirements" value={String(requirementCount)} />
            <Metric label="Source data types" value={String(evidenceTypeCount)} />
            <Metric label="Data categories" value={String(semanticBucketCount)} />
          </div>
        </div>
      </section>

      <section className="hw-wrap" style={{ padding: '34px 40px 8px' }}>
        <div className="hw-actions">
          <ActionCard label="Workflow Builder" title="Define the report process" body="Set steps, reviewers, inputs, and outputs." onClick={() => navigate('/app/designer')} />
          <ActionCard label="Modules" title="Qualify a source-traceable run" body="Run source data against requirements." onClick={() => navigate('/app/sandbox')} />
          <ActionCard label="PSUR Builder" title="Draft your post-market report" body="Generate PSUR/PMSR drafts and reopen outputs." onClick={() => navigate('/app/psur')} />
          <ActionCard label="Routine Use" title="Use a qualified module" body="Enter a record and review the result." onClick={() => navigate('/app/builder')} />
        </div>
      </section>

      {hasHistory && (
        <section className="hw-wrap" style={{ padding: '40px 40px 8px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 16px' }}>Continue</h2>
          <div className="hw-continue" style={{ gridTemplateColumns: `repeat(${continuePanelCount}, minmax(0, 1fr))` }}>
            {hasRuns && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Source-traceable runs</div>
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
                <div className="eyebrow" style={{ marginBottom: 10 }}>Modules in routine use</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {agents!.map((a) => (
                    <button key={a.id} className="hw-row" onClick={() => navigate('/app/builder')}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>{a.processTitle}</div>
                      </div>
                      <span style={{ color: 'var(--ink-3)', fontSize: 13, flexShrink: 0 }}>Use &rarr;</span>
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
        padding: '10px 16px',
        borderRight: '1px solid var(--rule)',
        background: 'transparent',
      }}
    >
      <div style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{value}</div>
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
