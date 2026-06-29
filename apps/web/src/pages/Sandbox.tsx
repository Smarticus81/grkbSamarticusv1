/**
 * Agent Templates - launch a medical-device agent against real evidence,
 * then promote the validated run into the managed runtime.
 *
 * Layout
 *   Left  pane  : Evidence input
 *   Right pane  : Agent result · requirement coverage · audit trail
 *
 * The graph-vs-no-graph comparison still exists in the backend, but the user
 * experience presents one governed operating path.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { SmarticusMark } from '../components/ui/logos.js';
import { useAuthenticatedApi } from '../auth/useApi.js';

/* ── Types mirrored from @regground/sandbox ─────────────────────────── */

type ChainHint = { taskId: string; via: string };

type TaskCard = {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  obligationCount: number;
  upstream?: ChainHint[];
  downstream?: ChainHint[];
};

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  items?: JsonSchema;
};

type Obligation = { obligationId: string; regulation?: string; citation?: string; summary?: string };

type TaskDetail = {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  sampleData: unknown;
  inputJsonSchema?: JsonSchema;
  obligations: Obligation[];
  chainHints?: { upstream: ChainHint[]; downstream: ChainHint[] };
};

type Lane = 'with-graph' | 'without-graph';

type LaneEvent =
  | { type: 'run.started'; runId: string; lane: Lane; atIso: string; taskId: string }
  | { type: 'agent.thinking'; lane: Lane; atIso: string; message: string }
  | { type: 'graph.query'; lane: Lane; atIso: string; method: string; args: Record<string, unknown>; resultCount: number; message: string }
  | { type: 'graph.cite'; lane: Lane; atIso: string; obligationId: string; citation: string; regulation: string; summary: string }
  | { type: 'agent.decision'; lane: Lane; atIso: string; decision: string; reason: string }
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

type WorkflowBuildNode = {
  id: string;
  kind: string;
  label: string;
  description?: string;
  automation?: string;
};

type WorkflowBuildSource = {
  id: string;
  name: string;
  processType: string;
  jurisdiction: string;
  description: string | null;
  draft: {
    name: string;
    description?: string;
    processType: string;
    jurisdiction: string;
    regulations: string[];
    nodes: WorkflowBuildNode[];
    edges: Array<{ from: string; to: string; label?: string }>;
  };
};

function regulationList(regulation: string): string[] {
  return regulation.split('·').map((s) => s.trim()).filter(Boolean);
}

function riskBandForTask(taskId: string): 'low' | 'medium' | 'high' {
  const highRiskTasks = new Set([
    'complaint-coder',
    'mir-drafter',
    'root-cause-investigator',
    'capa-plan-drafter',
    'change-impact-assessor',
    'template-compliance-evaluator',
  ]);
  return highRiskTasks.has(taskId) ? 'high' : 'medium';
}

/* ── Component ───────────────────────────────────────────────────────── */

