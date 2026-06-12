import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { Link } from 'wouter';
import { createAuthenticatedSse } from '../lib/queryClient.js';
import { SmarticusWordmark } from '../components/ui/logos.js';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';

/**
 * /demo/psur — public four-step walkthrough of the PSUR demo.
 *
 * 1. Intro    — the 2-weeks-to-20-minutes story.
 * 2. Inputs   — editable mock data pack (content editable, structure locked).
 * 3. Run      — live SSE stream: phases, section agents A–M, decision ticker.
 * 4. Results  — artifact downloads, validation summary, and the hero artifact:
 *               the hash-chained decision trace with a verification badge.
 *
 * Only the active step is on screen; a slim progress rail shows position.
 */

const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** Public SSE reader — same helper the app uses, with no auth token. */
const streamSse = createAuthenticatedSse(async () => null);

// ---------------------------------------------------------------------------
// Contract types (mirror apps/api/src/psur/schemas.ts)
// ---------------------------------------------------------------------------

interface ColumnSpec {
  name: string;
  type: string;
  required: boolean;
}
interface TableInput {
  kind: 'table';
  columns: ColumnSpec[];
  rows: Record<string, unknown>[];
}
interface JsonInput {
  kind: 'json';
  value: Record<string, unknown>;
}
type InputDefault = TableInput | JsonInput;

interface Defaults {
  period: { start: string; end: string };
  inputs: Record<string, InputDefault>;
}

interface DecisionTick {
  seq: number;
  decision: string;
  reason: string;
  basis: string[];
  section?: string;
}

interface ArtifactInfo {
  name: string;
  content_type: string;
  size_bytes: number;
}
interface CompleteInfo {
  artifacts: ArtifactInfo[];
  validation: { passed: boolean; error_count: number };
}

interface TraceEntryView {
  sequenceNumber: number;
  eventType: string;
  decision?: string;
  humanSummary?: string;
  reasons?: string[];
  currentHash: string;
  regulatoryContext?: {
    citations?: string[];
    obligationIds?: string[];
    unresolved_citation?: string[];
    section?: string;
  };
}
interface TraceResponse {
  processInstanceId: string;
  entries: TraceEntryView[];
  verification: { valid: boolean; verifiedEntries: number; totalEntries: number };
}

const PHASES = [
  'discovery',
  'parsing',
  'device_context',
  'imdrf_coding',
  'statistics',
  'charts',
  'generation',
  'audit',
  'remediation',
  'validation',
  'rendering',
  'artifacts',
] as const;
type Phase = (typeof PHASES)[number];

const PHASE_LABELS: Record<Phase, string> = {
  discovery: 'Discovery',
  parsing: 'Parsing',
  device_context: 'Device context',
  imdrf_coding: 'IMDRF coding',
  statistics: 'Statistics',
  charts: 'Charts',
  generation: 'Section agents',
  audit: 'Audit',
  remediation: 'Remediation',
  validation: 'Validation',
  rendering: 'Rendering',
  artifacts: 'Artifacts',
};

const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const;

const INPUT_LABELS: Record<string, string> = {
  sales: 'Sales',
  complaints: 'Complaints',
  capa: 'CAPA',
  fsca: 'FSCA',
  ract: 'RACT',
  external_events: 'External events',
  literature: 'Literature',
  device_context: 'Device context',
  pms_plan: 'PMS plan',
  previous_psur: 'Previous PSUR',
  clinical_safety: 'Clinical safety',
  clinical_performance: 'Clinical performance',
};

type Status = 'pending' | 'started' | 'completed';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clone<T>(value: T): T {
  return structuredClone(value);
}

function coerceCell(raw: string, columnType: string): unknown {
  const t = columnType.toLowerCase();
  if (raw === '') return '';
  if (t.includes('int') || t.includes('number') || t.includes('float') || t.includes('decimal')) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  if (t.includes('bool')) {
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
  }
  return raw;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function publicJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : undefined) as T;
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

const mono: CSSProperties = { fontFamily: 'var(--mono)', letterSpacing: '0.08em' };

