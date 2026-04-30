/**
 * Sandbox — run graph-bound task agents.
 *
 * Pick a pre-built task agent, view its sample data, run it in one of three
 * modes (with-graph, without-graph, compare), watch a live ticker show
 * exactly how the agent talks to the obligation graph, score the
 * delta, and download the agent as a self-contained runner.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { SmarticusMark } from '../components/ui/logos.js';
import { useAuthenticatedApi } from '../auth/useApi.js';

/* ── Types mirrored from @regground/sandbox ─────────────────────────── */

type TaskCard = {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  obligationCount: number;
};

type Obligation = { obligationId: string; regulation: string; citation: string; summary: string };

type TaskDetail = {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  sampleData: unknown;
  obligations: Obligation[];
};

type Mode = 'with-graph' | 'without-graph' | 'compare';
type Lane = 'with-graph' | 'without-graph';

type LaneEvent =
  | { type: 'run.started'; runId: string; lane: Lane; atIso: string; taskId: string }
  | { type: 'agent.thinking'; lane: Lane; atIso: string; message: string }
  | { type: 'graph.query'; lane: Lane; atIso: string; method: string; args: Record<string, unknown>; resultCount: number; message: string }
  | { type: 'graph.cite'; lane: Lane; atIso: string; obligationId: string; citation: string; regulation: string; summary: string }
  | { type: 'obligation.satisfied'; lane: Lane; atIso: string; obligationId: string; reason: string }
  | { type: 'obligation.missed'; lane: Lane; atIso: string; obligationId: string; reason: string }
  | { type: 'output.gated'; lane: Lane; atIso: string; passed: boolean; violations: string[] }
  | { type: 'run.completed'; lane: Lane; atIso: string; durationMs: number; runId: string }
  | { type: 'run.error'; lane: Lane; atIso: string; message: string; runId: string };

type LaneResult = {
  lane: Lane;
  output: unknown;
  durationMs: number;
  citations: string[];
  obligationsConsulted: string[];
  score: {
    coverage: number;
    citations: number;
    strictGatePass: boolean;
    violations: string[];
    obligationsConsulted: number;
  };
  judge?: {
    accuracy: number;
    citations: number;
    regulatoryAwareness: number;
    completeness: number;
    rationale: string;
  };
  error?: string;
};

type RunResult = {
  runId: string;
  taskId: string;
  startedAtIso: string;
  finishedAtIso: string;
  withGraph?: LaneResult;
  withoutGraph?: LaneResult;
};