export function Sandbox({ initialTaskId }: { initialTaskId?: string }) {
  const { api, streamSse } = useAuthenticatedApi();
  const [, navigate] = useLocation();

  const [tasks, setTasks] = useState<TaskCard[] | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [workflowSource, setWorkflowSource] = useState<WorkflowBuildSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialTaskId);

  // Input editor state
  const [inputValue, setInputValue] = useState<unknown>(null);
  const [editorTab, setEditorTab] = useState<'form' | 'json'>('form');
  const [jsonDraft, setJsonDraft] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Run state
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<LaneEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  // Promotion state for turning a validated run into a managed agent.
  const [agentName, setAgentName] = useState('');
  const [savingAgent, setSavingAgent] = useState(false);
  const [savedAgentMsg, setSavedAgentMsg] = useState<string | null>(null);
  const [savedAgentOk, setSavedAgentOk] = useState(false);

  // The route is the single source of truth for which template is open.
  // Choosing a template is an explicit first step.
  useEffect(() => { setSelectedId(initialTaskId); }, [initialTaskId]);

  /* Load catalog once (used by the picker and the chain-hints strip). */
  useEffect(() => {
    api<{ tasks: TaskCard[] }>('/api/sandbox/tasks')
      .then((r) => setTasks(r.tasks))
      .catch((e) => setError(String(e?.message ?? e)));
    const workflowId = new URLSearchParams(window.location.search).get('workflow');
    if (workflowId) {
      api<WorkflowBuildSource>(`/api/builder/workflows/${workflowId}`)
        .then((workflow) => setWorkflowSource(workflow))
        .catch((e) => setError(String(e?.message ?? e)));
    }
    return () => { streamAbortRef.current?.abort(); };
  }, []);

  /* Load detail when selection changes; clear everything when nothing is selected. */
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setEvents([]);
      setResult(null);
      return;
    }
    setDetail(null);
    setEvents([]);
    setResult(null);
    setError(null);
    setAgentName('');
    setSavedAgentMsg(null);
    setSavedAgentOk(false);
    api<TaskDetail>(`/api/sandbox/tasks/${selectedId}`)
      .then((d) => {
        setDetail(d);
        // Prefer workflow hand-off input if present.
        let prefilled: unknown | null = null;
        try {
          const cached = sessionStorage.getItem(`builder:input:${selectedId}`);
          if (cached) {
            prefilled = JSON.parse(cached) as unknown;
            sessionStorage.removeItem(`builder:input:${selectedId}`);
          }
        } catch { /* ignore */ }
        const initial = prefilled ?? d.sampleData;
        setInputValue(initial);
        setJsonDraft(JSON.stringify(initial, null, 2));
        setEditorTab('form');
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [selectedId]);

  function updateField(key: string, value: unknown) {
    setInputValue((prev: unknown) => {
      const next = { ...(prev as Record<string, unknown>), [key]: value };
      setJsonDraft(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function applyJsonDraft() {
    try {
      const parsed = JSON.parse(jsonDraft);
      setInputValue(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError(String((e as Error)?.message ?? e));
    }
  }

  function resetToSample() {
    if (!detail) return;
    setInputValue(detail.sampleData);
    setJsonDraft(JSON.stringify(detail.sampleData, null, 2));
    setJsonError(null);
  }

  async function runProcess() {
    if (!detail) return;
    // Make sure raw-JSON edits are committed before sending.
    let body = inputValue;
    if (editorTab === 'json') {
      try {
        body = JSON.parse(jsonDraft);
        setInputValue(body);
        setJsonError(null);
      } catch (e) {
        setJsonError(String((e as Error)?.message ?? e));
        return;
      }
    }
    setRunning(true);
    setEvents([]);
    setResult(null);
    setError(null);
    streamAbortRef.current?.abort();
    try {
      const start = await api<{ runId: string }>(`/api/sandbox/tasks/${detail.id}/run`, {
        method: 'POST',
        body: JSON.stringify({
          input: body,
          mode: 'with-graph',
          agentContext: workflowSource ? workflowBuildContext(workflowSource, detail.name) : undefined,
        }),
      });
      const controller = new AbortController();
      streamAbortRef.current = controller;
      const eventNames = new Set<LaneEvent['type']>([
        'run.started', 'agent.thinking', 'graph.query', 'graph.cite',
        'agent.decision', 'obligation.satisfied', 'obligation.missed', 'output.gated',
        'run.completed', 'run.error',
      ]);
      await streamSse(`/api/sandbox/runs/${start.runId}/stream`, {
        signal: controller.signal,
        onEvent: async ({ event, data }) => {
          if (event === 'stream.end') {
            try {
              const r = await api<RunResult>(`/api/sandbox/runs/${start.runId}/result`);
              setResult(r);
            } catch { /* ignore */ }
            return;
          }
          if (!eventNames.has(event as LaneEvent['type'])) return;
          try {
            const parsed = JSON.parse(data) as LaneEvent;
            setEvents((prev) => [...prev, parsed]);
          } catch { /* ignore */ }
        },
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(String((e as Error)?.message ?? e));
      }
    } finally {
      streamAbortRef.current = null;
      setRunning(false);
    }
  }

  /* Save the current task + edited input as a managed medical-device agent. */
  async function saveAsAgent() {
    if (!detail) return;
    const lane = result?.withGraph ?? result?.withoutGraph;
    if (!result?.runId || !lane) {
      setSavedAgentOk(false);
      setSavedAgentMsg('Run the module before release for routine use.');
      return;
    }
    if (!lane.score.strictGatePass) {
      setSavedAgentOk(false);
      setSavedAgentMsg('This run did not meet the acceptance criteria. Resolve issues before release for routine use.');
      return;
    }
    const name =
      agentName.trim() ||
      `${detail.name} module`;
    const riskBand = riskBandForTask(detail.id);
    const regulations = regulationList(detail.regulation);

    setSavingAgent(true);
    setSavedAgentMsg(null);
    try {
      await api<{ id: string }>('/api/builder/agents', {
        method: 'POST',
        body: JSON.stringify({
          name,
          processId: detail.id,
          processTitle: detail.name,
          taskId: detail.id,
          regulations,
          evidenceStatus: {},
          guardrails: { qualification: true, compliance: true, 'review-gate': false, 'strict-schema': true },
          outputFormat: 'draft-doc',
          deployTarget: 'claude-managed-agents',
          riskBand,
          description: detail.oneLiner,
          sourceRunId: result.runId,
        }),
      });
      setSavedAgentOk(true);
      setSavedAgentMsg(`Created "${name}" from validated run ${result.runId.slice(0, 12)}.`);
    } catch (e) {
      setSavedAgentOk(false);
      setSavedAgentMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSavingAgent(false);
    }
  }

  const workflowTaskSuggestions = workflowSource && tasks
    ? suggestWorkflowTasks(workflowSource, tasks)
    : [];

  /* ── Catalog state ─────────────────────────────────────────────── */
  if (!detail) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
        <header style={{ padding: '40px 40px 8px' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Modules</div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: '-0.045em', margin: 0 }}>
            Choose a module.
          </h1>
          <p style={{ marginTop: 8, color: 'var(--ink-3)', fontSize: 13.5, maxWidth: 540, lineHeight: 1.55 }}>
            Run it against your source data. Once it meets acceptance criteria, release it for routine use.
          </p>
        </header>
        <div style={{ padding: '24px 40px 56px' }}>
          {error && <div style={{ padding: 12, color: 'var(--err)', fontSize: 13 }}>Could not load: {error}</div>}
          {!tasks && !error && <div style={{ padding: 12, color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}
          {workflowSource && (
            <WorkflowBuildSourcePanel
              workflow={workflowSource}
              tasks={workflowTaskSuggestions}
              onPick={(taskId) => navigate(`/app/sandbox/${taskId}?workflow=${encodeURIComponent(workflowSource.id)}`)}
              onOpenWorkflow={() => navigate(`/app/designer?workflow=${encodeURIComponent(workflowSource.id)}`)}
            />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {tasks?.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/app/sandbox/${t.id}`)}
                style={{
                  textAlign: 'left',
                  background: 'var(--surface)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius)',
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 10,
                  aspectRatio: '1 / 1',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SmarticusMark size={18} />
                    <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)', lineHeight: 1.25 }}>{t.name}</span>
                  </div>
                  <div style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    lineHeight: 1.45,
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {t.oneLiner}
                  </div>
                </div>
                <span style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 650 }}>Run module -&gt;</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const laneForPromotion = result?.withGraph ?? result?.withoutGraph;
  const canPromote = !!laneForPromotion?.score.strictGatePass;
  const promotionExplanations = explainPromotionBlockers(laneForPromotion?.score.violations ?? [], events);

  /* ── Focused agent launcher ─────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <header
        style={{
          padding: '20px 32px 16px',
          borderBottom: '1px solid var(--rule)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button
            onClick={() => navigate('/app/sandbox')}
            style={GHOST_BUTTON}
          >
            ← Modules
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {detail.name}
          </h1>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{detail.regulation}</span>
          <ChainHintsStrip
            upstream={detail.chainHints?.upstream ?? []}
            downstream={detail.chainHints?.downstream ?? []}
            tasks={tasks ?? []}
            onPick={(id) => navigate(`/app/sandbox/${id}`)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={resetToSample} style={GHOST_BUTTON} disabled={running}>Reset source data</button>
          <button
            onClick={runProcess}
            disabled={running}
            className="btn-orange"
            style={{ fontSize: 14, padding: '10px 22px' }}
          >
            {running ? 'Running...' : 'Run module'}
          </button>
        </div>
      </header>

      <Stepper current={result ? 'save' : running ? 'run' : 'configure'} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)',
          gap: 20,
          padding: '20px 32px 56px',
          alignItems: 'start',
        }}
      >
        {/* ── LEFT: Input editor ─────────────────────────────────── */}
        <section style={CARD}>
          <div style={CARD_HEADER}>
            <div className="eyebrow">Source data input</div>
            <div style={{ display: 'flex', gap: 4, border: '1px solid var(--rule)', borderRadius: 6, padding: 2 }}>
              <TabButton active={editorTab === 'form'} onClick={() => setEditorTab('form')}>Form</TabButton>
              <TabButton active={editorTab === 'json'} onClick={() => setEditorTab('json')}>Advanced</TabButton>
            </div>
          </div>
          <p style={{ margin: '4px 16px 0', color: 'var(--ink-3)', fontSize: 12 }}>{detail.oneLiner}</p>

          {editorTab === 'form' ? (
            <InputForm
              schema={detail.inputJsonSchema}
              value={inputValue as Record<string, unknown> | null}
              onChange={updateField}
              disabled={running}
            />
          ) : (
            <div style={{ padding: '12px 16px 16px' }}>
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                onBlur={applyJsonDraft}
                spellCheck={false}
                disabled={running}
                style={{
                  width: '100%',
                  minHeight: 360,
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  lineHeight: 1.5,
                  border: '1px solid var(--rule)',
                  borderRadius: 6,
                  padding: 10,
                  resize: 'vertical',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                }}
              />
              {jsonError && (
                <div style={{ marginTop: 6, color: 'var(--err)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                  {jsonError}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── RIGHT: Live reasoning + result ────────────────────── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ padding: 12, color: 'var(--err)', fontSize: 13, border: '1px solid var(--err-edge)', borderRadius: 8, background: 'var(--err-soft)' }}>
              {error}
            </div>
          )}

          {!running && !result && (
            <div style={{ ...CARD, padding: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Launch checklist</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  Add the <b style={{ color: 'var(--ink)' }}>source data</b> the module should process, or run the starter input first.
                </li>
                <li style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  Press <b style={{ color: 'var(--ink)' }}>Run module</b> to check the work against requirements.
                </li>
                <li style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  Review the <b style={{ color: 'var(--ink)' }}>result</b>, requirement coverage, and audit trail before release.
                </li>
              </ol>
            </div>
          )}

          {(running || result) && (
            <AnswerPanel
              result={result}
              running={running}
              taskName={detail.name}
            />
          )}

          {(events.length > 0 || result) && (
            <RegulationsPanel
              events={events}
              result={result}
              fallback={detail.obligations}
            />
          )}

          {events.length > 0 && (
            <TracePanel
              events={events}
              runId={result?.runId}
              onOpenFullTrace={result ? () => navigate(`/app/trails/${result.runId}`) : undefined}
            />
          )}

          {result && !running && (
            <section style={{ ...CARD, padding: 18, background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-warm) 100%)', borderColor: 'var(--signal-edge)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Release for routine use</div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                    Turn this qualified run into a reusable module.
                  </h2>
                </div>
                {savedAgentOk && (
                  <button onClick={() => navigate('/app/builder')} className="btn btn-orange" style={{ fontSize: 12 }}>
                    Open Routine Use
                  </button>
                )}
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
                Capture the source data input, validation results, and controls from this run. The module can then be versioned and used again.
              </p>
              {!canPromote && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    border: '1px solid rgba(176, 0, 32, 0.18)',
                    borderRadius: 10,
                    background: 'rgba(176, 0, 32, 0.05)',
                    fontSize: 12.5,
                    color: 'var(--err)',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 650, marginBottom: 6 }}>
                    This run cannot be released until acceptance criteria are met.
                  </div>
                  {promotionExplanations.length > 0 ? (
                    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                      {promotionExplanations.slice(0, 5).map((item) => (
                        <div
                          key={item.key}
                          style={{
                            padding: '10px 12px',
                            border: '1px solid rgba(176, 0, 32, 0.14)',
                            borderRadius: 10,
                            background: 'var(--surface)',
                            color: 'var(--ink-2)',
                          }}
                        >
                          <div style={{ fontWeight: 650, color: 'var(--ink)', marginBottom: 4 }}>
                            {item.title}
                          </div>
                          <div style={{ color: 'var(--err)' }}>
                            {item.reason}
                          </div>
                          <div style={{ marginTop: 5, color: 'var(--ink-3)' }}>
                            {item.nextStep}
                          </div>
                          {item.reference && (
                            <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>
                              {item.reference}
                            </div>
                          )}
                        </div>
                      ))}
                      {promotionExplanations.length > 5 && (
                        <div style={{ color: 'var(--ink-3)' }}>
                          {promotionExplanations.length - 5} more item{promotionExplanations.length - 5 === 1 ? '' : 's'} are listed in the requirement coverage panel.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      Review requirement coverage and the audit trail for unmet acceptance criteria.
                    </div>
                  )}
                </div>
              )}
              {savedAgentOk ? (
                <div
                  style={{
                    padding: 12,
                    border: '1px solid rgba(42, 140, 79, 0.22)',
                    borderRadius: 10,
                    background: 'rgba(42, 140, 79, 0.06)',
                    fontSize: 13,
                    color: 'var(--ok, #2a8c4f)',
                  }}
                >
                  {savedAgentMsg}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div
                    style={{
                      padding: 14,
                      border: '1px solid rgba(255, 115, 0, 0.28)',
                      borderRadius: 12,
                      background: 'var(--surface)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)' }}>
                        Qualified Module
                      </div>
                      <span style={{ ...SMALL_RUNTIME_PILL, color: 'var(--orange)', borderColor: 'rgba(255, 115, 0, 0.34)' }}>
                        routine use
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-3)' }}>
                      This stores the qualified input set and controls for repeated use.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder={`${detail.name} module`}
                      disabled={savingAgent}
                      style={{
                        flex: 1,
                        minWidth: 180,
                        fontFamily: 'var(--sans)',
                        fontSize: 13,
                        color: 'var(--ink)',
                        background: 'var(--surface)',
                        border: '1px solid var(--rule-strong)',
                        borderRadius: 10,
                        padding: '10px 12px',
                      }}
                    />
                    <button
                      onClick={saveAsAgent}
                      disabled={savingAgent || !canPromote}
                      className="btn-orange"
                      style={{ fontSize: 13, padding: '10px 18px' }}
                    >
                      {savingAgent ? 'Creating...' : canPromote ? 'Release module' : 'Criteria not met'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={SMALL_RUNTIME_PILL}>source data snapshot</span>
                    <span style={SMALL_RUNTIME_PILL}>controls on</span>
                    <span style={SMALL_RUNTIME_PILL}>routine use</span>
                  </div>
                </div>
              )}
              {savedAgentMsg && !savedAgentOk && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--err)' }}>{savedAgentMsg}</div>
              )}
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--rule)',
  borderRadius: 'var(--radius)',
};
const CARD_HEADER: React.CSSProperties = {
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--rule)',
};
const GHOST_BUTTON: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--rule-strong)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--ink-2)',
  cursor: 'pointer',
};
const SMALL_RUNTIME_PILL: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 7px',
  border: '1px solid var(--rule-strong)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
  color: 'var(--ink-3)',
  fontFamily: 'var(--sans)',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

function WorkflowBuildSourcePanel({
  workflow,
  tasks,
  onPick,
  onOpenWorkflow,
}: {
  workflow: WorkflowBuildSource;
  tasks: TaskCard[];
  onPick: (taskId: string) => void;
  onOpenWorkflow: () => void;
}) {
  const agenticSteps = workflowAgenticSteps(workflow);
  return (
    <section
      style={{
        marginBottom: 18,
        border: '1px solid rgba(255, 115, 0, 0.24)',
        borderRadius: 16,
        background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-warm) 100%)',
        padding: 18,
        boxShadow: '0 18px 42px rgba(17, 24, 39, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Workflow source</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
            {workflow.name}
          </h2>
          <p style={{ margin: '7px 0 0', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5, maxWidth: 720 }}>
            Built in Workflow Builder. Pick a module below to validate one step, capture the audit trail, then release the qualified run.
          </p>
        </div>
        <button onClick={onOpenWorkflow} style={GHOST_BUTTON}>
          Edit workflow
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={SMALL_RUNTIME_PILL}>{workflow.draft.nodes.length} steps</span>
        <span style={SMALL_RUNTIME_PILL}>{agenticSteps.length} module steps</span>
        <span style={SMALL_RUNTIME_PILL}>{workflow.processType || workflow.draft.processType || 'process'}</span>
        <span style={SMALL_RUNTIME_PILL}>{workflow.jurisdiction || workflow.draft.jurisdiction || 'jurisdiction'}</span>
      </div>

      {agenticSteps.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginBottom: 14 }}>
          {agenticSteps.slice(0, 5).map((step) => (
            <div
              key={step.id}
              style={{
                padding: '11px 12px',
                border: '1px solid var(--rule)',
                borderRadius: 12,
                background: 'var(--surface)',
                minHeight: 86,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--ink)', marginBottom: 5 }}>{step.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                {step.description || step.kind.replace(/_/g, ' ')}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {tasks.length > 0 ? tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onPick(task.id)}
            style={{
              minHeight: 132,
              textAlign: 'left',
              background: 'var(--surface)',
              border: '1px solid rgba(255, 115, 0, 0.22)',
              borderRadius: 14,
              padding: 14,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)' }}>{task.name}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                {task.oneLiner}
              </div>
            </div>
            <span style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 650 }}>Run module -&gt;</span>
          </button>
        )) : (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>
            No direct module match found. Use the full module list below to choose the closest fit.
          </div>
        )}
      </div>
    </section>
  );
}

function workflowAgenticSteps(workflow: WorkflowBuildSource): WorkflowBuildNode[] {
  return workflow.draft.nodes.filter((node) =>
    node.kind === 'agent_task' ||
    node.kind === 'compliance_check' ||
    node.kind === 'evidence_capture' ||
    node.automation === 'agent' ||
    node.automation === 'hybrid',
  );
}

function suggestWorkflowTasks(workflow: WorkflowBuildSource, tasks: TaskCard[]): TaskCard[] {
  const processText = `${workflow.name} ${workflow.processType} ${workflow.draft.processType} ${workflow.draft.description ?? ''}`.toLowerCase();
  const selected = new Map<string, TaskCard>();
  const aliases: Array<[RegExp, string[]]> = [
    [/complaint|triage|imdrf|coding/, ['complaint-coder']],
    [/adverse|vigilance|reportability|mir/, ['ae-reportability', 'mir-drafter']],
    [/capa|corrective|preventive|root cause/, ['root-cause-investigator', 'capa-plan-drafter']],
    [/nonconformance|disposition/, ['nonconformance-dispositioner']],
    [/trend|pms|post-market/, ['trend-determination']],
    [/change|impact/, ['change-impact-assessor']],
    [/audit|finding/, ['audit-finding-drafter']],
    [/psur|periodic safety|template/, ['template-compliance-evaluator', 'psur-template-reviewer']],
  ];

  for (const [pattern, ids] of aliases) {
    if (!pattern.test(processText)) continue;
    for (const id of ids) {
      const task = tasks.find((candidate) => candidate.id === id);
      if (task) selected.set(task.id, task);
    }
  }

  const scored = tasks
    .map((task) => ({ task, score: workflowTaskScore(workflow, task) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const item of scored) {
    selected.set(item.task.id, item.task);
    if (selected.size >= 4) break;
  }
  return Array.from(selected.values()).slice(0, 4);
}

function workflowTaskScore(workflow: WorkflowBuildSource, task: TaskCard): number {
  const workflowTerms = tokenize([
    workflow.name,
    workflow.processType,
    workflow.draft.processType,
    workflow.draft.description ?? '',
    ...workflow.draft.nodes.map((node) => `${node.label} ${node.description ?? ''}`),
  ].join(' '));
  const taskTerms = tokenize(`${task.name} ${task.oneLiner} ${task.regulation}`);
  let score = 0;
  for (const term of workflowTerms) {
    if (taskTerms.has(term)) score += term.length > 6 ? 2 : 1;
  }
  return score;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 3),
  );
}

function workflowBuildContext(workflow: WorkflowBuildSource, taskName: string): string {
  const nodes = workflow.draft.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    description: node.description,
    automation: node.automation,
  }));
  return [
    `This run is part of the saved workflow "${workflow.name}".`,
    `Workflow process type: ${workflow.processType || workflow.draft.processType || 'unspecified'}.`,
    `Workflow jurisdiction: ${workflow.jurisdiction || workflow.draft.jurisdiction || 'unspecified'}.`,
    `Current module: ${taskName}.`,
    'Use the workflow only as process context. The regulatory decision must still be based on the input source data and applicable requirements loaded for this run.',
    `Workflow steps: ${JSON.stringify(nodes)}`,
    `Workflow edges: ${JSON.stringify(workflow.draft.edges)}`,
  ].join('\n');
}

type PromotionExplanation = {
  key: string;
  title: string;
  reason: string;
  nextStep: string;
  reference?: string;
};

function explainPromotionBlockers(violations: string[], events: LaneEvent[]): PromotionExplanation[] {
  return violations.map((violation, idx) => {
    if (violation.startsWith('obligation:')) {
      const obligationId = violation.slice('obligation:'.length);
      const missed = [...events]
        .reverse()
        .find((event): event is Extract<LaneEvent, { type: 'obligation.missed' }> =>
          event.type === 'obligation.missed' && event.obligationId === obligationId,
        );
      const cited = events.find((event): event is Extract<LaneEvent, { type: 'graph.cite' }> =>
        event.type === 'graph.cite' && event.obligationId === obligationId,
      );
      return explainObligationBlocker(obligationId, missed?.reason, cited);
    }
    if (violation.startsWith('output.')) {
      return {
        key: `${violation}-${idx}`,
        title: 'The module output was missing required structure.',
        reason: toSentence(violation.replace(/^output\./, '')),
        nextStep: 'Review the generated result, add the missing source data, then run the module again.',
      };
    }
    if (violation.startsWith('run.error:')) {
      return {
        key: `${violation}-${idx}`,
        title: 'The run did not complete successfully.',
        reason: toSentence(violation.replace(/^run\.error:\s*/, '')),
        nextStep: 'Run the module again after correcting the error shown in the audit trail.',
      };
    }
    return {
      key: `${violation}-${idx}`,
      title: 'The run did not pass validation.',
      reason: toSentence(violation),
      nextStep: 'Review the requirement coverage above, update the source data or result, and run the module again.',
    };
  });
}

function explainObligationBlocker(
  obligationId: string,
  reason: string | undefined,
  cited: Extract<LaneEvent, { type: 'graph.cite' }> | undefined,
): PromotionExplanation {
  const title = obligationTitle(obligationId, cited?.summary);
  return {
    key: obligationId,
    title,
    reason: plainReason(reason),
    nextStep: nextStepForObligation(obligationId),
    reference: cited?.citation
      ? `Reference: ${cited.citation}`
      : `Requirement: ${obligationId}`,
  };
}

function obligationTitle(obligationId: string, summary?: string): string {
  if (summary && !summary.toLowerCase().includes('loading')) return summary;
  if (obligationId.startsWith('IMDRF.AET')) return 'The adverse-event coding was not fully supported.';
  if (obligationId.startsWith('ISO13485.8.2.2')) return 'The complaint-handling record was not fully supported.';
  if (obligationId.startsWith('EUMDR.87')) return 'The EU MDR reportability decision was not fully supported.';
  if (obligationId.startsWith('CFR820.198')) return 'The FDA complaint-file requirement was not fully supported.';
  return 'A required compliance check was not fully supported.';
}

function plainReason(reason: string | undefined): string {
  if (!reason) {
    return 'The run did not provide enough source data or rationale for this requirement.';
  }
  if (reason.includes('not bound to process')) {
    return 'This requirement is claimed by the module, but the current requirement map did not bind it to this process. Release is blocked because the scope is inconsistent.';
  }
  if (reason === 'Output did not satisfy obligation check.') {
    return 'The generated result did not prove that this requirement was satisfied.';
  }
  return toSentence(reason);
}

function nextStepForObligation(obligationId: string): string {
  if (obligationId.startsWith('IMDRF.AET')) {
    return 'Add enough event detail for device problem, clinical signs, health impact, investigation outcome, and coding rationale, then run the module again.';
  }
  if (obligationId.startsWith('ISO13485.8.2.2')) {
    return 'Add complaint record source data such as receipt date, reporter, investigation status, actions taken, and required complaint-handling rationale.';
  }
  if (obligationId.startsWith('EUMDR.87')) {
    return 'Add the facts needed for reportability: seriousness, incident outcome, timing, region, and why the event is or is not reportable.';
  }
  if (obligationId.startsWith('CFR820.198')) {
    return 'Add FDA complaint-file source data such as investigation decision, MDR evaluation, corrective action link, or closure rationale.';
  }
  return 'Add the missing source data or rationale for this requirement, then run the module again.';
}

function toSentence(value: string): string {
  const cleaned = value
    .replace(/^obligation:/, '')
    .replace(/[_:]+/g, ' ')
    .trim();
  if (!cleaned) return 'The run did not provide enough source data for this check.';
  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
}

/* ── Flow stepper ────────────────────────────────────────────────────── */

const FLOW_STEPS = [
  { key: 'select', label: 'Select module' },
  { key: 'configure', label: 'Add source data' },
  { key: 'run', label: 'Run checks' },
  { key: 'save', label: 'Release module' },
] as const;

/** Slim Select → Evidence → Ground → Promote indicator on the run screen. */
function Stepper({ current }: { current: 'configure' | 'run' | 'save' }) {
  const currentIdx = FLOW_STEPS.findIndex((s) => s.key === current);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0,
        padding: '12px 32px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--paper-deep)',
      }}
    >
      {FLOW_STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = s.key === current;
        const color = active ? 'var(--orange)' : done ? 'var(--ink)' : 'var(--ink-4)';
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `1.5px solid ${active || done ? color : 'var(--rule-strong)'}`,
                  background: done ? 'var(--ink)' : 'transparent',
                  color: done ? 'var(--paper)' : color,
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 12, color, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <span style={{ width: 22, height: 1, background: 'var(--rule)', margin: '0 12px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--paper)' : 'transparent',
        border: 'none',
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 11,
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function labelFromKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Chain hints strip (focused header) ─────────────────────────────── */

function ChainHintsStrip({
  upstream,
  downstream,
  tasks,
  onPick,
}: {
  upstream: ChainHint[];
  downstream: ChainHint[];
  tasks: TaskCard[];
  onPick: (id: string) => void;
}) {
  if (upstream.length === 0 && downstream.length === 0) return null;
  const nameFor = (id: string) => tasks.find((t) => t.id === id)?.name ?? id;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8, flexWrap: 'wrap' }}>
      {upstream.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Receives from:{' '}
          {upstream.map((h, i) => (
            <ChainChip key={`u-${h.taskId}`} label={nameFor(h.taskId)} title={h.via} onClick={() => onPick(h.taskId)} trailingComma={i < upstream.length - 1} />
          ))}
        </span>
      )}
      {downstream.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          Feeds into:{' '}
          {downstream.map((h, i) => (
            <ChainChip key={`d-${h.taskId}`} label={nameFor(h.taskId)} title={h.via} onClick={() => onPick(h.taskId)} trailingComma={i < downstream.length - 1} />
          ))}
        </span>
      )}
    </div>
  );
}

function ChainChip({ label, title, onClick, trailingComma }: { label: string; title: string; onClick: () => void; trailingComma: boolean }) {
  return (
    <>
      <button
        onClick={onClick}
        title={title}
        style={{
          display: 'inline-block',
          background: 'transparent',
          border: '1px solid var(--rule)',
          borderRadius: 999,
          padding: '1px 8px',
          fontSize: 11,
          color: 'var(--ink-2)',
          cursor: 'pointer',
          margin: '0 2px',
        }}
      >
        {label}
      </button>
      {trailingComma ? ' ' : ''}
    </>
  );
}

/* ── Form auto-generated from JSON Schema ───────────────────────────── */

function InputForm({
  schema,
  value,
  onChange,
  disabled,
}: {
  schema?: JsonSchema;
  value: Record<string, unknown> | null;
  onChange: (key: string, val: unknown) => void;
  disabled: boolean;
}) {
  // Derive the field list from the schema if available; otherwise infer from value.
  const fields: Array<[string, JsonSchema]> = useMemo(() => {
    if (schema?.properties) return Object.entries(schema.properties);
    if (value && typeof value === 'object') {
      return Object.entries(value).map(([k, v]) => [k, inferSchema(v)]);
    }
    return [];
  }, [schema, value]);

  if (!value || typeof value !== 'object') {
    return (
      <div style={{ padding: 16, color: 'var(--ink-3)', fontSize: 12 }}>
        This template expects a structured payload. Use the Advanced tab.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fields.map(([key, fieldSchema]) => (
        <FieldRow
          key={key}
          name={key}
          schema={fieldSchema}
          value={(value as Record<string, unknown>)[key]}
          onChange={(v) => onChange(key, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function inferSchema(v: unknown): JsonSchema {
  if (typeof v === 'string') return { type: 'string' };
  if (typeof v === 'number') return { type: 'number' };
  if (typeof v === 'boolean') return { type: 'boolean' };
  if (Array.isArray(v)) return { type: 'array' };
  if (v && typeof v === 'object') return { type: 'object' };
  return {};
}

function FieldRow({
  name,
  schema,
  value,
  onChange,
  disabled,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  const label = labelFromKey(name);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const isEnum = Array.isArray(schema.enum) && schema.enum.length > 0;
  const isLongText =
    type === 'string' && ((schema.minLength ?? 0) >= 20 || /description|notes|details|narrative|comment/i.test(name));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'var(--surface)',
    border: '1px solid var(--rule)',
    borderRadius: 6,
    padding: '8px 10px',
  };

  let control: React.ReactNode;
  if (isEnum) {
    control = (
      <select
        value={value as string ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      >
        {(schema.enum as unknown[]).map((opt) => (
          <option key={String(opt)} value={String(opt)}>{labelFromKey(String(opt))}</option>
        ))}
      </select>
    );
  } else if (type === 'boolean') {
    control = (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {value ? 'Yes' : 'No'}
      </label>
    );
  } else if (type === 'number' || type === 'integer') {
    control = (
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        min={schema.minimum}
        max={schema.maximum}
        onChange={(e) => {
          const n = e.target.value === '' ? 0 : Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        disabled={disabled}
        style={inputStyle}
      />
    );
  } else if (type === 'string' && isLongText) {
    control = (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        style={{ ...inputStyle, fontFamily: 'var(--sans)', resize: 'vertical' }}
      />
    );
  } else if (type === 'string') {
    control = (
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      />
    );
  } else {
    // arrays, objects, unknown → JSON snippet
    const draft = JSON.stringify(value, null, 2);
    control = (
      <textarea
        defaultValue={draft}
        onBlur={(e) => {
          try { onChange(JSON.parse(e.target.value)); } catch { /* ignore */ }
        }}
        disabled={disabled}
        rows={4}
        style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 12, resize: 'vertical' }}
      />
    );
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
        {label}
        {schema.description && (
          <span style={{ color: 'var(--ink-4)', marginLeft: 6, fontStyle: 'italic' }}>{schema.description}</span>
        )}
      </label>
      {control}
    </div>
  );
}

/* ── Answer panel ─────────────────────────────────────────────────── */

function AnswerPanel({
  result,
  running,
  taskName,
}: {
  result: RunResult | null;
  running: boolean;
  taskName: string;
}) {
  const lane = result?.withGraph ?? result?.withoutGraph;
  return (
    <section style={CARD}>
      <div style={CARD_HEADER}>
        <div className="eyebrow">Answer</div>
        {lane && (
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
            {lane.durationMs} ms · {lane.score.obligationsConsulted} checks
          </span>
        )}
      </div>
      <div style={{ padding: 16 }}>
        {running && !lane && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
            {taskName} is working…
          </div>
        )}
        {lane?.error && (
          <div style={{ color: 'var(--err)', fontSize: 13 }}>{lane.error}</div>
        )}
        {lane && !lane.error && lane.output != null && (
          <OutputRenderer value={lane.output} />
        )}
      </div>
    </section>
  );
}

/* Renders the agent's structured output in a human-friendly way.
 * Recognises the common shapes used by sandbox tasks:
 *   - { decisions: [{jurisdiction, reportable, clockDays, reasoning, citation}] }
 *   - { summary: string, ... }
 *   - generic objects → labelled rows
 */
function OutputRenderer({ value }: { value: unknown }) {
  if (value == null) return <Muted>No output.</Muted>;
  if (typeof value !== 'object') return <div style={{ fontSize: 14, color: 'var(--ink)' }}>{String(value)}</div>;

  const obj = value as Record<string, unknown>;

  // Per-jurisdiction reportability decisions (AE / Complaint coder etc).
  if (Array.isArray(obj.decisions)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {typeof obj.summary === 'string' && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}>{obj.summary}</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {(obj.decisions as Array<Record<string, unknown>>).map((d, i) => (
            <DecisionCard key={i} decision={d} />
          ))}
        </div>
        {typeof obj.trendReportTriggered === 'boolean' && (
          <div style={{ fontSize: 12, color: obj.trendReportTriggered ? 'var(--orange)' : 'var(--ink-3)' }}>
            Trend report {obj.trendReportTriggered ? 'triggered' : 'not triggered'}.
          </div>
        )}
      </div>
    );
  }

  // PSUR Content Review - per-obligation content findings.
  const findings = obj.findings;
  if (
    Array.isArray(findings) &&
    findings.length > 0 &&
    findings.every((f) => !!f && typeof f === 'object' && 'assessment' in (f as object) && 'status' in (f as object))
  ) {
    return <PsurFindingsView obj={obj} findings={findings as Array<Record<string, unknown>>} />;
  }

  // PSUR Template Reviewer - per-obligation section coverage.
  const coverage = obj.coverage;
  if (
    Array.isArray(coverage) &&
    coverage.length > 0 &&
    coverage.every((c) => !!c && typeof c === 'object' && 'status' in (c as object) && 'mappedSection' in (c as object))
  ) {
    return <PsurCoverageView obj={obj} coverage={coverage as Array<Record<string, unknown>>} />;
  }

  // Generic object - show top-level fields.
  const entries = Object.entries(obj);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(([k, v]) => (
        <ValueRow key={k} label={labelFromKey(k)} value={v} />
      ))}
    </div>
  );
}

const STATUS_CHIP: Record<string, { color: string; bg: string; label: string }> = {
  met: { color: 'var(--ok)', bg: 'var(--ok-soft)', label: 'Met' },
  covered: { color: 'var(--ok)', bg: 'var(--ok-soft)', label: 'Covered' },
  partial: { color: 'var(--warn)', bg: 'var(--warn-soft)', label: 'Partial' },
  gap: { color: 'var(--orange)', bg: 'rgba(250,80,15,0.10)', label: 'Gap' },
  'not-covered': { color: 'var(--orange)', bg: 'rgba(250,80,15,0.10)', label: 'Not covered' },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_CHIP[status] ?? { color: 'var(--ink-2)', bg: 'var(--paper-deep)', label: status };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 8px',
        borderRadius: 10,
        border: `1px solid ${s.color}`,
        color: s.color,
        background: s.bg,
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

function OverallBanner({ status, text }: { status: string; text: string }) {
  const good = status === 'compliant' || status === 'ready';
  const minor = status === 'minor-gaps' || status === 'minor-changes';
  const color = good ? '#0f7a4d' : minor ? '#a8650a' : 'var(--orange)';
  const bg = good ? 'rgba(15,122,77,0.08)' : minor ? 'rgba(168,101,10,0.08)' : 'rgba(250,80,15,0.08)';
  return (
    <div style={{ border: `1px solid ${color}`, background: bg, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color }}>
        {status.replace(/-/g, ' ')}
      </div>
      {text && <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, marginTop: 4 }}>{text}</div>}
    </div>
  );
}

function PsurFindingsView({ obj, findings }: { obj: Record<string, unknown>; findings: Array<Record<string, unknown>> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {typeof obj.overallStatus === 'string' && (
        <OverallBanner status={obj.overallStatus} text={typeof obj.recommendation === 'string' ? obj.recommendation : ''} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {findings.map((f, i) => {
          const status = String(f.status ?? '');
          const evidence = typeof f.evidence === 'string' ? f.evidence : '';
          const gap = typeof f.gap === 'string' ? f.gap : '';
          return (
            <div key={i} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: 12, background: 'var(--paper)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>
                  {String(f.requirement ?? f.obligationId ?? '')}
                </div>
                <StatusChip status={status} />
              </div>
              {typeof f.assessment === 'string' && f.assessment && (
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 6 }}>{f.assessment}</div>
              )}
              {evidence && (
                <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid var(--rule-strong)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, fontStyle: 'italic' }}>
                  {evidence}
                </div>
              )}
              {gap && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--orange)', lineHeight: 1.5 }}>
                  <b>Gap:</b> {gap}
                </div>
              )}
              {typeof f.citation === 'string' && f.citation && (
                <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{f.citation}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PsurCoverageView({ obj, coverage }: { obj: Record<string, unknown>; coverage: Array<Record<string, unknown>> }) {
  const missing = Array.isArray(obj.missingSections) ? (obj.missingSections as unknown[]).map(String).filter(Boolean) : [];
  const recs = Array.isArray(obj.structuralRecommendations)
    ? (obj.structuralRecommendations as unknown[]).map(String).filter(Boolean)
    : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {typeof obj.readiness === 'string' && (
        <OverallBanner status={obj.readiness} text={typeof obj.summary === 'string' ? obj.summary : ''} />
      )}
      {missing.length > 0 && (
        <div style={{ border: '1px solid var(--orange)', background: 'rgba(250,80,15,0.06)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--orange)', marginBottom: 4 }}>
            Sections to add
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{missing.join(' · ')}</div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {coverage.map((c, i) => {
          const status = String(c.status ?? '');
          const mapped = typeof c.mappedSection === 'string' ? c.mappedSection : '';
          const rec = typeof c.recommendation === 'string' ? c.recommendation : '';
          return (
            <div key={i} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: 12, background: 'var(--paper)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>
                  {String(c.requirement ?? c.obligationId ?? '')}
                </div>
                <StatusChip status={status} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
                {mapped ? <>Maps to section: <b style={{ color: 'var(--ink-2)' }}>{mapped}</b></> : 'No section captures this requirement.'}
              </div>
              {typeof c.rationale === 'string' && c.rationale && (
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 6 }}>{c.rationale}</div>
              )}
              {rec && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--orange)', lineHeight: 1.5 }}>
                  <b>Recommend:</b> {rec}
                </div>
              )}
              {typeof c.citation === 'string' && c.citation && (
                <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{c.citation}</div>
              )}
            </div>
          );
        })}
      </div>
      {recs.length > 0 && (
        <div style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '10px 12px', background: 'var(--paper-deep)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
            Structural recommendations
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            {recs.map((r, i) => (<li key={i}>{r}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DecisionCard({ decision }: { decision: Record<string, unknown> }) {
  const jur = String(decision.jurisdiction ?? '');
  const reportable = decision.reportable === true;
  const clock = typeof decision.clockDays === 'number' ? decision.clockDays : null;
  const reasoning = typeof decision.reasoning === 'string' ? decision.reasoning : '';
  const citation = typeof decision.citation === 'string' ? decision.citation : '';

  const color = reportable ? 'var(--orange)' : 'var(--ink-2)';
  const bg = reportable ? 'rgba(250,80,15,0.08)' : 'var(--paper)';
  return (
    <div style={{ border: `1px solid ${reportable ? 'var(--orange)' : 'var(--rule)'}`, borderRadius: 8, padding: 12, background: bg }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>{jur}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{reportable ? 'Reportable' : 'Not reportable'}</div>
      </div>
      {clock != null && (
        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>
          Clock: <b style={{ color: 'var(--ink)' }}>{clock} day{clock === 1 ? '' : 's'}</b>
        </div>
      )}
      {reasoning && (
        <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{reasoning}</div>
      )}
      {citation && (
        <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{citation}</div>
      )}
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '8px 10px', background: 'var(--paper)' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {renderValue(value)}
      </div>
    </div>
  );
}

function renderValue(v: unknown): React.ReactNode {
  if (v == null) return <Muted>-</Muted>;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string' || typeof x === 'number')) {
      return v.join(', ');
    }
    return <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11 }}>{JSON.stringify(v, null, 2)}</pre>;
  }
  return <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 11 }}>{JSON.stringify(v, null, 2)}</pre>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--ink-4)' }}>{children}</span>;
}

/* ── Requirement coverage ─────────────────────────────────────────── */

function RegulationsPanel({
  events,
  result,
  fallback,
}: {
  events: LaneEvent[];
  result: RunResult | null;
  fallback: Obligation[];
}) {
  // Build from graph.cite events (richest data: id, citation, regulation, summary).
  const cites = new Map<string, { obligationId: string; citation: string; regulation: string; summary: string }>();
  for (const e of events) {
    if (e.type === 'graph.cite' && !cites.has(e.obligationId)) {
      cites.set(e.obligationId, {
        obligationId: e.obligationId,
        citation: e.citation,
        regulation: e.regulation,
        summary: e.summary,
      });
    }
  }
  const lane = result?.withGraph ?? result?.withoutGraph;
  const violations = new Set(lane?.score.violations ?? []);
  const items = Array.from(cites.values());
  const showFallback = items.length === 0 && fallback.length > 0;

  return (
    <section style={CARD}>
      <div style={CARD_HEADER}>
        <div className="eyebrow">Requirement coverage</div>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          {items.length || fallback.length}
        </span>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {showFallback &&
          fallback.map((o) => (
            <div key={o.obligationId} style={OBLIGATION_ROW}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{o.obligationId}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{o.summary ?? 'Loading requirement context...'}</div>
            </div>
          ))}
        {items.map((o) => (
          <div
            key={o.obligationId}
            style={{
              ...OBLIGATION_ROW,
              borderColor: violations.has(o.obligationId) ? 'var(--orange)' : 'var(--rule)',
              background: violations.has(o.obligationId) ? 'var(--signal-soft)' : 'var(--surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{o.citation || o.obligationId}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{o.regulation}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>{o.summary}</div>
            {violations.has(o.obligationId) && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--orange)', fontStyle: 'italic' }}>
                Output did not satisfy this requirement.
              </div>
            )}
          </div>
        ))}
        {!showFallback && items.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>No regulations cited yet.</div>
        )}
      </div>
    </section>
  );
}

const OBLIGATION_ROW: React.CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
  background: 'var(--surface)',
};

/* ── Audit trail (inline) ─────────────────────────────────────────── */

function TracePanel({
  events,
  runId,
  onOpenFullTrace,
}: {
  events: LaneEvent[];
  runId?: string;
  onOpenFullTrace?: () => void;
}) {
  const interesting = events.filter((e) =>
    e.type === 'agent.thinking' ||
    e.type === 'graph.query' ||
    e.type === 'agent.decision' ||
    e.type === 'obligation.satisfied' ||
    e.type === 'obligation.missed' ||
    e.type === 'output.gated',
  );

  return (
    <section style={CARD}>
      <div style={CARD_HEADER}>
        <div className="eyebrow">Audit trail</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {runId && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
              {runId.slice(0, 12)}
            </span>
          )}
          {onOpenFullTrace && (
            <button onClick={onOpenFullTrace} style={GHOST_BUTTON}>Open full trail</button>
          )}
        </div>
      </div>
      <ol
        style={{
          margin: 0,
          padding: '12px 16px 16px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 360,
          overflow: 'auto',
        }}
      >
        {interesting.map((e, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            <TraceLine event={e} />
          </li>
        ))}
        {interesting.length === 0 && (
          <li style={{ color: 'var(--ink-3)', listStyle: 'none', marginLeft: -16 }}>
            Audit trail entries will appear here as the module records each decision.
          </li>
        )}
      </ol>
    </section>
  );
}

function TraceLine({ event }: { event: LaneEvent }) {
  switch (event.type) {
    case 'agent.thinking':
      return <span><b style={{ color: 'var(--ink)' }}>Thinking · </b>{event.message}</span>;
    case 'graph.query':
      return (
        <span>
          <b style={{ color: 'var(--ink)' }}>Graph · </b>
          {event.message}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginLeft: 6 }}>
            ({event.resultCount} result{event.resultCount === 1 ? '' : 's'})
          </span>
        </span>
      );
    case 'agent.decision':
      return (
        <span>
          <b style={{ color: 'var(--ink)' }}>Decision · </b>
          {event.decision}
          <span style={{ color: 'var(--ink-3)' }}> - Why: {event.reason}</span>
        </span>
      );
    case 'obligation.satisfied':
      return (
        <span style={{ color: 'var(--ok, #2a8c4f)' }}>
          ✓ Satisfied <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{event.obligationId}</span>
          {event.reason && <span style={{ color: 'var(--ink-3)' }}> - {event.reason}</span>}
        </span>
      );
    case 'obligation.missed':
      return (
        <span style={{ color: 'var(--orange)' }}>
          ✗ Missed <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{event.obligationId}</span>
          {event.reason && <span style={{ color: 'var(--ink-3)' }}> - {event.reason}</span>}
        </span>
      );
    case 'output.gated':
      return (
        <span style={{ color: event.passed ? 'var(--ok, #2a8c4f)' : 'var(--orange)' }}>
          {event.passed ? 'Output met acceptance criteria.' : `Output did not meet acceptance criteria: ${event.violations.join('; ')}`}
        </span>
      );
    default:
      return null;
  }
}

export default Sandbox;
