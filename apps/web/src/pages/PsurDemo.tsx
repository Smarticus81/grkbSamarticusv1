import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { Link } from 'wouter';
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react';
import { createAuthenticatedSse } from '../lib/queryClient.js';
import {
  SIMULATED_DEFAULTS,
  runPsurSimulation,
  type ArtifactInfo,
  type ColumnSpec,
  type CompleteInfo,
  type Defaults,
  type InputDefault,
  type JsonInput,
  type SimArtifact,
  type SimRunResult,
  type TableInput,
  type TraceResponse,
} from '../lib/psurSimulation.js';
import { SmarticusWordmark } from '../components/ui/logos.js';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';

/**
 * /demo/psur — the PSUR walkthrough, in two modes:
 *
 * LIVE (signed in, or dev without Clerk): the real generation pipeline behind
 * /api/psur, streamed over authenticated SSE, with graph-grounded decision
 * traces written under the caller's tenant.
 *
 * SIMULATION (signed out): the identical four-step experience, driven by a
 * scripted client-side engine. Every conclusion is recomputed from the
 * visitor's edited inputs, the hash chain is real SHA-256 built and verified
 * locally, and the downloadable PDF/DOCX drafts are watermarked SIMULATED on
 * every page. Nothing leaves the browser; sign-up unlocks the real engine.
 *
 * 1. Intro    — the 2-weeks-to-20-minutes story.
 * 2. Inputs   — editable mock data pack (content editable, structure locked).
 * 3. Run      — the runtime, end to end: elapsed clock, phase timeline with
 *               per-phase timings, section agents A–M, animated decision
 *               stream, and a live runtime log from run-start to artifacts.
 * 4. Results  — inline document preview, PDF/DOCX/trace downloads, validation
 *               summary, and the hero artifact: the hash-chained decision
 *               trace with a verification badge.
 */

const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** Clerk is mounted by main.tsx only when the publishable key exists. */
const clerkAvailable = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

type DemoMode = 'live' | 'simulation';
type GetToken = () => Promise<string | null>;

// ---------------------------------------------------------------------------
// Contract types local to this page
// ---------------------------------------------------------------------------

interface DecisionTick {
  seq: number;
  decision: string;
  reason: string;
  basis: string[];
  section?: string;
}

interface LogLine {
  id: number;
  /** Milliseconds since run start. */
  t: number;
  kind: 'phase' | 'agent' | 'decision' | 'error';
  text: string;
}