/* ── Component ───────────────────────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function Sandbox({ initialTaskId }: { initialTaskId?: string }) {
  const { api } = useAuthenticatedApi();
  const [, navigate] = useLocation();

  const [tasks, setTasks] = useState<TaskCard[] | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialTaskId);
  const [mode, setMode] = useState<Mode>('compare');
  const [runInput, setRunInput] = useState<unknown | null>(null);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<LaneEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [judging, setJudging] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (initialTaskId) setSelectedId(initialTaskId);
  }, [initialTaskId]);

  /* Load catalog */
  useEffect(() => {
    api<{ tasks: TaskCard[] }>('/api/sandbox/tasks')
      .then((r) => {
        setTasks(r.tasks);
        if (!selectedId && r.tasks[0]) setSelectedId(r.tasks[0].id);
      })
      .catch((e) => setError(String(e?.message ?? e)));
    return () => { eventSourceRef.current?.close(); };
  }, []);

  /* Load detail when selection changes */
  useEffect(() => {
    if (!selectedId) return;
    setDetail(null);
    setEvents([]);
    setResult(null);
    api<TaskDetail>(`/api/sandbox/tasks/${selectedId}`)
      .then((d) => {
        setDetail(d);
        // Pick up pre-filled input from Builder's "Run in sandbox" if present.
        let prefilled: unknown | null = null;
        try {
          const cached = sessionStorage.getItem(`builder:input:${selectedId}`);
          if (cached) {
            prefilled = JSON.parse(cached) as unknown;
            sessionStorage.removeItem(`builder:input:${selectedId}`);
          }
        } catch { /* ignore */ }
        setRunInput(prefilled ?? d.sampleData);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [selectedId]);

  async function runAgent() {
    if (!detail) return;
    setRunning(true);
    setEvents([]);
    setResult(null);
    eventSourceRef.current?.close();
    try {
      const start = await api<{ runId: string }>(`/api/sandbox/tasks/${detail.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ input: runInput ?? detail.sampleData, mode }),
      });
      const es = new EventSource(`${API_BASE}/api/sandbox/runs/${start.runId}/stream`);
      eventSourceRef.current = es;
      const eventNames: LaneEvent['type'][] = [
        'run.started', 'agent.thinking', 'graph.query', 'graph.cite',
        'obligation.satisfied', 'obligation.missed', 'output.gated',
        'run.completed', 'run.error',
      ];
      eventNames.forEach((name) => {
        es.addEventListener(name, (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data) as LaneEvent;
            setEvents((prev) => [...prev, parsed]);
          } catch { /* ignore */ }
        });
      });
      es.addEventListener('stream.end', async () => {
        es.close();
        try {
          const r = await api<RunResult>(`/api/sandbox/runs/${start.runId}/result`);
          setResult(r);
        } catch { /* ignore */ }
        setRunning(false);
      });
      es.onerror = () => { es.close(); setRunning(false); };
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setRunning(false);
    }
  }

  async function judgeRun() {
    if (!result) return;
    setJudging(true);
    try {
      const r = await api<{ judges: { withGraph?: LaneResult['judge']; withoutGraph?: LaneResult['judge'] } }>(`/api/sandbox/runs/${result.runId}/judge`, { method: 'POST', body: JSON.stringify({ useLiveLLM: false }) });
      setResult((prev) => {
        if (!prev) return prev;
        const next: RunResult = { ...prev };
        if (next.withGraph    && r.judges.withGraph)    next.withGraph    = { ...next.withGraph,    judge: r.judges.withGraph };
        if (next.withoutGraph && r.judges.withoutGraph) next.withoutGraph = { ...next.withoutGraph, judge: r.judges.withoutGraph };
        return next;
      });
    } finally {
      setJudging(false);
    }
  }

  function downloadAgent() {
    if (!detail) return;
    window.location.href = `${API_BASE}/api/sandbox/tasks/${detail.id}/download`;
  }

  const primaryResult = result?.withGraph ?? result?.withoutGraph;
  const completed = !!primaryResult;
  const compliant = primaryResult?.score.strictGatePass === true;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', overflowX: 'hidden' }}>
      <header style={{ padding: '32px 40px 20px', borderBottom: '1px solid var(--rule)' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Process review</div>
          <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.025em', margin: 0 }}>
            Run a QMS process review.
          </h1>
          <p style={{ marginTop: 8, color: 'var(--ink-3)', fontSize: 14, maxWidth: 640 }}>
            Pick a process, review the data package, then see whether the output is compliant and traceable.
          </p>
        </div>
      </header>

      <div style={{ padding: '20px 0 56px' }}>
        <section style={{ padding: '0 40px 18px', borderBottom: '1px solid var(--rule)' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Choose a process</div>
          {error && <div style={{ padding: 12, color: '#B00020', fontSize: 13 }}>Could not load: {error}</div>}
          {!tasks && !error && <div style={{ padding: 12, color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {tasks?.map((t) => {
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    textAlign: 'left',
                    background: active ? 'var(--paper-deep)' : 'var(--paper)',
                    border: `1px solid ${active ? 'var(--ink)' : 'var(--rule)'}`,
                    borderTop: `3px solid ${active ? 'var(--orange)' : 'transparent'}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SmarticusMark size={18} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{t.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>{friendlyReviewText(t.oneLiner)}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={SMALL_PILL}>{t.regulation}</span>
                    <span style={SMALL_PILL}>{t.obligationCount} requirements</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {!detail && (
          <div style={{ padding: 40, color: 'var(--ink-3)', fontSize: 14 }}>
            Choose a process review to begin.
          </div>
        )}

        {detail && (
          <section style={{ padding: '24px 40px 8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(320px, 1.1fr) minmax(300px, 0.9fr)', gap: 14, alignItems: 'stretch' }}>
            <WorkflowPanel>
              <div className="eyebrow">Selected review</div>
              <h2 style={{ margin: '8px 0 6px', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{detail.name}</h2>
              <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>{friendlyReviewText(detail.oneLiner)}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
                <span style={SMALL_PILL}>{detail.regulation}</span>
                <span style={SMALL_PILL}>{detail.jurisdiction}</span>
                <span style={SMALL_PILL}>{detail.obligations.length} requirements</span>
              </div>
            </WorkflowPanel>

            <WorkflowPanel>
              <div className="eyebrow">Data package</div>
              <p style={{ margin: '8px 0 14px', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>Information used for this review.</p>
              <DataSummary value={runInput ?? detail.sampleData} />
            </WorkflowPanel>

            <WorkflowPanel>
              <div className="eyebrow">Run</div>
              <div style={{ display: 'flex', gap: 0, marginBottom: 18, border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
                {(['with-graph', 'compare'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      padding: '9px 14px',
                      fontSize: 12,
                      background: mode === m ? 'var(--ink)' : 'transparent',
                      color: mode === m ? 'var(--paper)' : 'var(--ink-2)',
                      border: 0,
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'with-graph' ? 'Compliance review' : 'Compare review'}
                  </button>
                ))}
              </div>
              <button onClick={runAgent} disabled={running} className="btn-orange" style={{ fontSize: 14, padding: '12px 24px' }}>
                {running ? 'Review running…' : 'Run review'}
              </button>
              <div style={{ marginTop: 14 }}>
                <button onClick={downloadAgent} style={SECONDARY_BUTTON}>Download package</button>
              </div>
            </WorkflowPanel>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: result ? 'minmax(340px, 1fr) minmax(340px, 1fr)' : 'minmax(340px, 1fr)', gap: 14, marginTop: 14 }}>
            <WorkflowPanel>
              <div className="eyebrow">Outcome</div>
              {!completed && !running && (
                <p style={{ margin: '10px 0 0', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>
                  Run the review to see compliance status, requirements checked, and trace availability.
                </p>
              )}
              {running && (
                <p style={{ margin: '10px 0 0', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>
                  Review in progress. The result will appear here when the compliance check is complete.
                </p>
              )}
              {primaryResult && result && (
                <OutcomeSummary result={result} laneResult={primaryResult} compliant={compliant} onOpenTrace={() => navigate(`/app/trails/${result.runId}`)} />
              )}
            </WorkflowPanel>

            <WorkflowPanel>
              <div className="eyebrow">Requirements checked</div>
              <p style={{ margin: '8px 0 14px', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>The review uses these requirements.</p>
              <RequirementList requirements={detail.obligations} />
            </WorkflowPanel>

            {result && (
              <WorkflowPanel>
                <EvalCard result={result} judging={judging} onJudge={judgeRun} />
              </WorkflowPanel>
            )}
            </div>
          </section>
          )}
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const SMALL_PILL: React.CSSProperties = {
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
};

const SECONDARY_BUTTON: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--rule-strong)',
  borderRadius: 6,
  color: 'var(--ink-2)',
  fontFamily: 'var(--sans)',
  fontSize: 12,
  padding: '8px 12px',
  cursor: 'pointer',
};

function WorkflowPanel({ children }: { children: React.ReactNode }) {
  return (
    <article
      style={{
        background: '#fff',
        border: '1px solid var(--rule)',
        borderRadius: 10,
        padding: 18,
        alignSelf: 'stretch',
        boxShadow: '0 1px 0 rgba(20,20,20,0.03)',
      }}
    >
      {children}
    </article>
  );
}

function labelFromKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyReviewText(text: string): string {
  return text
    .replace(/obligations?/gi, 'requirements')
    .replace(/obligation graph/gi, 'requirement library')
    .replace(/live graph/gi, 'requirement library')
    .replace(/graph-bound\s*/gi, '');
}

function shortText(value: unknown): string {
  if (value == null) return 'Not provided';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}`;
  return 'Provided';
}

function DataSummary({ value }: { value: unknown }) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 8);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([key, entryValue]) => (
          <div key={key} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '9px 11px', background: 'var(--paper)' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 }}>{labelFromKey(key)}</div>
            <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>{shortText(entryValue)}</div>
            {Array.isArray(entryValue) && entryValue.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                {entryValue.slice(0, 5).map((item, index) => (
                  <span key={`${key}-${index}`} style={SMALL_PILL}>{shortText(item)}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return <div style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5 }}>{shortText(value)}</div>;
}

function OutcomeSummary({
  result,
  laneResult,
  compliant,
  onOpenTrace,
}: {
  result: RunResult;
  laneResult: LaneResult;
  compliant: boolean;
  onOpenTrace: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 10,
          border: `1px solid ${compliant ? 'var(--ok)' : 'var(--orange)'}`,
          background: compliant ? 'rgba(111,207,151,0.10)' : 'rgba(250,80,15,0.10)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, color: compliant ? 'var(--ok)' : 'var(--orange)' }}>
          {compliant ? 'Compliant' : 'Needs review'}
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          {compliant
            ? 'The review passed the compliance check and generated a trace.'
            : 'The review found items that should be checked before release.'}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <MiniStat value={`${laneResult.score.obligationsConsulted}`} label="requirements checked" />
        <MiniStat value={`${Math.round(laneResult.score.coverage * 100)}%`} label="coverage" />
        <MiniStat value={`${laneResult.citations.length}`} label="data references" />
      </div>
      {laneResult.score.violations.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--orange)', lineHeight: 1.5 }}>
          Review notes: {laneResult.score.violations.join('; ')}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Trace</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 10 }}>
          A trace was created for this review so QA/RA can reconstruct what was checked.
        </div>
        <button onClick={onOpenTrace} style={SECONDARY_BUTTON}>Open trace</button>
        <span style={{ marginLeft: 8, color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 10 }}>
          {result.runId.slice(0, 12)}
        </span>
      </div>
      {laneResult.output !== undefined && laneResult.output !== null && (
        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Review output</div>
          <DataSummary value={laneResult.output} />
        </div>
      )}
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: 10, background: 'var(--paper)' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RequirementList({ requirements }: { requirements: Obligation[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
      {requirements.map((o) => (
        <div key={o.obligationId} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: 10, background: 'var(--paper)' }}>
          <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>{o.citation ?? o.obligationId}</div>
          <div style={{ color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.45, fontSize: 11 }}>{o.summary ?? 'Requirement checked during review.'}</div>
        </div>
      ))}
    </div>
  );
}

function EvalCard({ result, judging, onJudge }: { result: RunResult; judging: boolean; onJudge: () => void }) {
  const w = result.withGraph?.score;
  const wo = result.withoutGraph?.score;
  return (
    <div style={{ marginTop: 18, background: '#fff', border: '1px solid var(--rule)', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="eyebrow">Review comparison</div>
        <button onClick={onJudge} disabled={judging} style={{ background: 'none', border: '1px solid var(--rule)', color: 'var(--ink-2)', padding: '6px 12px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {judging ? 'Scoring…' : 'Score with quality review'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Metric label="Requirement coverage" withVal={w ? `${Math.round(w.coverage * 100)}%` : '—'} withoutVal={wo ? `${Math.round(wo.coverage * 100)}%` : '—'} bar={{ withN: (w?.coverage ?? 0), withoutN: (wo?.coverage ?? 0) }} />
        <Metric label="Source citations"  withVal={`${w?.citations ?? 0}`} withoutVal={`${wo?.citations ?? 0}`} bar={{ withN: Math.min(1, (w?.citations ?? 0) / 8), withoutN: Math.min(1, (wo?.citations ?? 0) / 8) }} />
        <Metric label="Output check"           withVal={w?.strictGatePass ? 'Pass' : 'Fail'} withoutVal={wo?.strictGatePass ? 'Pass' : 'Fail'} bar={{ withN: w?.strictGatePass ? 1 : 0, withoutN: wo?.strictGatePass ? 1 : 0 }} />
      </div>

      {(result.withGraph?.judge || result.withoutGraph?.judge) && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Quality review</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '0.04em', marginBottom: 10 }}>
            Rule-based judge
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <JudgePanel title="Compliance review" judge={result.withGraph?.judge} />
            <JudgePanel title="Baseline review" judge={result.withoutGraph?.judge} />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, withVal, withoutVal, bar }: { label: string; withVal: string; withoutVal: string; bar: { withN: number; withoutN: number } }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>
          <span>Compliance review</span><span style={{ color: 'var(--ink)', fontWeight: 500 }}>{withVal}</span>
        </div>
        <div style={{ height: 6, background: 'var(--paper-2, #E8E4DA)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(bar.withN * 100)}%`, height: '100%', background: 'var(--orange)' }} />
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>
          <span>Baseline review</span><span style={{ color: 'var(--ink)', fontWeight: 500 }}>{withoutVal}</span>
        </div>
        <div style={{ height: 6, background: 'var(--paper-2, #E8E4DA)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(bar.withoutN * 100)}%`, height: '100%', background: 'var(--ink-4)' }} />
        </div>
      </div>
    </div>
  );
}

function JudgePanel({ title, judge }: { title: string; judge?: LaneResult['judge'] }) {
  if (!judge) return <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{title} — not scored.</div>;
  const rows: Array<[string, number]> = [
    ['Accuracy', judge.accuracy],
    ['Citations', judge.citations],
    ['Regulatory awareness', judge.regulatoryAwareness],
    ['Completeness', judge.completeness],
  ];
  return (
    <div style={{ background: 'var(--paper)', padding: 12, border: '1px solid var(--rule)' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)', padding: '3px 0' }}>
          <span>{k}</span><span style={{ color: 'var(--ink)', fontWeight: 500 }}>{v.toFixed(1)} / 10</span>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.5, fontStyle: 'italic' }}>{judge.rationale}</div>
    </div>
  );
}

export default Sandbox;
