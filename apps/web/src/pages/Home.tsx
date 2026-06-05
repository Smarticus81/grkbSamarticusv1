/**
 * Home — the workspace front door.
 *
 * Design intent: a first-time user must understand the product and know their
 * next action within seconds. So the screen is deliberately low-density and
 * progressive:
 *
 *   1. One line on what this does + ONE dominant action ("Create managed agent").
 *   2. The loop in three steps (pick -> run on your data -> deploy a Claude
 *      Managed Agent) so "what does it do" is answered immediately.
 *   3. Three featured managed-agent templates as one-click starts.
 *   4. History (recent runs, managed agents) appears ONLY once it exists, so a
 *      new user is never shown empty shells.
 *
 * Everything is wired to live endpoints — no placeholder data.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuthenticatedApi } from '../auth/useApi.js';
import { REQUIREMENT_COUNT, REG_COUNT } from '../lib/coverage.js';

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

/* ── The three featured outcomes — the commercial wedge ─────────────── */

const FEATURED: { taskId: string; eyebrow: string; title: string; outcome: string }[] = [
  {
    taskId: 'template-compliance-evaluator',
    eyebrow: 'Authoring',
    title: 'PSUR draft',
    outcome: 'Structured to MDCG 2022-21 and checked against EU MDR Art. 83\u201386, with a citation on every claim.',
  },
  {
    taskId: 'complaint-coder',
    eyebrow: 'Vigilance',
    title: 'Complaint triage',
    outcome: 'Reporting clocks mapped to EU MDR Art. 87, 21 CFR 803, and ISO 13485 \u00a78.2.2 in one decision.',
  },
  {
    taskId: 'ae-reportability',
    eyebrow: 'Coding',
    title: 'IMDRF coding',
    outcome: 'Adverse-event narratives coded across Annexes A\u2013G with rationale and confidence per code.',
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Pick a grounded agent template', body: 'Each template is pre-bound to the exact requirements it must satisfy.' },
  { n: '2', title: 'Run once with real input', body: 'The run captures the input, citations, guardrails, and graph context.' },
  { n: '3', title: 'Deploy to Claude Managed Agents', body: 'Save the run, deploy the cloud agent, then start live managed sessions.' },
];

/* ── Component ──────────────────────────────────────────────────────── */

export function Home() {
  const { api } = useAuthenticatedApi();
  const [, navigate] = useLocation();

  const [tasks, setTasks] = useState<TaskCard[] | null>(null);
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [agents, setAgents] = useState<SavedAgent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ tasks: TaskCard[] }>('/api/sandbox/tasks')
      .then((r) => !cancelled && setTasks(r.tasks))
      .catch(() => !cancelled && setTasks([]));
    api<{ runs: RecentRun[] }>('/api/sandbox/runs/recent?limit=5')
      .then((r) => !cancelled && setRuns(r.runs ?? []))
      .catch(() => !cancelled && setRuns([]));
    api<SavedAgent[]>('/api/builder/agents')
      .then((r) => !cancelled && setAgents(Array.isArray(r) ? r : []))
      .catch(() => !cancelled && setAgents([]));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const featured = FEATURED.map((f) => ({ ...f, task: tasks?.find((t) => t.id === f.taskId) }));
  const hasRuns = (runs?.length ?? 0) > 0;
  const hasAgents = (agents?.length ?? 0) > 0;
  const hasHistory = hasRuns || hasAgents;

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <style>{`
        .hw-wrap { max-width: 980px; margin: 0 auto; padding: 0 40px; }
        .hw-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: var(--r-3); overflow: hidden; }
        .hw-step { background: var(--paper); padding: 22px 22px; }
        .hw-processes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .hw-process { display:flex; flex-direction:column; gap:10px; padding:20px; cursor:pointer; height:100%; text-align:left; }
        .hw-process:hover { border-color: var(--ink); }
        .hw-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 15px; border:1px solid var(--rule); border-radius: var(--r-2); background: var(--paper); cursor:pointer; text-align:left; width:100%; transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease); }
        .hw-row:hover { border-color: var(--ink); background: var(--paper-deep); }
        @media (max-width: 860px) {
          .hw-steps { grid-template-columns: 1fr; }
          .hw-processes { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Hero: one promise, one action ── */}
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
        <div className="hw-wrap" style={{ position: 'relative', padding: '48px 40px 40px' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
            Claude Managed Agents workspace
          </div>
          <h1 style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.04, margin: 0, maxWidth: 680 }}>
            Build regulated Claude agents from grounded runs.
          </h1>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 560 }}>
            Pick a regulated workflow, run it once against your data, then promote it into a Claude Managed Agent
            with its own cloud environment, live session stream, citations, and Regulatory Ground guardrails.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')} style={{ padding: '12px 22px', fontSize: 14.5 }}>
              Create managed agent
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/builder')} style={{ fontSize: 14 }}>
              Open Agent Builder
            </button>
            {hasHistory && (
              <button className="btn btn-ghost" onClick={() => navigate('/app/trails')} style={{ fontSize: 14 }}>
                View decision trails
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── How it works (the comprehension fix) ── */}
      <section className="hw-wrap" style={{ padding: '40px 40px 8px' }}>
        <div className="hw-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="hw-step">
              <div
                style={{
                  width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--orange)',
                  color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 12,
                }}
              >
                {s.n}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{s.title}</div>
              <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-3)' }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Start a managed agent ── */}
      <section className="hw-wrap" style={{ padding: '40px 40px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Start a managed agent</h2>
          <button onClick={() => navigate('/app/sandbox')} style={{ background: 'none', border: 0, color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer' }}>
            Browse all {tasks ? tasks.length : ''} templates &rarr;
          </button>
        </div>
        <div className="hw-processes">
          {featured.map((f) => (
            <button key={f.taskId} className="ground-card lift hw-process" onClick={() => navigate(`/app/sandbox/${f.taskId}`)}>
              <span className="eyebrow">{f.eyebrow}</span>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{f.title}</div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-3)', flex: 1 }}>{f.outcome}</p>
              <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 500 }}>Configure agent &rarr;</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Continue (only when there's history) ── */}
      {hasHistory && (
        <section className="hw-wrap" style={{ padding: '40px 40px 8px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 16px' }}>Continue</h2>
          <div style={{ display: 'grid', gridTemplateColumns: hasRuns && hasAgents ? '1fr 1fr' : '1fr', gap: 24 }}>
            {hasRuns && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Recent runs</div>
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
                            {score.passed ? 'Released' : 'Held'}
                          </span>
                        )}
                      </button>
                    );
                  })}
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
                      <span style={{ color: 'var(--ink-3)', fontSize: 13, flexShrink: 0 }}>Deploy &rarr;</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Slim trust + connect strip (de-emphasized) ── */}
      <section className="hw-wrap" style={{ padding: '40px 40px 80px' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
            padding: '20px 24px', border: '1px solid var(--rule)', borderRadius: 'var(--r-3)', background: 'var(--paper-deep)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--ink)' }}>
              Claude Managed Agents grounded by {REQUIREMENT_COUNT} requirements across {REG_COUNT} regulations.
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              Every managed session starts from a graph-grounded run and carries its regulatory context forward.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-ghost" onClick={() => navigate('/app/requirements')} style={{ fontSize: 13 }}>Requirements</button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/connect')} style={{ fontSize: 13 }}>Connect a tool</button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

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