/** One row from GET /api/psur/runs — the signed-in user's durable run history. */
interface PsurRunSummary {
  runId: string;
  processInstanceId: string;
  status: 'running' | 'completed' | 'failed';
  deviceName: string | null;
  reportType: string | null;
  periodStart: string;
  periodEnd: string;
  validationPassed: boolean | null;
  errorCount: number | null;
  artifacts: ArtifactInfo[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
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

/** JSON helper that attaches the Clerk bearer token when one is available. */
function createJsonClient(getToken: GetToken) {
  return async function json<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const text = await res.text();
    const body = (text ? JSON.parse(text) : undefined) as T;
    return { status: res.status, body };
  };
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 'E_complaint_trends' → 'Complaint trends' */
function sectionPretty(section: string): string {
  const rest = section.includes('_') ? section.slice(section.indexOf('_') + 1) : section;
  const words = rest.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function extOf(name: string): string {
  return (name.split('.').pop() ?? '').toUpperCase();
}

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

const mono: CSSProperties = { fontFamily: 'var(--mono)', letterSpacing: '0.08em' };

/** Page-scoped keyframes for the runtime view. */
const RUNTIME_KEYFRAMES = `
@keyframes rgFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes rgPulseDot { 0% { box-shadow: 0 0 0 0 var(--signal-edge); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`;

function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'active' | 'done' | 'warn' | 'sim';
  title?: string;
}) {
  const palette: Record<string, CSSProperties> = {
    neutral: { borderColor: 'var(--rule)', color: 'var(--ink-3)', background: 'var(--paper)' },
    active: { borderColor: 'var(--orange)', color: 'var(--orange)', background: 'var(--paper)' },
    done: { borderColor: 'var(--orange)', color: '#fff', background: 'var(--orange)' },
    warn: { borderColor: 'var(--err)', color: 'var(--err)', background: 'var(--paper)' },
    // Simulation: on-brand orange, dashed — unmistakably "not the real thing".
    sim: { borderColor: 'var(--orange)', borderStyle: 'dashed', color: 'var(--orange)', background: 'var(--paper)' },
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

/** Sign-up / sign-in pair (modal when Clerk is mounted, pricing link otherwise). */
function AuthCtaButtons({ compact = false }: { compact?: boolean }) {
  const size: CSSProperties = compact ? { fontSize: 12.5, padding: '7px 14px' } : {};
  if (!clerkAvailable) {
    return (
      <Link href="/pricing" className="btn btn-ghost" style={{ textDecoration: 'none', ...size }}>
        See pricing
      </Link>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
      <SignUpButton mode="modal">
        <button className="btn btn-orange" style={size}>
          Create a free account
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </SignUpButton>
      <SignInButton mode="modal">
        <button className="btn btn-ghost" style={size}>Sign in</button>
      </SignInButton>
    </span>
  );
}

/** Persistent strip shown in simulation mode — never lets the visitor mistake the simulation for the real run. */
function SimulationBanner() {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 14,
        padding: '12px 28px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--paper-deep)',
      }}
    >
      <Chip tone="sim">Simulation</Chip>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)', flex: 1, minWidth: 280 }}>
        Everything on this page is a scripted simulation that runs entirely in your browser — no AI agents,
        no obligation graph, and nothing leaves this page. The real engine is reserved for signed-in users.
      </span>
      <AuthCtaButtons compact />
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

function IntroStep({ mode, onStart }: { mode: DemoMode; onStart: () => void }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <SectionHeading
        eyebrow={mode === 'simulation' ? 'The keynote demo · simulation' : 'The keynote demo'}
        title={
          mode === 'simulation'
            ? 'A PSUR takes two weeks to assemble. Watch a simulated one draft itself in under a minute.'
            : 'A PSUR takes two weeks to assemble. Watch one draft itself in under 20 minutes.'
        }
      />
      <p style={{ margin: '18px 0 0', fontSize: 15.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        A <strong style={{ color: 'var(--ink)' }}>Periodic Safety Update Report (PSUR)</strong> is the
        document EU MDR Article 86 requires medical-device manufacturers to produce on a fixed cadence:
        sales, complaints, serious incidents, field safety corrective actions, trends, literature, and a
        benefit–risk conclusion, all reconciled against the risk file. Assembling one by hand takes a
        quality team a minimum of two weeks.
      </p>
      {mode === 'simulation' ? (
        <>
          <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            What you are about to watch is a <strong style={{ color: 'var(--ink)' }}>faithful, fully
            simulated replay</strong> of our real generation pipeline — the runtime end to end: every phase,
            all 13 section agents (A–M), and every traced decision, streamed live. The statistics, the EU MDR
            Article 88 trend finding, and the benefit–risk conclusion are all{' '}
            <strong style={{ color: 'var(--ink)' }}>recomputed live from the data you can edit in step 2</strong>.
            The hash chain at the end is real SHA-256, built and verified in your browser. The draft downloads
            as <strong style={{ color: 'var(--ink)' }}>PDF and DOCX</strong>, watermarked SIMULATED on every page.
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            The real engine — grounded LLM section agents, the obligation knowledge graph, and an auditable
            decision trace written under your own tenant — runs only for signed-in users.
          </p>
        </>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          This demo runs the real generation pipeline on a realistic mock data pack and produces a
          human-review-ready draft in under 20 minutes — a <strong style={{ color: 'var(--ink)' }}>99%
          reduction in data-to-draft time</strong>. The downloadable report is the proof of capability. The
          product is what you will watch being built alongside it: a{' '}
          <strong style={{ color: 'var(--ink)' }}>hash-chained decision trace</strong>, grounded in the
          obligation graph, where every decision cites a reason and, where a regulation genuinely drives
          it, the regulation itself.
        </p>
      )}
      <ol style={{ margin: '20px 0 0', paddingLeft: 18, color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.8 }}>
        <li>
          Review (and edit) the mock inputs — content is editable, structure is locked.
          {mode === 'simulation' && ' Push the numbers around: the simulation recomputes its conclusions from your edits.'}
        </li>
        <li>Watch the runtime end to end: phases with live timings, 13 section agents (A–M), the decision stream, and the raw runtime log.</li>
        <li>Preview the draft in place, download it{mode === 'simulation' ? ' as PDF or DOCX' : ''}, and inspect the verified decision trace.</li>
      </ol>
      <div style={{ marginTop: 28, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-orange" onClick={onStart}>
          {mode === 'simulation' ? 'Run the simulation' : 'Start'}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {mode === 'simulation' && clerkAvailable && (
          <span style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>
            or{' '}
            <SignUpButton mode="modal">
              <button
                style={{ border: 0, background: 'transparent', padding: 0, color: 'var(--orange)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
              >
                create a free account
              </button>
            </SignUpButton>{' '}
            to run the real engine on this same data pack.
          </span>
        )}
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
  mode,
  defaults,
  edited,
  setEdited,
  loadError,
  onBack,
  onRun,
}: {
  mode: DemoMode;
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
        body={
          mode === 'simulation'
            ? 'Content is editable; structure is locked. This is where the simulation earns its keep: change any number — add complaint rows until the rate crosses the PMS-plan trend threshold, for instance — and the Article 88 trend finding and the benefit–risk conclusion will recompute from your edits.'
            : 'Content is editable; structure is locked. Change any number or narrative and the run — and its traced calculations — will change with it. Columns and field names cannot be added, removed, or renamed; structural edits are rejected with a precise error.'
        }
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
          {mode === 'simulation' ? 'Run the simulation' : 'Run the pipeline'}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Run — the runtime, end to end
// ---------------------------------------------------------------------------

interface RunState {
  phases: Partial<Record<Phase, Status>>;
  sections: Partial<Record<string, Status>>;
  decisions: DecisionTick[];
  log: LogLine[];
  phaseTimes: Partial<Record<Phase, { start: number; end?: number }>>;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  busy: boolean;
}

/** Weighted run progress: generation counts per completed section agent. */
function runProgressPct(runState: RunState): number {
  const sectionsDone = SECTION_LETTERS.filter((l) => runState.sections[l] === 'completed').length;
  const score = PHASES.reduce((acc, p) => {
    if (p === 'generation') {
      const st = runState.phases[p];
      if (st === 'completed') return acc + 1;
      return acc + sectionsDone / SECTION_LETTERS.length;
    }
    const st = runState.phases[p];
    return acc + (st === 'completed' ? 1 : st === 'started' ? 0.4 : 0);
  }, 0);
  return Math.min(100, Math.round((score / PHASES.length) * 100));
}

function RuntimeStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 86 }}>
      <span style={{ ...mono, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--ink-4)' }}>{label}</span>
      <span style={{ ...mono, fontSize: 19, letterSpacing: '0.02em', color: accent ? 'var(--orange)' : 'var(--ink)' }}>
        {value}
      </span>
    </div>
  );
}

function PhaseTimeline({ runState, now }: { runState: RunState; now: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {PHASES.map((phase, i) => {
        const status = runState.phases[phase] ?? 'pending';
        const times = runState.phaseTimes[phase];
        const duration =
          times?.end !== undefined
            ? `${((times.end - times.start) / 1000).toFixed(1)}s`
            : status === 'started' && times
              ? `${Math.max(0, (now - times.start) / 1000).toFixed(0)}s`
              : '';
        return (
          <div key={phase} style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
            {/* Rail: dot + connecting line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  marginTop: 6,
                  flexShrink: 0,
                  border: '1.5px solid',
                  borderColor: status === 'pending' ? 'var(--rule-strong)' : 'var(--orange)',
                  background: status === 'completed' ? 'var(--orange)' : 'var(--paper)',
                  animation: status === 'started' ? 'rgPulseDot 1.4s ease-out infinite' : undefined,
                }}
              />
              {i < PHASES.length - 1 && (
                <span
                  style={{
                    width: 1.5,
                    flex: 1,
                    minHeight: 14,
                    background: status === 'completed' ? 'var(--orange)' : 'var(--rule)',
                  }}
                />
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                flex: 1,
                paddingBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: status === 'pending' ? 'var(--ink-4)' : status === 'started' ? 'var(--orange)' : 'var(--ink)',
                  fontWeight: status === 'started' ? 600 : 400,
                }}
              >
                {PHASE_LABELS[phase]}
              </span>
              <span style={{ ...mono, fontSize: 10, color: status === 'started' ? 'var(--orange)' : 'var(--ink-4)' }}>
                {duration}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RuntimeLog({ log }: { log: LogLine[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const colors: Record<LogLine['kind'], string> = {
    phase: 'var(--ink-2)',
    agent: 'var(--orange)',
    decision: 'var(--ink)',
    error: 'var(--err)',
  };

  return (
    <div
      ref={ref}
      aria-live="polite"
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 'var(--r-2)',
        background: 'var(--paper-deep)',
        maxHeight: 190,
        overflowY: 'auto',
        padding: '10px 14px',
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        lineHeight: 1.85,
      }}
    >
      {log.length === 0 && <span style={{ color: 'var(--ink-4)' }}>waiting for the runtime…</span>}
      {log.map((line) => (
        <div key={line.id} style={{ display: 'flex', gap: 10, animation: 'rgFadeUp 200ms var(--ease-out) both' }}>
          <span style={{ color: 'var(--ink-4)', flexShrink: 0 }}>{(line.t / 1000).toFixed(1).padStart(6, ' ')}s</span>
          <span style={{ color: colors[line.kind], wordBreak: 'break-word' }}>{line.text}</span>
        </div>
      ))}
    </div>
  );
}

function RunStep({
  mode,
  runState,
  starting,
  startError,
  speed,
  onSpeedChange,
  onRetry,
  onBack,
}: {
  mode: DemoMode;
  runState: RunState;
  starting: boolean;
  startError: string | null;
  speed: number;
  onSpeedChange: (next: number) => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  // Live clock — ticks while the run is in flight.
  const [now, setNow] = useState(() => Date.now());
  const running = runState.startedAt !== null && runState.endedAt === null && !startError;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);

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

  const elapsed = runState.startedAt ? (runState.endedAt ?? now) - runState.startedAt : 0;
  const pct = runProgressPct(runState);
  const sectionsDone = SECTION_LETTERS.filter((l) => runState.sections[l] === 'completed').length;

  return (
    <div>
      <SectionHeading
        eyebrow={mode === 'simulation' ? 'Step 3 — Run · simulation' : 'Step 3 — Run'}
        title={
          mode === 'simulation'
            ? 'The simulated runtime, end to end.'
            : starting
              ? 'Starting the pipeline…'
              : 'The runtime, end to end.'
        }
        body={
          mode === 'simulation'
            ? 'A scripted replay of the real pipeline — no model calls, nothing leaves your browser. Every phase, agent, and decision below was recomputed from the inputs you just edited, and each decision is appended to a real SHA-256 hash chain as it happens.'
            : 'Real LLM runtime. Deterministic statistics are pre-computed and consumed verbatim by 13 section agents (A–M). Every decision below is appended to the hash chain as it happens — grounded in the obligation graph.'
        }
      />

      {/* Runtime stats strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 28,
          marginTop: 24,
          padding: '14px 18px',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-2)',
          background: 'var(--paper)',
        }}
      >
        <RuntimeStat label="Elapsed" value={fmtClock(elapsed)} accent={running} />
        <RuntimeStat label="Progress" value={`${pct}%`} />
        <RuntimeStat label="Decisions" value={String(runState.decisions.length)} />
        <RuntimeStat label="Sections" value={`${sectionsDone}/13`} />
        {mode === 'simulation' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ ...mono, fontSize: 9.5, textTransform: 'uppercase', color: 'var(--ink-4)' }}>Playback</span>
            {[1, 4].map((s) => (
              <button
                key={s}
                onClick={() => onSpeedChange(s)}
                style={{
                  ...mono,
                  fontSize: 10.5,
                  padding: '4px 11px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: speed === s ? 'var(--orange)' : 'var(--rule)',
                  background: speed === s ? 'var(--orange)' : 'transparent',
                  color: speed === s ? '#fff' : 'var(--ink-3)',
                }}
              >
                {s}×
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--rule)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--orange)',
            borderRadius: 2,
            transition: 'width 480ms var(--ease-out)',
          }}
        />
      </div>

      {/* Timeline + agents/decisions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 26, alignItems: 'flex-start' }}>
        {/* Phase timeline */}
        <div style={{ flex: '0 1 240px', minWidth: 210 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Pipeline phases</div>
          <PhaseTimeline runState={runState} now={now} />
        </div>

        {/* Section agents + decision stream */}
        <div style={{ flex: '1 1 440px', minWidth: 320 }}>
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
                    animation: status === 'started' ? 'rgPulseDot 1.4s ease-out infinite' : undefined,
                    transition: 'background var(--t-fast) var(--ease), color var(--t-fast) var(--ease)',
                  }}
                >
                  {letter}
                </span>
              );
            })}
          </div>

          <div className="eyebrow" style={{ margin: '22px 0 10px' }}>
            Decision stream · {runState.decisions.length} traced{mode === 'simulation' && ' · simulated'}
          </div>
          <div aria-live="polite" style={{ border: '1px solid var(--rule)', borderRadius: 'var(--r-2)', maxHeight: 320, overflowY: 'auto' }}>
            {runState.decisions.length === 0 && (
              <div style={{ padding: 18, fontSize: 13.5, color: 'var(--ink-4)' }}>
                Waiting for the first traced decision…
              </div>
            )}
            {[...runState.decisions].reverse().map((d) => (
              <div
                key={d.seq}
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', animation: 'rgFadeUp 260ms var(--ease-out) both' }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ ...mono, fontSize: 10, color: 'var(--ink-4)' }}>#{d.seq}</span>
                  <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>{d.decision}</strong>
                  {d.section && <Chip tone="neutral">{d.section.split('_')[0]}</Chip>}
                </div>
                <p style={{ margin: '6px 0 8px', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>{d.reason}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {d.basis.map((b) => (
                    <Chip
                      key={b}
                      tone={mode === 'simulation' ? 'sim' : 'active'}
                      title={mode === 'simulation' ? 'Simulated citation — illustrative only, not resolved against the obligation graph' : undefined}
                    >
                      {b}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* End-to-end runtime log */}
      <div style={{ marginTop: 26 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Runtime log · run start → artifacts
        </div>
        <RuntimeLog log={runState.log} />
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
  mode,
  complete,
  trace,
  previewHtml,
  onDownload,
  onRestart,
}: {
  mode: DemoMode;
  complete: CompleteInfo;
  trace: TraceResponse | null;
  previewHtml: string | null;
  onDownload: (name: string) => void;
  onRestart: () => void;
}) {
  const verification = trace?.verification ?? null;
  const decisions = (trace?.entries ?? []).filter((e) => e.eventType === 'psur.decision');

  return (
    <div>
      <SectionHeading
        eyebrow={mode === 'simulation' ? 'Step 4 — Results · simulation' : 'Step 4 — Results'}
        title={mode === 'simulation' ? 'Simulated draft delivered. Local chain verified.' : 'Draft delivered. Trace verified.'}
        body={
          mode === 'simulation'
            ? 'Preview the watermarked simulated draft below, download it as PDF or DOCX — its numbers and conclusions came from your edited inputs — then inspect the decision chain: every simulated decision was hashed with SHA-256 and the full chain re-verified, right here in your browser.'
            : 'Preview and download the human-review-ready draft below. Then inspect the hero artifact: the hash-chained decision trace — every decision with its reason and its obligation citations.'
        }
      />

      {/* Validation + verification badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20, alignItems: 'center' }}>
        {mode === 'simulation' && <Chip tone="sim">Simulated run</Chip>}
        <Chip tone={complete.validation.passed ? 'done' : 'warn'}>
          Validation {complete.validation.passed ? 'passed' : 'failed'} · {complete.validation.error_count} error(s)
        </Chip>
        {verification && (
          <Chip tone={verification.valid ? 'done' : 'warn'} title={`${verification.verifiedEntries}/${verification.totalEntries} entries verified`}>
            {verification.valid
              ? mode === 'simulation'
                ? `Hash chain verified locally · ${verification.verifiedEntries} entries`
                : `Hash chain verified · ${verification.verifiedEntries} entries`
              : 'Hash chain verification FAILED'}
          </Chip>
        )}
      </div>

      {/* Document preview + downloads */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 26, marginTop: 24, alignItems: 'stretch' }}>
        {previewHtml && (
          <div style={{ flex: '1 1 460px', minWidth: 320, display: 'flex', flexDirection: 'column' }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Document preview{mode === 'simulation' && ' · watermarked'}
            </div>
            <iframe
              title="PSUR draft preview"
              sandbox=""
              srcDoc={previewHtml}
              style={{
                width: '100%',
                flex: 1,
                minHeight: 480,
                border: '1px solid var(--rule)',
                borderRadius: 'var(--r-2)',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        <div style={{ flex: '0 1 300px', minWidth: 260 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Downloads</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {complete.artifacts.map((a: ArtifactInfo, i) => {
              const primary = i === 0;
              return (
                <button
                  key={a.name}
                  className={primary ? 'btn btn-orange' : 'btn btn-ghost'}
                  style={{ justifyContent: 'space-between', fontSize: 13, width: '100%' }}
                  onClick={() => onDownload(a.name)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        ...mono,
                        fontSize: 9,
                        padding: '2px 6px',
                        borderRadius: 'var(--r-1)',
                        border: '1px solid',
                        borderColor: primary ? 'rgba(255,255,255,0.5)' : 'var(--rule-strong)',
                        flexShrink: 0,
                      }}
                    >
                      {extOf(a.name) || 'FILE'}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↓ {a.name}</span>
                  </span>
                  <span style={{ ...mono, fontSize: 10, opacity: 0.75, flexShrink: 0, marginLeft: 8 }}>
                    {(a.size_bytes / 1024).toFixed(0)} KB
                  </span>
                </button>
              );
            })}
          </div>
          {mode === 'simulation' && (
            <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-4)', marginTop: 12 }}>
              Both documents are generated in your browser and watermarked SIMULATED on every page.
            </p>
          )}
        </div>
      </div>

      {/* Decision trace — the hero artifact */}
      <div style={{ marginTop: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          The decision trace · {decisions.length} decisions{mode === 'simulation' && ' · simulated'}
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
                  {mode === 'simulation' &&
                    (ctx.citations ?? []).map((c) => (
                      <Chip key={c} tone="sim" title="Simulated citation — illustrative only, not resolved against the obligation graph">
                        {c}
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

      {mode === 'simulation' ? (
        /* The conversion moment: the simulation just proved the experience —
           the real engine is one sign-up away. */
        <div
          style={{
            marginTop: 30,
            border: '1px dashed var(--orange)',
            borderRadius: 'var(--r-2)',
            padding: '24px 26px',
            maxWidth: 720,
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 10 }}>What you just watched was a simulation</div>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            No AI was called and no regulation was actually consulted — but the real engine produces exactly
            this experience with <strong style={{ color: 'var(--ink)' }}>grounded LLM section agents</strong>,
            citations resolved against the <strong style={{ color: 'var(--ink)' }}>obligation knowledge
            graph</strong>, and a decision trace written under your own tenant that an auditor can verify.
            Create a free account and run it on this same data pack.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 18, alignItems: 'center' }}>
            <AuthCtaButtons />
            <button className="btn btn-ghost" onClick={onRestart}>Replay the simulation</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {trace && (
            <Link
              href={`/app/trails/${trace.processInstanceId}`}
              className="btn btn-ghost"
              style={{ textDecoration: 'none', fontSize: 13 }}
            >
              Open in Trace Explorer + export Audit Pack
            </Link>
          )}
          <button className="btn btn-orange" onClick={onRestart}>Run it again</button>
        </div>
      )}
      {trace && (
        <p style={{ ...mono, fontSize: 10.5, color: 'var(--ink-4)', marginTop: 12 }}>
          {mode === 'simulation' ? 'SIMULATED PROCESS INSTANCE' : 'PROCESS INSTANCE'} {trace.processInstanceId}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your runs — durable, per-user run history
// ---------------------------------------------------------------------------

function fmtRunDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function YourRunsPanel({
  runs,
  loading,
  busyRunId,
  onReopen,
  onDownload,
  onRefresh,
}: {
  runs: PsurRunSummary[];
  loading: boolean;
  busyRunId: string | null;
  onReopen: (run: PsurRunSummary) => void;
  onDownload: (runId: string, name: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 36,
        maxWidth: 760,
        border: '1px solid var(--rule)',
        borderRadius: 14,
        background: 'var(--paper)',
        padding: '20px 22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div className="eyebrow">Your runs</div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={{
            ...mono,
            fontSize: 10.5,
            textTransform: 'uppercase',
            padding: '5px 11px',
            borderRadius: 999,
            border: '1px solid var(--rule)',
            background: 'var(--paper)',
            color: 'var(--ink-3)',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {runs.length === 0 ? (
        <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-3)' }}>
          {loading ? 'Loading your run history…' : 'No saved runs yet. Every PSUR you run is saved here automatically.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 12 }}>
          {runs.map((run) => {
            const isBusy = busyRunId === run.runId;
            const completed = run.status === 'completed';
            const docx = run.artifacts.find((a) => a.name.toLowerCase().endsWith('.docx'));
            return (
              <li
                key={run.runId}
                style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Chip tone={completed ? 'done' : run.status === 'failed' ? 'warn' : 'active'}>{run.status}</Chip>
                  {completed && run.validationPassed != null && (
                    <Chip tone={run.validationPassed ? 'done' : 'warn'}>
                      {run.validationPassed ? 'validation passed' : `${run.errorCount ?? 0} validation errors`}
                    </Chip>
                  )}
                  <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-4)' }}>{fmtRunDate(run.createdAt)}</span>
                </div>

                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                  <strong style={{ color: 'var(--ink-1)' }}>{run.deviceName ?? 'PSUR run'}</strong>
                  {run.reportType ? ` · ${run.reportType}` : ''}
                  <span style={{ color: 'var(--ink-3)' }}>{` · ${run.periodStart} → ${run.periodEnd}`}</span>
                </div>

                {run.status === 'failed' && run.error && (
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--err)' }}>{run.error}</div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => onReopen(run)}
                    disabled={!completed || isBusy}
                    style={{
                      ...mono,
                      fontSize: 10.5,
                      textTransform: 'uppercase',
                      padding: '6px 13px',
                      borderRadius: 999,
                      border: '1px solid var(--orange)',
                      background: 'var(--orange)',
                      color: '#fff',
                      cursor: !completed || isBusy ? 'default' : 'pointer',
                      opacity: !completed || isBusy ? 0.5 : 1,
                    }}
                  >
                    {isBusy ? 'Opening…' : 'Re-open'}
                  </button>
                  {completed && docx && (
                    <button
                      type="button"
                      onClick={() => onDownload(run.runId, docx.name)}
                      style={{
                        ...mono,
                        fontSize: 10.5,
                        textTransform: 'uppercase',
                        padding: '6px 13px',
                        borderRadius: 999,
                        border: '1px solid var(--rule)',
                        background: 'var(--paper)',
                        color: 'var(--ink-2)',
                        cursor: 'pointer',
                      }}
                    >
                      Download DOCX
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
  log: [],
  phaseTimes: {},
  startedAt: null,
  endedAt: null,
  error: null,
  busy: false,
};

function PsurDemoCore({ mode, getToken }: { mode: DemoMode; getToken: GetToken }) {
  const [step, setStep] = useState<StepId>('intro');

  const apiJson = useMemo(() => createJsonClient(getToken), [getToken]);
  const streamSse = useMemo(() => createAuthenticatedSse(getToken), [getToken]);

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
  const [simArtifacts, setSimArtifacts] = useState<SimArtifact[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);

  // Your runs — durable, per-user history (live mode only).
  const [pastRuns, setPastRuns] = useState<PsurRunSummary[]>([]);
  const [pastRunsLoading, setPastRunsLoading] = useState(false);
  const [reopeningRunId, setReopeningRunId] = useState<string | null>(null);

  // Simulation playback speed (1× scripted, 4× fast-forward).
  const [speed, setSpeedState] = useState(1);
  const speedRef = useRef(1);
  const setSpeed = useCallback((next: number) => {
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  // Load the data pack when entering the inputs step (once).
  // Simulation mode is instant and offline; live mode fetches from the API.
  useEffect(() => {
    if (step !== 'inputs' || defaults || loadError) return;
    if (mode === 'simulation') {
      const sim = clone(SIMULATED_DEFAULTS);
      setDefaults(sim);
      setEdited(clone(sim.inputs));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { status, body } = await apiJson<Defaults>('/api/psur/defaults');
        if (cancelled) return;
        if (status === 401) {
          setLoadError('Your session has expired. Sign in again to run the real pipeline.');
          return;
        }
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
  }, [step, defaults, loadError, mode, apiJson]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Shared SSE/sim event reducer — feeds phases, agents, decisions, timings, and the runtime log. */
  const applyRunEvent = useCallback((ev: Record<string, unknown>) => {
    const nowMs = Date.now();
    const appendLog = (s: RunState, kind: LogLine['kind'], text: string): LogLine[] => {
      const line: LogLine = { id: logIdRef.current++, t: s.startedAt ? nowMs - s.startedAt : 0, kind, text };
      const log = [...s.log, line];
      return log.length > 500 ? log.slice(-400) : log;
    };

    const kind = ev.kind;
    if (kind === 'progress') {
      const phase = ev.phase as Phase;
      const status = ev.status as Status;
      const section = typeof ev.section === 'string' ? ev.section : undefined;
      setRunState((s) => {
        const next: RunState = { ...s, phases: { ...s.phases, [phase]: status } };
        const existing = s.phaseTimes[phase];
        if (!existing) {
          next.phaseTimes = { ...s.phaseTimes, [phase]: { start: nowMs } };
        } else if (status === 'completed' && !section) {
          next.phaseTimes = { ...s.phaseTimes, [phase]: { start: existing.start, end: nowMs } };
        }
        if (section) {
          const letter = section.charAt(0).toUpperCase();
          next.sections = { ...s.sections, [letter]: status };
          next.log = appendLog(s, 'agent', `agent ${letter} · ${sectionPretty(section)} — ${status}`);
        } else {
          next.log = appendLog(s, 'phase', `${PHASE_LABELS[phase] ?? phase} ${status}`);
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
      setRunState((s) => {
        if (s.decisions.some((d) => d.seq === tick.seq)) return s;
        return {
          ...s,
          decisions: [...s.decisions, tick],
          log: appendLog(s, 'decision', `decision #${tick.seq} · ${tick.decision}`),
        };
      });
    } else if (kind === 'error') {
      const message = typeof ev.message === 'string' ? ev.message : 'The pipeline reported an error.';
      setRunState((s) => ({
        ...s,
        error: message,
        busy: message.toLowerCase().includes('busy'),
        endedAt: nowMs,
        log: appendLog(s, 'error', message),
      }));
    }
  }, []);

  const resetRunOutputs = useCallback(() => {
    setStartError(null);
    setRunState(EMPTY_RUN_STATE);
    setComplete(null);
    setTrace(null);
    setSimArtifacts([]);
    setPreviewHtml(null);
  }, []);

  const markRunStarted = useCallback(() => {
    setRunState({ ...EMPTY_RUN_STATE, startedAt: Date.now() });
  }, []);

  const markRunEnded = useCallback(() => {
    setRunState((s) => (s.endedAt === null ? { ...s, endedAt: Date.now() } : s));
  }, []);

  // -- Simulated run (signed out): scripted, local, abortable ---------------
  const startSimulatedRun = useCallback(async () => {
    if (!defaults) return;
    abortRef.current?.abort();
    setStep('run');
    setStarting(false);
    resetRunOutputs();
    markRunStarted();

    const abort = new AbortController();
    abortRef.current = abort;

    let result: SimRunResult | null = null;
    try {
      result = await runPsurSimulation({
        period: defaults.period,
        inputs: edited,
        signal: abort.signal,
        speed: () => speedRef.current,
        onEvent: (ev) => applyRunEvent(ev as unknown as Record<string, unknown>),
      });
    } catch {
      setRunState((s) => ({ ...s, error: 'The simulation hit an unexpected error. Run it again.', endedAt: Date.now() }));
      return;
    }
    if (!result) return; // aborted by restart/unmount
    markRunEnded();

    setSimArtifacts(result.artifacts);
    setRunId(result.processInstanceId);
    setTrace(result.trace);
    setPreviewHtml(result.previewHtml);
    setComplete({
      artifacts: result.artifacts.map((a) => ({
        name: a.name,
        content_type: a.contentType,
        size_bytes: a.sizeBytes,
      })),
      validation: result.validation,
    });
    setStep('results');
  }, [defaults, edited, applyRunEvent, resetRunOutputs, markRunStarted, markRunEnded]);

  // -- Live run (signed in): the real pipeline over authenticated SSE -------
  const startLiveRun = useCallback(async () => {
    if (!defaults) return;
    setStep('run');
    setStarting(true);
    resetRunOutputs();

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
      const { status, body } = await apiJson<{
        runId?: string;
        processInstanceId?: string;
        error?: string;
        detail?: unknown;
      }>('/api/psur/runs', { method: 'POST', body: JSON.stringify(payload) });

      if (status === 401) {
        setStartError('Your session has expired. Sign in again to run the real pipeline.');
        setStarting(false);
        return;
      }
      if (status === 409) {
        setRunState((s) => ({ ...s, busy: true }));
        setStartError('Another run is in progress right now — the demo only runs one PSUR at a time. Please try again in a few minutes.');
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
    markRunStarted();

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
          if (ev.kind === 'complete') {
            completed = {
              artifacts: (ev.artifacts as ArtifactInfo[]) ?? [],
              validation: (ev.validation as CompleteInfo['validation']) ?? { passed: false, error_count: 0 },
            };
          } else {
            applyRunEvent(ev);
          }
        },
      });
    } catch {
      if (!abort.signal.aborted) {
        setRunState((s) => ({ ...s, error: 'The live stream was interrupted. The trace keeps its partial chain.' }));
      }
    }
    markRunEnded();

    if (completed) {
      setComplete(completed);
      try {
        const { status, body } = await apiJson<TraceResponse>(
          `/api/psur/runs/${encodeURIComponent(createdRunId)}/trace`,
        );
        if (status === 200) setTrace(body);
      } catch {
        // Verification badge simply won't render; downloads still work.
      }
      setStep('results');
    }
  }, [defaults, edited, apiJson, streamSse, applyRunEvent, resetRunOutputs, markRunStarted, markRunEnded]);

  const startRun = useCallback(() => {
    if (mode === 'simulation') void startSimulatedRun();
    else void startLiveRun();
  }, [mode, startSimulatedRun, startLiveRun]);

  // -- Your runs: durable per-user history (live mode only) ------------------
  const refreshRuns = useCallback(async () => {
    if (mode !== 'live') return;
    setPastRunsLoading(true);
    try {
      const { status, body } = await apiJson<{ runs?: PsurRunSummary[] }>('/api/psur/runs');
      if (status === 200 && Array.isArray(body.runs)) setPastRuns(body.runs);
    } catch {
      // History is best-effort; the live pipeline still works without it.
    } finally {
      setPastRunsLoading(false);
    }
  }, [mode, apiJson]);

  // Load history on the intro step, and refresh it after each run finishes.
  useEffect(() => {
    if (mode !== 'live') return;
    if (step === 'intro' || step === 'results') void refreshRuns();
  }, [mode, step, refreshRuns]);

  const downloadFromRun = useCallback(
    async (forRunId: string, name: string) => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const res = await fetch(
          `${API_BASE}/api/psur/runs/${encodeURIComponent(forRunId)}/artifacts/${encodeURIComponent(name)}`,
          { headers },
        );
        if (!res.ok) return;
        saveBlob(await res.blob(), name);
      } catch {
        // Download silently unavailable.
      }
    },
    [getToken],
  );

  const reopenRun = useCallback(
    async (run: PsurRunSummary) => {
      if (run.status !== 'completed') return;
      setReopeningRunId(run.runId);
      abortRef.current?.abort();
      resetRunOutputs();
      setPreviewHtml(null);
      setRunId(run.runId);
      setComplete({
        artifacts: run.artifacts,
        validation: {
          passed: run.validationPassed ?? false,
          error_count: run.errorCount ?? 0,
        },
      });
      try {
        const { status, body } = await apiJson<TraceResponse>(
          `/api/psur/runs/${encodeURIComponent(run.runId)}/trace`,
        );
        setTrace(status === 200 ? body : null);
      } catch {
        setTrace(null);
      }
      setReopeningRunId(null);
      setStep('results');
    },
    [apiJson, resetRunOutputs],
  );

  // Live mode: pull the first HTML artifact for the inline document preview.
  useEffect(() => {
    if (mode !== 'live' || step !== 'results' || previewHtml || !complete || !runId) return;
    const htmlArtifact = complete.artifacts.find((a) => a.content_type.includes('html'));
    if (!htmlArtifact) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(
          `${API_BASE}/api/psur/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(htmlArtifact.name)}`,
          { headers },
        );
        if (!res.ok || cancelled) return;
        const text = await res.text();
        if (!cancelled) setPreviewHtml(text);
      } catch {
        // No preview — downloads still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, step, previewHtml, complete, runId, getToken]);

  // -- Artifact downloads ----------------------------------------------------
  // Simulation: serve the locally generated blobs. Live: authenticated
  // fetch → blob (plain <a href> can't carry the bearer token).
  const downloadArtifact = useCallback(
    async (name: string) => {
      if (mode === 'simulation') {
        const artifact = simArtifacts.find((a) => a.name === name);
        if (artifact) saveBlob(artifact.blob, name);
        return;
      }
      if (!runId) return;
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const res = await fetch(
          `${API_BASE}/api/psur/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`,
          { headers },
        );
        if (!res.ok) return;
        saveBlob(await res.blob(), name);
      } catch {
        // Download silently unavailable; the run view still holds the trace.
      }
    },
    [mode, simArtifacts, runId, getToken],
  );

  const restart = useCallback(() => {
    abortRef.current?.abort();
    setRunId(null);
    resetRunOutputs();
    setStep('inputs');
  }, [resetRunOutputs]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      <style>{RUNTIME_KEYFRAMES}</style>
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
          <span className="eyebrow">
            {mode === 'simulation' ? 'PSUR demo · simulation mode' : 'PSUR demo · data → draft in 20 minutes'}
          </span>
          <Chip tone={mode === 'live' ? 'done' : 'sim'}>{mode === 'live' ? 'Live pipeline' : 'Simulation'}</Chip>
          {mode === 'live' && clerkAvailable && (
            <Link href="/app" className="btn btn-ghost" style={{ textDecoration: 'none', fontSize: 12.5, padding: '7px 14px' }}>
              Command Center
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--rule)' }}>
        <ProgressRail step={step} />
      </div>

      {mode === 'simulation' && <SimulationBanner />}

      <main style={{ flex: 1, padding: '36px 28px 64px', maxWidth: 1040, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {step === 'intro' && <IntroStep mode={mode} onStart={() => setStep('inputs')} />}
        {step === 'intro' && mode === 'live' && (
          <YourRunsPanel
            runs={pastRuns}
            loading={pastRunsLoading}
            busyRunId={reopeningRunId}
            onReopen={(run) => void reopenRun(run)}
            onDownload={(forRunId, name) => void downloadFromRun(forRunId, name)}
            onRefresh={() => void refreshRuns()}
          />
        )}
        {step === 'inputs' && (
          <InputsStep
            mode={mode}
            defaults={defaults}
            edited={edited}
            setEdited={setEdited}
            loadError={loadError}
            onBack={() => setStep('intro')}
            onRun={startRun}
          />
        )}
        {step === 'run' && (
          <RunStep
            mode={mode}
            runState={runState}
            starting={starting}
            startError={startError}
            speed={speed}
            onSpeedChange={setSpeed}
            onRetry={startRun}
            onBack={() => setStep('inputs')}
          />
        )}
        {step === 'results' && complete && (
          <ResultsStep
            mode={mode}
            complete={complete}
            trace={trace}
            previewHtml={previewHtml}
            onDownload={(name) => void downloadArtifact(name)}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  );
}

function DemoSplash() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        color: 'var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <SmarticusWordmark size={16} tagline={false} />
      <span style={{ ...mono, fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-3)' }}>
        Preparing the demo…
      </span>
    </div>
  );
}

/** Picks the mode from auth state; remounts the core on sign-in so a visitor who converts mid-demo lands cleanly in the live pipeline. */
function ClerkAwarePsurDemo() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  if (!isLoaded) return <DemoSplash />;
  const mode: DemoMode = isSignedIn ? 'live' : 'simulation';
  return <PsurDemoCore key={mode} mode={mode} getToken={getToken} />;
}

export function PsurDemo() {
  if (!clerkAvailable) {
    // Dev without Clerk: mirror the app shell's open-access behaviour.
    return <PsurDemoCore mode="live" getToken={async () => null} />;
  }
  return <ClerkAwarePsurDemo />;
}

export default PsurDemo;