function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'active' | 'done' | 'warn';
  title?: string;
}) {
  const palette: Record<string, CSSProperties> = {
    neutral: { borderColor: 'var(--rule)', color: 'var(--ink-3)', background: 'var(--paper)' },
    active: { borderColor: 'var(--orange)', color: 'var(--orange)', background: 'var(--paper)' },
    done: { borderColor: 'var(--orange)', color: '#fff', background: 'var(--orange)' },
    warn: { borderColor: 'var(--err)', color: 'var(--err)', background: 'var(--paper)' },
  };
  return (
    <span
      title={title}
      style={{
        ...mono,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10.5,
        textTransform: 'uppercase',
        padding: '4px 9px',
        borderRadius: 999,
        border: '1px solid',
        whiteSpace: 'nowrap',
        ...palette[tone],
      }}
    >
      {children}
    </span>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 12 }}>{eyebrow}</div>
      <h2 style={{ margin: 0, fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.08 }}>
        {title}
      </h2>
      {body && (
        <p style={{ margin: '14px 0 0', maxWidth: 660, fontSize: 15.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>{body}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress rail
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 'intro', label: 'Intro' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'run', label: 'Run' },
  { id: 'results', label: 'Results' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

function ProgressRail({ step }: { step: StepId }) {
  const activeIndex = STEPS.findIndex((s) => s.id === step);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((s, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <span
                style={{
                  width: 34,
                  height: 1,
                  background: state === 'todo' ? 'var(--rule)' : 'var(--orange)',
                  display: 'inline-block',
                }}
              />
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 6px' }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9.5,
                  fontFamily: 'var(--mono)',
                  border: '1px solid',
                  borderColor: state === 'todo' ? 'var(--rule)' : 'var(--orange)',
                  background: state === 'done' ? 'var(--orange)' : 'transparent',
                  color: state === 'done' ? '#fff' : state === 'active' ? 'var(--orange)' : 'var(--ink-4)',
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  ...mono,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  color: state === 'active' ? 'var(--ink)' : 'var(--ink-4)',
                }}
              >
                {s.label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Intro
// ---------------------------------------------------------------------------

function IntroStep({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <SectionHeading
        eyebrow="The keynote demo"
        title="A PSUR takes two weeks to assemble. Watch one draft itself in under 20 minutes."
      />
      <p style={{ margin: '18px 0 0', fontSize: 15.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        A <strong style={{ color: 'var(--ink)' }}>Periodic Safety Update Report (PSUR)</strong> is the
        document EU MDR Article 86 requires medical-device manufacturers to produce on a fixed cadence:
        sales, complaints, serious incidents, field safety corrective actions, trends, literature, and a
        benefit–risk conclusion, all reconciled against the risk file. Assembling one by hand takes a
        quality team a minimum of two weeks.
      </p>
      <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        This demo runs the real generation pipeline on a realistic mock data pack and produces a
        human-review-ready draft in under 20 minutes — a <strong style={{ color: 'var(--ink)' }}>99%
        reduction in data-to-draft time</strong>. The downloadable report is the proof of capability. The
        product is what you will watch being built alongside it: a{' '}
        <strong style={{ color: 'var(--ink)' }}>hash-chained decision trace</strong>, grounded in the
        obligation graph, where every decision cites a reason and, where a regulation genuinely drives
        it, the regulation itself.
      </p>
      <ol style={{ margin: '20px 0 0', paddingLeft: 18, color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.8 }}>
        <li>Review (and edit) the mock inputs — content is editable, structure is locked.</li>
        <li>Watch the pipeline stream live: phases, 13 section agents (A–M), and a decision ticker.</li>
        <li>Download the draft and inspect the verified decision trace.</li>
      </ol>
      <div style={{ marginTop: 28 }}>
        <button className="btn btn-orange" onClick={onStart}>
          Start
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Inputs
// ---------------------------------------------------------------------------

function TableEditor({
  input,
  onChange,
}: {
  input: TableInput;
  onChange: (next: TableInput) => void;
}) {
  const setCell = (rowIndex: number, column: ColumnSpec, raw: string) => {
    const rows = input.rows.map((row, i) =>
      i === rowIndex ? { ...row, [column.name]: coerceCell(raw, column.type) } : row,
    );
    onChange({ ...input, rows });
  };
  const addRow = () => {
    const blank: Record<string, unknown> = {};
    for (const c of input.columns) blank[c.name] = '';
    onChange({ ...input, rows: [...input.rows, blank] });
  };
  const removeRow = (rowIndex: number) => {
    onChange({ ...input, rows: input.rows.filter((_, i) => i !== rowIndex) });
  };

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--rule)', borderRadius: 'var(--r-2)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              {input.columns.map((c) => (
                <th
                  key={c.name}
                  title={`${c.type}${c.required ? ' · required' : ''} — column locked`}
                  style={{
                    ...mono,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    textAlign: 'left',
                    color: 'var(--ink-3)',
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--rule)',
                    background: 'var(--paper-deep)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.name}
                  {c.required && <span style={{ color: 'var(--orange)' }}> *</span>}
                </th>
              ))}
              <th style={{ width: 34, borderBottom: '1px solid var(--rule)', background: 'var(--paper-deep)' }} />
            </tr>
          </thead>
          <tbody>
            {input.rows.map((row, ri) => (
              <tr key={ri}>
                {input.columns.map((c) => (
                  <td key={c.name} style={{ borderBottom: '1px solid var(--rule)', padding: 0 }}>
                    <input
                      value={cellToString(row[c.name])}
                      onChange={(e) => setCell(ri, c, e.target.value)}
                      style={{
                        width: '100%',
                        minWidth: 90,
                        boxSizing: 'border-box',
                        border: 0,
                        background: 'transparent',
                        color: 'var(--ink)',
                        font: 'inherit',
                        padding: '7px 10px',
                        outline: 'none',
                      }}
                    />
                  </td>
                ))}
                <td style={{ borderBottom: '1px solid var(--rule)', textAlign: 'center' }}>
                  <button
                    onClick={() => removeRow(ri)}
                    title="Remove row"
                    style={{ border: 0, background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 14 }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px' }} onClick={addRow}>
          + Add row
        </button>
      </div>
    </div>
  );
}

function JsonEditor({
  input,
  onChange,
}: {
  input: JsonInput;
  onChange: (next: JsonInput) => void;
}) {
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  const setValue = (key: string, value: unknown) => {
    onChange({ ...input, value: { ...input.value, [key]: value } });
  };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
      {Object.entries(input.value).map(([key, value]) => {
        const isScalar = value === null || ['string', 'number', 'boolean'].includes(typeof value);
        return (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, alignItems: 'start' }}>
            <label
              title="Field name locked"
              style={{ ...mono, fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-3)', paddingTop: 9 }}
            >
              {key}
            </label>
            {isScalar ? (
              typeof value === 'boolean' ? (
                <select
                  value={String(value)}
                  onChange={(e) => setValue(key, e.target.value === 'true')}
                  style={{ padding: '7px 10px', border: '1px solid var(--rule)', borderRadius: 'var(--r-1)', background: 'var(--paper)', color: 'var(--ink)', font: 'inherit' }}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  value={cellToString(value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setValue(key, typeof value === 'number' && Number.isFinite(Number(raw)) && raw !== '' ? Number(raw) : raw);
                  }}
                  style={{ padding: '7px 10px', border: '1px solid var(--rule)', borderRadius: 'var(--r-1)', background: 'var(--paper)', color: 'var(--ink)', font: 'inherit' }}
                />
              )
            ) : (
              <div>
                <textarea
                  defaultValue={JSON.stringify(value, null, 2)}
                  rows={Math.min(10, JSON.stringify(value, null, 2).split('\n').length + 1)}
                  onBlur={(e) => {
                    try {
                      setValue(key, JSON.parse(e.target.value) as unknown);
                      setJsonErrors((prev) => ({ ...prev, [key]: '' }));
                    } catch {
                      setJsonErrors((prev) => ({ ...prev, [key]: 'Invalid JSON — value not saved.' }));
                    }
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    padding: '8px 10px',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--r-1)',
                    background: 'var(--paper)',
                    color: 'var(--ink)',
                  }}
                />
                {jsonErrors[key] && (
                  <div style={{ color: 'var(--err)', fontSize: 12, marginTop: 4 }}>{jsonErrors[key]}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InputsStep({
  defaults,
  edited,
  setEdited,
  loadError,
  onBack,
  onRun,
}: {
  defaults: Defaults | null;
  edited: Record<string, InputDefault>;
  setEdited: Dispatch<SetStateAction<Record<string, InputDefault>>>;
  loadError: string | null;
  onBack: () => void;
  onRun: () => void;
}) {
  const names = useMemo(() => Object.keys(edited), [edited]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const current = activeName ?? names[0] ?? null;

  if (loadError) {
    return (
      <div style={{ maxWidth: 640 }}>
        <SectionHeading eyebrow="Step 2 — Inputs" title="The demo service is not reachable right now." body={loadError} />
        <div style={{ marginTop: 22 }}>
          <button className="btn btn-ghost" onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }
  if (!defaults || !current) {
    return (
      <div style={{ maxWidth: 640 }}>
        <SectionHeading eyebrow="Step 2 — Inputs" title="Loading the mock data pack…" />
      </div>
    );
  }

  const input = edited[current];

  const resetInput = (name: string) => {
    const pristine = defaults.inputs[name];
    if (!pristine) return;
    setEdited((prev) => ({ ...prev, [name]: clone(pristine) }));
  };

  return (
    <div>
      <SectionHeading
        eyebrow="Step 2 — Inputs"
        title="The mock data pack."
        body="Content is editable; structure is locked. Change any number or narrative and the run — and its traced calculations — will change with it. Columns and field names cannot be added, removed, or renamed; structural edits are rejected with a precise error."
      />
      <div style={{ ...mono, fontSize: 11, color: 'var(--ink-3)', marginTop: 14 }}>
        REPORTING PERIOD {defaults.period.start} → {defaults.period.end}
      </div>

      {/* Input tabs — one input type on screen at a time */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18, borderBottom: '1px solid var(--rule)', paddingBottom: 10 }}>
        {names.map((name) => (
          <button
            key={name}
            onClick={() => setActiveName(name)}
            style={{
              ...mono,
              fontSize: 10.5,
              textTransform: 'uppercase',
              padding: '6px 11px',
              borderRadius: 999,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: name === current ? 'var(--orange)' : 'var(--rule)',
              background: name === current ? 'var(--orange)' : 'transparent',
              color: name === current ? '#fff' : 'var(--ink-3)',
            }}
          >
            {INPUT_LABELS[name] ?? name}
          </button>
        ))}
      </div>

      {input && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Chip tone="neutral">{input.kind === 'table' ? 'table · columns locked' : 'form · keys locked'}</Chip>
              {input.kind === 'table' && <Chip tone="neutral">{input.rows.length} rows</Chip>}
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px' }} onClick={() => resetInput(current)}>
              Reset to default
            </button>
          </div>
          {input.kind === 'table' ? (
            <TableEditor input={input} onChange={(next) => setEdited((prev) => ({ ...prev, [current]: next }))} />
          ) : (
            <JsonEditor input={input} onChange={(next) => setEdited((prev) => ({ ...prev, [current]: next }))} />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-orange" onClick={onRun}>
          Run the pipeline
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Run
// ---------------------------------------------------------------------------

interface RunState {
  phases: Partial<Record<Phase, Status>>;
  sections: Partial<Record<string, Status>>;
  decisions: DecisionTick[];
  error: string | null;
  busy: boolean;
}

function RunStep({
  runState,
  starting,
  startError,
  onRetry,
  onBack,
}: {
  runState: RunState;
  starting: boolean;
  startError: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  if (startError) {
    return (
      <div style={{ maxWidth: 640 }}>
        <SectionHeading eyebrow="Step 3 — Run" title={runState.busy ? 'The demo is busy right now.' : 'The run could not start.'} body={startError} />
        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button className="btn btn-ghost" onClick={onBack}>Back to inputs</button>
          <button className="btn btn-orange" onClick={onRetry}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading
        eyebrow="Step 3 — Run"
        title={starting ? 'Starting the pipeline…' : 'The pipeline is running.'}
        body="Real LLM runtime. Deterministic statistics are pre-computed and consumed verbatim by 13 section agents (A–M). Every decision below is appended to the hash chain as it happens — grounded in the obligation graph."
      />

      {/* Phase stepper */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
        {PHASES.map((phase) => {
          const status = runState.phases[phase] ?? 'pending';
          return (
            <Chip key={phase} tone={status === 'completed' ? 'done' : status === 'started' ? 'active' : 'neutral'}>
              {status === 'started' && <span className="signal-dot" />}
              {PHASE_LABELS[phase]}
            </Chip>
          );
        })}
      </div>

      {/* Section agents A–M */}
      <div style={{ marginTop: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Section agents A–M</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SECTION_LETTERS.map((letter) => {
            const status = runState.sections[letter] ?? 'pending';
            return (
              <span
                key={letter}
                title={`Section ${letter}`}
                style={{
                  ...mono,
                  width: 30,
                  height: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  borderRadius: 'var(--r-1)',
                  border: '1px solid',
                  borderColor: status === 'pending' ? 'var(--rule)' : 'var(--orange)',
                  background: status === 'completed' ? 'var(--orange)' : 'transparent',
                  color: status === 'completed' ? '#fff' : status === 'started' ? 'var(--orange)' : 'var(--ink-4)',
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      </div>

      {/* Live decision ticker */}
      <div style={{ marginTop: 26 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Decision ticker · {runState.decisions.length} traced
        </div>
        <div style={{ border: '1px solid var(--rule)', borderRadius: 'var(--r-2)', maxHeight: 340, overflowY: 'auto' }}>
          {runState.decisions.length === 0 && (
            <div style={{ padding: 18, fontSize: 13.5, color: 'var(--ink-4)' }}>
              Waiting for the first traced decision…
            </div>
          )}
          {[...runState.decisions].reverse().map((d) => (
            <div key={d.seq} style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ ...mono, fontSize: 10, color: 'var(--ink-4)' }}>#{d.seq}</span>
                <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>{d.decision}</strong>
                {d.section && <Chip tone="neutral">{d.section.split('_')[0]}</Chip>}
              </div>
              <p style={{ margin: '6px 0 8px', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>{d.reason}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {d.basis.map((b) => (
                  <Chip key={b} tone="active">{b}</Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {runState.error && (
        <div style={{ marginTop: 18, padding: '12px 16px', border: '1px solid var(--err)', borderRadius: 'var(--r-2)', color: 'var(--err)', fontSize: 13.5 }}>
          {runState.error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Results
// ---------------------------------------------------------------------------

function ResultsStep({
  runId,
  complete,
  trace,
  onRestart,
}: {
  runId: string;
  complete: CompleteInfo;
  trace: TraceResponse | null;
  onRestart: () => void;
}) {
  const verification = trace?.verification ?? null;
  const decisions = (trace?.entries ?? []).filter((e) => e.eventType === 'psur.decision');

  return (
    <div>
      <SectionHeading
        eyebrow="Step 4 — Results"
        title="Draft delivered. Trace verified."
        body="Download the human-review-ready draft below. Then inspect the hero artifact: the hash-chained decision trace — every decision with its reason and its obligation citations."
      />

      {/* Validation + artifacts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20, alignItems: 'center' }}>
        <Chip tone={complete.validation.passed ? 'done' : 'warn'}>
          Validation {complete.validation.passed ? 'passed' : 'failed'} · {complete.validation.error_count} error(s)
        </Chip>
        {verification && (
          <Chip tone={verification.valid ? 'done' : 'warn'} title={`${verification.verifiedEntries}/${verification.totalEntries} entries verified`}>
            {verification.valid
              ? `Hash chain verified · ${verification.verifiedEntries} entries`
              : 'Hash chain verification FAILED'}
          </Chip>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
        {complete.artifacts.map((a) => (
          <a
            key={a.name}
            className="btn btn-ghost"
            style={{ textDecoration: 'none', fontSize: 13 }}
            href={`${API_BASE}/api/psur/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(a.name)}`}
          >
            ↓ {a.name}
            <span style={{ ...mono, fontSize: 10, color: 'var(--ink-4)', marginLeft: 6 }}>
              {(a.size_bytes / 1024).toFixed(0)} KB
            </span>
          </a>
        ))}
      </div>

      {/* Decision trace — the hero artifact */}
      <div style={{ marginTop: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          The decision trace · {decisions.length} decisions
        </div>
        <div style={{ border: '1px solid var(--rule)', borderRadius: 'var(--r-2)', maxHeight: 420, overflowY: 'auto' }}>
          {decisions.map((e) => {
            const ctx = e.regulatoryContext ?? {};
            return (
              <div key={e.sequenceNumber} style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ ...mono, fontSize: 10, color: 'var(--ink-4)' }}>#{e.sequenceNumber}</span>
                  <strong style={{ fontSize: 13.5 }}>{e.decision ?? e.eventType}</strong>
                </div>
                {(e.reasons?.[0] ?? e.humanSummary) && (
                  <p style={{ margin: '6px 0 8px', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                    {e.reasons?.[0] ?? e.humanSummary}
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {(ctx.obligationIds ?? []).map((id) => (
                    <Chip key={id} tone="done" title="Resolved graph obligation">{id}</Chip>
                  ))}
                  {(ctx.unresolved_citation ?? []).map((c) => (
                    <Chip key={c} tone="warn" title="Citation not yet seeded in the obligation graph — recorded, never guessed">
                      unresolved · {c}
                    </Chip>
                  ))}
                </div>
                <div style={{ ...mono, fontSize: 9.5, color: 'var(--ink-4)', marginTop: 8, wordBreak: 'break-all' }}>
                  sha256 {e.currentHash.slice(0, 24)}…
                </div>
              </div>
            );
          })}
          {decisions.length === 0 && (
            <div style={{ padding: 18, fontSize: 13.5, color: 'var(--ink-4)' }}>No decision entries recorded.</div>
          )}
        </div>
      </div>

      {/* Audit pack / trace explorer */}
      <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {trace && (
          <Link
            href={`/app/trails/${trace.processInstanceId}`}
            className="btn btn-ghost"
            style={{ textDecoration: 'none', fontSize: 13 }}
          >
            Open in Trace Explorer + export Audit Pack (sign-in required)
          </Link>
        )}
        <button className="btn btn-orange" onClick={onRestart}>Run it again</button>
      </div>
      {trace && (
        <p style={{ ...mono, fontSize: 10.5, color: 'var(--ink-4)', marginTop: 12 }}>
          PROCESS INSTANCE {trace.processInstanceId}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EMPTY_RUN_STATE: RunState = {
  phases: {},
  sections: {},
  decisions: [],
  error: null,
  busy: false,
};

export function PsurDemo() {
  const [step, setStep] = useState<StepId>('intro');

  // Inputs
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [edited, setEdited] = useState<Record<string, InputDefault>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  // Run
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>(EMPTY_RUN_STATE);
  const [complete, setComplete] = useState<CompleteInfo | null>(null);
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch the mock pack when entering the inputs step (once).
  useEffect(() => {
    if (step !== 'inputs' || defaults || loadError) return;
    let cancelled = false;
    (async () => {
      try {
        const { status, body } = await publicJson<Defaults>('/api/psur/defaults');
        if (cancelled) return;
        if (status !== 200) {
          setLoadError('The PSUR demo service did not respond. Please try again shortly.');
          return;
        }
        setDefaults(body);
        setEdited(clone(body.inputs));
      } catch {
        if (!cancelled) setLoadError('The PSUR demo service did not respond. Please try again shortly.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, defaults, loadError]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startRun = useCallback(async () => {
    if (!defaults) return;
    setStep('run');
    setStarting(true);
    setStartError(null);
    setRunState(EMPTY_RUN_STATE);
    setComplete(null);
    setTrace(null);

    const payload = {
      period: defaults.period,
      inputs: Object.fromEntries(
        Object.entries(edited).map(([name, input]) => [
          name,
          input.kind === 'table' ? { rows: input.rows } : { value: input.value },
        ]),
      ),
    };

    let createdRunId: string;
    try {
      const { status, body } = await publicJson<{
        runId?: string;
        processInstanceId?: string;
        error?: string;
        detail?: unknown;
      }>('/api/psur/runs', { method: 'POST', body: JSON.stringify(payload) });

      if (status === 409) {
        setRunState((s) => ({ ...s, busy: true }));
        setStartError('Another visitor is running the demo right now — it only runs one PSUR at a time. Please try again in a few minutes.');
        setStarting(false);
        return;
      }
      if (status === 429) {
        setStartError(body.error ?? 'Demo run limit reached for today.');
        setStarting(false);
        return;
      }
      if (status === 422) {
        setStartError(
          `The service rejected the inputs as structurally invalid: ${JSON.stringify(body.detail ?? body)}. ` +
            'Structure is locked — reset the affected input to default and try again.',
        );
        setStarting(false);
        return;
      }
      if (status !== 202 && status !== 200) {
        setStartError(body.error ?? `The run could not start (HTTP ${status}).`);
        setStarting(false);
        return;
      }
      if (!body.runId) {
        setStartError('The run could not start: no run id returned.');
        setStarting(false);
        return;
      }
      createdRunId = body.runId;
    } catch {
      setStartError('The API is unreachable. Please try again shortly.');
      setStarting(false);
      return;
    }

    setRunId(createdRunId);
    setStarting(false);

    const abort = new AbortController();
    abortRef.current = abort;

    let completed: CompleteInfo | null = null;
    try {
      await streamSse(`/api/psur/runs/${encodeURIComponent(createdRunId)}/stream`, {
        signal: abort.signal,
        onEvent: ({ data }) => {
          let raw: unknown;
          try {
            raw = JSON.parse(data);
          } catch {
            return;
          }
          const ev = raw as Record<string, unknown>;
          const kind = ev.kind;
          if (kind === 'progress') {
            const phase = ev.phase as Phase;
            const status = ev.status as Status;
            const section = typeof ev.section === 'string' ? ev.section : undefined;
            setRunState((s) => {
              const next: RunState = { ...s, phases: { ...s.phases, [phase]: status } };
              if (section) {
                const letter = section.charAt(0).toUpperCase();
                next.sections = { ...s.sections, [letter]: status };
              }
              return next;
            });
          } else if (kind === 'decision') {
            const tick: DecisionTick = {
              seq: Number(ev.seq ?? 0),
              decision: String(ev.decision ?? ''),
              reason: String(ev.reason ?? ''),
              basis: Array.isArray(ev.regulatory_basis) ? (ev.regulatory_basis as string[]) : [],
              section: typeof ev.section === 'string' ? ev.section : undefined,
            };
            setRunState((s) =>
              s.decisions.some((d) => d.seq === tick.seq) ? s : { ...s, decisions: [...s.decisions, tick] },
            );
          } else if (kind === 'complete') {
            completed = {
              artifacts: (ev.artifacts as ArtifactInfo[]) ?? [],
              validation: (ev.validation as CompleteInfo['validation']) ?? { passed: false, error_count: 0 },
            };
          } else if (kind === 'error') {
            const message = typeof ev.message === 'string' ? ev.message : 'The pipeline reported an error.';
            setRunState((s) => ({ ...s, error: message, busy: message.toLowerCase().includes('busy') }));
          }
        },
      });
    } catch {
      if (!abort.signal.aborted) {
        setRunState((s) => ({ ...s, error: 'The live stream was interrupted. The trace keeps its partial chain.' }));
      }
    }

    if (completed) {
      setComplete(completed);
      try {
        const { status, body } = await publicJson<TraceResponse>(
          `/api/psur/runs/${encodeURIComponent(createdRunId)}/trace`,
        );
        if (status === 200) setTrace(body);
      } catch {
        // Verification badge simply won't render; downloads still work.
      }
      setStep('results');
    }
  }, [defaults, edited]);

  const restart = useCallback(() => {
    abortRef.current?.abort();
    setRunId(null);
    setRunState(EMPTY_RUN_STATE);
    setComplete(null);
    setTrace(null);
    setStartError(null);
    setStep('inputs');
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      <nav
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', border: 0, color: 'var(--ink)', display: 'inline-flex' }}>
          <SmarticusWordmark size={15} tagline={false} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span className="eyebrow">PSUR demo · data → draft in 20 minutes</span>
          <ThemeToggle />
        </div>
      </nav>

      <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--rule)' }}>
        <ProgressRail step={step} />
      </div>

      <main style={{ flex: 1, padding: '36px 28px 64px', maxWidth: 1040, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {step === 'intro' && <IntroStep onStart={() => setStep('inputs')} />}
        {step === 'inputs' && (
          <InputsStep
            defaults={defaults}
            edited={edited}
            setEdited={setEdited}
            loadError={loadError}
            onBack={() => setStep('intro')}
            onRun={() => void startRun()}
          />
        )}
        {step === 'run' && (
          <RunStep
            runState={runState}
            starting={starting}
            startError={startError}
            onRetry={() => void startRun()}
            onBack={() => setStep('inputs')}
          />
        )}
        {step === 'results' && runId && complete && (
          <ResultsStep runId={runId} complete={complete} trace={trace} onRestart={restart} />
        )}
      </main>
    </div>
  );
}

export default PsurDemo;
