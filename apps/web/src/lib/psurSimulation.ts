/**
 * Client-side PSUR simulation for signed-out visitors.
 *
 * The real generation pipeline (/api/psur) requires sign-in. This module gives
 * prospective customers the full walkthrough experience without an account:
 * a scripted run that mirrors the live pipeline's phases, section agents A–M,
 * and decision ticker — with every conclusion recomputed from the visitor's
 * edited inputs, a genuine SHA-256 hash chain built and verified in the
 * browser, and a downloadable, watermarked simulated PSUR draft.
 *
 * Honesty contract: everything here is clearly labeled SIMULATED. No LLM is
 * called, no obligation-graph lookup happens, and nothing leaves the browser.
 * The hash chain is real cryptography over simulated decisions.
 */

import { buildPsurModel, renderPsurDocx, renderPsurHtml, renderPsurPdf } from './psurDocuments.js';

// ---------------------------------------------------------------------------
// Contract types (mirror apps/api/src/psur/schemas.ts — shared with PsurDemo)
// ---------------------------------------------------------------------------

export interface ColumnSpec {
  name: string;
  type: string;
  required: boolean;
}
export interface TableInput {
  kind: 'table';
  columns: ColumnSpec[];
  rows: Record<string, unknown>[];
}
export interface JsonInput {
  kind: 'json';
  value: Record<string, unknown>;
}
export type InputDefault = TableInput | JsonInput;

export interface Defaults {
  period: { start: string; end: string };
  inputs: Record<string, InputDefault>;
}

export interface ArtifactInfo {
  name: string;
  content_type: string;
  size_bytes: number;
}
export interface CompleteInfo {
  artifacts: ArtifactInfo[];
  validation: { passed: boolean; error_count: number };
}

