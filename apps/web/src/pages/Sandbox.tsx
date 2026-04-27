/**
 * Smarticus Sandbox — full implementation.
 *
 * Pick a pre-built task agent, view its sample data, run it in one of three
 * modes (with-graph, without-graph, compare), watch a live ticker show
 * exactly how the agent talks to the Smarticus knowledge graph, score the
 * delta, and download the agent as a self-contained runner.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SmarticusMark, SmarticusWordmark } from '../components/ui/logos.js';
import { api } from '../lib/queryClient.js';

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

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:4000';

export function Sandbox({ initialTaskId }: { initialTaskId?: string }) {
  const [tasks, setTasks] = useState<TaskCard[] | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialTaskId);
  const [mode, setMode] = useState<Mode>('compare');
  const [editing, setEditing] = useState(false);
  const [inputDraft, setInputDraft] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<LaneEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [judging, setJudging] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

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
    setEditing(false);
    api<TaskDetail>(`/api/sandbox/tasks/${selectedId}`)
      .then((d) => {
        setDetail(d);
        // Pick up pre-filled input from Builder's "Run in sandbox" if present.
        let prefilled: string | null = null;
        try {
          const cached = sessionStorage.getItem(`builder:input:${selectedId}`);
          if (cached) {
            prefilled = JSON.stringify(JSON.parse(cached), null, 2);
            sessionStorage.removeItem(`builder:input:${selectedId}`);
            setEditing(true);
          }
        } catch { /* ignore */ }
        setInputDraft(prefilled ?? JSON.stringify(d.sampleData, null, 2));
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [selectedId]);

  const inputJson = useMemo<unknown | undefined>(() => {
    try { return JSON.parse(inputDraft); } catch { return undefined; }
  }, [inputDraft]);
  const inputValid = inputJson !== undefined;

  async function runAgent() {
    if (!detail) return;
    if (editing && !inputValid) return;
    setRunning(true);
    setEvents([]);
    setResult(null);
    eventSourceRef.current?.close();
    try {
      const start = await api<{ runId: string }>(`/api/sandbox/tasks/${detail.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ input: editing && inputValid ? inputJson : detail.sampleData, mode }),
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

  const withEvents    = events.filter((e) => e.lane === 'with-graph');
  const withoutEvents = events.filter((e) => e.lane === 'without-graph');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <header style={{ padding: '36px 40px 24px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>The sandbox</div>
          <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.025em', margin: 0 }}>
            Pick an agent. Run it. Watch it check the requirements.
          </h1>
          <p style={{ marginTop: 8, color: 'var(--ink-3)', fontSize: 14, maxWidth: 640 }}>
            Each agent is pre-bound to its regulatory requirements. Sample data is loaded.
            Run it Smarticus-guided, run it generic, and see the difference.
          </p>
        </div>
        <SmarticusWordmark size={14} tagline="REGULATORY INTELLIGENCE. ENGINEERED." />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 380px', minHeight: 'calc(100vh - 130px)' }}>
        {/* Catalog rail */}
        <aside style={{ borderRight: '1px solid var(--rule)', padding: '20px 14px', overflow: 'auto' }}>
          <div className="eyebrow" style={{ padding: '0 6px 12px' }}>Agent catalog</div>
          {error && <div style={{ padding: 12, color: '#B00020', fontSize: 13 }}>Could not load: {error}</div>}
          {!tasks && !error && <div style={{ padding: 12, color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}
          {tasks?.map((t) => {
            const active = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: active ? 'var(--paper-deep)' : 'transparent',
                  border: `1px solid ${active ? 'var(--ink)' : 'var(--rule)'}`,
                  borderLeft: `3px solid ${active ? 'var(--orange)' : 'transparent'}`,
                  borderRadius: 6, padding: '12px 14px', marginBottom: 10,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SmarticusMark size={18} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{t.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>{t.oneLiner}</div>
                <div className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-4)' }}>{t.regulation}</div>
              </button>
            );
          })}
        </aside>

        {/* Run console */}
        <section style={{ padding: '24px 32px', overflow: 'auto' }}>
          {!detail && <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.6 }}>Pick a task on the left to load its sample data —<br />then run it grounded vs ungrounded to see the difference.</div>}
          {detail && (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">{detail.regulation}</div>
                  <h2 style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em' }}>{detail.name}</h2>
                  <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>{detail.oneLiner}</div>
                  <div style={{ color: 'var(--ink-4)', fontSize: 11, marginTop: 6, letterSpacing: '0.06em' }}>
                    {detail.obligations.length} requirement(s) · jurisdiction {detail.jurisdiction}
                  </div>
                </div>
                <button onClick={downloadAgent} className="btn-orange" style={{ whiteSpace: 'nowrap' }}>
                  ↓ Download agent
                </button>
              </div>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
                {(['with-graph', 'without-graph', 'compare'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      padding: '8px 16px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: mode === m ? 'var(--ink)' : 'transparent',
                      color: mode === m ? 'var(--paper)' : 'var(--ink-2)',
                      border: 0, cursor: 'pointer', borderRight: '1px solid var(--rule)',
                    }}
                  >{m === 'with-graph' ? 'Smarticus-guided' : m === 'without-graph' ? 'Generic AI' : 'Compare'}</button>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 16, lineHeight: 1.55, maxWidth: 640 }}>
                {mode === 'compare'
                  ? 'Run both side-by-side. Watch citations, coverage, and validation pass/fail diverge in real time.'
                  : mode === 'with-graph'
                    ? 'The agent is grounded in the Smarticus knowledge graph \u2014 it cites requirements, qualifies inputs, and gates outputs.'
                    : 'A vanilla LLM call \u2014 no requirements, no citations, no validation. This is the baseline you\u2019re replacing.'}
              </div>

              {/* Sample input + Run */}
              <div style={{ background: '#fff', border: '1px solid var(--rule)', padding: 18, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div className="eyebrow">Sample input</div>
                  <button onClick={() => setEditing((v) => !v)} style={{ background: 'none', border: 0, color: 'var(--orange)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    {editing ? 'Use sample' : 'Edit input'}
                  </button>
                </div>
                {editing ? (
                  <textarea
                    value={inputDraft}
                    onChange={(e) => setInputDraft(e.target.value)}
                    spellCheck={false}
                    style={{ width: '100%', minHeight: 220, fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 12, border: `1px solid ${inputValid ? 'var(--rule)' : '#B00020'}`, background: 'var(--paper)', color: 'var(--ink)' }}
                  />
                ) : (
                  <pre style={{ margin: 0, background: 'var(--paper)', padding: 12, fontSize: 12, lineHeight: 1.5, maxHeight: 240, overflow: 'auto' }}>
{JSON.stringify(detail.sampleData, null, 2)}
                  </pre>
                )}
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button onClick={runAgent} disabled={running || (editing && !inputValid)} className="btn-orange" style={{ fontSize: 13, padding: '12px 24px' }}>
                    {running ? 'Running…' : '▶ Run agent'}
                  </button>
                  {editing && !inputValid && <span style={{ color: '#B00020', fontSize: 12 }}>Input must be valid JSON.</span>}
                </div>
              </div>

              {/* Grounded run summary card */}
              {result?.withGraph && (
                <div style={{
                  background: 'var(--paper-deep)',
                  border: '1px solid var(--rule)',
                  padding: 16,
                  borderRadius: 'var(--r-2)',
                  fontSize: 14,
                  marginBottom: 18,
                  color: 'var(--ink-2)',
                  lineHeight: 1.55,
                }}>
                  Smarticus-guided run checked <strong style={{ color: 'var(--ink)' }}>{result.withGraph.score.obligationsConsulted}</strong> requirements,
                  used <strong style={{ color: 'var(--ink)' }}>{result.withGraph.citations.length}</strong> required data items, attached{' '}
                  <strong style={{ color: 'var(--ink)' }}>{result.withGraph.citations.length}</strong> source citations,{' '}
                  <strong style={{ color: result.withGraph.score.strictGatePass ? 'var(--ok)' : 'var(--err)' }}>
                    {result.withGraph.score.strictGatePass ? 'passed' : 'failed'} output check
                  </strong>,
                  and created a decision trail <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)' }}>#{result.runId}</strong>.
                </div>
              )}

              {/* Console: single or split */}
              {mode === 'compare' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <ConsolePanel title="Smarticus-guided AI"    lane="with-graph"    events={withEvents}    result={result?.withGraph} />
                  <ConsolePanel title="Generic AI" lane="without-graph" events={withoutEvents} result={result?.withoutGraph} />
                </div>
              ) : (
                <ConsolePanel
                  title={mode === 'with-graph' ? 'Smarticus-guided AI' : 'Generic AI'}
                  lane={mode}
                  events={mode === 'with-graph' ? withEvents : withoutEvents}
                  result={mode === 'with-graph' ? result?.withGraph : result?.withoutGraph}
                />
              )}

              {/* Eval card */}
              {result && <EvalCard result={result} judging={judging} onJudge={judgeRun} />}
            </>
          )}
        </section>

        {/* Live requirement lookups */}
        <aside style={{ borderLeft: '1px solid var(--rule)', background: 'var(--paper-deep)', padding: '20px 18px', position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="pulse-orange" />
            <span className="eyebrow" style={{ color: 'var(--ink-2)' }}>Requirement lookups</span>
          </div>
          <GraphTicker events={events.filter((e) => e.type === 'graph.query' || e.type === 'graph.cite')} />
          {detail && (
            <div style={{ marginTop: 24 }}>
              <div className="eyebrow" style={{ color: 'var(--ink-2)', marginBottom: 10 }}>Applicable requirements</div>
              {detail.obligations.map((o) => (
                <div key={o.obligationId} style={{ padding: '10px 12px', borderLeft: '2px solid var(--orange)', background: 'var(--paper)', marginBottom: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{o.citation}</div>
                  <div style={{ color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.45 }}>{o.summary}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function ConsolePanel({ title, lane, events, result }: { title: string; lane: Lane; events: LaneEvent[]; result?: LaneResult }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--rule)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="eyebrow">{title}</div>
        {result && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>
            {Math.round(result.score.coverage * 100)}% coverage · {result.score.citations} cites · {result.durationMs}ms
          </div>
        )}
      </div>
      <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: 14, fontFamily: 'ui-monospace, monospace', fontSize: 11.5, lineHeight: 1.55, minHeight: 200, maxHeight: 360, overflow: 'auto' }}>
        {events.length === 0 && <div style={{ color: 'var(--ink-3)' }}>Waiting for run…</div>}
        {events.map((e, i) => <EventLine key={i} event={e} />)}
        {result?.score?.strictGatePass === true && (
          <div style={{ marginTop: 8, padding: '4px 8px', background: 'rgba(255,255,255,0.06)', display: 'inline-block' }}>
            ✓ Output check validated
          </div>
        )}
        {result?.score?.strictGatePass === false && (
          <div style={{ marginTop: 8, padding: '4px 8px', background: 'rgba(250,80,15,0.18)', color: '#FF7A3D', display: 'inline-block' }}>
            ✗ Output check failed: {result.score.violations.join(', ')}
          </div>
        )}
      </div>
      {result?.output !== undefined && result.output !== null && (
        <div style={{ background: 'var(--paper)', borderTop: '1px solid var(--rule)' }}>
          <div className="eyebrow" style={{ padding: '8px 14px 0' }}>Output</div>
          <pre style={{ margin: 0, padding: '8px 14px 14px', fontSize: 11, maxHeight: 180, overflow: 'auto', lineHeight: 1.5 }}>
{JSON.stringify(result.output, null, 2)}
          </pre>
        </div>
      )}
      {/* Lane reference for accessibility */}
      <span style={{ display: 'none' }}>{lane}</span>
    </div>
  );
}

function EventLine({ event }: { event: LaneEvent }) {
  switch (event.type) {
    case 'agent.thinking':
      return <div style={{ color: 'var(--paper-edge, #9AA4AE)' }}>· {event.message}</div>;
    case 'graph.query':
      return <div>? <span style={{ color: '#FF7A3D' }}>graph.{event.method}</span> → {event.resultCount} result(s) <span style={{ color: 'var(--ink-3)' }}>{event.message}</span></div>;
    case 'graph.cite':
      return <div style={{ display: 'inline-block', background: 'rgba(250,80,15,0.18)', color: '#FF7A3D', padding: '2px 8px', margin: '2px 0', borderRadius: 3 }}>✓ {event.citation}</div>;
    case 'obligation.satisfied':
      return <div style={{ color: '#6FCF97' }}>✓ {event.obligationId}</div>;
    case 'obligation.missed':
      return <div style={{ color: '#FF7A3D' }}>✗ {event.obligationId}</div>;
    case 'output.gated':
      return null;
    case 'run.started':
      return <div style={{ color: 'var(--ink-3)' }}>&gt; Run started</div>;
    case 'run.completed':
      return <div style={{ color: 'var(--ink-3)', marginTop: 6 }}>&gt; Completed in {event.durationMs}ms</div>;
    case 'run.error':
      return <div style={{ color: '#FF7A3D' }}>✗ {event.message}</div>;
  }
}

function GraphTicker({ events }: { events: LaneEvent[] }) {
  if (events.length === 0) return <div style={{ color: 'var(--ink-3)', fontSize: 12.5, lineHeight: 1.55 }}>Live requirement lookups will stream here when a run starts.</div>;
  return (
    <div style={{ fontSize: 12, lineHeight: 1.55 }}>
      {events.slice(-30).map((e, i) => (
        <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--rule)' }}>
          <div style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: '0.08em', marginBottom: 2 }}>{e.lane === 'with-graph' ? 'Smarticus-guided AI' : 'Generic AI'}</div>
          {e.type === 'graph.query' && (
            <>
              <div style={{ color: 'var(--ink-2)' }}>{e.message}</div>
              <div style={{ color: 'var(--orange)', fontFamily: 'ui-monospace, monospace', fontSize: 11, marginTop: 2 }}>graph.{e.method}() → {e.resultCount}</div>
            </>
          )}
          {e.type === 'graph.cite' && (
            <>
              <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{e.citation}</div>
              <div style={{ color: 'var(--ink-3)', fontSize: 11, marginTop: 2 }}>{e.summary}</div>
            </>
          )}
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
        <div className="eyebrow">Eval — Smarticus-guided AI vs Generic AI</div>
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
            Rule-based judge · live LLM scoring coming soon
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <JudgePanel title="Smarticus-guided AI"    judge={result.withGraph?.judge} />
            <JudgePanel title="Generic AI" judge={result.withoutGraph?.judge} />
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
          <span>Smarticus-guided AI</span><span style={{ color: 'var(--ink)', fontWeight: 500 }}>{withVal}</span>
        </div>
        <div style={{ height: 6, background: 'var(--paper-2, #E8E4DA)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(bar.withN * 100)}%`, height: '100%', background: 'var(--orange)' }} />
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>
          <span>Generic AI</span><span style={{ color: 'var(--ink)', fontWeight: 500 }}>{withoutVal}</span>
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
