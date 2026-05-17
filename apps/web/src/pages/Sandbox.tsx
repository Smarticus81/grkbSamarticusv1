/**
 * Sandbox — run a created process against sample or user-provided input,
 * and get back: an answer, the applicable regulations, and the
 * decision trace that explains the agent's reasoning.
 *
 * Layout
 *   Left  pane  : Input editor (auto-generated form + raw JSON tab)
 *   Right pane  : Answer · Applicable regulations · Decision trace
 *
 * The graph-vs-no-graph comparison still exists in the backend (mode
 * defaults to `with-graph`) but is not the primary user surface here.
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

/* ── Component ───────────────────────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function Sandbox({ initialTaskId }: { initialTaskId?: string }) {
  const { api } = useAuthenticatedApi();
  const [, navigate] = useLocation();

  const [tasks, setTasks] = useState<TaskCard[] | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
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
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => { if (initialTaskId) setSelectedId(initialTaskId); }, [initialTaskId]);

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
    setError(null);
    api<TaskDetail>(`/api/sandbox/tasks/${selectedId}`)
      .then((d) => {
        setDetail(d);
        // Prefer Builder hand-off input if present.
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
    eventSourceRef.current?.close();
    try {
      const start = await api<{ runId: string }>(`/api/sandbox/tasks/${detail.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ input: body, mode: 'with-graph' }),
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

  /* ── Catalog state ─────────────────────────────────────────────── */
  if (!detail) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
        <header style={{ padding: '40px 40px 8px' }}>
          <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            Pick a process to run.
          </h1>
          <p style={{ marginTop: 8, color: 'var(--ink-3)', fontSize: 13 }}>
            Each process runs against the obligation graph, applies the relevant rules to your input,
            and returns an answer with citations and a decision trace.
          </p>
        </header>
        <div style={{ padding: '24px 40px 56px' }}>
          {error && <div style={{ padding: 12, color: '#B00020', fontSize: 13 }}>Could not load: {error}</div>}
          {!tasks && !error && <div style={{ padding: 12, color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {tasks?.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  textAlign: 'left',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SmarticusMark size={18} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{t.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{t.oneLiner}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{t.regulation}</div>
                {((t.upstream?.length ?? 0) + (t.downstream?.length ?? 0)) > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                    ↔ chains with {(t.upstream?.length ?? 0) + (t.downstream?.length ?? 0)} task
                    {(t.upstream?.length ?? 0) + (t.downstream?.length ?? 0) === 1 ? '' : 's'}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Focused process runner ─────────────────────────────────────── */
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
            onClick={() => { setSelectedId(undefined); setDetail(null); setResult(null); setEvents([]); }}
            style={GHOST_BUTTON}
          >
            ← Change
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {detail.name}
          </h1>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{detail.regulation}</span>
          <ChainHintsStrip
            upstream={detail.chainHints?.upstream ?? []}
            downstream={detail.chainHints?.downstream ?? []}
            tasks={tasks ?? []}
            onPick={(id) => { setSelectedId(id); setDetail(null); setResult(null); setEvents([]); }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={resetToSample} style={GHOST_BUTTON} disabled={running}>Reset to sample</button>
          <button
            onClick={runProcess}
            disabled={running}
            className="btn-orange"
            style={{ fontSize: 14, padding: '10px 22px' }}
          >
            {running ? 'Running…' : 'Run process'}
          </button>
        </div>
      </header>

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
            <div className="eyebrow">Input</div>
            <div style={{ display: 'flex', gap: 4, border: '1px solid var(--rule)', borderRadius: 6, padding: 2 }}>
              <TabButton active={editorTab === 'form'} onClick={() => setEditorTab('form')}>Form</TabButton>
              <TabButton active={editorTab === 'json'} onClick={() => setEditorTab('json')}>JSON</TabButton>
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
                  background: '#fff',
                  color: 'var(--ink)',
                }}
              />
              {jsonError && (
                <div style={{ marginTop: 6, color: '#B00020', fontSize: 12, fontFamily: 'var(--mono)' }}>
                  {jsonError}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── RIGHT: Live reasoning + result ────────────────────── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ padding: 12, color: '#B00020', fontSize: 13, border: '1px solid #f5cccc', borderRadius: 8, background: '#fff5f5' }}>
              {error}
            </div>
          )}

          {!running && !result && (
            <div style={{ ...CARD, padding: 28, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              Edit the input on the left, then press <b style={{ color: 'var(--ink)' }}>Run process</b> to
              get the answer, applicable regulations, and decision trace.
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
        </section>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--rule)',
  borderRadius: 10,
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
        This process expects a non-object input. Use the JSON tab.
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
    background: '#fff',
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
          <div style={{ color: '#B00020', fontSize: 13 }}>{lane.error}</div>
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

  // Generic object — show top-level fields.
  const entries = Object.entries(obj);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(([k, v]) => (
        <ValueRow key={k} label={labelFromKey(k)} value={v} />
      ))}
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
  if (v == null) return <Muted>—</Muted>;
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

/* ── Applicable regulations ──────────────────────────────────────── */

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
        <div className="eyebrow">Applicable regulations</div>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          {items.length || fallback.length}
        </span>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {showFallback &&
          fallback.map((o) => (
            <div key={o.obligationId} style={OBLIGATION_ROW}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{o.obligationId}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{o.summary ?? 'Loading from graph…'}</div>
            </div>
          ))}
        {items.map((o) => (
          <div
            key={o.obligationId}
            style={{
              ...OBLIGATION_ROW,
              borderColor: violations.has(o.obligationId) ? 'var(--orange)' : 'var(--rule)',
              background: violations.has(o.obligationId) ? 'rgba(250,80,15,0.05)' : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{o.citation || o.obligationId}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>{o.regulation}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>{o.summary}</div>
            {violations.has(o.obligationId) && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--orange)', fontStyle: 'italic' }}>
                Output did not satisfy this obligation.
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
  borderRadius: 8,
  padding: '10px 12px',
  background: '#fff',
};

/* ── Decision trace (inline) ─────────────────────────────────────── */

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
    e.type === 'obligation.satisfied' ||
    e.type === 'obligation.missed' ||
    e.type === 'output.gated',
  );

  return (
    <section style={CARD}>
      <div style={CARD_HEADER}>
        <div className="eyebrow">Decision trace</div>
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
            Trace will appear here as the agent reasons through the input.
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
    case 'obligation.satisfied':
      return (
        <span style={{ color: 'var(--ok, #2a8c4f)' }}>
          ✓ Satisfied <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{event.obligationId}</span>
          {event.reason && <span style={{ color: 'var(--ink-3)' }}> — {event.reason}</span>}
        </span>
      );
    case 'obligation.missed':
      return (
        <span style={{ color: 'var(--orange)' }}>
          ✗ Missed <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{event.obligationId}</span>
          {event.reason && <span style={{ color: 'var(--ink-3)' }}> — {event.reason}</span>}
        </span>
      );
    case 'output.gated':
      return (
        <span style={{ color: event.passed ? 'var(--ok, #2a8c4f)' : 'var(--orange)' }}>
          {event.passed ? 'Output passed strict gate.' : `Output blocked by strict gate: ${event.violations.join('; ')}`}
        </span>
      );
    default:
      return null;
  }
}

export default Sandbox;