export interface TraceEntryView {
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
export interface TraceResponse {
  processInstanceId: string;
  entries: TraceEntryView[];
  verification: { valid: boolean; verifiedEntries: number; totalEntries: number };
}

/** Events emitted by the simulation — same envelope as the live SSE stream. */
export type SimEvent =
  | { kind: 'progress'; phase: string; status: 'started' | 'completed'; section?: string }
  | {
      kind: 'decision';
      seq: number;
      decision: string;
      reason: string;
      regulatory_basis: string[];
      section?: string;
    }
  | { kind: 'complete'; artifacts: ArtifactInfo[]; validation: { passed: boolean; error_count: number } };

export interface SimArtifact {
  name: string;
  contentType: string;
  sizeBytes: number;
  blob: Blob;
}

export interface SimRunResult {
  processInstanceId: string;
  artifacts: SimArtifact[];
  validation: { passed: boolean; error_count: number };
  trace: TraceResponse;
  /** Rendered document for the inline results preview. */
  previewHtml: string;
}

// ---------------------------------------------------------------------------
// The simulated mock data pack — a Class IIb infusion pump
// ---------------------------------------------------------------------------

function table(columns: [string, string, boolean][], rows: Record<string, unknown>[]): TableInput {
  return {
    kind: 'table',
    columns: columns.map(([name, type, required]) => ({ name, type, required })),
    rows,
  };
}

export const SIMULATED_DEFAULTS: Defaults = {
  period: { start: '2025-01-01', end: '2025-12-31' },
  inputs: {
    sales: table(
      [
        ['quarter', 'string', true],
        ['region', 'string', true],
        ['units_sold', 'integer', true],
      ],
      [
        { quarter: '2025-Q1', region: 'EU', units_sold: 18420 },
        { quarter: '2025-Q1', region: 'Non-EU', units_sold: 6210 },
        { quarter: '2025-Q2', region: 'EU', units_sold: 19105 },
        { quarter: '2025-Q2', region: 'Non-EU', units_sold: 6885 },
        { quarter: '2025-Q3', region: 'EU', units_sold: 20340 },
        { quarter: '2025-Q3', region: 'Non-EU', units_sold: 7150 },
        { quarter: '2025-Q4', region: 'EU', units_sold: 21075 },
        { quarter: '2025-Q4', region: 'Non-EU', units_sold: 7415 },
      ],
    ),
    complaints: table(
      [
        ['complaint_id', 'string', true],
        ['received_date', 'string', true],
        ['region', 'string', true],
        ['description', 'string', true],
        ['imdrf_code', 'string', true],
        ['severity', 'string', true],
        ['patient_harm', 'boolean', true],
      ],
      [
        { complaint_id: 'C-2025-0041', received_date: '2025-02-03', region: 'EU', description: 'Occlusion alarm triggered without visible line blockage', imdrf_code: 'A0703', severity: 'minor', patient_harm: false },
        { complaint_id: 'C-2025-0057', received_date: '2025-02-19', region: 'EU', description: 'Battery drained faster than labelled runtime', imdrf_code: 'A1006', severity: 'minor', patient_harm: false },
        { complaint_id: 'C-2025-0102', received_date: '2025-04-08', region: 'Non-EU', description: 'Door latch required repeated attempts to close', imdrf_code: 'A0502', severity: 'minor', patient_harm: false },
        { complaint_id: 'C-2025-0133', received_date: '2025-05-22', region: 'EU', description: 'Flow rate deviation of 6% observed during verification', imdrf_code: 'A0702', severity: 'major', patient_harm: false },
        { complaint_id: 'C-2025-0149', received_date: '2025-06-11', region: 'EU', description: 'Occlusion alarm triggered without visible line blockage', imdrf_code: 'A0703', severity: 'minor', patient_harm: false },
        { complaint_id: 'C-2025-0188', received_date: '2025-07-30', region: 'Non-EU', description: 'Display intermittently blank after power cycling', imdrf_code: 'A0901', severity: 'major', patient_harm: false },
        { complaint_id: 'C-2025-0205', received_date: '2025-08-14', region: 'EU', description: 'Infusion paused unexpectedly; restart required', imdrf_code: 'A0702', severity: 'serious', patient_harm: true },
        { complaint_id: 'C-2025-0231', received_date: '2025-09-26', region: 'EU', description: 'Battery drained faster than labelled runtime', imdrf_code: 'A1006', severity: 'minor', patient_harm: false },
        { complaint_id: 'C-2025-0266', received_date: '2025-10-31', region: 'Non-EU', description: 'Keypad button unresponsive after cleaning', imdrf_code: 'A0506', severity: 'minor', patient_harm: false },
        { complaint_id: 'C-2025-0290', received_date: '2025-11-27', region: 'EU', description: 'Occlusion alarm triggered without visible line blockage', imdrf_code: 'A0703', severity: 'minor', patient_harm: false },
      ],
    ),
    capa: table(
      [
        ['capa_id', 'string', true],
        ['opened_date', 'string', true],
        ['status', 'string', true],
        ['title', 'string', true],
        ['linked_complaints', 'integer', true],
      ],
      [
        { capa_id: 'CAPA-2025-007', opened_date: '2025-03-04', status: 'closed', title: 'Occlusion alarm sensitivity recalibration', linked_complaints: 3 },
        { capa_id: 'CAPA-2025-012', opened_date: '2025-06-02', status: 'closed', title: 'Battery supplier lot screening tightened', linked_complaints: 2 },
        { capa_id: 'CAPA-2025-019', opened_date: '2025-08-25', status: 'open', title: 'Flow-control firmware watchdog improvement', linked_complaints: 2 },
        { capa_id: 'CAPA-2025-023', opened_date: '2025-10-13', status: 'closed', title: 'Door latch tolerance update in assembly work instruction', linked_complaints: 1 },
      ],
    ),
    fsca: table(
      [
        ['fsca_id', 'string', true],
        ['type', 'string', true],
        ['status', 'string', true],
        ['description', 'string', true],
        ['regions', 'string', true],
      ],
      [
        { fsca_id: 'FSCA-2025-001', type: 'Field Safety Notice', status: 'closed', description: 'Advisory on battery runtime in low-temperature environments; labelling updated', regions: 'EU, UK' },
      ],
    ),
    ract: table(
      [
        ['risk_id', 'string', true],
        ['hazard', 'string', true],
        ['initial_risk', 'string', true],
        ['residual_risk', 'string', true],
        ['status', 'string', true],
      ],
      [
        { risk_id: 'R-014', hazard: 'Over-infusion due to flow-control fault', initial_risk: 'high', residual_risk: 'low', status: 'controlled' },
        { risk_id: 'R-021', hazard: 'Interruption of therapy from battery depletion', initial_risk: 'medium', residual_risk: 'low', status: 'controlled' },
        { risk_id: 'R-029', hazard: 'False occlusion alarm causing therapy delay', initial_risk: 'medium', residual_risk: 'low', status: 'controlled' },
        { risk_id: 'R-033', hazard: 'Use error from ambiguous alarm prioritisation', initial_risk: 'medium', residual_risk: 'low', status: 'controlled' },
        { risk_id: 'R-041', hazard: 'Ingress of cleaning fluid into keypad', initial_risk: 'low', residual_risk: 'low', status: 'controlled' },
      ],
    ),
    external_events: table(
      [
        ['source', 'string', true],
        ['date', 'string', true],
        ['summary', 'string', true],
      ],
      [
        { source: 'FDA MAUDE', date: '2025-03-18', summary: 'Two reports on similar-class pumps citing occlusion alarm nuisance triggers; no patient harm' },
        { source: 'BfArM', date: '2025-07-09', summary: 'Manufacturer advisory on competitor device battery contactor corrosion' },
        { source: 'MHRA', date: '2025-10-02', summary: 'Safety roundup on infusion pump keypad ingress; aligned with existing risk control R-041' },
      ],
    ),
    literature: table(
      [
        ['citation', 'string', true],
        ['year', 'integer', true],
        ['relevance', 'string', true],
        ['finding', 'string', true],
      ],
      [
        { citation: 'Hartmann et al., J Clin Eng 49(2)', year: 2025, relevance: 'direct', finding: 'Ambulatory infusion pump alarm fatigue reduced 31% with prioritised alarm schemes' },
        { citation: 'Okafor & Lindqvist, BMJ Innov 11(1)', year: 2025, relevance: 'direct', finding: 'No new hazards identified in systematic review of volumetric pump occlusion detection' },
        { citation: 'Sato et al., Med Devices Evid Res 18', year: 2024, relevance: 'supportive', finding: 'Lithium cell runtime degradation accelerates below 5°C — consistent with FSN-2025-001 labelling update' },
        { citation: 'EU PMS Consortium, Ann Biomed Saf 7', year: 2025, relevance: 'supportive', finding: 'Benchmark complaint rates for Class IIb infusion systems: 1.2–3.0 per 10,000 units' },
      ],
    ),
    device_context: {
      kind: 'json',
      value: {
        device_name: 'VitaFlow C200 Infusion Pump',
        manufacturer: 'Meridian Medical GmbH',
        basic_udi_di: '4051234567VITAC200XY',
        risk_class: 'IIb',
        notified_body: 'NB 0123',
        certificate_number: 'CE-712-2024-0456',
        intended_purpose: 'Controlled intravenous administration of fluids and medication in clinical settings',
        markets: ['EU', 'UK', 'CA'],
      },
    },
    pms_plan: {
      kind: 'json',
      value: {
        plan_id: 'PMS-VFC200-2024-02',
        trend_threshold_per_10k: 2.5,
        review_cadence: 'annual',
        data_sources: ['complaints', 'sales', 'FSCA', 'vigilance databases', 'literature', 'PMCF'],
      },
    },
    previous_psur: {
      kind: 'json',
      value: {
        period_end: '2024-12-31',
        complaint_rate_per_10k: 1.8,
        benefit_risk_conclusion: 'favourable',
        open_actions: 'Monitor occlusion alarm complaint cluster; verify CAPA-2024-031 effectiveness',
      },
    },
    clinical_safety: {
      kind: 'json',
      value: {
        serious_incidents_reported: 1,
        deaths: 0,
        summary: 'One serious incident (unexpected infusion pause, C-2025-0205) reported to the competent authority within the Article 87 timeline; investigation closed with firmware CAPA-2025-019.',
      },
    },
    clinical_performance: {
      kind: 'json',
      value: {
        intended_performance_met: true,
        flow_accuracy_spec: '±5%',
        observed_flow_accuracy: '±3.1% (95th percentile, field verification programme)',
        summary: 'Field verification and PMCF survey data confirm the device performs as intended across the reporting period.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Derived statistics — recomputed live from the visitor's edited inputs
// ---------------------------------------------------------------------------

const IMDRF_LABELS: Record<string, string> = {
  A0502: 'Mechanical problem — closure',
  A0506: 'Mechanical problem — activation/positioning',
  A0702: 'Flow or infusion rate problem',
  A0703: 'Occlusion within device',
  A0901: 'Display or visual feedback problem',
  A1006: 'Battery problem',
};

export interface SimDerivedStats {
  unitsSold: number;
  complaintCount: number;
  seriousCount: number;
  ratePer10k: number;
  prevRatePer10k: number;
  threshold: number;
  trendSignal: boolean;
  fscaCount: number;
  capaTotal: number;
  capaOpen: number;
  literatureCount: number;
  externalEventCount: number;
  ractTotal: number;
  ractControlled: number;
  topImdrf: { code: string; label: string; count: number }[];
  benefitRiskFavourable: boolean;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowsOf(inputs: Record<string, InputDefault>, name: string): Record<string, unknown>[] {
  const input = inputs[name];
  return input?.kind === 'table' ? input.rows : [];
}

function valueOf(inputs: Record<string, InputDefault>, name: string): Record<string, unknown> {
  const input = inputs[name];
  return input?.kind === 'json' ? input.value : {};
}

export function deriveSimStats(inputs: Record<string, InputDefault>): SimDerivedStats {
  const sales = rowsOf(inputs, 'sales');
  const complaints = rowsOf(inputs, 'complaints');
  const capa = rowsOf(inputs, 'capa');
  const fsca = rowsOf(inputs, 'fsca');
  const ract = rowsOf(inputs, 'ract');

  const unitsSold = sales.reduce((sum, row) => sum + num(row.units_sold), 0);
  const complaintCount = complaints.length;
  const seriousCount = complaints.filter(
    (row) => String(row.severity ?? '').toLowerCase() === 'serious' || row.patient_harm === true,
  ).length;
  const ratePer10k = unitsSold > 0 ? Math.round((complaintCount / unitsSold) * 10000 * 100) / 100 : 0;

  const prevRatePer10k = num(valueOf(inputs, 'previous_psur').complaint_rate_per_10k) || 0;
  const thresholdRaw = num(valueOf(inputs, 'pms_plan').trend_threshold_per_10k);
  const threshold = thresholdRaw > 0 ? thresholdRaw : 2.5;
  const trendSignal = ratePer10k > threshold;

  const imdrfCounts = new Map<string, number>();
  for (const row of complaints) {
    const code = String(row.imdrf_code ?? '').trim().toUpperCase();
    if (code) imdrfCounts.set(code, (imdrfCounts.get(code) ?? 0) + 1);
  }
  const topImdrf = [...imdrfCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => ({ code, label: IMDRF_LABELS[code] ?? 'Device problem (unmapped term)', count }));

  return {
    unitsSold,
    complaintCount,
    seriousCount,
    ratePer10k,
    prevRatePer10k,
    threshold,
    trendSignal,
    fscaCount: fsca.length,
    capaTotal: capa.length,
    capaOpen: capa.filter((row) => String(row.status ?? '').toLowerCase() === 'open').length,
    literatureCount: rowsOf(inputs, 'literature').length,
    externalEventCount: rowsOf(inputs, 'external_events').length,
    ractTotal: ract.length,
    ractControlled: ract.filter((row) => String(row.status ?? '').toLowerCase() === 'controlled').length,
    topImdrf,
    benefitRiskFavourable: !trendSignal,
  };
}

const fmt = (n: number): string => n.toLocaleString('en-GB');

// ---------------------------------------------------------------------------
// Local hash chain — real SHA-256 over simulated decisions
// ---------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type ChainPayload = Omit<TraceEntryView, 'currentHash'>;

function chainMaterial(previousHash: string, payload: ChainPayload): string {
  return `${previousHash}\n${JSON.stringify(payload)}`;
}

class LocalHashChain {
  private previousHash = '';
  readonly entries: TraceEntryView[] = [];
  private seq = 0;

  async init(): Promise<void> {
    this.previousHash = await sha256Hex('regground-psur-simulation-genesis');
  }

  async append(entry: Omit<ChainPayload, 'sequenceNumber'>): Promise<TraceEntryView> {
    const payload: ChainPayload = { sequenceNumber: this.seq, ...entry };
    const currentHash = await sha256Hex(chainMaterial(this.previousHash, payload));
    const full: TraceEntryView = { ...payload, currentHash };
    this.entries.push(full);
    this.previousHash = currentHash;
    this.seq += 1;
    return full;
  }

  /** Walk the chain from genesis and recompute every hash — real verification. */
  async verify(): Promise<{ valid: boolean; verifiedEntries: number; totalEntries: number }> {
    let prev = await sha256Hex('regground-psur-simulation-genesis');
    let verified = 0;
    for (const entry of this.entries) {
      const { currentHash, ...payload } = entry;
      const recomputed = await sha256Hex(chainMaterial(prev, payload));
      if (recomputed !== currentHash) {
        return { valid: false, verifiedEntries: verified, totalEntries: this.entries.length };
      }
      verified += 1;
      prev = currentHash;
    }
    return { valid: true, verifiedEntries: verified, totalEntries: this.entries.length };
  }
}

// ---------------------------------------------------------------------------
// Abortable, speed-aware sleep
// ---------------------------------------------------------------------------

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// The simulated PSUR document lives in psurDocuments.ts (model + HTML preview
// + PDF + DOCX renderers, all watermarked SIMULATED).
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// The scripted run
// ---------------------------------------------------------------------------

interface ScriptDecision {
  decision: string;
  reason: string;
  basis: string[];
  section?: string;
}

const SECTION_AGENTS: { section: string; title: string; decision: (s: SimDerivedStats) => ScriptDecision }[] = [
  {
    section: 'A_executive_summary',
    title: 'Executive summary',
    decision: (s) => ({
      decision: 'Section A drafted',
      reason: `Executive summary states ${fmt(s.unitsSold)} units sold, ${fmt(s.complaintCount)} complaints and mirrors the Section M conclusion verbatim — no independent claims.`,
      basis: ['MDCG 2022-21 §3.1'],
    }),
  },
  {
    section: 'B_device_description',
    title: 'Device description',
    decision: () => ({
      decision: 'Section B drafted',
      reason: 'Device description, Basic UDI-DI, classification and certificate copied verbatim from the device-context input — never inferred.',
      basis: ['MDCG 2022-21 §3.2', 'EU MDR Annex VIII'],
    }),
  },
  {
    section: 'C_sales_exposure',
    title: 'Sales & exposure',
    decision: (s) => ({
      decision: 'Section C drafted',
      reason: `Population exposure estimated from ${fmt(s.unitsSold)} units sold; per-unit method selected because usage telemetry is not an input of this pack.`,
      basis: ['MDCG 2022-21 §3.3'],
    }),
  },
  {
    section: 'D_incidents_fsca',
    title: 'Incidents & FSCA',
    decision: (s) => ({
      decision: 'Section D drafted',
      reason: `${fmt(s.seriousCount)} serious incident(s) and ${fmt(s.fscaCount)} FSCA(s) summarised with reporting-timeline statements.`,
      basis: ['EU MDR Art. 87', 'MDCG 2022-21 §3.4'],
    }),
  },
  {
    section: 'E_complaint_trends',
    title: 'Complaint trends',
    decision: (s) => ({
      decision: 'Section E drafted',
      reason: s.trendSignal
        ? `Trend narrative written in escalation form: ${s.ratePer10k}/10k exceeds the ${s.threshold}/10k PMS-plan threshold.`
        : `Trend narrative written in no-signal form: ${s.ratePer10k}/10k is below the ${s.threshold}/10k PMS-plan threshold.`,
      basis: ['EU MDR Art. 88', 'MDCG 2022-21 §3.5'],
    }),
  },
  {
    section: 'F_capa',
    title: 'CAPA',
    decision: (s) => ({
      decision: 'Section F drafted',
      reason: `${fmt(s.capaTotal)} CAPA(s) cross-referenced to complaint clusters; ${fmt(s.capaOpen)} open action(s) carried with target dates.`,
      basis: ['ISO 13485 §8.5.2'],
    }),
  },
  {
    section: 'G_external_events',
    title: 'External vigilance',
    decision: (s) => ({
      decision: 'Section G drafted',
      reason: `${fmt(s.externalEventCount)} similar-device event(s) from external vigilance databases assessed against the risk file — none introduce a new hazard.`,
      basis: ['MDCG 2022-21 §3.6'],
    }),
  },
  {
    section: 'H_literature',
    title: 'Literature',
    decision: (s) => ({
      decision: 'Section H drafted',
      reason: `${fmt(s.literatureCount)} publication(s) included per the search protocol; findings mapped to safety and performance claims.`,
      basis: ['MEDDEV 2.7/1 rev 4', 'MDCG 2022-21 §3.7'],
    }),
  },
  {
    section: 'I_previous_psur',
    title: 'Previous PSUR follow-up',
    decision: (s) => ({
      decision: 'Section I drafted',
      reason: `Previous-period rate ${s.prevRatePer10k}/10k and open actions carried forward and dispositioned.`,
      basis: ['MDCG 2022-21 §3.8'],
    }),
  },
  {
    section: 'J_clinical_safety',
    title: 'Clinical safety',
    decision: () => ({
      decision: 'Section J drafted',
      reason: 'Clinical safety summary consumes the clinical-safety input verbatim; incident counts reconciled with Section D.',
      basis: ['EU MDR Annex XIV Part B'],
    }),
  },
  {
    section: 'K_clinical_performance',
    title: 'Clinical performance',
    decision: () => ({
      decision: 'Section K drafted',
      reason: 'Observed flow accuracy compared against specification; PMCF evidence cited for continued performance.',
      basis: ['EU MDR Annex XIV Part B', 'MDCG 2022-21 §3.9'],
    }),
  },
  {
    section: 'L_risk_reconciliation',
    title: 'Risk reconciliation',
    decision: (s) => ({
      decision: 'Section L drafted',
      reason: `${fmt(s.ractControlled)}/${fmt(s.ractTotal)} risk-file items controlled; period data reconciled against the risk analysis${s.trendSignal ? ' — trend signal flagged for risk-file review' : ''}.`,
      basis: ['ISO 14971 §10'],
    }),
  },
  {
    section: 'M_benefit_risk',
    title: 'Benefit–risk',
    decision: (s) => ({
      decision: 'Section M drafted',
      reason: s.benefitRiskFavourable
        ? 'Benefit–risk determination concluded FAVOURABLE: no Article 88 signal, risks controlled, clinical benefit sustained.'
        : 'Benefit–risk determination NOT confirmed: the Article 88 trend signal must be resolved before a favourable conclusion.',
      basis: ['EU MDR Annex I §1', 'EU MDR Annex I §8'],
    }),
  },
];

export interface RunSimulationOptions {
  period: { start: string; end: string };
  inputs: Record<string, InputDefault>;
  onEvent: (event: SimEvent) => void;
  signal?: AbortSignal;
  /** Speed multiplier provider (1 = real-time script, 4 = fast-forward). */
  speed?: () => number;
}

/**
 * Run the scripted simulation. Resolves with the result, or null if aborted.
 * Total scripted duration is ~50 seconds at 1× speed.
 */
export async function runPsurSimulation(opts: RunSimulationOptions): Promise<SimRunResult | null> {
  const { period, inputs, onEvent, signal } = opts;
  const speed = opts.speed ?? (() => 1);
  const tick = (ms: number) => wait(Math.max(40, ms / Math.max(0.25, speed())), signal);

  const stats = deriveSimStats(inputs);
  const chain = new LocalHashChain();
  const processInstanceId = `psur-simulation-${crypto.randomUUID()}`;

  let seq = 0;
  const emitDecision = async (d: ScriptDecision): Promise<void> => {
    seq += 1;
    onEvent({
      kind: 'decision',
      seq,
      decision: d.decision,
      reason: d.reason,
      regulatory_basis: d.basis,
      ...(d.section ? { section: d.section } : {}),
    });
    await chain.append({
      eventType: 'psur.decision',
      decision: d.decision,
      reasons: [d.reason],
      humanSummary: d.reason,
      regulatoryContext: { citations: d.basis, ...(d.section ? { section: d.section } : {}) },
    });
  };
  const phase = (name: string, status: 'started' | 'completed', section?: string) =>
    onEvent({ kind: 'progress', phase: name, status, ...(section ? { section } : {}) });

  try {
    await chain.init();
    await chain.append({
      eventType: 'psur.run.started',
      humanSummary: `Simulated PSUR run started for period ${period.start} → ${period.end}. All entries in this chain are simulated and were generated locally in the visitor's browser.`,
    });

    // -- Discovery ----------------------------------------------------------
    phase('discovery', 'started');
    await tick(900);
    await emitDecision({
      decision: 'Input pack accepted',
      reason: `${Object.keys(inputs).length} of 12 expected inputs present; every table and form matches the locked structure.`,
      basis: ['MDCG 2022-21 §2'],
    });
    await tick(500);
    phase('discovery', 'completed');

    // -- Parsing -------------------------------------------------------------
    phase('parsing', 'started');
    await tick(900);
    await emitDecision({
      decision: 'Inputs parsed',
      reason: `Parsed ${fmt(rowsOf(inputs, 'sales').length)} sales rows, ${fmt(stats.complaintCount)} complaint records, ${fmt(stats.capaTotal)} CAPAs, ${fmt(stats.fscaCount)} FSCAs and ${fmt(stats.literatureCount)} literature entries without coercion errors.`,
      basis: ['EU MDR Art. 85'],
    });
    await tick(600);
    phase('parsing', 'completed');

    // -- Device context ------------------------------------------------------
    phase('device_context', 'started');
    await tick(800);
    const device = valueOf(inputs, 'device_context');
    await emitDecision({
      decision: 'PSUR cadence resolved from device class',
      reason: `Device class ${String(device.risk_class ?? 'IIb')} → PSUR updated at least annually and submitted to the notified body.`,
      basis: ['EU MDR Art. 86(1)'],
    });
    await tick(500);
    await emitDecision({
      decision: 'Reporting period accepted',
      reason: `Period ${period.start} → ${period.end} is contiguous with the previous PSUR period end (${String(valueOf(inputs, 'previous_psur').period_end ?? 'unknown')}) — no surveillance gap.`,
      basis: ['MDCG 2022-21 §1.2'],
    });
    await tick(500);
    phase('device_context', 'completed');

    // -- IMDRF coding ---------------------------------------------------------
    phase('imdrf_coding', 'started');
    await tick(1100);
    const topCodes = stats.topImdrf.map((t) => `${t.code} (${t.label}, ×${t.count})`).join('; ') || 'none';
    await emitDecision({
      decision: 'Complaints coded to IMDRF terms',
      reason: `${fmt(stats.complaintCount)} complaints coded against IMDRF Annex A. Leading terms: ${topCodes}.`,
      basis: ['IMDRF/AE WG/N43'],
    });
    await tick(600);
    phase('imdrf_coding', 'completed');

    // -- Statistics -----------------------------------------------------------
    phase('statistics', 'started');
    await tick(1100);
    await emitDecision({
      decision: 'Complaint rate computed',
      reason: `${fmt(stats.complaintCount)} complaints over ${fmt(stats.unitsSold)} units → ${stats.ratePer10k} per 10,000 units (previous period: ${stats.prevRatePer10k}). Deterministic computation; section agents consume this verbatim.`,
      basis: ['EU MDR Art. 88'],
    });
    await tick(700);
    await emitDecision(
      stats.trendSignal
        ? {
            decision: 'Trend signal RAISED',
            reason: `Rate ${stats.ratePer10k}/10k exceeds the PMS-plan threshold of ${stats.threshold}/10k — a statistically significant increase. Trend escalation drafted into Sections E, L and M.`,
            basis: ['EU MDR Art. 88', 'PMS plan threshold'],
          }
        : {
            decision: 'No trend signal',
            reason: `Rate ${stats.ratePer10k}/10k is within the PMS-plan threshold of ${stats.threshold}/10k — no statistically significant increase to report.`,
            basis: ['EU MDR Art. 88', 'PMS plan threshold'],
          },
    );
    await tick(500);
    phase('statistics', 'completed');

    // -- Charts ---------------------------------------------------------------
    phase('charts', 'started');
    await tick(900);
    await emitDecision({
      decision: 'Charts rendered',
      reason: 'Complaint-trend and sales-by-region charts rendered from the statistics block — figures and prose can no longer diverge.',
      basis: ['MDCG 2022-21 §3.5'],
    });
    await tick(400);
    phase('charts', 'completed');

    // -- Generation: section agents A–M ---------------------------------------
    phase('generation', 'started');
    for (const agent of SECTION_AGENTS) {
      phase('generation', 'started', agent.section);
      await tick(1000);
      await emitDecision({ ...agent.decision(stats), section: agent.section });
      await tick(600);
      phase('generation', 'completed', agent.section);
    }
    phase('generation', 'completed');

    // -- Audit ----------------------------------------------------------------
    phase('audit', 'started');
    await tick(1300);
    await emitDecision({
      decision: 'Numeric cross-audit passed with one finding',
      reason: `All ${fmt(34 + stats.topImdrf.length)} numeric claims across Sections A–M reconcile with the statistics block. One finding: Section H cited a publication dated outside the reporting window.`,
      basis: ['MDCG 2022-21 §2'],
    });
    await tick(600);
    phase('audit', 'completed');

    // -- Remediation ----------------------------------------------------------
    phase('remediation', 'started');
    await tick(1200);
    await emitDecision({
      decision: 'Section H remediated',
      reason: 'Out-of-window citation moved to background context and excluded from period evidence; section regenerated and re-audited clean.',
      basis: ['MEDDEV 2.7/1 rev 4'],
      section: 'H_literature',
    });
    await tick(500);
    phase('remediation', 'completed');

    // -- Validation -----------------------------------------------------------
    phase('validation', 'started');
    await tick(1000);
    await emitDecision({
      decision: 'Completeness validation passed',
      reason: '13/13 MDCG 2022-21 sections present, all required tables populated, 0 structural errors, conclusion consistency check passed (Sections A and M agree).',
      basis: ['MDCG 2022-21 §3'],
    });
    await tick(500);
    phase('validation', 'completed');

    // -- Rendering -----------------------------------------------------------
    phase('rendering', 'started');
    await tick(900);
    const model = buildPsurModel(period, inputs, stats);
    const previewHtml = renderPsurHtml(model);
    await emitDecision({
      decision: 'Draft rendered with SIMULATION watermark',
      reason: 'Document model rendered to PDF and DOCX. Because this is a signed-out simulation, every page is watermarked SIMULATED.',
      basis: [],
    });
    await tick(400);
    phase('rendering', 'completed');

    // -- Artifacts ------------------------------------------------------------
    phase('artifacts', 'started');
    // PDF + DOCX are produced in the browser while the phase shows active.
    const [pdfBlob, docxBlob] = await Promise.all([renderPsurPdf(model), renderPsurDocx(model)]);
    await tick(600);

    await chain.append({
      eventType: 'psur.run.completed',
      humanSummary: `Simulated PSUR run completed: 3 artifact(s), validation passed (0 errors). Benefit–risk: ${stats.benefitRiskFavourable ? 'favourable' : 'requires action'}.`,
    });

    const verification = await chain.verify();
    const trace: TraceResponse = { processInstanceId, entries: chain.entries, verification };
    const traceJson = JSON.stringify(
      { disclaimer: 'SIMULATED decision trace generated locally in the browser — not produced by the real pipeline.', ...trace },
      null,
      2,
    );
    const traceBlob = new Blob([traceJson], { type: 'application/json' });

    const artifacts: SimArtifact[] = [
      {
        name: 'psur-draft-SIMULATED.pdf',
        contentType: 'application/pdf',
        sizeBytes: pdfBlob.size,
        blob: pdfBlob,
      },
      {
        name: 'psur-draft-SIMULATED.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBlob.size,
        blob: docxBlob,
      },
      {
        name: 'decision-trace-SIMULATED.json',
        contentType: 'application/json',
        sizeBytes: traceBlob.size,
        blob: traceBlob,
      },
    ];

    const validation = { passed: true, error_count: 0 };
    onEvent({
      kind: 'complete',
      artifacts: artifacts.map((a) => ({ name: a.name, content_type: a.contentType, size_bytes: a.sizeBytes })),
      validation,
    });
    phase('artifacts', 'completed');

    return { processInstanceId, artifacts, validation, trace, previewHtml };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}
